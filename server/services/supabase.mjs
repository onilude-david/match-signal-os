import { createClient } from "@supabase/supabase-js";

export const getSupabase = () => {
  if (!process.env.SUPABASE_URL || (!process.env.SUPABASE_SERVICE_ROLE_KEY && !process.env.SUPABASE_PUBLISHABLE_KEY)) {
    throw new Error("Supabase environment variables are missing.");
  }
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false },
  });
};

export const normalizeAiContent = (content) => {
  if (!content) return null;
  const marketContext = content.marketContext || content.bettingAngle || "";
  return {
    telegram: content.telegram || "",
    xPost: content.xPost || "",
    thread: content.thread || null,
    shortsScript: content.shortsScript || "",
    videoTitle: content.videoTitle || "",
    reportSection: content.reportSection || "",
    marketContext,
    // back-compat: older schema column name
    bettingAngle: marketContext,
    safetyNotes: Array.isArray(content.safetyNotes) ? content.safetyNotes : [],
  };
};

const supabaseConfigured = () =>
  Boolean(process.env.SUPABASE_URL && (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY));

const pickRow = (pick, fixtureId) => ({
  pick_id: pick.id,
  match_id: fixtureId,
  market: pick.market,
  side: pick.side,
  label: pick.label,
  line: pick.line ?? null,
  model_prob: pick.modelProb,
  fair_prob: pick.fairProb ?? null,
  edge: pick.edge ?? null,
  devig_method: pick.devigMethod ?? null,
  book_name: pick.bookName,
  book_price: pick.bookPrice,
  implied_prob: pick.impliedProb,
  ev: pick.ev,
  stake_units: pick.stakeUnits,
  confidence: pick.confidence,
  created_at: pick.createdAt ?? new Date().toISOString(),
});

// Audit log for VIP picks. Best-effort: if the pick_log table is missing the
// caller catches the error so a logging failure doesn't block a publish.
// Falls back to a column-compatible subset if the god-mode columns aren't
// migrated yet (so an older DB still records the core fields).
export const logPicks = async ({ fixture, picks }) => {
  if (!supabaseConfigured()) {
    return { logged: false, reason: "supabase not configured" };
  }
  const supabase = getSupabase();
  const rows = picks.map((pick) => pickRow(pick, fixture.id));
  let result = await supabase.from("pick_log").upsert(rows, { onConflict: "pick_id" });
  if (result.error && /line|fair_prob|edge|devig_method/.test(String(result.error.message ?? ""))) {
    const legacy = rows.map((r) => withoutKeys(r, ["line", "fair_prob", "edge", "devig_method"]));
    result = await supabase.from("pick_log").upsert(legacy, { onConflict: "pick_id" });
  }
  if (result.error) throw new Error(result.error.message);
  return { logged: true, count: rows.length };
};

// ---------------------------------------------------------------------------
// CLV + settlement.

// Closing line value: did we beat the market's final efficient price?
// For a back bet at price P with closing price C, CLV% = P/C - 1 (positive
// means we locked in a better-than-closing price — the #1 long-run signal).
export const closingLineValue = (bookPrice, closingPrice) => {
  const p = Number(bookPrice);
  const c = Number(closingPrice);
  if (!Number.isFinite(p) || !Number.isFinite(c) || p <= 1 || c <= 1) return null;
  return p / c - 1;
};

// Record the closing price for a pick and compute its CLV. Used at kickoff.
export const recordClosingLine = async (pickId, closingPrice) => {
  if (!supabaseConfigured()) return { ok: false, reason: "supabase not configured" };
  const supabase = getSupabase();
  const existing = await supabase.from("pick_log").select("book_price").eq("pick_id", pickId).maybeSingle();
  if (existing.error) throw new Error(existing.error.message);
  if (!existing.data) return { ok: false, reason: "pick not found" };
  const clv = closingLineValue(existing.data.book_price, closingPrice);
  const result = await supabase
    .from("pick_log")
    .update({ closing_price: Number(closingPrice), clv, updated_at: new Date().toISOString() })
    .eq("pick_id", pickId);
  if (result.error) throw new Error(result.error.message);
  return { ok: true, pickId, clv };
};

