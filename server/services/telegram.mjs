import dotenv from "dotenv";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readSupabaseSnapshot, persistGeneratedContent, normalizeAiContent } from "./supabase.mjs";
import { generateGeminiContent } from "./gemini.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "../..");
const dataDir = path.join(rootDir, "data");
const statePath = path.join(dataDir, "app-state.json");

export const readAppState = async () => {
  try {
    const raw = await readFile(statePath, "utf8");
    return JSON.parse(raw);
  } catch {
    return { fixtures: [], ratings: [], accuracy: [], aiContent: {} };
  }
};

export const writeAppState = async (state) => {
  await mkdir(dataDir, { recursive: true });
  await writeFile(statePath, JSON.stringify({ ...state, savedAt: new Date().toISOString() }, null, 2), "utf8");
};

export const telegramSendMessage = async ({ chatId, text, parseMode }) => {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      disable_web_page_preview: true,
      ...(parseMode ? { parse_mode: parseMode } : {}),
    }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body.description ?? `Telegram request failed with ${response.status}`);
  }
  return body;
};

export const telegramRequest = async (method, payload = {}) => {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.ok === false) {
    throw new Error(body.description ?? `Telegram ${method} failed with ${response.status}`);
  }
  return body;
};

export const isAuthorizedTelegramChat = (chatId) => {
  const adminChatId = String(process.env.TELEGRAM_ADMIN_CHAT_ID ?? "");
  return adminChatId && String(chatId) === adminChatId;
};

export const normalizeCommand = (text = "") => {
  const first = text.trim().split(/\s+/)[0] ?? "";
  return first.toLowerCase().replace(/@thematchsignalbot$/i, "");
};

export const fixtureLabel = (fixture) =>
  `${fixture.teamA ?? "TBD"} vs ${fixture.teamB ?? "TBD"}${fixture.time ? ` at ${fixture.time} UTC` : ""}`;

export const nextFixtures = (fixtures = [], limit = 5) => {
  const today = new Date().toISOString().slice(0, 10);
  return [...fixtures]
    .filter((fixture) => fixture.status !== "Final" && (fixture.date ?? "") >= today)
    .sort((a, b) => `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`))
    .slice(0, limit);
};

export const footballDataMatchToFixture = (match) => ({
  id: `fd-${match.id}`,
  date: match.utcDate?.slice(0, 10) ?? "",
  time: match.utcDate?.slice(11, 16) ?? "",
  teamA: match.homeTeam?.name ?? "TBD",
  teamB: match.awayTeam?.name ?? "TBD",
  stage: [match.stage, match.group].filter(Boolean).join(" / ") || match.competition?.name || "Match",
  venue: match.venue ?? match.area?.name ?? "",
  status:
    match.status === "FINISHED"
      ? "Final"
      : match.status === "IN_PLAY" || match.status === "PAUSED"
        ? "Live"
        : "Scheduled",
  contentStatus: "Draft",
  homeOdds: match.odds?.homeWin ?? null,
  drawOdds: match.odds?.draw ?? null,
  awayOdds: match.odds?.awayWin ?? null,
});

