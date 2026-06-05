import express from "express";
import { assertEnv, jsonError } from "../config/env.mjs";
import {
  configuredSocialVendors,
  normalizeSocialPayload,
  publishWithSocialVendor,
  officialSocialApis,
} from "../services/social.mjs";

const router = express.Router();

// GET /api/social/status
router.get("/social/status", (_req, res) => {
  const primaryProvider = process.env.SOCIAL_PRIMARY_PROVIDER || "postproxy";
  res.json({
    ok: true,
    primaryProvider,
    dryRunDefault: process.env.SOCIAL_DRY_RUN !== "false",
    vendors: configuredSocialVendors(),
    officialApis: officialSocialApis.map((api) => ({
      key: api.key,
      label: api.label,
      configured: api.configured(),
      docs: api.docs,
    })),
  });
});

// POST /api/social/publish
router.post("/social/publish", async (req, res) => {
  const provider = String(req.body.provider || process.env.SOCIAL_PRIMARY_PROVIDER || "postproxy").toLowerCase();
  const dryRun = req.body.dryRun ?? process.env.SOCIAL_DRY_RUN !== "false";
  const payload = normalizeSocialPayload(req.body);

  if (!payload.text && !payload.mediaUrls.length) {
    jsonError(res, 400, "text or mediaUrls are required.");
    return;
  }

  if (!payload.platforms.length) {
    jsonError(res, 400, "At least one target platform is required.");
    return;
  }

  if (dryRun) {
    res.json({
      ok: true,
      dryRun: true,
      provider,
      payload,
      note: "Dry run only. Set dryRun=false and configure the provider API key/base URL to publish.",
    });
    return;
  }

  try {
    const result = await publishWithSocialVendor({ provider, payload });
    res.json({ ok: true, dryRun: false, provider, result });
  } catch (error) {
    jsonError(res, 502, error.message);
  }
});

// GET /api/odds-api/sync
router.get("/odds-api/sync", async (req, res) => {
  if (!assertEnv(res, "ODDS_API_KEY")) return;
  const apiKey = process.env.ODDS_API_KEY.trim();
  try {
    const response = await fetch(`https://api.the-odds-api.com/v4/sports/soccer_fifa_world_cup/odds?apiKey=${apiKey}&regions=us,eu,uk&markets=h2h`);
    const body = await response.json().catch(() => ({}));
    if (!response.ok) return jsonError(res, response.status, "Odds API request failed", body);
    res.json({ ok: true, events: body });
  } catch (error) {
    jsonError(res, 502, "Odds API sync failed.", error.message);
  }
});

export default router;
