import express from "express";
import { assertEnv, jsonError } from "../config/env.mjs";
import path from "node:path";
import { access } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  telegramSendMessage,
  telegramSendVideo,
  telegramRequest,
  telegramPolling,
  handleTelegramUpdate,
} from "../services/telegram.mjs";
import { publicSafetyMiddleware, publicSafetyCheck } from "../services/safetyFilter.mjs";
import { computePicks, buildVipMessage, responsibleGamblingFooter } from "../services/picks.mjs";

const router = express.Router();

const telegramCommands = [
  { command: "today", description: "Show today's match queue" },
  { command: "generate", description: "Generate selected match intelligence" },
  { command: "preview", description: "Send the latest admin preview" },
  { command: "approve", description: "Approve current content draft" },
  { command: "stats", description: "Show operator stats" },
  { command: "help", description: "Show Match Signal commands" },
];

// Operator-configurable jurisdictional gate. Comma-separated list of allowed
// jurisdictions (free-text labels — operator decides what the channel covers).
// Empty means VIP publishing is disabled. This is intentionally simple: no IP
// geo, just an explicit operator opt-in per region the channel is allowed in.
const vipPublishingEnabled = () => {
  if (process.env.VIP_PUBLISH_ENABLED === "false") return false;
  const jurisdictions = String(process.env.VIP_JURISDICTIONS ?? "").trim();
  return Boolean(process.env.TELEGRAM_BETTING_CHANNEL_ID) && jurisdictions.length > 0;
};

// POST /api/telegram/send
router.post("/send", async (req, res) => {
  if (!assertEnv(res, "TELEGRAM_BOT_TOKEN")) return;
  const { chatId, text, parseMode } = req.body;
  if (!chatId || !text) {
    jsonError(res, 400, "chatId and text are required.");
    return;
  }
  try {
    const result = await telegramSendMessage({ chatId, text, parseMode });
    res.json({ ok: true, result });
  } catch (error) {
    jsonError(res, 502, error.message);
  }
});

// GET /api/telegram/status
router.get("/status", async (_req, res) => {
  if (!assertEnv(res, "TELEGRAM_BOT_TOKEN")) return;
  try {
    const me = await telegramRequest("getMe");
    const commands = await telegramRequest("getMyCommands");
    res.json({
      ok: true,
      bot: me.result,
      commands: commands.result,
      adminConfigured: Boolean(process.env.TELEGRAM_ADMIN_CHAT_ID),
      publicChannelConfigured: Boolean(process.env.TELEGRAM_PUBLIC_CHANNEL_ID),
      vipChannelConfigured: Boolean(process.env.TELEGRAM_BETTING_CHANNEL_ID),
      vipPublishEnabled: vipPublishingEnabled(),
      vipJurisdictions: String(process.env.VIP_JURISDICTIONS ?? "").trim(),
    });
  } catch (error) {
    jsonError(res, 502, error.message);
  }
});

// POST /api/telegram/setup
router.post("/setup", async (_req, res) => {
  if (!assertEnv(res, "TELEGRAM_BOT_TOKEN")) return;
  try {
    const result = await telegramRequest("setMyCommands", { commands: telegramCommands });
    res.json({ ok: true, result, commands: telegramCommands });
  } catch (error) {
    jsonError(res, 502, error.message);
  }
});

// GET /api/telegram/polling/status
router.get("/polling/status", (_req, res) => {
  res.json({
    ok: true,
    polling: telegramPolling,
    enabled: process.env.TELEGRAM_POLLING_ENABLED !== "false",
  });
});

// POST /api/telegram/webhook
// Always respond 2xx to Telegram. A non-2xx response causes Telegram to retry
// the same update indefinitely, which can stampede the bot.
//
// This route is exempt from the API-key gate (Telegram can't send custom auth
// headers), so it gets Telegram's own mechanism instead: register the webhook
// with setWebhook's secret_token parameter and set the same value in
// TELEGRAM_WEBHOOK_SECRET. Telegram then sends it back on every update as the
// X-Telegram-Bot-Api-Secret-Token header, and forged requests get a 401.
router.post("/webhook", async (req, res) => {
  if (!assertEnv(res, "TELEGRAM_BOT_TOKEN")) return;
  const webhookSecret = (process.env.TELEGRAM_WEBHOOK_SECRET ?? "").trim();
  if (webhookSecret && req.header("x-telegram-bot-api-secret-token") !== webhookSecret) {
    res.status(401).json({ ok: false, error: "Invalid webhook secret token." });
    return;
  }
  try {
    await handleTelegramUpdate(req.body);
    res.json({ ok: true });
  } catch (error) {
    console.error("[telegram/webhook] handler error:", error?.message ?? error);
    // 200 with ok:false: handler failed but we don't want Telegram retries.
    res.status(200).json({ ok: false, handled: false, error: error?.message ?? String(error) });
  }
});

