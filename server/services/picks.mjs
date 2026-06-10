// VIP picks engine ("god mode").
//
// Pipeline per fixture:
//   1. modelMatch()   — Dixon-Coles scoreline grid -> probabilities for every
//                       market (1X2, Over/Under, BTTS, Double Chance).
//   2. line shopping  — best decimal price per outcome across books (odds.mjs).
//   3. de-vig         — strip the book overround (devig.mjs, Shin) to get the
//                       market's FAIR probability, our honest benchmark.
//   4. edge + EV      — a pick must (a) have positive EV at the offered price
//                       AND (b) have model prob above the de-vigged fair prob
//                       (we must be on the right side of the no-vig market).
//   5. fractional Kelly stake, capped and floored.
//
// The LLM never supplies any number here — every probability, edge, and stake
// is computed in this module. Picks only ever go to the gated VIP channel, and
// every message carries the responsible-gambling footer.

import { modelMatch } from "./model.mjs";
import { fairProbabilities } from "./devig.mjs";

const RG_FOOTER = `18+ / 21+ where required. Past results do not guarantee future outcomes.\nIf gambling is becoming a problem, support is available: 1-800-GAMBLER (US), GamCare 0808 8020 133 (UK), gamblingtherapy.org (worldwide).\nReply /stop to unsubscribe.`;

// Convert a decimal price (e.g. 2.10) to the book's implied probability.
// Stripping the overround is left to the caller — single-book implied is good
// enough for an EV sanity check.
export const decimalToImpliedProb = (decimalOdds) => {
  const price = Number(decimalOdds);
  if (!Number.isFinite(price) || price <= 1.0) return null;
  return 1 / price;
};

// Expected value as a fraction of the stake. EV > 0 means the model thinks
// the price is too long (favorable for us). EV is the unit we publish.
export const expectedValue = (modelProb, decimalOdds) => {
  const price = Number(decimalOdds);
  const p = Number(modelProb);
  if (!Number.isFinite(price) || price <= 1.0) return null;
  if (!Number.isFinite(p) || p <= 0 || p >= 1) return null;
  return p * price - 1;
};

// Fractional Kelly stake, expressed in betting UNITS.
//
// Full Kelly f = (bp - q) / b is a fraction OF BANKROLL. The earlier version
// returned that fraction but labelled it "units" and floored at 0.1-0.25 —
// which actually meant "10-25% of bankroll minimum", so it silently dropped
// every realistic edge. Here we convert properly:
//
//   bankrollFraction = fullKelly * kellyFraction          (e.g. quarter Kelly)
//   units            = bankrollFraction / (unitPct / 100) (1 unit = unitPct%)
//
// Default 1 unit = 1% of bankroll, quarter Kelly, capped at 3u, floored at
// 0.25u (sub-floor stakes return 0 to keep the channel disciplined).
export const kellyStake = (modelProb, decimalOdds, {
  kellyFraction = Number(process.env.KELLY_FRACTION ?? 0.25),
  unitPct = Number(process.env.UNIT_BANKROLL_PCT ?? 1),
  maxUnits = Number(process.env.MAX_STAKE_UNITS ?? 3),
  minUnits = Number(process.env.MIN_STAKE_UNITS ?? 0.25),
} = {}) => {
  const price = Number(decimalOdds);
  const p = Number(modelProb);
  if (!Number.isFinite(price) || price <= 1.0) return 0;
  if (!Number.isFinite(p) || p <= 0 || p >= 1) return 0;
  const b = price - 1;
  const q = 1 - p;
  const fullKelly = (b * p - q) / b;
  if (fullKelly <= 0) return 0;
  const bankrollFraction = fullKelly * Math.max(0, Math.min(1, kellyFraction));
  const perUnit = Math.max(0.0001, unitPct / 100);
  const units = bankrollFraction / perUnit;
  const capped = Math.max(0, Math.min(maxUnits, units));
  return capped < minUnits ? 0 : Number(capped.toFixed(2));
};

// Build a model probability for the 1X2 markets from the team-rating diff
// already used by the editorial layer. This mirrors src/main.tsx#predictionFor
// so the VIP picks stay consistent with what the operator sees in Command.
const sigmoid = (x) => 1 / (1 + Math.exp(-x));

