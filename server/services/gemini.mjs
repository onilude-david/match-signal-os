import { getSportradarMatchIntel } from "./sportradar.mjs";

export const parseGeminiText = (body) => {
  const text = body.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) return "";
  return text.trim();
};

// Normalize editorial content (PUBLIC layer). bettingAngle is kept as an alias
// onto marketContext for back-compat with any existing Supabase rows, but the
// model is no longer asked to produce picks here. marketContext is editorial
// market signal only — attention, volatility, narrative pressure.
export const normalizeAiContent = (content = {}) => {
  const marketContext = String(content.marketContext ?? content.bettingAngle ?? "");
  return {
    telegram: String(content.telegram ?? ""),
    xPost: String(content.xPost ?? ""),
    thread: String(content.thread ?? content.reportSection ?? ""),
    shortsScript: String(content.shortsScript ?? ""),
    videoTitle: String(content.videoTitle ?? ""),
    reportSection: String(content.reportSection ?? ""),
    marketContext,
    // back-compat: older callers still read bettingAngle
    bettingAngle: marketContext,
    safetyNotes: Array.isArray(content.safetyNotes) ? content.safetyNotes.map(String) : [],
  };
};

export const clampTeamRating = (value, fallback = 6) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(10, Math.max(0, Math.round(number)));
};

export const normalizeTeamRating = (rating = {}, fallbackTeam = "") => ({
  team: String(rating.team ?? fallbackTeam).trim(),
  form: clampTeamRating(rating.form),
  attack: clampTeamRating(rating.attack),
  defense: clampTeamRating(rating.defense),
  midfield: clampTeamRating(rating.midfield),
  depth: clampTeamRating(rating.depth ?? rating.squadDepth),
  coach: clampTeamRating(rating.coach),
  injuryImpact: clampTeamRating(rating.injuryImpact, 2),
  motivation: clampTeamRating(rating.motivation, 7),
});

// ============================================================================
// PUBLIC editorial content
// Generates Telegram, X, Shorts, report, and an editorial marketContext field.
// No picks, no odds numbers, no stake language, no book names. This is the
// content that goes to TELEGRAM_PUBLIC_CHANNEL_ID and social.
// ============================================================================

const PUBLIC_SYSTEM_INSTRUCTION = [
  "You are the editorial voice of The Match Signal.",
  "You write calm-authority football intelligence: tactical context, match narrative,",
  "confidence ranges, and uncertainty. You do NOT produce betting picks, EV claims,",
  "unit stakes, odds recommendations, book names, market shorthand (1X2, BTTS, O/U),",
  "or any 'guaranteed/sure/lock' language. The marketContext field is editorial only:",
  "attention level, volatility (how swingy this read is), fan pressure, narrative",
  "pressure, and content priority. If sportradarIntel is provided, weave lineup,",
  "missing-player, and momentum context into the narrative. Return concise JSON only.",
].join(" ");

export const generateGeminiContent = async ({ fixture, prediction, scenarios, intel = null }) => {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not configured.");
  }

  const geminiApiKey = process.env.GEMINI_API_KEY.trim();

  // Auto-fetch Sportradar match intelligence if not provided but sourceId exists
  let activeIntel = intel;
  if (!activeIntel && (fixture?.sourceId || (fixture?.id && fixture.id.startsWith("sr:")))) {
    const eventId = fixture.sourceId ?? fixture.id;
    activeIntel = await getSportradarMatchIntel(eventId);
  }

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiApiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      system_instruction: { parts: { text: PUBLIC_SYSTEM_INSTRUCTION } },
      contents: [
        {
          parts: [
            {
              text: JSON.stringify({
                task: "Generate editorial Telegram, X, Shorts, report, marketContext, and safety notes for this match.",
                fixture,
                prediction,
                scenarios,
                sportradarIntel: activeIntel || undefined,
                schema: {
                  telegram: "string",
                  xPost: "string",
                  thread: "string",
                  shortsScript: "string",
                  videoTitle: "string",
                  reportSection: "string",
                  marketContext: "string. Editorial market signal only: attention level, volatility, fan pressure, narrative pressure, content priority. No odds numbers, no picks, no book names, no stake language.",
                  safetyNotes: ["string"],
                },
              })
            }
          ]
        }
      ],
      generationConfig: { responseMimeType: "application/json" }
    }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error("Gemini request failed.");
    error.status = response.status;
    error.details = body;
    throw error;
  }

  const text = parseGeminiText(body);
  return { content: normalizeAiContent(JSON.parse(text)), raw: text };
};

