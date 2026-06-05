import express from "express";
import { assertEnv, assertAllEnv, jsonError } from "../config/env.mjs";
import { generateGeminiContent, generateGeminiRatings } from "../services/gemini.mjs";
import { buildWorkbook, getSheetsClient, stateToRows } from "../services/sheets.mjs";
import { getSupabase, ratingRowFromRating } from "../services/supabase.mjs";

const router = express.Router();

// Helper for safe JSON formatting
const safeJson = (value) => JSON.stringify(value ?? null);

// POST /api/content/ai
router.post("/content/ai", async (req, res) => {
  if (!assertEnv(res, "GEMINI_API_KEY")) return;

  const { fixture, prediction, scenarios, intel } = req.body;
  try {
    const result = await generateGeminiContent({ fixture, prediction, scenarios, intel });
    res.json({ ok: true, content: result.content, raw: result.raw });
  } catch (error) {
    if (error.details) {
      jsonError(res, error.status ?? 502, error.message, error.details);
      return;
    }
    res.json({ ok: true, content: null, raw: error.message });
  }
});

// POST /api/ratings/ai
router.post("/ratings/ai", async (req, res) => {
  if (!assertEnv(res, "GEMINI_API_KEY")) return;

  const bodyTeams = Array.isArray(req.body?.teams) ? req.body.teams : [];
  const bodyFixtures = Array.isArray(req.body?.fixtures) ? req.body.fixtures : [];
  const teams = [...new Set(bodyTeams.map((team) => String(team).trim()).filter((team) => team && team.toLowerCase() !== "tbd"))].slice(0, 64);
  const fixtureContext = bodyFixtures.slice(0, 128).map((fixture) => ({
    date: fixture.date,
    stage: fixture.stage,
    teamA: fixture.teamA,
    teamB: fixture.teamB,
    venue: fixture.venue,
  }));

  if (!teams.length) {
    jsonError(res, 400, "At least one real team is required for AI ratings.");
    return;
  }

  try {
    const ratings = await generateGeminiRatings({ teams, fixtures: fixtureContext });
    if (process.env.SUPABASE_URL && (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY)) {
      const supabase = getSupabase();
      const { error } = await supabase.from("team_ratings").upsert(ratings.map(ratingRowFromRating), { onConflict: "team" });
      if (error) {
        jsonError(res, 502, "AI ratings generated, but Supabase rating save failed.", error);
        return;
      }
    }

    res.json({
      ok: true,
      source: "gemini",
      ratings,
      savedToSupabase: Boolean(process.env.SUPABASE_URL && (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY)),
    });
  } catch (error) {
    if (error.details) {
      jsonError(res, error.status ?? 502, error.message, error.details);
      return;
    }
    jsonError(res, 502, "AI ratings generation failed.", error.message);
  }
});

// POST /api/spreadsheet/workbook
router.post("/spreadsheet/workbook", async (req, res) => {
  try {
    const workbook = await buildWorkbook(req.body ?? {});
    const buffer = await workbook.xlsx.writeBuffer();
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", 'attachment; filename="match-signal-os-workbook.xlsx"');
    res.send(Buffer.from(buffer));
  } catch (error) {
    jsonError(res, 500, "Spreadsheet workbook generation failed.", error.message);
  }
});

// POST /api/sheets/export
router.post("/sheets/export", async (req, res) => {
  if (!assertAllEnv(res, ["GOOGLE_SHEETS_SPREADSHEET_ID", "GOOGLE_SERVICE_ACCOUNT_EMAIL", "GOOGLE_PRIVATE_KEY"])) return;
  const sheets = await getSheetsClient();
  const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
  const rowGroups = stateToRows(req.body);

  try {
    const results = [];
    for (const [sheetName, values] of Object.entries(rowGroups)) {
      await sheets.spreadsheets.values.clear({
        spreadsheetId,
        range: `'${sheetName}'!A:Z`,
      });
      const result = await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `'${sheetName}'!A1`,
        valueInputOption: "RAW",
        requestBody: { values },
      });
      results.push({ sheetName, updatedCells: result.data.updatedCells ?? 0 });
    }
    res.json({ ok: true, results });
  } catch (error) {
    jsonError(res, 502, "Google Sheets export failed. Confirm the spreadsheet has Fixtures, Team Ratings, Accuracy, and Content Outputs tabs, and share it with the service account email.", error.message);
  }
});

// POST /api/n8n/trigger
router.post("/n8n/trigger", async (req, res) => {
  if (!assertEnv(res, "N8N_WEBHOOK_URL")) return;
  const { workflow = "manual", payload = {} } = req.body;
  const webhookMap = {
    dailyBrief: process.env.N8N_DAILY_BRIEF_WEBHOOK,
    preMatch: process.env.N8N_PRE_MATCH_WEBHOOK,
    postMatch: process.env.N8N_POST_MATCH_WEBHOOK,
    report: process.env.N8N_REPORT_WEBHOOK,
    manual: process.env.N8N_WEBHOOK_URL,
  };
  const url = webhookMap[workflow] ?? process.env.N8N_WEBHOOK_URL;
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(process.env.N8N_WEBHOOK_SECRET ? { "X-Match-Signal-Secret": process.env.N8N_WEBHOOK_SECRET } : {}),
      },
      body: safeJson({
        workflow,
        source: "match-signal-os",
        sentAt: new Date().toISOString(),
        payload,
      }),
    });
    const text = await response.text();
    if (!response.ok) {
      jsonError(res, response.status, "n8n webhook failed.", text);
      return;
    }
    res.json({ ok: true, workflow, response: text });
  } catch (error) {
    jsonError(res, 500, "n8n webhook trigger failed.", error.message);
  }
});

// GET /api/n8n/mcp/status
router.get("/n8n/mcp/status", async (_req, res) => {
  if (!assertAllEnv(res, ["N8N_MCP_URL", "N8N_MCP_TOKEN"])) return;

  try {
    const response = await fetch(process.env.N8N_MCP_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.N8N_MCP_TOKEN}`,
        "Content-Type": "application/json",
        "Accept": "application/json, text/event-stream",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "match-signal-os-init",
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: {
            name: "match-signal-os",
            version: "0.1.0",
          },
        },
      }),
    });
    const text = await response.text();
    res.json({
      ok: response.ok,
      status: response.status,
      contentType: response.headers.get("content-type"),
      sessionIdPresent: Boolean(response.headers.get("mcp-session-id")),
      responsePreview: text.slice(0, 500),
    });
  } catch (error) {
    jsonError(res, 502, "n8n MCP status check failed.", error.message);
  }
});

export default router;