const ratingScore = (rating) => {
  if (!rating) return 0;
  const r = {
    form: Number(rating.form ?? 6),
    attack: Number(rating.attack ?? 6),
    defense: Number(rating.defense ?? 6),
    midfield: Number(rating.midfield ?? 6),
    depth: Number(rating.depth ?? 6),
    coach: Number(rating.coach ?? 6),
    motivation: Number(rating.motivation ?? 7),
    injuryImpact: Number(rating.injuryImpact ?? 2),
  };
  return r.form * 1.25 + r.attack * 1.3 + r.defense * 1.15 + r.midfield * 1.25 +
    r.depth * 0.85 + r.coach * 0.75 + r.motivation * 0.75 - r.injuryImpact * 1.1;
};

// Returns { homeProb, drawProb, awayProb } that always sums to 1. Calibration
// constants come from BACK-FIT on the editorial prediction confidence range
// (3-point edge ~= 60% favorite). Tweak via env when we get a CLV log to
// regress against.
export const oneXTwoProbabilities = (teamRatings, fixture) => {
  const a = teamRatings.find((t) => t.team?.toLowerCase() === fixture.teamA?.toLowerCase());
  const b = teamRatings.find((t) => t.team?.toLowerCase() === fixture.teamB?.toLowerCase());
  const aScore = ratingScore(a);
  const bScore = ratingScore(b);
  const diff = aScore - bScore;
  // Draw probability shrinks as the strength gap widens.
  const tempScale = Number(process.env.PICKS_TEMP_SCALE ?? 4.0);
  const drawWeight = Number(process.env.PICKS_DRAW_WEIGHT ?? 0.27);
  const homeRaw = sigmoid(diff / tempScale);
  const awayRaw = 1 - homeRaw;
  const drawProb = drawWeight * (1 - Math.abs(homeRaw - awayRaw));
  const remaining = 1 - drawProb;
  const homeProb = homeRaw * remaining;
  const awayProb = awayRaw * remaining;
  return { homeProb, drawProb, awayProb };
};

const round4 = (v) => (v == null ? null : Math.round(v * 10000) / 10000);
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);

// Resolve the best available 1X2 prices for a fixture, preferring the
// line-shopped odds object (from odds.mjs) and falling back to the prices
// stored on the fixture itself.
const resolve1x2 = (fixture, odds, fallbackBook) => {
  const h2h = odds?.best?.h2h;
  if (h2h?.home?.price && h2h?.away?.price) {
    return {
      home: { price: h2h.home.price, book: h2h.home.book ?? fallbackBook },
      draw: h2h.draw?.price ? { price: h2h.draw.price, book: h2h.draw.book ?? fallbackBook } : null,
      away: { price: h2h.away.price, book: h2h.away.book ?? fallbackBook },
    };
  }
  if (num(fixture.homeOdds) && num(fixture.awayOdds)) {
    return {
      home: { price: num(fixture.homeOdds), book: fallbackBook },
      draw: num(fixture.drawOdds) ? { price: num(fixture.drawOdds), book: fallbackBook } : null,
      away: { price: num(fixture.awayOdds), book: fallbackBook },
    };
  }
  return null;
};

