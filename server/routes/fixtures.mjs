import express from "express";
import { assertEnv, jsonError } from "../config/env.mjs";
import {
  readAppState,
  writeAppState,
  fetchLiveWorldCupFixtures,
  nextFixtures,
} from "../services/telegram.mjs";
import {
  sportradarFetch,
  sportradarEventToFixture,
  mergeFixtureSources,
} from "../services/sportradar.mjs";
import {
  getSupabase,
  fixtureRowFromFixture,
  withoutKeys,
} from "../services/supabase.mjs";

const router = express.Router();

// GET /api/state
router.get("/state", async (_req, res) => {
  try {
    const state = await readAppState();
    res.json({ ok: true, state });
  } catch {
    res.json({ ok: true, state: null });
  }
});

// PUT /api/state
router.put("/state", async (req, res) => {
  try {
    await writeAppState(req.body);
    res.json({ ok: true, savedAt: new Date().toISOString() });
  } catch (error) {
    jsonError(res, 500, "Failed to save state.", error.message);
  }
});

// GET /api/fixtures
router.get("/fixtures", async (req, res) => {
  if (!assertEnv(res, "FOOTBALL_DATA_TOKEN")) return;

  const params = new URLSearchParams();
  if (req.query.dateFrom) params.set("dateFrom", String(req.query.dateFrom));
  if (req.query.dateTo) params.set("dateTo", String(req.query.dateTo));
  const competition = req.query.competition ? String(req.query.competition) : "";
  const url = competition
    ? `https://api.football-data.org/v4/competitions/${encodeURIComponent(competition)}/matches?${params}`
    : `https://api.football-data.org/v4/matches?${params}`;

  try {
    const response = await fetch(url, {
      headers: { "X-Auth-Token": process.env.FOOTBALL_DATA_TOKEN },
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      jsonError(res, response.status, "Football data request failed.", body);
      return;
    }
    // We import footballDataMatchToFixture if needed, or get it from telegram service
    const { footballDataMatchToFixture } = await import("../services/telegram.mjs");
    res.json({
      ok: true,
      source: "football-data.org",
      fixtures: (body.matches ?? []).map(footballDataMatchToFixture),
      rawCount: body.resultSet?.count ?? body.matches?.length ?? 0,
    });
  } catch (error) {
    jsonError(res, 502, "Football data request failed.", error.message);
  }
});

// POST /api/fixtures/sync-world-cup
router.post("/fixtures/sync-world-cup", async (_req, res) => {
  if (!assertEnv(res, "FOOTBALL_DATA_TOKEN") || !assertEnv(res, "SPORTRADAR_API_KEY")) return;
  if (!process.env.SUPABASE_URL || (!process.env.SUPABASE_SERVICE_ROLE_KEY && !process.env.SUPABASE_PUBLISHABLE_KEY)) {
    jsonError(res, 501, "Supabase is not configured for fixture sync.");
    return;
  }

  try {
    const params = new URLSearchParams({ dateFrom: "2026-06-11", dateTo: "2026-07-19" });
    const footballResponse = await fetch(`https://api.football-data.org/v4/competitions/WC/matches?${params}`, {
      headers: { "X-Auth-Token": process.env.FOOTBALL_DATA_TOKEN },
    });
    const footballBody = await footballResponse.json().catch(() => ({}));
    if (!footballResponse.ok) {
      jsonError(res, footballResponse.status, "Football-data World Cup sync failed.", footballBody);
      return;
    }

    const sportradarSeasonId = process.env.SPORTRADAR_WORLD_CUP_2026_SEASON_ID ?? "sr:season:101177";
    const sportradarBody = await sportradarFetch(`/seasons/${encodeURIComponent(sportradarSeasonId)}/schedules.json`);
    const { footballDataMatchToFixture } = await import("../services/telegram.mjs");
    const footballDataFixtures = (footballBody.matches ?? []).map(footballDataMatchToFixture);
    const sportradarFixtures = (sportradarBody.schedules ?? []).map((schedule) => sportradarEventToFixture(schedule));
    const fixtures = mergeFixtureSources(footballDataFixtures, sportradarFixtures);

    const supabase = getSupabase();
    const rows = fixtures.map(fixtureRowFromFixture);
    let { error } = await supabase.from("fixtures").upsert(rows, { onConflict: "match_id" });
    if (error && String(error.message ?? "").includes("source_id")) {
      ({ error } = await supabase.from("fixtures").upsert(rows.map((row) => withoutKeys(row, ["source_id"])), { onConflict: "match_id" }));
    }
    if (error) {
      jsonError(res, 502, "Supabase fixture sync save failed.", error);
      return;
    }
    const cleanup = await supabase.from("fixtures").delete().like("match_id", "sr:%");
    if (cleanup.error) {
      jsonError(res, 502, "Supabase duplicate Sportradar cleanup failed.", cleanup.error);
      return;
    }

    res.json({
      ok: true,
      source: "football-data + sportradar",
      footballDataCount: footballDataFixtures.length,
      sportradarCount: sportradarFixtures.length,
      mergedCount: fixtures.length,
      enrichedCount: fixtures.filter((fixture) => fixture.sourceId).length,
      fixtures,
    });
  } catch (error) {
    jsonError(res, error.status ?? 502, "World Cup dual-source sync failed.", error.details ?? error.message);
  }
});

// GET /api/telegram/live-fixtures/status (Note: the implementation plan mounts this, but it matches the legacy path)
router.get("/telegram/live-fixtures/status", async (req, res) => {
  try {
    const force = req.query.force === "true";
    const live = await fetchLiveWorldCupFixtures({ force });
    res.json({
      ok: !live.error,
      source: live.source,
      count: live.fixtures.length,
      error: live.error,
      cacheAgeMs: null, // Let's simplify or keep it simple
      next: nextFixtures(live.fixtures, 3),
    });
  } catch (error) {
    jsonError(res, 500, "Failed to get live fixtures status.", error.message);
  }
});

export default router;
