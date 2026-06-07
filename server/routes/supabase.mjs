import express from "express";
import { assertEnv, jsonError } from "../config/env.mjs";
import {
  getSupabase,
  fixtureRowFromFixture,
  ratingRowFromRating,
  contentRowFromContent,
  fixtureFromRow,
  ratingFromRow,
  accuracyFromRow,
  contentFromRow,
  withoutKeys,
  normalizeAiContent,
} from "../services/supabase.mjs";

const router = express.Router();

// POST /api/supabase/push
router.post("/push", async (req, res) => {
  if (!assertEnv(res, "SUPABASE_URL")) return;
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY && !process.env.SUPABASE_PUBLISHABLE_KEY) {
    jsonError(res, 501, "SUPABASE_SERVICE_ROLE_KEY or SUPABASE_PUBLISHABLE_KEY is not configured. Add one to .env and restart the API server.");
    return;
  }
  const { fixtures = [], ratings = [], accuracy = [], aiContent = {} } = req.body;
  const supabase = getSupabase();

  const tables = [
    {
      name: "fixtures",
      rows: fixtures.map(fixtureRowFromFixture),
      onConflict: "match_id",
    },
    {
      name: "team_ratings",
      rows: ratings.map(ratingRowFromRating),
      onConflict: "team",
    },
    {
      name: "accuracy_records",
      rows: accuracy.map((record) => ({
        match_id: record.matchId,
        final_score: record.finalScore,
        actual_winner: record.actualWinner,
        model_read: record.modelRead,
        lesson: record.lesson,
      })),
      onConflict: "match_id",
    },
    {
      name: "content_outputs",
      rows: Object.entries(aiContent).map(([matchId, content]) => contentRowFromContent(matchId, normalizeAiContent(content))),
      onConflict: "match_id",
    },
  ];

  const results = [];
  try {
    for (const table of tables) {
      if (!table.rows.length) {
        results.push({ table: table.name, rows: 0, skipped: true });
        continue;
      }
      let { error } = await supabase.from(table.name).upsert(table.rows, { onConflict: table.onConflict });
      if (error && table.name === "fixtures" && (String(error.message ?? "").includes("away_odds") || String(error.message ?? "").includes("source_id"))) {
        const compatibleRows = table.rows.map((row) => withoutKeys(row, ["home_odds", "draw_odds", "away_odds", "source_id"]));
        ({ error } = await supabase.from(table.name).upsert(compatibleRows, { onConflict: table.onConflict }));
      }
      if (error && table.name === "content_outputs" && String(error.message ?? "").includes("betting_angle")) {
        const compatibleRows = table.rows.map((row) => withoutKeys(row, ["betting_angle"]));
        ({ error } = await supabase.from(table.name).upsert(compatibleRows, { onConflict: table.onConflict }));
      }
      if (error) {
        jsonError(res, 502, `Supabase upsert failed for ${table.name}.`, error);
        return;
      }
      results.push({ table: table.name, rows: table.rows.length });
    }
    res.json({ ok: true, results });
  } catch (err) {
    jsonError(res, 500, "Supabase push failed.", err.message);
  }
});

// GET /api/supabase/state
router.get("/state", async (_req, res) => {
  if (!assertEnv(res, "SUPABASE_URL")) return;
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY && !process.env.SUPABASE_PUBLISHABLE_KEY) {
    jsonError(res, 501, "SUPABASE_SERVICE_ROLE_KEY or SUPABASE_PUBLISHABLE_KEY is not configured. Add one to .env and restart the API server.");
    return;
  }

  try {
    const supabase = getSupabase();
    const [
      fixturesResult,
      ratingsResult,
      accuracyResult,
      contentResult,
    ] = await Promise.all([
      supabase.from("fixtures").select("*").order("match_date", { ascending: true }).order("match_time", { ascending: true }),
      supabase.from("team_ratings").select("*").order("team", { ascending: true }),
      supabase.from("accuracy_records").select("*").order("match_id", { ascending: true }),
      supabase.from("content_outputs").select("*").order("match_id", { ascending: true }),
    ]);

    const failed = [fixturesResult, ratingsResult, accuracyResult, contentResult].find((result) => result.error);
    if (failed?.error) {
      jsonError(res, 502, "Supabase read failed.", failed.error);
      return;
    }

    const aiContent = Object.fromEntries((contentResult.data ?? []).map((row) => [row.match_id, contentFromRow(row)]));
    res.json({
      ok: true,
      source: "supabase",
      state: {
        fixtures: (fixturesResult.data ?? []).map(fixtureFromRow),
        ratings: (ratingsResult.data ?? []).map(ratingFromRow),
        accuracy: (accuracyResult.data ?? []).map(accuracyFromRow),
        aiContent,
      },
      counts: {
        fixtures: fixturesResult.data?.length ?? 0,
        ratings: ratingsResult.data?.length ?? 0,
        accuracy: accuracyResult.data?.length ?? 0,
        aiContent: Object.keys(aiContent).length,
      },
    });
  } catch (error) {
    jsonError(res, 502, "Supabase state load failed.", error.message);
  }
});