// Turn the model + shopped odds into scored candidate bets across markets.
// Every candidate carries the de-vigged fair probability so the caller can
// require model prob > fair (us on the right side of the no-vig market).
const buildCandidates = (fixture, model, odds, fallbackBook) => {
  const candidates = [];

  // --- 1X2 ---
  const prices = resolve1x2(fixture, odds, fallbackBook);
  if (prices) {
    const legs = [
      { side: "Home", label: fixture.teamA, modelProb: model.markets.oneXtwo.home, ...prices.home },
      prices.draw ? { side: "Draw", label: "Draw", modelProb: model.markets.oneXtwo.draw, ...prices.draw } : null,
      { side: "Away", label: fixture.teamB, modelProb: model.markets.oneXtwo.away, ...prices.away },
    ].filter(Boolean);
    // De-vig across all offered legs together (3-way if draw present, else 2).
    const fair = fairProbabilities(legs.map((l) => l.price));
    legs.forEach((leg, i) => {
      candidates.push({
        market: "1X2",
        side: leg.side,
        label: leg.label,
        modelProb: leg.modelProb,
        fairProb: fair ? round4(fair.probs[i]) : null,
        devigMethod: fair?.method ?? null,
        bookName: leg.book,
        bookPrice: leg.price,
      });
    });
  }

  // --- Over/Under totals (only when shopped odds provide them) ---
  for (const t of odds?.best?.totals ?? []) {
    const line = num(t.line);
    if (line == null) continue;
    const modeled = model.markets.totals.find((m) => m.line === line);
    if (!modeled) continue; // model only prices lines we asked it to
    const legs = [];
    if (t.over?.price) legs.push({ side: "Over", label: `Over ${line}`, modelProb: modeled.over, price: t.over.price, book: t.over.book ?? fallbackBook });
    if (t.under?.price) legs.push({ side: "Under", label: `Under ${line}`, modelProb: modeled.under, price: t.under.price, book: t.under.book ?? fallbackBook });
    if (legs.length < 2) continue;
    const fair = fairProbabilities(legs.map((l) => l.price));
    legs.forEach((leg, i) => {
      candidates.push({
        market: "Over/Under",
        side: leg.side,
        label: leg.label,
        line,
        modelProb: leg.modelProb,
        fairProb: fair ? round4(fair.probs[i]) : null,
        devigMethod: fair?.method ?? null,
        bookName: leg.book,
        bookPrice: leg.price,
      });
    });
  }

  // --- BTTS (only when shopped odds provide it) ---
  const btts = odds?.best?.btts;
  if (btts?.yes?.price && btts?.no?.price) {
    const legs = [
      { side: "Yes", label: "BTTS Yes", modelProb: model.markets.btts.yes, price: btts.yes.price, book: btts.yes.book ?? fallbackBook },
      { side: "No", label: "BTTS No", modelProb: model.markets.btts.no, price: btts.no.price, book: btts.no.book ?? fallbackBook },
    ];
    const fair = fairProbabilities(legs.map((l) => l.price));
    legs.forEach((leg, i) => {
      candidates.push({
        market: "BTTS",
        side: leg.side,
        label: leg.label,
        modelProb: leg.modelProb,
        fairProb: fair ? round4(fair.probs[i]) : null,
        devigMethod: fair?.method ?? null,
        bookName: leg.book,
        bookPrice: leg.price,
      });
    });
  }

  return candidates;
};

const confidenceFor = (ev, edge) => {
  if (ev > 0.1 && edge > 0.05) return "High";
  if (ev > 0.05 && edge > 0.02) return "Medium";
  return "Low";
};

const summarizeCandidate = (candidate, { minEv, minEdge }) => {
  const price = num(candidate.bookPrice);
  const ev = price && price > 1 ? expectedValue(candidate.modelProb, price) : null;
  const edge = ev === null ? null : candidate.fairProb == null ? ev : candidate.modelProb - candidate.fairProb;
  const stakeUnits = ev === null ? 0 : kellyStake(candidate.modelProb, price);
  const reasons = [];
  if (!price || price <= 1) reasons.push("No usable price.");
  if (ev === null || ev < minEv) reasons.push(`EV below ${(minEv * 100).toFixed(1)}% threshold.`);
  if (edge === null || edge < minEdge) reasons.push(`Model edge below ${(minEdge * 100).toFixed(1)}pp threshold.`);
  if (stakeUnits <= 0) reasons.push("Kelly stake below floor.");

  return {
    market: candidate.market,
    side: candidate.side,
    label: candidate.label,
    line: candidate.line ?? null,
    modelProb: round4(candidate.modelProb),
    fairProb: candidate.fairProb,
    edge: edge == null ? null : round4(edge),
    bookName: candidate.bookName,
    bookPrice: price,
    impliedProb: price ? round4(decimalToImpliedProb(price)) : null,
    ev: ev == null ? null : round4(ev),
    stakeUnits,
    confidence: ev == null || edge == null ? "Low" : confidenceFor(ev, edge),
    status: reasons.length ? "watchlist" : "qualified",
    reasons,
  };
};