// POST /api/telegram/preview
// Operator inbox. Public-safe: anything sent here will likely go to public next,
// so we hold it to the same standard. To preview a VIP message, use /vip/preview.
router.post("/preview", publicSafetyMiddleware, async (req, res) => {
  if (!assertEnv(res, "TELEGRAM_BOT_TOKEN") || !assertEnv(res, "TELEGRAM_ADMIN_CHAT_ID")) return;
  const { text, parseMode, matchId } = req.body;
  if (!text) {
    jsonError(res, 400, "text is required.");
    return;
  }
  try {
    const result = await telegramRequest("sendMessage", {
      chat_id: process.env.TELEGRAM_ADMIN_CHAT_ID,
      text,
      disable_web_page_preview: true,
      ...(parseMode ? { parse_mode: parseMode } : {}),
      reply_markup: {
        inline_keyboard: [
          [
            { text: "Approve", callback_data: `approve:${matchId ?? "current"}` },
            { text: "Revise", callback_data: `revise:${matchId ?? "current"}` },
          ],
          [{ text: "Mark Posted", callback_data: `posted:${matchId ?? "current"}` }],
        ],
      },
    });
    res.json({ ok: true, result });
  } catch (error) {
    jsonError(res, 502, error.message);
  }
});

// POST /api/telegram/public
// PUBLIC channel — strictest filter applied.
router.post("/public", publicSafetyMiddleware, async (req, res) => {
  if (!assertEnv(res, "TELEGRAM_BOT_TOKEN") || !assertEnv(res, "TELEGRAM_PUBLIC_CHANNEL_ID")) return;
  const { text, parseMode } = req.body;
  if (!text) {
    jsonError(res, 400, "text is required.");
    return;
  }
  try {
    const result = await telegramSendMessage({
      chatId: process.env.TELEGRAM_PUBLIC_CHANNEL_ID,
      text,
      parseMode,
    });
    res.json({ ok: true, result });
  } catch (error) {
    jsonError(res, 502, error.message);
  }
});

// POST /api/telegram/market-context
// Public-safe market context (attention, volatility, pressure) for the
// operator's admin inbox or the public channel. Replaces the old /betting
// route which was confusingly named — that one is now deprecated below.
router.post("/market-context", publicSafetyMiddleware, async (req, res) => {
  if (!assertEnv(res, "TELEGRAM_BOT_TOKEN") || !assertEnv(res, "TELEGRAM_ADMIN_CHAT_ID")) return;
  const { text, parseMode, target = "admin" } = req.body;
  if (!text) {
    jsonError(res, 400, "text is required.");
    return;
  }
  const chatId = target === "public"
    ? process.env.TELEGRAM_PUBLIC_CHANNEL_ID
    : process.env.TELEGRAM_ADMIN_CHAT_ID;
  if (target === "public" && !process.env.TELEGRAM_PUBLIC_CHANNEL_ID) {
    return jsonError(res, 501, "TELEGRAM_PUBLIC_CHANNEL_ID is not configured.");
  }
  try {
    const result = await telegramSendMessage({ chatId, text, parseMode });
    res.json({ ok: true, result });
  } catch (error) {
    jsonError(res, 502, error.message);
  }
});

// POST /api/telegram/clip
// Publish a locally-rendered video clip to a Telegram destination.
// Body: { videoPath, caption?, parseMode?, target?: "admin"|"public"|"vip", duration?, width?, height? }
//
// Path resolution: we accept either an absolute path or a path relative to
// the project root. Public-safety filter applies to the caption before any
// upload happens.
router.post("/clip", async (req, res) => {
  if (!assertEnv(res, "TELEGRAM_BOT_TOKEN")) return;

  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const rootDir = path.resolve(__dirname, "../..");

  const { videoPath: rawPath, caption = "", parseMode, target = "admin", duration, width, height } = req.body ?? {};
  if (!rawPath) {
    jsonError(res, 400, "videoPath is required.");
    return;
  }

  // Caption guard — same gate as text routes.
  if (caption) {
    const verdict = publicSafetyCheck(caption);
    if (!verdict.ok) {
      return res.status(400).json({
        ok: false,
        error: "Public-safety filter rejected the caption.",
        verdict,
      });
    }
  }

  // Choose destination channel id by target.
  let chatId;
  if (target === "public") {
    chatId = process.env.TELEGRAM_PUBLIC_CHANNEL_ID;
    if (!chatId) return jsonError(res, 501, "TELEGRAM_PUBLIC_CHANNEL_ID is not configured.");
  } else if (target === "vip") {
    chatId = process.env.TELEGRAM_BETTING_CHANNEL_ID;
    if (!chatId) return jsonError(res, 501, "TELEGRAM_BETTING_CHANNEL_ID is not configured.");
    if (!vipPublishingEnabled()) {
      return res.status(403).json({
        ok: false,
        error: "VIP publishing is not enabled.",
        hint: "Set VIP_JURISDICTIONS and VIP_PUBLISH_ENABLED!=false in .env.",
      });
    }
  } else {
    chatId = process.env.TELEGRAM_ADMIN_CHAT_ID;
    if (!chatId) return jsonError(res, 501, "TELEGRAM_ADMIN_CHAT_ID is not configured.");
  }

  // Resolve videoPath: absolute or root-relative.
  const videoPath = path.isAbsolute(rawPath) ? rawPath : path.resolve(rootDir, rawPath);
  try {
    await access(videoPath);
  } catch {
    return jsonError(res, 404, `Video file not found at ${videoPath}`);
  }

  try {
    const result = await telegramSendVideo({
      chatId,
      videoPath,
      caption,
      parseMode,
      duration,
      width,
      height,
    });
    res.json({
      ok: true,
      target,
      messageId: result.result?.message_id ?? null,
      chatId: result.result?.chat?.id ?? chatId,
      result,
    });
  } catch (error) {
    jsonError(res, 502, error.message);
  }
});