export const fetchLiveWorldCupFixtures = async ({ force = false } = {}) => {
  if (!process.env.FOOTBALL_DATA_TOKEN) {
    return { fixtures: [], source: "not-configured", error: "FOOTBALL_DATA_TOKEN is not configured" };
  }

  const now = Date.now();
  if (!force && liveFixtureCache.fixtures.length && now - liveFixtureCache.fetchedAt < 5 * 60 * 1000) {
    return { fixtures: liveFixtureCache.fixtures, source: "cache", error: liveFixtureCache.error };
  }

  const today = new Date().toISOString().slice(0, 10);
  const params = new URLSearchParams({
    dateFrom: today,
    dateTo: "2026-07-19",
  });
  const response = await fetch(`https://api.football-data.org/v4/competitions/WC/matches?${params}`, {
    headers: { "X-Auth-Token": process.env.FOOTBALL_DATA_TOKEN },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    liveFixtureCache = { ...liveFixtureCache, error: body.message ?? `Football-data failed with ${response.status}` };
    return { fixtures: liveFixtureCache.fixtures, source: "stale-cache", error: liveFixtureCache.error };
  }

  const fixtures = (body.matches ?? []).map(footballDataMatchToFixture);
  liveFixtureCache = { fetchedAt: now, fixtures, error: null };
  return { fixtures, source: "football-data.org", error: null };
};

let liveFixtureCache = {
  fetchedAt: 0,
  fixtures: [],
  error: null,
};

export const mergeFixtures = (savedFixtures = [], liveFixtures = []) => {
  const byId = new Map();
  for (const fixture of liveFixtures) byId.set(fixture.id, fixture);
  for (const fixture of savedFixtures) {
    byId.set(fixture.id, { ...(byId.get(fixture.id) ?? {}), ...fixture });
  }
  return [...byId.values()];
};

export const loadTelegramContext = async ({ includeLive = true, forceLive = false } = {}) => {
  const state = await readAppState();
  const savedFixtures = state.fixtures ?? [];
  const supabaseState = await readSupabaseSnapshot().catch(() => null);
  const supabaseFixtures = supabaseState?.fixtures ?? [];
  const live = includeLive ? await fetchLiveWorldCupFixtures({ force: forceLive }) : { fixtures: [], source: "disabled", error: null };
  const fixtures = mergeFixtures(mergeFixtures(savedFixtures, supabaseFixtures), live.fixtures);
  const queue = nextFixtures(fixtures);
  return {
    state,
    fixtures,
    savedFixtures,
    supabaseFixtures,
    liveFixtures: live.fixtures,
    liveSource: supabaseFixtures.length ? `supabase + ${live.source}` : live.source,
    liveError: live.error,
    queue,
    aiContent: { ...(supabaseState?.aiContent ?? {}), ...(state.aiContent ?? {}) },
  };
};

export const simplePredictionFor = (fixture) => ({
  matchId: fixture.id,
  winnerLean: "No clear lean",
  expectedScore: "1-1",
  confidence: 6,
  upsetRisk: "Medium",
  goalPotential: "Medium",
  redFlags: ["Generated from Telegram command with backend default ratings"],
  storyline: `${fixture.teamA} vs ${fixture.teamB} needs a fuller operator review, but the first goal and control phases are the immediate signal points.`,
  keyPlayer: `${fixture.teamA} central creator`,
  marketRead: "No market context loaded",
});

export const generatedTelegramBrief = (fixture, prediction) => `The Match Signal Brief

${fixtureLabel(fixture)}
Stage: ${fixture.stage ?? "Match"}
Venue: ${fixture.venue || "TBD"}

Lean: ${prediction.winnerLean}
Expected score: ${prediction.expectedScore}
Confidence: ${prediction.confidence}/10
Signal: ${prediction.storyline}`;

export const scenariosForFixture = (fixture, prediction) => [
  {
    title: "First goal pressure",
    trigger: `If ${fixture.teamA} scores first`,
    signal: `${fixture.teamB} must open up earlier than planned, raising transition risk.`,
    contentAngle: `The match becomes a control test for ${fixture.teamA}.`,
  },
  {
    title: "Level after 60 minutes",
    trigger: "If the game is still level deep into the second half",
    signal: "Set pieces, substitutions, and emotional pressure become the main swing factors.",
    contentAngle: "Frame the brief around game-state discipline and late volatility.",
  },
];

export const buildHelpText = () => `The Match Signal Bot

/today - show the next match queue
/generate - generate a fresh admin brief for the next match
/preview - send the latest saved brief
/approve - approve the next draft
/stats - show OS status
/help - show this menu`;

export const handleTelegramCommand = async (message) => {
  const chatId = message.chat?.id;
  const text = message.text ?? "";
  if (!chatId || !text.startsWith("/")) return;

  if (!isAuthorizedTelegramChat(chatId)) {
    await telegramSendMessage({ chatId, text: "This bot is locked to the Match Signal operator chat." });
    return;
  }

  const command = normalizeCommand(text);

  if (command === "/help" || command === "/start") {
    await telegramSendMessage({ chatId, text: buildHelpText() });
    return;
  }

  const context = await loadTelegramContext({ includeLive: true, forceLive: command === "/today" });
  const { state, fixtures, savedFixtures, supabaseFixtures, liveFixtures, liveSource, liveError, queue, aiContent } = context;
  const selectedFixture = queue[0] ?? fixtures[0];

  if (command === "/today") {
    const rows = queue.length ? queue : nextFixtures(fixtures, 5);
    await telegramSendMessage({
      chatId,
      text: rows.length
        ? `Next Match Queue (${liveSource})\n\n${rows.map((fixture, index) => `${index + 1}. ${fixture.date} - ${fixtureLabel(fixture)}\n${fixture.stage ?? "Match"} · ${fixture.contentStatus ?? "Draft"}`).join("\n\n")}${liveError ? `\n\nLive warning: ${liveError}` : ""}`
        : `No fixtures available yet.${liveError ? ` Live API warning: ${liveError}` : " Import World Cup fixtures from the app or check the Football Data token."}`,
    });
    return;
  }

  if (!selectedFixture) {
    await telegramSendMessage({ chatId, text: `No fixture is available yet.${liveError ? ` Live API warning: ${liveError}` : " Import fixtures or check the Football Data token."}` });
    return;
  }

  if (command === "/preview") {
    const saved = aiContent[selectedFixture.id]?.telegram;
    await telegramRequest("sendMessage", {
      chat_id: chatId,
      text: saved || generatedTelegramBrief(selectedFixture, simplePredictionFor(selectedFixture)),
      disable_web_page_preview: true,
      reply_markup: {
        inline_keyboard: [
          [
            { text: "📢 Pub Editorial", callback_data: `pub_edit:${selectedFixture.id}` },
            { text: "🎯 Pub Betting", callback_data: `pub_bet:${selectedFixture.id}` },
          ],
          [
            { text: "🔄 Revise", callback_data: `revise:${selectedFixture.id}` },
            { text: "✅ Mark Posted", callback_data: `posted:${selectedFixture.id}` }
          ],
        ],
      },
    });
    return;
  }

  if (command === "/generate") {
    await telegramSendMessage({ chatId, text: `Generating AI draft for ${fixtureLabel(selectedFixture)}...` });
    const prediction = simplePredictionFor(selectedFixture);
    const scenarios = scenariosForFixture(selectedFixture, prediction);
    let generated;
    try {
      generated = await generateGeminiContent({ fixture: selectedFixture, prediction, scenarios });
    } catch (error) {
      const fallback = normalizeAiContent({
        telegram: generatedTelegramBrief(selectedFixture, prediction),
        xPost: `${selectedFixture.teamA} vs ${selectedFixture.teamB}: ${prediction.winnerLean}. ${prediction.storyline}`,
        thread: generatedTelegramBrief(selectedFixture, prediction),
        shortsScript: generatedTelegramBrief(selectedFixture, prediction),
        videoTitle: `${selectedFixture.teamA} vs ${selectedFixture.teamB}: Match Signal Preview`,
        reportSection: generatedTelegramBrief(selectedFixture, prediction),
        bettingAngle: "Betting intelligence pending — generate AI content to unlock EV analysis.",
        safetyNotes: [`AI generation fallback used: ${error.message}`],
      });
      generated = { content: fallback, raw: "" };
    }
    const generatedContent = generated.content;
    const brief = generatedContent.telegram || generatedTelegramBrief(selectedFixture, prediction);
    const stateFixtures = state.fixtures ?? [];
    state.aiContent = {
      ...aiContent,
      [selectedFixture.id]: generatedContent,
    };
    if (!stateFixtures.some((fixture) => fixture.id === selectedFixture.id)) {
      state.fixtures = [...stateFixtures, selectedFixture];
    }
    await writeAppState(state);
    try {
      await persistGeneratedContent({ fixture: selectedFixture, content: generatedContent });
    } catch (error) {
      await telegramSendMessage({ chatId, text: `Draft generated, but Supabase save failed: ${error.message}` });
    }
    await telegramRequest("sendMessage", {
      chat_id: chatId,
      text: brief,
      disable_web_page_preview: true,
      reply_markup: {
        inline_keyboard: [
          [
            { text: "📢 Pub Editorial", callback_data: `pub_edit:${selectedFixture.id}` },
            { text: "🎯 Pub Betting", callback_data: `pub_bet:${selectedFixture.id}` },
          ],
          [
            { text: "🔄 Revise", callback_data: `revise:${selectedFixture.id}` },
            { text: "✅ Mark Posted", callback_data: `posted:${selectedFixture.id}` }
          ],
        ],
      },
    });
    return;
  }

  if (command === "/approve") {
    const stateFixtures = (state.fixtures ?? []).some((fixture) => fixture.id === selectedFixture.id)
      ? state.fixtures
      : [...(state.fixtures ?? []), selectedFixture];
    state.fixtures = stateFixtures.map((fixture) =>
      fixture.id === selectedFixture.id ? { ...fixture, contentStatus: "Approved" } : fixture,
    );
    await writeAppState(state);
    await telegramSendMessage({ chatId, text: `Approved: ${fixtureLabel(selectedFixture)}` });
    return;
  }

  await telegramSendMessage({ chatId, text: buildHelpText() });
};

export const handleTelegramCallback = async (callbackQuery) => {
  const chatId = callbackQuery.message?.chat?.id;
  const data = callbackQuery.data ?? "";
  await telegramRequest("answerCallbackQuery", { callback_query_id: callbackQuery.id });
  if (!chatId || !isAuthorizedTelegramChat(chatId)) return;

  const [action, matchId] = data.split(":");
  const state = await readAppState();
  const fixtures = state.fixtures ?? [];
  const aiContent = state.aiContent ?? {};
  const match = fixtures.find((fixture) => fixture.id === matchId);
  const content = aiContent[matchId];

  if (action === "pub_edit") {
    if (!content || !content.telegram) {
      await telegramSendMessage({ chatId, text: `❌ Cannot publish: Editorial draft for ${matchId} is missing. Run /generate first.` });
      return;
    }
    try {
      await telegramSendMessage({
        chatId: process.env.TELEGRAM_PUBLIC_CHANNEL_ID,
        text: content.telegram,
      });
      state.fixtures = fixtures.map((f) => f.id === matchId ? { ...f, contentStatus: "Posted" } : f);
      await writeAppState(state);
      await telegramSendMessage({ chatId, text: `📢 Successfully published Editorial Brief for ${match ? fixtureLabel(match) : matchId} to public channel!` });
    } catch (err) {
      await telegramSendMessage({ chatId, text: `❌ Failed to publish to public channel: ${err.message}` });
    }
    return;
  }

  if (action === "pub_bet") {
    if (!content || !content.bettingAngle || content.bettingAngle.startsWith("Betting intelligence pending")) {
      await telegramSendMessage({ chatId, text: `❌ Cannot publish: Betting draft for ${matchId} is missing or pending.` });
      return;
    }
    try {
      const fullText = `⚽️ ${match ? `${match.teamA} vs ${match.teamB}` : "Match Preview"}\n🎯 Betting Angle:\n\n${content.bettingAngle}`;
      await telegramSendMessage({
        chatId: process.env.TELEGRAM_BETTING_CHANNEL_ID,
        text: fullText,
      });
      state.fixtures = fixtures.map((f) => f.id === matchId ? { ...f, contentStatus: "Posted" } : f);
      await writeAppState(state);
      await telegramSendMessage({ chatId, text: `🎯 Successfully published Betting Angle for ${match ? fixtureLabel(match) : matchId} to VIP channel!` });
    } catch (err) {
      await telegramSendMessage({ chatId, text: `❌ Failed to publish to VIP channel: ${err.message}` });
    }
    return;
  }

  if (action === "posted") {
    state.fixtures = fixtures.map((f) => f.id === matchId ? { ...f, contentStatus: "Posted" } : f);
    await writeAppState(state);
    await telegramSendMessage({ chatId, text: `✅ Marked ${match ? fixtureLabel(match) : matchId} as posted.` });
    return;
  }

  if (action === "revise") {
    state.fixtures = fixtures.map((f) => f.id === matchId ? { ...f, contentStatus: "Draft" } : f);
    await writeAppState(state);
    await telegramSendMessage({ chatId, text: `🔄 Revision requested for ${match ? fixtureLabel(match) : matchId}. Open the Command Center to adjust.` });
    return;
  }

  if (action === "approve") {
    state.fixtures = fixtures.map((f) => f.id === matchId ? { ...f, contentStatus: "Approved" } : f);
    await writeAppState(state);
    await telegramSendMessage({ chatId, text: `👍 Approved: ${match ? fixtureLabel(match) : matchId}` });
    return;
  }
};

export const handleTelegramUpdate = async (update) => {
  if (update.message) await handleTelegramCommand(update.message);
  if (update.callback_query) await handleTelegramCallback(update.callback_query);
};

export const telegramPolling = {
  active: false,
  offset: 0,
  lastUpdateAt: null,
  lastError: null,
};

export const pollTelegramUpdates = async () => {
  if (telegramPolling.active) return;
  telegramPolling.active = true;
  while (telegramPolling.active) {
    try {
      const result = await telegramRequest("getUpdates", {
        offset: telegramPolling.offset || undefined,
        timeout: 25,
        allowed_updates: ["message", "callback_query"],
      });
      for (const update of result.result ?? []) {
        telegramPolling.offset = update.update_id + 1;
        telegramPolling.lastUpdateAt = new Date().toISOString();
        await handleTelegramUpdate(update);
      }
      telegramPolling.lastError = null;
    } catch (error) {
      telegramPolling.lastError = error.message;
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }
};