const buildDiagnostics = ({ fixture, model, candidates, picks, totalStake, minEv, minEdge, maxExposureUnits, exposureLimited }) => {
  const has1x2Odds = Boolean(num(fixture?.homeOdds) && num(fixture?.awayOdds));
  const missingRatings = [];
  if (!model?.strengths?.home?.hasRating) missingRatings.push(fixture?.teamA ?? "home team");
  if (!model?.strengths?.away?.hasRating) missingRatings.push(fixture?.teamB ?? "away team");

  const watchlist = candidates
    .map((candidate) => summarizeCandidate(candidate, { minEv, minEdge }))
    .filter((candidate) => candidate.status !== "qualified")
    .sort((a, b) => (b.ev ?? -1) - (a.ev ?? -1))
    .slice(0, 6);

  const marketDiagnostics = candidates
    .map((candidate) => summarizeCandidate(candidate, { minEv, minEdge }))
    .sort((a, b) => (b.ev ?? -1) - (a.ev ?? -1))
    .slice(0, 12);

  const riskFlags = [];
  if (!has1x2Odds && !candidates.length) riskFlags.push("No odds loaded for this fixture.");
  if (missingRatings.length) riskFlags.push(`Missing team rating: ${missingRatings.join(", ")}.`);
  if (!picks.length && candidates.length) riskFlags.push("Market is priced efficiently at current thresholds.");
  if (exposureLimited) riskFlags.push(`Exposure capped at ${maxExposureUnits.toFixed(2)}u.`);

  const topEdge = picks[0]?.edge ?? 0;
  const topEv = picks[0]?.ev ?? 0;
  const signalScore = Math.round(Math.max(0, Math.min(100, topEv * 420 + topEdge * 260 + Math.min(totalStake, maxExposureUnits) * 6)));
  const grade = picks.length
    ? signalScore >= 70 ? "Attack"
      : signalScore >= 45 ? "Measured"
        : "Small edge"
    : candidates.length ? "No bet" : "Needs odds";

  return {
    grade,
    signalScore,
    thresholds: {
      minEv,
      minEdge,
      maxExposureUnits,
      kellyFraction: Number(process.env.KELLY_FRACTION ?? 0.25),
      unitBankrollPct: Number(process.env.UNIT_BANKROLL_PCT ?? 1),
    },
    exposure: {
      totalStake,
      pickCount: picks.length,
      capped: exposureLimited,
    },
    riskFlags,
    watchlist,
    marketDiagnostics,
  };
};

// Build VIP value picks for a fixture across every available market.
//
// opts:
//   odds      line-shopped best-price object from odds.mjs (optional; falls
//             back to fixture.homeOdds/drawOdds/awayOdds for 1X2)
//   minEv     minimum EV at the offered price (default 0.04)
//   minEdge   minimum (modelProb - fairProb) so we only bet when we genuinely
//             disagree with the no-vig market (default 0.02)
//   maxPicks  cap per fixture to keep the channel disciplined (default 4)
// Internal: run the full pipeline once and return both the model snapshot and
// the ranked picks. computePicks and analyzeFixture both wrap this.
const runPipeline = (fixture, teamRatings, {
  odds = null,
  minEv = Number(process.env.MIN_EV ?? 0.04),
  minEdge = Number(process.env.MIN_EDGE ?? 0.02),
  maxPicks = Number(process.env.MAX_PICKS_PER_FIXTURE ?? 4),
  maxExposureUnits = Number(process.env.MAX_TOTAL_EXPOSURE_UNITS ?? 6),
  bookName = "Book",
} = {}) => {
  if (!fixture) return { model: null, picks: [], diagnostics: null };

  // Price the exact totals lines the books are offering so model and market
  // line up; default to the standard lines otherwise.
  const totalsLines = (odds?.best?.totals ?? [])
    .map((t) => Number(t.line))
    .filter((n) => Number.isFinite(n));
  const model = modelMatch(teamRatings, fixture, totalsLines.length ? { totalsLines } : {});

  const candidates = buildCandidates(fixture, model, odds, bookName);

  const rawPicks = [];
  for (const c of candidates) {
    const summary = summarizeCandidate(c, { minEv, minEdge });
    const price = summary.bookPrice;
    if (!price || price <= 1) continue;
    const ev = summary.ev;
    if (ev === null || ev < minEv) continue;
    // Discipline gate: only bet when the model beats the de-vigged fair price.
    const edge = summary.edge;
    if (edge < minEdge) continue;
    const stakeUnits = summary.stakeUnits;
    if (stakeUnits <= 0) continue;

    const sideKey = `${c.market}_${c.side}${c.line ? `_${c.line}` : ""}`.toLowerCase().replace(/[^a-z0-9]+/g, "_");
    rawPicks.push({
      id: `pick_${fixture.id}_${sideKey}`,
      fixtureId: fixture.id,
      market: c.market,
      side: c.side,
      label: c.label,
      line: c.line ?? null,
      modelProb: round4(c.modelProb),
      fairProb: c.fairProb,
      edge: round4(edge),
      impliedProb: round4(decimalToImpliedProb(price)),
      devigMethod: c.devigMethod,
      bookName: c.bookName,
      bookPrice: price,
      ev: round4(ev),
      stakeUnits,
      confidence: confidenceFor(ev, edge),
      createdAt: new Date().toISOString(),
    });
  }

  const ranked = rawPicks.sort((a, b) => b.ev - a.ev).slice(0, Math.max(1, maxPicks));
  const picks = [];
  let totalStake = 0;
  let exposureLimited = false;
  for (const pick of ranked) {
    if (totalStake + pick.stakeUnits > maxExposureUnits) {
      exposureLimited = true;
      continue;
    }
    picks.push(pick);
    totalStake = Number((totalStake + pick.stakeUnits).toFixed(2));
  }
  const diagnostics = buildDiagnostics({
    fixture,
    model,
    candidates,
    picks,
    totalStake,
    minEv,
    minEdge,
    maxExposureUnits,
    exposureLimited,
  });
  return { model, picks, diagnostics };
};

