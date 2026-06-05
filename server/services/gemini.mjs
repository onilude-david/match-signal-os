import { getSportradarMatchIntel } from "./sportradar.mjs";

export const parseGeminiText = (body) => {
  const text = body.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) return "";
  return text.trim();
};

export const normalizeAiContent = (content = {}) => ({
  telegram: String(content.telegram ?? ""),
  xPost: String(content.xPost ?? ""),
  thread: String(content.thread ?? content.reportSection ?? ""),
  shortsScript: String(content.shortsScript ?? ""),
  videoTitle: String(content.videoTitle ?? ""),
  reportSection: String(content.reportSection ?? ""),
  bettingAngle: String(content.bettingAngle ?? content.marketContext ?? ""),
  safetyNotes: Array.isArray(content.safetyNotes) ? content.safetyNotes.map(String) : [],
});

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
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      system_instruction: {
        parts: {
          text: "You create football intelligence content for The Match Signal. You produce two layers of output: (1) editorial match intelligence — tactical context, match narratives, confidence, uncertainty, content angles, and audience-safe football analysis; (2) a professional betting intelligence addon — Expected Value (EV) analysis, odds comparison, unit stakes, and market recommendations. For the bettingAngle field, write for a worldwide sportsbook audience. Use universal betting parlance: 1X2 (1=Home, X=Draw, 2=Away), GG/NG (Goal/Goal, No Goal) for BTTS, O/U 2.5 for Over/Under, DC for Double Chance, HT/FT for Half-Time/Full-Time. Reference global platforms (Bet365, DraftKings, SportyBet, Bet9ja, 1xBet, Betway, William Hill). Include EV percentage calculations when odds are provided. Always add a responsible gambling disclaimer. Do not guarantee wins. If sportradarIntel is provided, analyze the lineup formations, starting XI, bench players, injured/missing players, match timeline events (if live/post-match), and momentum swings to construct a highly context-aware, precise narrative and betting angle. Return concise JSON only."
        }
      },
      contents: [
        {
          parts: [
            {
              text: JSON.stringify({
                task: "Generate Telegram, X, Shorts, report, betting angle, and safety notes for this match.",
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
                  bettingAngle: "string. Professional betting intelligence: EV analysis, recommended markets (1X2, GG/NG, O/U 2.5, DC), unit stakes, odds comparison vs model confidence. Include responsible gambling disclaimer.",
                  safetyNotes: ["string"],
                },
              })
            }
          ]
        }
      ],
      generationConfig: {
        responseMimeType: "application/json"
      }
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

export const generateGeminiRatings = async ({ teams, fixtures }) => {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not configured.");
  }

  const geminiApiKey = process.env.GEMINI_API_KEY.trim();
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiApiKey}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
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
      generationConfig: {
        responseMimeType: "application/json"
      }
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
