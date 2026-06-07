// VIP picks engine.
//
// Pure math + persistence wiring. No I/O outside Supabase persistence helpers.
// Produces value picks (positive expected value) from a model probability
// and a book decimal price. Fractional Kelly stake, capped, with hard floors
// to keep small edges from triggering a publish.
//
// IMPORTANT: every consumer of this module must apply the responsible-gambling
// footer (see buildVipMessage). Picks must only ever be sent to the gated
// TELEGRAM_BETTING_CHANNEL_ID, never the public channel.

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

// Fractional Kelly stake in units, capped. Standard Kelly is f = (bp - q) / b
// where b = decimal - 1, p = modelProb, q = 1 - p. We multiply by KELLY_FRACTION
// (default 0.25) and cap at MAX_STAKE_UNITS (default 2.0).
export const kellyStake = (modelProb, decimalOdds, {
  kellyFraction = Number(process.env.KELLY_FRACTION ?? 0.25),
  maxUnits = Number(process.env.MAX_STAKE_UNITS ?? 2.0),
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
  const stake = fullKelly * Math.max(0, Math.min(1, kellyFraction));
  const capped = Math.max(0, Math.min(maxUnits, stake));
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

// Build VIP picks for a fixture. Returns at most three picks (home, draw, away)
// where EV exceeds threshold AND a non-zero fractional Kelly stake comes out.
// Picks with stake==0 are dropped — that's how we keep the channel disciplined.
export const computePicks = (fixture, teamRatings, {
  minEv = Number(process.env.MIN_EV ?? 0.04),
  bookName = "Pinnacle",
} = {}) => {
  if (!fixture || !fixture.homeOdds || !fixture.awayOdds) return [];
  const { homeProb, drawProb, awayProb } = oneXTwoProbabilities(teamRatings, fixture);

  const candidates = [
    { market: "1X2", side: "Home", label: fixture.teamA, modelProb: homeProb, bookPrice: Number(fixture.homeOdds) },
    fixture.drawOdds ? { market: "1X2", side: "Draw", label: "Draw", modelProb: drawProb, bookPrice: Number(fixture.drawOdds) } : null,
    { market: "1X2", side: "Away", label: fixture.teamB, modelProb: awayProb, bookPrice: Number(fixture.awayOdds) },
  ].filter(Boolean);

  const picks = [];
  for (const c of candidates) {
    if (!c.bookPrice || c.bookPrice <= 1) continue;
    const ev = expectedValue(c.modelProb, c.bookPrice);
    const stakeUnits = kellyStake(c.modelProb, c.bookPrice);
    if (ev === null || ev < minEv) continue;
    if (stakeUnits <= 0) continue;
    picks.push({
      id: `pick_${fixture.id}_${c.side.toLowerCase()}`,
      fixtureId: fixture.id,
      market: c.market,
      side: c.side,
      label: c.label,
      modelProb: Number(c.modelProb.toFixed(4)),
      bookPrice: c.bookPrice,
      bookName,
      impliedProb: Number(decimalToImpliedProb(c.bookPrice).toFixed(4)),
      ev: Number(ev.toFixed(4)),
      stakeUnits,
      confidence: ev > 0.10 ? "High" : ev > 0.06 ? "Medium" : "Low",
      createdAt: new Date().toISOString(),
    });
  }
  return picks.sort((a, b) => b.ev - a.ev);
};

// Format a VIP message body. The caller appends fixture context and RG footer.
const formatPick = (pick) => {
  const evPct = (pick.ev * 100).toFixed(1);
  return [
    `${pick.market} · ${pick.side} (${pick.label})`,
    `Book: ${pick.bookName} @ ${pick.bookPrice.toFixed(2)}`,
    `Model: ${(pick.modelProb * 100).toFixed(1)}% · Implied: ${(pick.impliedProb * 100).toFixed(1)}%`,
    `Edge: +${evPct}% EV · Stake: ${pick.stakeUnits.toFixed(2)}u · Confidence: ${pick.confidence}`,
  ].join("\n");
};

export const buildVipMessage = (fixture, picks) => {
  if (!picks.length) {
    return null;
  }
  const header = `${fixture.teamA} vs ${fixture.teamB}\n${fixture.stage} · ${fixture.date} ${fixture.time}`;
  const body = picks.map(formatPick).join("\n\n");
  return `${header}\n\n${body}\n\n— — —\n${RG_FOOTER}`;
};

export const responsibleGamblingFooter = () => RG_FOOTER;
