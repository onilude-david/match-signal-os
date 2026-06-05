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
  return {
    telegram: content.telegram || "",
    xPost: content.xPost || "",
    thread: content.thread || null,
    shortsScript: content.shortsScript || "",
    videoTitle: content.videoTitle || "",
    reportSection: content.reportSection || "",
    bettingAngle: content.bettingAngle || content.marketContext || "",
    safetyNotes: Array.isArray(content.safetyNotes) ? content.safetyNotes : [],
  };
};

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
