import express from "express";
import { assertEnv, jsonError } from "../config/env.mjs";
import {
  telegramSendMessage,
  telegramRequest,
  telegramPolling,
  handleTelegramUpdate,
} from "../services/telegram.mjs";

const router = express.Router();

const telegramCommands = [
  { command: "today", description: "Show today's match queue" },
  { command: "generate", description: "Generate selected match intelligence" },
  { command: "preview", description: "Send the latest admin preview" },
  { command: "approve", description: "Approve current content draft" },
  { command: "stats", description: "Show operator stats" },
  { command: "help", description: "Show Match Signal commands" },
];

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
      bettingChannelConfigured: Boolean(process.env.TELEGRAM_BETTING_CHANNEL_ID),
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
router.post("/webhook", async (req, res) => {
  if (!assertEnv(res, "TELEGRAM_BOT_TOKEN")) return;
  try {
    await handleTelegramUpdate(req.body);
    res.json({ ok: true });
  } catch (error) {
    jsonError(res, 502, "Telegram webhook update failed.", error.message);
  }
});

// POST /api/telegram/preview
router.post("/preview", async (req, res) => {
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
router.post("/public", async (req, res) => {
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

// POST /api/telegram/betting
router.post("/betting", async (req, res) => {
  if (!assertEnv(res, "TELEGRAM_BOT_TOKEN") || !assertEnv(res, "TELEGRAM_BETTING_CHANNEL_ID")) return;
  const { text, parseMode } = req.body;
  if (!text) {
    jsonError(res, 400, "text is required.");
    return;
  }
  try {
    const result = await telegramSendMessage({
      chatId: process.env.TELEGRAM_BETTING_CHANNEL_ID,
      text,
      parseMode,
    });
    res.json({ ok: true, result });
  } catch (error) {
    jsonError(res, 502, error.message);
  }
});

export default router;