// POST /api/supabase/fixture
router.post("/fixture", async (req, res) => {
  if (!assertEnv(res, "SUPABASE_URL")) return;
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY && !process.env.SUPABASE_PUBLISHABLE_KEY) {
    jsonError(res, 501, "SUPABASE_SERVICE_ROLE_KEY or SUPABASE_PUBLISHABLE_KEY is not configured. Add one to .env and restart the API server.");
    return;
  }
  const fixture = req.body?.fixture;
  if (!fixture?.id) {
    jsonError(res, 400, "fixture.id is required.");
    return;
  }
  try {
    const supabase = getSupabase();
    const { error } = await supabase.from("fixtures").upsert(fixtureRowFromFixture(fixture), { onConflict: "match_id" });
    if (error) {
      jsonError(res, 502, "Supabase fixture upsert failed.", error);
      return;
    }
    res.json({ ok: true, fixtureId: fixture.id });
  } catch (err) {
    jsonError(res, 500, "Supabase single fixture upsert failed.", err.message);
  }
});

// POST /api/supabase/rating
router.post("/rating", async (req, res) => {
  if (!assertEnv(res, "SUPABASE_URL")) return;
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY && !process.env.SUPABASE_PUBLISHABLE_KEY) {
    jsonError(res, 501, "SUPABASE_SERVICE_ROLE_KEY or SUPABASE_PUBLISHABLE_KEY is not configured. Add one to .env and restart the API server.");
    return;
  }
  const rating = req.body?.rating;
  if (!rating?.team) {
    jsonError(res, 400, "rating.team is required.");
    return;
  }
  try {
    const supabase = getSupabase();
    const { error } = await supabase.from("team_ratings").upsert(ratingRowFromRating(rating), { onConflict: "team" });
    if (error) {
      jsonError(res, 502, "Supabase rating upsert failed.", error);
      return;
    }
    res.json({ ok: true, team: rating.team });
  } catch (err) {
    jsonError(res, 500, "Supabase rating upsert failed.", err.message);
  }
});

// POST /api/supabase/content
router.post("/content", async (req, res) => {
  if (!assertEnv(res, "SUPABASE_URL")) return;
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY && !process.env.SUPABASE_PUBLISHABLE_KEY) {
    jsonError(res, 501, "SUPABASE_SERVICE_ROLE_KEY or SUPABASE_PUBLISHABLE_KEY is not configured. Add one to .env and restart the API server.");
    return;
  }
  const { matchId, content, fixture } = req.body ?? {};
  if (!matchId || !content) {
    jsonError(res, 400, "matchId and content are required.");
    return;
  }
  try {
    const supabase = getSupabase();

    // content_outputs has a FK to fixtures(match_id). If the caller provided a
    // fixture payload, upsert it first; otherwise verify a row already exists
    // so we can surface a clearer error than the raw 23503 FK violation.
    if (fixture && fixture.id) {
      let fixtureUpsert = await supabase
        .from("fixtures")
        .upsert(fixtureRowFromFixture({ ...fixture, id: matchId }), { onConflict: "match_id" });
      if (fixtureUpsert.error && String(fixtureUpsert.error.message ?? "").match(/source_id|away_odds/)) {
        fixtureUpsert = await supabase
          .from("fixtures")
          .upsert(withoutKeys(fixtureRowFromFixture({ ...fixture, id: matchId }), ["home_odds", "draw_odds", "away_odds", "source_id"]), { onConflict: "match_id" });
      }
      if (fixtureUpsert.error) {
        jsonError(res, 502, "Supabase fixture upsert (pre-content) failed.", fixtureUpsert.error);
        return;
      }
    } else {
      const exists = await supabase.from("fixtures").select("match_id").eq("match_id", matchId).maybeSingle();
      if (exists.error) {
        jsonError(res, 502, "Supabase fixture lookup failed.", exists.error);
        return;
      }
      if (!exists.data) {
        jsonError(
          res,
          409,
          `Fixture ${matchId} is not in the fixtures table yet. Pass { fixture: {...} } in the request body, or POST /api/supabase/fixture first.`,
        );
        return;
      }
    }

    let { error } = await supabase
      .from("content_outputs")
      .upsert(contentRowFromContent(matchId, normalizeAiContent(content)), { onConflict: "match_id" });
    if (error && String(error.message ?? "").includes("betting_angle")) {
      ({ error } = await supabase
        .from("content_outputs")
        .upsert(withoutKeys(contentRowFromContent(matchId, normalizeAiContent(content)), ["betting_angle"]), { onConflict: "match_id" }));
    }
    if (error) {
      jsonError(res, 502, "Supabase content upsert failed.", error);
      return;
    }
    res.json({ ok: true, matchId });
  } catch (err) {
    jsonError(res, 500, "Supabase content upsert failed.", err.message);
  }
});

// DELETE /api/supabase/fixtures/:matchId
router.delete("/fixtures/:matchId", async (req, res) => {
  if (!assertEnv(res, "SUPABASE_URL")) return;
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY && !process.env.SUPABASE_PUBLISHABLE_KEY) {
    jsonError(res, 501, "SUPABASE_SERVICE_ROLE_KEY or SUPABASE_PUBLISHABLE_KEY is not configured. Add one to .env and restart the API server.");
    return;
  }

  try {
    const supabase = getSupabase();
    const { error } = await supabase.from("fixtures").delete().eq("match_id", req.params.matchId);
    if (error) {
      jsonError(res, 502, "Supabase fixture delete failed.", error);
      return;
    }
    res.json({ ok: true, deleted: req.params.matchId });
  } catch (err) {
    jsonError(res, 500, "Supabase fixture delete failed.", err.message);
  }
});

export default router;