// Back-compat: returns a plain Pick[] (safe to JSON.stringify). Most callers
// use this. For the full model context use analyzeFixture.
export const computePicks = (fixture, teamRatings, opts = {}) =>
  runPipeline(fixture, teamRatings, opts).picks;

// God-mode entry point: the full picture for a fixture — model xG + likeliest
// scorelines + every market's probabilities, the ranked value picks, total
// exposure, and the ready-to-send VIP message. Serialization-safe (no props
// attached to arrays).
export const analyzeFixture = (fixture, teamRatings, opts = {}) => {
  const { model, picks, diagnostics } = runPipeline(fixture, teamRatings, opts);
  const snapshot = model
    ? {
        lambdaHome: model.lambdaHome,
        lambdaAway: model.lambdaAway,
        expectedTotal: model.expectedTotal,
        markets: model.markets,
        topScorelines: model.topScorelines,
      }
    : null;
  const totalStake = Number(picks.reduce((s, p) => s + p.stakeUnits, 0).toFixed(2));
  return {
    fixtureId: fixture?.id ?? null,
    model: snapshot,
    picks,
    totalStake,
    diagnostics,
    message: buildVipMessage(fixture, picks, snapshot),
  };
};

// ---------------------------------------------------------------------------
// Premium VIP message. Groups picks by market, shows model vs fair, the EV
// edge, the best book + price (line-shopped), and the stake. Always ends with
// the responsible-gambling footer.

const pct = (v) => `${(v * 100).toFixed(1)}%`;

const formatPick = (pick) => {
  const lines = [
    `▸ ${pick.market}${pick.line ? ` ${pick.line}` : ""} · ${pick.label}`,
    `   Best price: ${pick.bookName} @ ${pick.bookPrice.toFixed(2)}`,
    `   Model ${pct(pick.modelProb)} vs fair ${pick.fairProb != null ? pct(pick.fairProb) : "n/a"}`,
    `   +${(pick.ev * 100).toFixed(1)}% EV · ${pick.stakeUnits.toFixed(2)}u · ${pick.confidence}`,
  ];
  return lines.join("\n");
};

export const buildVipMessage = (fixture, picks, model = null) => {
  if (!picks || !picks.length) return null;
  const header = `🎯 ${fixture.teamA} vs ${fixture.teamB}\n${fixture.stage ?? "Match"} · ${fixture.date ?? ""} ${fixture.time ?? ""}`.trim();

  let modelLine = "";
  if (model) {
    const top = (model.topScorelines ?? []).slice(0, 3).map((s) => s.score).join(", ");
    modelLine = `\nModel xG: ${model.lambdaHome?.toFixed(2)}–${model.lambdaAway?.toFixed(2)}${top ? ` · likeliest: ${top}` : ""}`;
  }

  const totalStake = picks.reduce((s, p) => s + p.stakeUnits, 0);
  const body = picks.map(formatPick).join("\n\n");
  const footer = `Total exposure: ${totalStake.toFixed(2)}u across ${picks.length} pick${picks.length > 1 ? "s" : ""}.`;

  return `${header}${modelLine}\n\n${body}\n\n${footer}\n— — —\n${RG_FOOTER}`;
};

export const responsibleGamblingFooter = () => RG_FOOTER;