// Settle a pick: Win | Loss | Void. Optionally also record the closing price.
export const settlePick = async (pickId, { result: outcome, closingPrice = null } = {}) => {
  if (!supabaseConfigured()) return { ok: false, reason: "supabase not configured" };
  const valid = new Set(["Win", "Loss", "Void"]);
  if (!valid.has(outcome)) throw new Error(`Invalid result '${outcome}'. Use Win, Loss, or Void.`);
  const supabase = getSupabase();
  const patch = { result: outcome, settled_at: new Date().toISOString(), updated_at: new Date().toISOString() };
  if (closingPrice != null) {
    const existing = await supabase.from("pick_log").select("book_price").eq("pick_id", pickId).maybeSingle();
    if (existing.error) throw new Error(existing.error.message);
    if (existing.data) {
      patch.closing_price = Number(closingPrice);
      patch.clv = closingLineValue(existing.data.book_price, closingPrice);
    }
  }
  const res = await supabase.from("pick_log").update(patch).eq("pick_id", pickId);
  if (res.error) throw new Error(res.error.message);
  return { ok: true, pickId, result: outcome };
};

// Pure: turn pick_log rows into a performance summary. Testable without a DB.
// profit per settled pick (in units): Win -> stake*(price-1), Loss -> -stake,
// Void -> 0. ROI = profit / staked. CLV beat rate = share of picks priced at
// or above their closing line.
export const summarizePicks = (rows = []) => {
  const settled = rows.filter((r) => r.result === "Win" || r.result === "Loss" || r.result === "Void");
  let staked = 0, profit = 0, wins = 0, losses = 0, voids = 0;
  for (const r of settled) {
    const stake = Number(r.stake_units) || 0;
    const price = Number(r.book_price) || 0;
    if (r.result === "Win") { profit += stake * (price - 1); wins += 1; staked += stake; }
    else if (r.result === "Loss") { profit -= stake; losses += 1; staked += stake; }
    else { voids += 1; } // void: stake returned, excluded from staked turnover
  }
  const withClv = rows.filter((r) => r.clv != null && Number.isFinite(Number(r.clv)));
  const clvBeat = withClv.filter((r) => Number(r.clv) >= 0).length;
  const avgClv = withClv.length ? withClv.reduce((s, r) => s + Number(r.clv), 0) / withClv.length : null;

  return {
    totalPicks: rows.length,
    settled: settled.length,
    pending: rows.length - settled.length,
    wins,
    losses,
    voids,
    hitRate: wins + losses > 0 ? wins / (wins + losses) : null,
    stakedUnits: round2(staked),
    profitUnits: round2(profit),
    roi: staked > 0 ? profit / staked : null,
    clvTracked: withClv.length,
    clvBeatRate: withClv.length ? clvBeat / withClv.length : null,
    avgClv,
  };
};

// DB-backed analytics, optionally filtered by market or confidence.
export const vipAnalytics = async ({ market = null, confidence = null, limit = 1000 } = {}) => {
  if (!supabaseConfigured()) return { ok: false, reason: "supabase not configured" };
  const supabase = getSupabase();
  let query = supabase.from("pick_log").select("*").order("created_at", { ascending: false }).limit(limit);
  if (market) query = query.eq("market", market);
  if (confidence) query = query.eq("confidence", confidence);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return { ok: true, summary: summarizePicks(data ?? []), sample: (data ?? []).slice(0, 25) };
};

const round2 = (v) => Math.round(v * 100) / 100;
const round4 = (v) => Math.round(v * 10000) / 10000;

export const fixtureFromRow = (row) => ({
  id: row.match_id,
  date: row.match_date ?? "",
  time: row.match_time ?? "",
  teamA: row.team_a ?? "TBD",
  teamB: row.team_b ?? "TBD",
  stage: row.stage ?? "Match",
  venue: row.venue ?? "",
  status: row.status ?? "Scheduled",
  contentStatus: row.content_status ?? "Draft",
  sourceId: row.source_id ?? undefined,
  homeOdds: row.home_odds ?? undefined,
  drawOdds: row.draw_odds ?? undefined,
  awayOdds: row.away_odds ?? undefined,
});

export const ratingFromRow = (row) => ({
  team: row.team,
  form: Number(row.form_score ?? 6),
  attack: Number(row.attack ?? 6),
  defense: Number(row.defense ?? 6),
  midfield: Number(row.midfield ?? 6),
  depth: Number(row.squad_depth ?? 6),
  coach: Number(row.coach ?? 6),
  injuryImpact: Number(row.injury_impact ?? 2),
  motivation: Number(row.motivation ?? 7),
});

