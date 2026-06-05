import express from "express";
import { assertEnv, jsonError } from "../config/env.mjs";
import {
  sportradarBaseUrl,
  sportradarFetch,
  sportradarEventToFixture,
  encodeSportradarUrn,
} from "../services/sportradar.mjs";

const router = express.Router();

// GET /api/sportradar/status
router.get("/status", (_req, res) => {
  res.json({
    ok: true,
    configured: Boolean(process.env.SPORTRADAR_API_KEY),
    product: process.env.SPORTRADAR_SOCCER_PRODUCT ?? "soccer",
    accessLevel: process.env.SPORTRADAR_ACCESS_LEVEL ?? "trial",
    language: process.env.SPORTRADAR_LANGUAGE ?? "en",
    baseUrl: sportradarBaseUrl(),
    docs: "https://api.sportradar.com/soccer/trial/v4/openapi/swagger/index.html",
  });
});

// GET /api/sportradar/competitions
router.get("/competitions", async (_req, res) => {
  if (!assertEnv(res, "SPORTRADAR_API_KEY")) return;
  try {
    const body = await sportradarFetch("/competitions.json");
    res.json({ ok: true, source: "sportradar", competitions: body.competitions ?? [], raw: body });
  } catch (error) {
    jsonError(res, error.status ?? 502, "Sportradar competitions request failed.", error.details ?? error.message);
  }
});

// GET /api/sportradar/competitions/:competitionId/seasons
router.get("/competitions/:competitionId/seasons", async (req, res) => {
  if (!assertEnv(res, "SPORTRADAR_API_KEY")) return;
  try {
    const body = await sportradarFetch(`/competitions/${encodeSportradarUrn(req.params.competitionId)}/seasons.json`);
    res.json({ ok: true, source: "sportradar", seasons: body.seasons ?? [], raw: body });
  } catch (error) {
    jsonError(res, error.status ?? 502, "Sportradar competition seasons request failed.", error.details ?? error.message);
  }
});

// GET /api/sportradar/seasons
router.get("/seasons", async (_req, res) => {
  if (!assertEnv(res, "SPORTRADAR_API_KEY")) return;
  try {
    const body = await sportradarFetch("/seasons.json");
    res.json({ ok: true, source: "sportradar", seasons: body.seasons ?? [], raw: body });
  } catch (error) {
    jsonError(res, error.status ?? 502, "Sportradar seasons request failed.", error.details ?? error.message);
  }
});

// GET /api/sportradar/seasons/:seasonId/info
router.get("/seasons/:seasonId/info", async (req, res) => {
  if (!assertEnv(res, "SPORTRADAR_API_KEY")) return;
  try {
    const body = await sportradarFetch(`/seasons/${encodeSportradarUrn(req.params.seasonId)}/info.json`);
    res.json({ ok: true, source: "sportradar", info: body, raw: body });
  } catch (error) {
    jsonError(res, error.status ?? 502, "Sportradar season info request failed.", error.details ?? error.message);
  }
});

// GET /api/sportradar/seasons/:seasonId/schedules
router.get("/seasons/:seasonId/schedules", async (req, res) => {
  if (!assertEnv(res, "SPORTRADAR_API_KEY")) return;
  try {
    const body = await sportradarFetch(`/seasons/${encodeSportradarUrn(req.params.seasonId)}/schedules.json`);
    const schedules = body.schedules ?? [];
    res.json({
      ok: true,
      source: "sportradar",
      rawCount: schedules.length,
      fixtures: schedules.map((schedule) => sportradarEventToFixture(schedule)),
      raw: body,
    });
  } catch (error) {
    jsonError(res, error.status ?? 502, "Sportradar season schedules request failed.", error.details ?? error.message);
  }
});

// GET /api/sportradar/seasons/:seasonId/standings
router.get("/seasons/:seasonId/standings", async (req, res) => {
  if (!assertEnv(res, "SPORTRADAR_API_KEY")) return;
  try {
    const body = await sportradarFetch(`/seasons/${encodeSportradarUrn(req.params.seasonId)}/standings.json`);
    res.json({ ok: true, source: "sportradar", standings: body.standings ?? [], raw: body });
  } catch (error) {
    jsonError(res, error.status ?? 502, "Sportradar standings request failed.", error.details ?? error.message);
  }
});

// GET /api/sportradar/seasons/:seasonId/lineups
router.get("/seasons/:seasonId/lineups", async (req, res) => {
  if (!assertEnv(res, "SPORTRADAR_API_KEY")) return;
  try {
    const body = await sportradarFetch(`/seasons/${encodeSportradarUrn(req.params.seasonId)}/lineups.json`);
    res.json({ ok: true, source: "sportradar", lineups: body.lineups ?? body.sport_events ?? [], raw: body });
  } catch (error) {
    jsonError(res, error.status ?? 502, "Sportradar season lineups request failed.", error.details ?? error.message);
  }
});