// ============================================================================
// VIP narrative wrapper
// Picks come from server/services/picks.mjs (real EV math, not model fiat).
// This function asks Gemini ONLY for a short narrative paragraph that frames
// the picks for the VIP channel audience. The numbers in the published message
// always come from picks.mjs — the model never invents EV or stake.
// ============================================================================

const VIP_SYSTEM_INSTRUCTION = [
  "You write a single short narrative paragraph (3 sentences max) framing why",
  "a value pick exists in a football match. You are NOT computing EV, stake, or",
  "odds — those numbers are provided to you and you must not change them or add",
  "your own. Sober tone, no hype, no guarantees, no 'sure' or 'lock' language.",
  "Do NOT add a responsible-gambling disclaimer — the system adds the official one.",
  "Return JSON: { narrative: string }.",
].join(" ");

export const generateVipNarrative = async ({ fixture, picks, prediction }) => {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not configured.");
  }
  if (!picks?.length) {
    return { narrative: "" };
  }
  const geminiApiKey = process.env.GEMINI_API_KEY.trim();
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiApiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      system_instruction: { parts: { text: VIP_SYSTEM_INSTRUCTION } },
      contents: [
        {
          parts: [
            {
              text: JSON.stringify({
                task: "Write a 3-sentence narrative framing for these value picks.",
                fixture: { teamA: fixture.teamA, teamB: fixture.teamB, stage: fixture.stage, venue: fixture.venue },
                prediction,
                picks: picks.map(({ id, fixtureId, bookPrice, bookName, ev, stakeUnits, ...rest }) => rest),
              })
            }
          ]
        }
      ],
      generationConfig: { responseMimeType: "application/json" }
    }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    return { narrative: "" };
  }
  const text = parseGeminiText(body);
  try {
    const parsed = JSON.parse(text);
    return { narrative: String(parsed.narrative ?? "") };
  } catch {
    return { narrative: "" };
  }
};

// ============================================================================
// Team rating starter
// ============================================================================

export const generateGeminiRatings = async ({ teams, fixtures }) => {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not configured.");
  }

  const geminiApiKey = process.env.GEMINI_API_KEY.trim();
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiApiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      system_instruction: {
        parts: {
          text: "You create football team strength ratings for The Match Signal. Produce editorial football intelligence only. Do not provide betting advice, staking guidance, odds recommendations, wager instructions, slips, bankroll guidance, or picks. Return concise JSON only."
        }
      },
      contents: [
        {
          parts: [
            {
              text: JSON.stringify({
                task: "Create starter World Cup team ratings for the listed teams using general football knowledge plus the provided fixture context. Ratings are 0-10 integers. injuryImpact means current squad-risk estimate where higher is worse. If a team is unknown or TBD, skip it.",
                teams,
                fixtureContext: fixtures,
                schema: {
                  ratings: [
                    {
                      team: "string",
                      form: "integer 0-10",
                      attack: "integer 0-10",
                      defense: "integer 0-10",
                      midfield: "integer 0-10",
                      depth: "integer 0-10",
                      coach: "integer 0-10",
                      injuryImpact: "integer 0-10",
                      motivation: "integer 0-10"
                    }
                  ]
                },
              })
            }
          ]
        }
      ],
      generationConfig: { responseMimeType: "application/json" }
    }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error("Gemini ratings request failed.");
    error.status = response.status;
    error.details = body;
    throw error;
  }

  const text = parseGeminiText(body);
  const parsed = JSON.parse(text);
  const rawRatings = Array.isArray(parsed) ? parsed : parsed.ratings;
  if (!Array.isArray(rawRatings)) {
    throw new Error("Gemini ratings response did not include a ratings array.");
  }
  return rawRatings.map((rating) => normalizeTeamRating(rating)).filter((rating) => rating.team);
};