// POST /api/telegram/betting  (DEPRECATED — 410 Gone)
// Old route name. Returns a clear error so existing clients fail loudly rather
// than silently publish unsafe content to the wrong channel.
router.post("/betting", (_req, res) => {
  res.status(410).json({
    ok: false,
    error: "/api/telegram/betting is deprecated.",
    hint: "For public editorial market context use POST /api/telegram/market-context. For VIP picks use POST /api/telegram/vip (gated; see README VIP scope).",
  });
});

// POST /api/telegram/vip/preview
// Build a VIP picks message from the fixture + ratings, return the formatted
// message body WITHOUT sending. Operator uses this to review before publish.
router.post("/vip/preview", async (req, res) => {
  const { fixture, teamRatings = [] } = req.body ?? {};
  if (!fixture) {
    return jsonError(res, 400, "fixture is required.");
  }
  const picks = computePicks(fixture, teamRatings);
  const message = buildVipMessage(fixture, picks);
  res.json({
    ok: true,
    picks,
    message,
    vipPublishEnabled: vipPublishingEnabled(),
    jurisdictions: String(process.env.VIP_JURISDICTIONS ?? "").trim().split(",").map((s) => s.trim()).filter(Boolean),
  });
});

// POST /api/telegram/vip
// Publish picks to the VIP channel ONLY. Triple-gated:
//   1. TELEGRAM_BOT_TOKEN must be configured
//   2. TELEGRAM_BETTING_CHANNEL_ID must be configured
//   3. VIP_JURISDICTIONS must be set (operator explicitly opts in per region)
//   4. VIP_PUBLISH_ENABLED must not be "false"
// Every successful publish writes an audit row {ts, fixtureId, picks[]} to
// Supabase pick_log (best-effort — failure to log does not block the send,
// but is reported in the response).
router.post("/vip", async (req, res) => {
  if (!assertEnv(res, "TELEGRAM_BOT_TOKEN")) return;
  if (!assertEnv(res, "TELEGRAM_BETTING_CHANNEL_ID")) return;
  if (!vipPublishingEnabled()) {
    return res.status(403).json({
      ok: false,
      error: "VIP publishing is not enabled.",
      hint: "Set VIP_JURISDICTIONS=US,UK,... and VIP_PUBLISH_ENABLED!=false in .env to enable. See README VIP scope.",
    });
  }

  const { fixture, teamRatings = [], narrative = "" } = req.body ?? {};
  if (!fixture) {
    return jsonError(res, 400, "fixture is required.");
  }

  const picks = computePicks(fixture, teamRatings);
  if (!picks.length) {
    return res.status(200).json({
      ok: false,
      published: false,
      reason: "No value picks at current prices. Nothing was published.",
    });
  }

  const baseMessage = buildVipMessage(fixture, picks);
  const message = narrative ? `${baseMessage}\n\nNote: ${narrative}` : baseMessage;

  try {
    const result = await telegramSendMessage({
      chatId: process.env.TELEGRAM_BETTING_CHANNEL_ID,
      text: message,
    });

    // Best-effort audit log
    let audit = { logged: false };
    try {
      const { logPicks } = await import("../services/supabase.mjs");
      if (typeof logPicks === "function") {
        await logPicks({ fixture, picks });
        audit = { logged: true };
      }
    } catch (logError) {
      audit = { logged: false, error: logError?.message ?? String(logError) };
    }

    res.json({
      ok: true,
      published: true,
      pickCount: picks.length,
      picks,
      audit,
      result,
    });
  } catch (error) {
    jsonError(res, 502, error.message);
  }
});

// GET /api/telegram/vip/footer — returns the canonical RG footer so the
// frontend can display it next to the publish button.
router.get("/vip/footer", (_req, res) => {
  res.json({ ok: true, footer: responsibleGamblingFooter() });
});

export default router;