// GET /api/sportradar/seasons/:seasonId/missing-players
router.get("/seasons/:seasonId/missing-players", async (req, res) => {
  if (!assertEnv(res, "SPORTRADAR_API_KEY")) return;
  try {
    const body = await sportradarFetch(`/seasons/${encodeSportradarUrn(req.params.seasonId)}/missing_players.json`);
    res.json({ ok: true, source: "sportradar", missingPlayers: body.missing_players ?? [], raw: body });
  } catch (error) {
    jsonError(res, error.status ?? 502, "Sportradar missing players request failed.", error.details ?? error.message);
  }
});

// GET /api/sportradar/live/:feed
router.get("/live/:feed", async (req, res) => {
  if (!assertEnv(res, "SPORTRADAR_API_KEY")) return;
  const allowedFeeds = new Set(["schedules", "summaries", "timelines", "timelines_delta"]);
  if (!allowedFeeds.has(req.params.feed)) {
    jsonError(res, 400, "Unsupported Sportradar live feed. Use schedules, summaries, timelines, or timelines_delta.");
    return;
  }
  try {
    const body = await sportradarFetch(`/schedules/live/${req.params.feed}.json`);
    res.json({ ok: true, source: "sportradar", feed: req.params.feed, raw: body });
  } catch (error) {
    jsonError(res, error.status ?? 502, "Sportradar live feed request failed.", error.details ?? error.message);
  }
});

// GET /api/sportradar/schedules/:date
router.get("/schedules/:date", async (req, res) => {
  if (!assertEnv(res, "SPORTRADAR_API_KEY")) return;
  try {
    const body = await sportradarFetch(`/schedules/${req.params.date}/schedules.json`);
    const schedules = body.schedules ?? [];
    res.json({
      ok: true,
      source: "sportradar",
      date: req.params.date,
      rawCount: schedules.length,
      fixtures: schedules.map((schedule) => sportradarEventToFixture(schedule)),
      raw: body,
    });
  } catch (error) {
    jsonError(res, error.status ?? 502, "Sportradar schedule request failed.", error.details ?? error.message);
  }
});

// GET /api/sportradar/schedules/:date/summaries
router.get("/schedules/:date/summaries", async (req, res) => {
  if (!assertEnv(res, "SPORTRADAR_API_KEY")) return;
  try {
    const body = await sportradarFetch(`/schedules/${req.params.date}/summaries.json`);
    res.json({ ok: true, source: "sportradar", date: req.params.date, summaries: body.summaries ?? [], raw: body });
  } catch (error) {
    jsonError(res, error.status ?? 502, "Sportradar daily summaries request failed.", error.details ?? error.message);
  }
});

// GET /api/sportradar/sport-events/:eventId/summary
router.get("/sport-events/:eventId/summary", async (req, res) => {
  if (!assertEnv(res, "SPORTRADAR_API_KEY")) return;
  try {
    const body = await sportradarFetch(`/sport_events/${encodeSportradarUrn(req.params.eventId)}/summary.json`);
    res.json({ ok: true, source: "sportradar", summary: body });
  } catch (error) {
    jsonError(res, error.status ?? 502, "Sportradar sport event summary request failed.", error.details ?? error.message);
  }
});

// GET /api/sportradar/sport-events/:eventId/timeline
router.get("/sport-events/:eventId/timeline", async (req, res) => {
  if (!assertEnv(res, "SPORTRADAR_API_KEY")) return;
  try {
    const body = await sportradarFetch(`/sport_events/${encodeSportradarUrn(req.params.eventId)}/timeline.json`);
    res.json({ ok: true, source: "sportradar", timeline: body });
  } catch (error) {
    jsonError(res, error.status ?? 502, "Sportradar sport event timeline request failed.", error.details ?? error.message);
  }
});

// GET /api/sportradar/sport-events/:eventId/lineups
router.get("/sport-events/:eventId/lineups", async (req, res) => {
  if (!assertEnv(res, "SPORTRADAR_API_KEY")) return;
  try {
    const body = await sportradarFetch(`/sport_events/${encodeSportradarUrn(req.params.eventId)}/lineups.json`);
    res.json({ ok: true, source: "sportradar", lineups: body.lineups ?? body, raw: body });
  } catch (error) {
    jsonError(res, error.status ?? 502, "Sportradar sport event lineups request failed.", error.details ?? error.message);
  }
});

// GET /api/sportradar/sport-events/:eventId/momentum
router.get("/sport-events/:eventId/momentum", async (req, res) => {
  if (!assertEnv(res, "SPORTRADAR_API_KEY")) return;
  try {
    const body = await sportradarFetch(`/sport_events/${encodeSportradarUrn(req.params.eventId)}/momentum.json`);
    res.json({ ok: true, source: "sportradar", momentum: body.momentum ?? body, raw: body });
  } catch (error) {
    jsonError(res, error.status ?? 502, "Sportradar sport event momentum request failed.", error.details ?? error.message);
  }
});

export default router;