export const accuracyFromRow = (row) => ({
  matchId: row.match_id,
  finalScore: row.final_score ?? "",
  actualWinner: row.actual_winner ?? "",
  modelRead: row.model_read ?? "Pending",
  lesson: row.lesson ?? "",
});

export const contentFromRow = (row) => normalizeAiContent({
  telegram: row.telegram_post,
  xPost: row.x_post,
  thread: row.thread,
  shortsScript: row.shorts_script,
  videoTitle: row.video_title,
  reportSection: row.report_section,
  bettingAngle: row.betting_angle,
  safetyNotes: row.safety_notes,
});

export const withoutKeys = (row, keys) => Object.fromEntries(Object.entries(row).filter(([key]) => !keys.includes(key)));

export const fixtureRowFromFixture = (fixture) => ({
  match_id: fixture.id,
  match_date: fixture.date,
  match_time: fixture.time,
  team_a: fixture.teamA,
  team_b: fixture.teamB,
  stage: fixture.stage,
  venue: fixture.venue,
  status: fixture.status,
  content_status: fixture.contentStatus,
  source_id: fixture.sourceId,
  home_odds: fixture.homeOdds,
  draw_odds: fixture.drawOdds,
  away_odds: fixture.awayOdds,
});

export const contentRowFromContent = (matchId, content) => ({
  match_id: matchId,
  telegram_post: content.telegram,
  x_post: content.xPost,
  thread: content.thread,
  shorts_script: content.shortsScript,
  video_title: content.videoTitle,
  report_section: content.reportSection,
  betting_angle: content.bettingAngle || content.marketContext,
  safety_notes: content.safetyNotes,
});

export const ratingRowFromRating = (rating) => ({
  team: rating.team,
  form_score: rating.form,
  attack: rating.attack,
  defense: rating.defense,
  midfield: rating.midfield,
  squad_depth: rating.depth,
  coach: rating.coach,
  injury_impact: rating.injuryImpact,
  motivation: rating.motivation,
});

export const readSupabaseSnapshot = async () => {
  if (!process.env.SUPABASE_URL || (!process.env.SUPABASE_SERVICE_ROLE_KEY && !process.env.SUPABASE_PUBLISHABLE_KEY)) {
    return null;
  }
  const supabase = getSupabase();
  const [fixturesResult, contentResult] = await Promise.all([
    supabase.from("fixtures").select("*").order("match_date", { ascending: true }).order("match_time", { ascending: true }),
    supabase.from("content_outputs").select("*").order("match_id", { ascending: true }),
  ]);
  if (fixturesResult.error || contentResult.error) {
    throw fixturesResult.error ?? contentResult.error;
  }
  return {
    fixtures: (fixturesResult.data ?? []).map(fixtureFromRow),
    aiContent: Object.fromEntries((contentResult.data ?? []).map((row) => [row.match_id, contentFromRow(row)])),
  };
};

export const persistGeneratedContent = async ({ fixture, content }) => {
  if (!process.env.SUPABASE_URL || (!process.env.SUPABASE_SERVICE_ROLE_KEY && !process.env.SUPABASE_PUBLISHABLE_KEY)) {
    return { ok: false, skipped: true, reason: "Supabase is not configured" };
  }

  const supabase = getSupabase();
  const fixtureRow = fixtureRowFromFixture(fixture);
  let fixtureResult = await supabase.from("fixtures").upsert(fixtureRow, { onConflict: "match_id" });
  if (fixtureResult.error && String(fixtureResult.error.message ?? "").includes("away_odds")) {
    fixtureResult = await supabase.from("fixtures").upsert(withoutKeys(fixtureRow, ["home_odds", "draw_odds", "away_odds"]), { onConflict: "match_id" });
  }
  if (fixtureResult.error) throw fixtureResult.error;

  const contentRow = contentRowFromContent(fixture.id, content);
  let contentResult = await supabase.from("content_outputs").upsert(contentRow, { onConflict: "match_id" });
  if (contentResult.error && String(contentResult.error.message ?? "").includes("betting_angle")) {
    contentResult = await supabase.from("content_outputs").upsert(withoutKeys(contentRow, ["betting_angle"]), { onConflict: "match_id" });
  }
  if (contentResult.error) throw contentResult.error;

  return { ok: true, skipped: false };
};
