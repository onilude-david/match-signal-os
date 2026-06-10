// Gemini 2.5 video scan — football-semantic moment detection.
//
// We hand Gemini a YouTube URL via the native fileData.fileUri path
// (no download required) and ask it to identify clip-worthy moments
// using tactical language a football operator actually understands:
// goals, big chances, cards, momentum shifts, set-piece set-ups.
//
// The shape of the returned ClipSuggestion[] matches scan.mjs so the
// rest of the pipeline (the suggestions strip, applySuggestion, render)
// works without any downstream changes.
//
// Cost: with `media_resolution: "low"` the API uses ~66 input tokens per
// second of video. A 90-min broadcast ≈ 1.5M input tokens. At Flash
// pricing ($0.30/M in, $2.50/M out) that's ~$0.45 per match scan.
// At Pro pricing ($1.25/M in, $10/M out) ~$1.88 per match.

const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta";

const DEFAULT_MODEL = "gemini-2.5-flash";

// Structured-output schema. Gemini will fill exactly this shape, which
// removes the LLM-text-parsing risk that usually breaks production
// integrations. Enum types map straight onto our existing presets.
const EVENT_SCHEMA = {
  type: "OBJECT",
  properties: {
    summary: {
      type: "STRING",
      description: "One-paragraph editorial recap of the match — what happened, who looked sharp, where the swings were. No betting language.",
    },
    duration_seconds: {
      type: "NUMBER",
      description: "Total length of the video in seconds.",
    },
    events: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          type: {
            type: "STRING",
            enum: ["signal", "emotion", "context", "recap"],
            description: "signal = tactical moment / goal / key pass; emotion = crowd peak / reaction; context = build-up / phase of play; recap = post-event analysis.",
          },
          label: {
            type: "STRING",
            description: "Editorial headline for the clip, e.g. 'Olmo's first-time finish on the counter'. Concrete, no hype.",
          },
          start_seconds: { type: "NUMBER", description: "Clip start time in seconds from video start. Include 3-5s of pre-roll before the event itself." },
          end_seconds:   { type: "NUMBER", description: "Clip end time in seconds. Total clip duration should typically be 12-30s." },
          reason: {
            type: "STRING",
            description: "Why this is a clip-worthy moment. One sentence, tactical.",
          },
          hook_score: {
            type: "NUMBER",
            description: "0..1 — how likely this clip lands on social (1 = clear goal/big save, 0 = filler).",
          },
        },
        required: ["type", "label", "start_seconds", "end_seconds", "reason", "hook_score"],
      },
    },
  },
  required: ["summary", "duration_seconds", "events"],
};

// Football-operator system prompt. We keep it grounded in tactical
// language so the model doesn't drift into sports-broadcast hype.
function systemPromptFor({ fixtureContext, maxClips }) {
  return [
    "You are a tactical football analyst working with editorial broadsheet voice (FT pink, The Athletic, UEFA technical report).",
    "You watch a match video and identify the clip-worthy moments a tactical editor would cut for a Telegram brief + social.",
    "",
    "Your output rules:",
    `- Return at most ${maxClips} moments, ranked by hook_score descending.`,
    "- start_seconds includes 3-5 seconds of pre-roll so the clip lands cleanly before the event.",
    "- end_seconds extends 2-4 seconds past the action so reactions are captured.",
    "- Total clip length should be 12 to 30 seconds.",
    "- Use concrete, tactical language. 'Olmo's first-time finish on the counter', not 'amazing goal!'.",
    "- No betting, odds, pick, or 'lock' language anywhere.",
    "- The summary is one paragraph, editorial tone, no headers or bullet points.",
    "",
    "Type guidance:",
    "- signal: goals, big chances cleared off the line, defining tactical moments, set-piece routines that scored or nearly did.",
    "- emotion: crowd peaks, manager touchline reactions, player-to-player moments after a goal.",
    "- context: phases of sustained pressure or build-up that explain the game state, useful as a beat between signals.",
    "- recap: post-event analysis windows (e.g. the last 60s of a half) suitable for a longer YouTube-native cut.",
    fixtureContext ? `\nFixture context the operator supplied: ${fixtureContext}` : "",
  ].filter(Boolean).join("\n");
}

// ----------------------------------------------------------------------------

export async function geminiScanYouTube({
  youtubeUrl,
  fixtureContext = "",
  maxClips = 8,
  model = DEFAULT_MODEL,
  apiKey = process.env.GEMINI_API_KEY,
} = {}) {
  if (!apiKey) {
    const err = new Error("GEMINI_API_KEY is not configured.");
    err.code = "GEMINI_NOT_CONFIGURED";
    throw err;
  }
  if (!youtubeUrl) {
    throw new Error("youtubeUrl is required.");
  }

  const payload = {
    systemInstruction: {
      parts: [{ text: systemPromptFor({ fixtureContext, maxClips }) }],
    },
    contents: [{
      parts: [
        {
          fileData: {
            fileUri: youtubeUrl,
            // Gemini infers the mime type for YouTube URIs; explicit value
            // documented as optional but harmless to send.
          },
        },
        {
          text: "Watch the entire match. Identify clip-worthy moments per the system instructions and return them in the structured JSON schema.",
        },
      ],
    }],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: EVENT_SCHEMA,
      temperature: 0.4,
      // MEDIA_RESOLUTION_LOW runs video at ~66 tokens/sec instead of ~258 at
      // standard res. 4× cheaper, same temporal accuracy for moment detection.
      // Note: snake_case required by the REST proto serialiser. Tested 2026-06.
      media_resolution: "MEDIA_RESOLUTION_LOW",
    },
  };

  const url = `${GEMINI_API_BASE}/models/${encodeURIComponent(model)}:generateContent?key=${apiKey.trim()}`;
  // Retry on 429 / 503 — Gemini occasionally reports "model overloaded" on
  // busy days. Three attempts with exponential backoff is enough to ride
  // out 99% of those without making the operator click again.
  const { body, response } = await fetchWithRetry(url, payload, { retries: 3 });
  if (!response.ok) {
    const message = body?.error?.message ?? `Gemini API HTTP ${response.status}`;
    throw new Error(message);
  }

  // Gemini returns text-formatted JSON in the response.candidates[0].content
  // path. With responseSchema set, the body is always valid JSON — but we
  // still try/catch in case Google ever changes the contract.
  const text = body.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error("Gemini returned no text content.");
  }

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new Error(`Failed to parse Gemini JSON output: ${error.message}`);
  }

  return {
    model,
    summary: String(parsed.summary ?? ""),
    duration: Number(parsed.duration_seconds ?? 0) || 0,
    suggestions: normaliseSuggestions(parsed.events ?? []),
    usage: body.usageMetadata ?? null,
  };
}

// Map Gemini's event list into ClipSuggestion[] (same shape scan.mjs emits)
// so the suggestions strip in the UI renders them without any branching.
function normaliseSuggestions(events) {
  const out = [];
  for (let i = 0; i < events.length; i += 1) {
    const e = events[i];
    const start = clampNonNegative(Number(e.start_seconds));
    const end = clampNonNegative(Number(e.end_seconds));
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
    const allowedTypes = new Set(["signal", "emotion", "context", "recap"]);
    const type = allowedTypes.has(e.type) ? e.type : "signal";
    out.push({
      id: `gemini-${i + 1}`,
      type,
      start: round2(start),
      end: round2(end),
      duration: round2(end - start),
      score: round3(Number(e.hook_score) || 0),
      reason: `${e.label ?? "Moment"} — ${e.reason ?? ""}`.trim(),
    });
  }
  return out;
}

function clampNonNegative(n) {
  return Number.isFinite(n) ? Math.max(0, n) : NaN;
}
function round2(v) { return Math.round(v * 100) / 100; }
function round3(v) { return Math.round(v * 1000) / 1000; }

const RETRY_STATUSES = new Set([429, 500, 502, 503, 504]);

async function fetchWithRetry(url, payload, { retries = 3 } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await response.json().catch(() => ({}));
      // Gemini wraps "overloaded" in 503 with a clear message; sometimes also
      // returns 200 with an error envelope. Treat both as retryable.
      const isOverloaded =
        body?.error?.message?.toLowerCase().includes("high demand") ||
        body?.error?.message?.toLowerCase().includes("overloaded");
      if (RETRY_STATUSES.has(response.status) || isOverloaded) {
        if (attempt === retries) return { body, response };
        await sleep(800 * (2 ** attempt));
        continue;
      }
      return { body, response };
    } catch (error) {
      lastErr = error;
      if (attempt === retries) throw error;
      await sleep(800 * (2 ** attempt));
    }
  }
  throw lastErr ?? new Error("Gemini fetch failed after retries.");
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
