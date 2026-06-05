import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Activity,
  BarChart3,
  CalendarPlus,
  CheckCircle2,
  Clipboard,
  Download,
  FileText,
  Film,
  Gauge,
  Hash,
  Image,
  Instagram,
  Layers,
  Megaphone,
  Palette,
  Radio,
  RefreshCcw,
  Search,
  Scissors,
  ShieldCheck,
  Sparkles,
  Trash2,
  Youtube,
  Send,
  Loader2,
  Sun,
  Moon,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import "./styles.css";

// Import types
import {
  FixtureStatus,
  ContentStatus,
  View,
  Fixture,
  TeamRating,
  Prediction,
  Scenario,
  AccuracyRecord,
  ContextSignal,
  MarketContext,
  ProviderHealth,
  AppSnapshot,
  StandingRow,
  StandingGroup,
  MatchIntel,
  StateResponse,
  ProviderBadge,
  ContentPack,
  SocialPlatform,
  ClipPlan,
  RenderJob,
} from "./types";

// Import components
import { Metric } from "./components/Metric";
import { LabeledInput } from "./components/LabeledInput";
import { OutputPanel } from "./components/OutputPanel";
import { TeamRatingEditor } from "./components/TeamRatingEditor";
import { MatchIntelPanel } from "./components/MatchIntelPanel";
import { WorldCupDataView } from "./components/WorldCupDataView";
import { Button } from "./components/ui/Button";

// Import api client
import { api } from "./utils/api";

const WORLD_CUP_2026_SPORTRADAR_SEASON_ID = "sr:season:101177";

const seedFixtures: Fixture[] = [
  {
    id: "m-001",
    date: "2026-06-11",
    time: "20:00",
    teamA: "Mexico",
    teamB: "South Africa",
    stage: "Group stage",
    venue: "Estadio Azteca",
    status: "Scheduled",
    contentStatus: "Draft",
  },
  {
    id: "m-002",
    date: "2026-06-12",
    time: "18:00",
    teamA: "Brazil",
    teamB: "Morocco",
    stage: "Group stage",
    venue: "MetLife Stadium",
    status: "Scheduled",
    contentStatus: "Draft",
  },
];

const seedRatings: TeamRating[] = [
  { team: "Mexico", form: 7, attack: 7, defense: 7, midfield: 7, depth: 7, coach: 7, injuryImpact: 2, motivation: 9 },
  { team: "South Africa", form: 6, attack: 6, defense: 6, midfield: 6, depth: 5, coach: 6, injuryImpact: 1, motivation: 9 },
  { team: "Brazil", form: 8, attack: 9, defense: 8, midfield: 8, depth: 9, coach: 7, injuryImpact: 2, motivation: 8 },
  { team: "Morocco", form: 8, attack: 7, defense: 8, midfield: 8, depth: 7, coach: 8, injuryImpact: 1, motivation: 9 },
];

const brandPillars = [
  {
    title: "Signal over noise",
    detail: "Lead with the one tactical or emotional shift that changes how fans watch the match.",
  },
  {
    title: "Calm authority",
    detail: "Sound sharp and useful without pretending the model knows the future.",
  },
  {
    title: "Matchday momentum",
    detail: "Package previews, live pivots, and recaps as one continuous story.",
  },
  {
    title: "Fan-intelligent",
    detail: "Respect passion, but keep the brand grounded in football intelligence.",
  },
];

const voiceRules = [
  "Say what to watch, not what is guaranteed",
  "Use short sentences and concrete match language",
  "Avoid official World Cup affiliation claims",
  "Keep betting language out of public social copy",
];

const visualSystem = [
  { label: "Primary", value: "Deep pitch green", swatch: "#13513f" },
  { label: "Accent", value: "Signal gold", swatch: "#c8962f" },
  { label: "Alert", value: "Pressure red", swatch: "#a4382f" },
  { label: "Support", value: "Analysis blue", swatch: "#254e70" },
];

const contentPillars = [
  "Pre-match signal",
  "One-minute tactical explainer",
  "Upset watch",
  "Host-country pressure",
  "Post-match model lesson",
  "Daily fixture radar",
];

const hashtagsFor = (fixture: Fixture) => [
  "#TheMatchSignal",
  "#WorldCup2026",
  `#${fixture.teamA.replace(/\s+/g, "")}`,
  `#${fixture.teamB.replace(/\s+/g, "")}`,
  "#FootballIntelligence",
  "#Matchday",
];

const socialKitFor = (fixture: Fixture, prediction: Prediction, marketContext: MarketContext): SocialPlatform[] => {
  const tags = hashtagsFor(fixture).join(" ");
  const match = `${fixture.teamA} vs ${fixture.teamB}`;
  const urgency = interestLabelFor(clamp(marketContext.attentionScore + marketContext.volatilityScore / 2, 0, 100)).toLowerCase();
  const leadSignal = prediction.redFlags[0] ?? "the first 20 minutes will tell us whether this becomes controlled or chaotic";

  return [
    {
      platform: "Instagram Reels",
      format: "9:16 · 30-45s",
      cadence: "Matchday morning",
      hook: `${match}: watch this before kickoff`,
      caption: `${match} is a ${urgency} because ${leadSignal.toLowerCase()}. Lean: ${prediction.winnerLean}. Expected score: ${prediction.expectedScore}. ${tags}`,
      creative: "Vertical pitch map, two team crests as labels, one animated pressure meter, final frame with follow CTA.",
      cta: "Save this before kickoff",
    },
    {
      platform: "TikTok",
      format: "9:16 · 20-35s",
      cadence: "2-4 hours before kickoff",
      hook: `This is the signal in ${match}`,
      caption: `The model is watching control, pressure, and the first goal swing. ${match}: ${prediction.winnerLean}, ${prediction.confidence}/10 confidence. ${tags}`,
      creative: "Fast cut: hook text, matchup card, upset watch meter, one key player callout, comment prompt.",
      cta: "Comment your scoreline",
    },
    {
      platform: "X / Twitter",
      format: "Single post + 4-part thread",
      cadence: "Morning post, live update, final lesson",
      hook: `${match}: ${prediction.winnerLean}`,
      caption: `${match}: ${prediction.winnerLean}, ${prediction.expectedScore}. Upset watch: ${prediction.upsetRisk}. Main signal: ${leadSignal}. ${tags}`,
      creative: "One square graphic with lean, score, confidence, upset watch, and a small source label.",
      cta: "Follow for the daily signal",
    },
    {
      platform: "YouTube Shorts",
      format: "9:16 · under 60s",
      cadence: "Evening preview slot",
      hook: `${match} in under 60 seconds`,
      caption: `${match} preview: ${prediction.winnerLean}, ${prediction.goalPotential} goal potential, ${prediction.upsetRisk} upset watch. ${tags}`,
      creative: "Presenter-free explainer: scoreboard intro, three signal cards, recap frame, subscribe cue.",
      cta: "Subscribe for daily match intelligence",
    },
  ];
};

const useStoredState = <T,>(key: string, fallback: T) => {
  const [value, setValue] = useState<T>(() => {
    const stored = localStorage.getItem(key);
    return stored ? (JSON.parse(stored) as T) : fallback;
  });

  const setStoredValue = (next: T) => {
    setValue(next);
    localStorage.setItem(key, JSON.stringify(next));
  };

  return [value, setStoredValue] as const;
};

const scoreTeam = (rating: TeamRating) =>
  rating.form * 1.25 +
  rating.attack * 1.3 +
  rating.defense * 1.15 +
  rating.midfield * 1.25 +
  rating.depth * 0.85 +
  rating.coach * 0.75 +
  rating.motivation * 0.75 -
  rating.injuryImpact * 1.1;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const predictionFor = (fixture: Fixture, ratings: TeamRating[]): Prediction => {
  const fallback = (team: string): TeamRating => ({
    team,
    form: 6,
    attack: 6,
    defense: 6,
    midfield: 6,
    depth: 6,
    coach: 6,
    injuryImpact: 2,
    motivation: 7,
  });

  const a = ratings.find((rating) => rating.team.toLowerCase() === fixture.teamA.toLowerCase()) ?? fallback(fixture.teamA);
  const b = ratings.find((rating) => rating.team.toLowerCase() === fixture.teamB.toLowerCase()) ?? fallback(fixture.teamB);
  const aScore = scoreTeam(a);
  const bScore = scoreTeam(b);
  const diff = aScore - bScore;
  const leanTeam = Math.abs(diff) < 3 ? "No clear lean" : diff > 0 ? a.team : b.team;
  const confidence = clamp(Math.round(5 + Math.abs(diff) / 3), 5, 9);
  const upsetRisk = Math.abs(diff) < 2.5 ? "High" : Math.abs(diff) < 7 ? "Medium" : "Low";
  const goalIndex = (a.attack + b.attack + a.form + b.form - a.defense * 0.55 - b.defense * 0.55) / 2;
  const goalPotential = goalIndex > 9 ? "High" : goalIndex > 7 ? "Medium" : "Low";
  const baseA = clamp(Math.round(1 + (a.attack - b.defense) / 3 + a.form / 12), 0, 4);
  const baseB = clamp(Math.round(1 + (b.attack - a.defense) / 3 + b.form / 12), 0, 4);

  const redFlags = [
    a.injuryImpact >= 4 ? `${a.team} injury impact is elevated` : "",
    b.injuryImpact >= 4 ? `${b.team} injury impact is elevated` : "",
    Math.abs(diff) < 3 ? "Ratings are tight enough for a swing result" : "",
    a.motivation >= 9 || b.motivation >= 9 ? "Emotional pressure may shape the first 20 minutes" : "",
  ].filter(Boolean);

  const matchupEdge =
    a.midfield + a.defense > b.midfield + b.defense
      ? `${a.team}'s control phase looks slightly cleaner`
      : `${b.team}'s structure can make this uncomfortable`;

  let marketRead = "No market context loaded";
  if (fixture.homeOdds && fixture.awayOdds) {
    const homeProb = diff > 0 ? 0.4 + (diff * 0.05) : 0.3 + (diff * 0.05);
    const awayProb = diff < 0 ? 0.4 - (diff * 0.05) : 0.3 - (diff * 0.05);
    const impliedHome = 1 / fixture.homeOdds;
    const impliedAway = 1 / fixture.awayOdds;

    if (homeProb > impliedHome + 0.05) {
      marketRead = `${fixture.teamA} model confidence is above public price context`;
    } else if (awayProb > impliedAway + 0.05) {
      marketRead = `${fixture.teamB} model confidence is above public price context`;
    } else {
      marketRead = "Model and market context are broadly aligned";
    }
  }

  return {
    matchId: fixture.id,
    winnerLean: leanTeam === "No clear lean" ? "No clear lean" : `${leanTeam} slight lean`,
    expectedScore: `${baseA}-${baseB}`,
    confidence,
    upsetRisk,
    goalPotential,
    redFlags,
    keyPlayer: diff >= 0 ? `${fixture.teamA} central creator` : `${fixture.teamB} transition runner`,
    storyline: `${fixture.teamA} vs ${fixture.teamB} profiles as a ${upsetRisk.toLowerCase()} upset-risk match. ${matchupEdge}, and the first goal could decide whether this becomes controlled or chaotic.`,
    marketRead,
  };
};

const scenariosFor = (fixture: Fixture, prediction: Prediction): Scenario[] => [
  {
    title: "First goal pressure",
    trigger: `If ${fixture.teamA} scores first`,
    signal: `${fixture.teamB} must open up earlier than planned, which raises transition risk.`,
    contentAngle: `The match becomes a control test for ${fixture.teamA}, not just a scoreline story.`,
  },
  {
    title: "0-0 at 60 minutes",
    trigger: "If the game stays level deep into the second half",
    signal: `The upset watch moves toward ${prediction.upsetRisk === "Low" ? "medium" : "high"} because one set piece can override the rating gap.`,
    contentAngle: "Use this for a live tactical thread or quick vertical explainer.",
  },
  {
    title: "Early card or VAR swing",
    trigger: "If discipline changes the tempo",
    signal: "Confidence should be downgraded and the post-match recap should focus on game-state disruption.",
    contentAngle: "Frame the content around how the model adjusted after the moment, not certainty.",
  },
];

const interestScoreFor = (fixture: Fixture, prediction: Prediction) => {
  const upsetWeight = prediction.upsetRisk === "High" ? 26 : prediction.upsetRisk === "Medium" ? 16 : 8;
  const goalWeight = prediction.goalPotential === "High" ? 18 : prediction.goalPotential === "Medium" ? 12 : 6;
  const stageWeight = fixture.stage.toLowerCase().includes("final") || fixture.stage.toLowerCase().includes("knockout") ? 18 : 8;
  const uncertaintyWeight = 20 - prediction.confidence;
  return clamp(Math.round(30 + upsetWeight + goalWeight + stageWeight + uncertaintyWeight + prediction.redFlags.length * 4), 0, 100);
};

const interestLabelFor = (score: number) => {
  if (score >= 78) return "Lead story";
  if (score >= 62) return "Strong angle";
  if (score >= 46) return "Useful brief";
  return "Low priority";
};

const prettyStage = (value: string) => value.replace(/_/g, " ");

const groupNameFor = (fixture: Fixture) => {
  const parts = fixture.stage.split("/");
  return parts[1]?.trim() ?? "Knockout";
};

const matchdayFor = (fixture: Fixture) => {
  const group = groupNameFor(fixture);
  return group.startsWith("GROUP_") ? group.replace("GROUP_", "Group ") : prettyStage(fixture.stage.split("/")[0]?.trim() || "Match");
};

const sortFixtures = (items: Fixture[]) =>
  [...items].sort((a, b) => `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`));

const canonicalTeamName = (name = "") =>
  name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, "and")
    .replace(/\b(united states|usa)\b/g, "usa")
    .replace(/\b(korea republic|south korea)\b/g, "korea republic")
    .replace(/\b(bosnia and herzegovina|bosnia herzegovina)\b/g, "bosnia herzegovina")
    .replace(/\b(cape verde islands|cape verde|cabo verde)\b/g, "cape verde")
    .replace(/\b(ir iran|iran)\b/g, "iran")
    .replace(/\b(cote d'ivoire|cote d’ivoire|ivory coast)\b/g, "ivory coast")
    .replace(/\b(turkiye|turkey)\b/g, "turkiye")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const fixtureMergeKey = (fixture: Fixture) =>
  `${fixture.date}T${fixture.time}|${[canonicalTeamName(fixture.teamA), canonicalTeamName(fixture.teamB)].sort().join("|")}`;

const mergeFixtureSources = (baseFixtures: Fixture[], enrichmentFixtures: Fixture[]) => {
  const byKey = new Map<string, Fixture>();
  const byDateTime = new Map<string, Fixture>();
  for (const fixture of baseFixtures) {
    const row = { ...fixture };
    byKey.set(fixtureMergeKey(fixture), row);
    byDateTime.set(`${fixture.date}T${fixture.time}`, row);
  }
  for (const fixture of enrichmentFixtures) {
    const key = fixtureMergeKey(fixture);
    const existing = byKey.get(key) ?? byDateTime.get(`${fixture.date}T${fixture.time}`);
    const merged = existing
      ? {
          ...existing,
          time: existing.time || fixture.time,
          stage: fixture.stage || existing.stage,
          venue: fixture.venue || existing.venue,
          status: existing.status === "Scheduled" ? fixture.status : existing.status,
          sourceId: fixture.sourceId ?? fixture.id,
        }
      : fixture;
    byKey.set(existing ? fixtureMergeKey(existing) : key, merged);
    byDateTime.set(`${merged.date}T${merged.time}`, merged);
  }
  return sortFixtures([...byKey.values()]);
};

const groupFixturesBy = (fixtures: Fixture[], getKey: (fixture: Fixture) => string) =>
  sortFixtures(fixtures).reduce<Record<string, Fixture[]>>((groups, fixture) => {
    const key = getKey(fixture);
    groups[key] = [...(groups[key] ?? []), fixture];
    return groups;
  }, {});

const buildGroupTables = (fixtures: Fixture[]) => {
  const groups = groupFixturesBy(
    fixtures.filter((fixture) => groupNameFor(fixture).startsWith("GROUP_")),
    groupNameFor,
  );

  return Object.fromEntries(
    Object.entries(groups).map(([group, matches]) => {
      const teams = Array.from(new Set(matches.flatMap((match) => [match.teamA, match.teamB]).filter((team) => team && team !== "TBD"))).sort();
      return [
        group.replace("GROUP_", "Group "),
        teams.map((team) => ({
          team,
          played: 0,
          wins: 0,
          draws: 0,
          losses: 0,
          goalsFor: 0,
          goalsAgainst: 0,
          goalDifference: 0,
          points: 0,
        })),
      ];
    }),
  );
};

const normalizeSportradarStandings = (standings: any[]): StandingGroup[] => {
  const total = standings.find((standing) => standing.type === "total") ?? standings[0];
  return (total?.groups ?? []).map((group: any) => ({
    group: group.name ?? `Group ${group.group_name ?? ""}`.trim(),
    rows: (group.standings ?? []).map((row: any) => ({
      team: row.competitor?.name ?? "TBD",
      rank: Number(row.rank ?? 0),
      played: Number(row.played ?? 0),
      wins: Number(row.win ?? 0),
      draws: Number(row.draw ?? 0),
      losses: Number(row.loss ?? 0),
      goalsFor: Number(row.goals_for ?? 0),
      goalsAgainst: Number(row.goals_against ?? 0),
      goalDifference: Number(row.goals_diff ?? 0),
      points: Number(row.points ?? 0),
      outcome: row.current_outcome,
    })),
  }));
};

const bandFor = (score: number): "Low" | "Medium" | "High" => {
  if (score >= 72) return "High";
  if (score >= 48) return "Medium";
  return "Low";
};

const marketContextFor = (fixture: Fixture, prediction: Prediction, fixtures: Fixture[]): MarketContext => {
  const hostPressure = ["Mexico", "Canada", "United States"].some((host) => [fixture.teamA, fixture.teamB].includes(host)) ? 18 : 0;
  const groupPressure = groupNameFor(fixture).startsWith("GROUP_") ? 8 : 20;
  const tbdPenalty = fixture.teamA === "TBD" || fixture.teamB === "TBD" ? -18 : 0;
  const sameDayMatches = fixtures.filter((item) => item.date === fixture.date).length;
  const attentionScore = clamp(
    interestScoreFor(fixture, prediction) + hostPressure + groupPressure + Math.min(sameDayMatches * 2, 12) + tbdPenalty,
    0,
    100,
  );
  const volatilityScore = clamp(
    (prediction.upsetRisk === "High" ? 30 : prediction.upsetRisk === "Medium" ? 18 : 8) +
      prediction.redFlags.length * 12 +
      (prediction.confidence <= 6 ? 20 : 8) +
      (fixture.status === "Live" ? 18 : 0),
    0,
    100,
  );

  return {
    attentionScore,
    volatilityScore,
    mediaMomentum: bandFor(attentionScore),
    fanPressure: bandFor(hostPressure + groupPressure + sameDayMatches * 4),
    signals: [
      {
        label: "Attention",
        score: attentionScore,
        note: `${sameDayMatches} match(es) share this date; ${hostPressure ? "host-country attention is active" : "no host-country boost detected"}.`,
      },
      {
        label: "Volatility",
        score: volatilityScore,
        note: `${prediction.upsetRisk} upset watch with ${prediction.redFlags.length} model red flag(s).`,
      },
      {
        label: "Content urgency",
        score: clamp(attentionScore + volatilityScore / 2, 0, 100),
        note: attentionScore >= 72 ? "Treat as a lead content candidate." : "Useful for briefs, but not necessarily the lead story.",
      },
    ],
  };
};

const generateContent = (fixture: Fixture, prediction: Prediction): ContentPack => {
  const telegram = `Today's Match Signal Brief

Top match: ${fixture.teamA} vs ${fixture.teamB}
Prediction: ${prediction.winnerLean}
Expected score: ${prediction.expectedScore}
Confidence: ${prediction.confidence}/10
Upset watch: ${prediction.upsetRisk}
Key player: ${prediction.keyPlayer}
Signal: ${prediction.storyline}

Full report drops tonight.`;

  const xPost = `${fixture.teamA} vs ${fixture.teamB}: ${prediction.winnerLean}, ${prediction.expectedScore}. Upset watch: ${prediction.upsetRisk}. The signal is the opening control phase, not just the star names.`;

  const thread = `1/ ${fixture.teamA} vs ${fixture.teamB} is one of today's sharper storylines.

2/ Signal: ${prediction.storyline}

3/ Confidence: ${prediction.confidence}/10. Goal potential: ${prediction.goalPotential}. Red flags: ${prediction.redFlags.join("; ") || "No major red flags from the current rating sheet."}

4/ Follow The Match Signal for daily football intelligence.`;

  const shortsScript = `HOOK: This match is closer than the headline says.
SCENE 1: ${fixture.teamA} vs ${fixture.teamB}. The lean is ${prediction.winnerLean}.
SCENE 2: Expected score: ${prediction.expectedScore}. Confidence: ${prediction.confidence}/10.
SCENE 3: Upset watch is ${prediction.upsetRisk}; watch the first-goal pressure.
CTA: Follow The Match Signal for daily matchday intelligence.`;

  const reportSection = `## ${fixture.teamA} vs ${fixture.teamB}

Prediction: ${prediction.winnerLean}
Expected score: ${prediction.expectedScore}
Confidence: ${prediction.confidence}/10
Upset risk: ${prediction.upsetRisk}
Goal potential: ${prediction.goalPotential}

${prediction.storyline}

Model notes: ${prediction.redFlags.join("; ") || "No major red flags from the current rating sheet."}`;

  const safetyNotes = safetyCheck(`${telegram}\n${xPost}\n${thread}\n${shortsScript}\n${reportSection}`);

  return {
    telegram,
    xPost,
    thread,
    shortsScript,
    videoTitle: `${fixture.teamA} vs ${fixture.teamB}: Match Signal Preview`,
    reportSection,
    bettingAngle: "Market context pending. Generate AI content to unlock editorial pressure, attention, and volatility notes.",
    safetyNotes,
  };
};

const safetyCheck = (text: string) => {
  const banned = [
    "official fifa",
    "guaranteed",
    "sure game",
  ];
  const lowered = text.toLowerCase();
  const hits = banned.filter((term) => lowered.includes(term));
  return hits.length
    ? hits.map((hit) => `Revise phrase: "${hit.trim()}". Keep outputs as football intelligence; no guaranteed win claims or official-affiliation language.`)
    : ["Clear for operator review: no official-affiliation or guarantee language detected."];
};

const makeVideoJson = (fixture: Fixture, prediction: Prediction, content: ContentPack) => ({
  template: "prediction",
  teamA: fixture.teamA,
  teamB: fixture.teamB,
  hook: "This match is closer than people think.",
  prediction: prediction.winnerLean,
  expectedScore: prediction.expectedScore,
  confidence: `${prediction.confidence}/10`,
  upsetRisk: prediction.upsetRisk,
  cta: "Follow The Match Signal for daily football intelligence.",
  script: content.shortsScript,
});

const providerBadges: ProviderBadge[] = [
  { key: "gemini", label: "Gemini" },
  { key: "footballData", label: "Football Data" },
  { key: "sportradar", label: "Sportradar" },
  { key: "telegram", label: "Telegram Bot" },
  { key: "telegramAdmin", label: "Telegram Admin" },
  { key: "supabaseReady", label: "Supabase", requires: ["supabase", "supabaseKey"] },
  { key: "googleSheetsReady", label: "Google Sheets", requires: ["googleSheets", "googleServiceAccount"] },
  { key: "n8n", label: "n8n" },
  { key: "oddsApi", label: "Market Feed" },
  { key: "buffer", label: "Buffer" },
  { key: "postproxy", label: "Postproxy" },
  { key: "ayrshare", label: "Ayrshare" },
  { key: "uploadPost", label: "Upload-Post" },
  { key: "meta", label: "Meta API" },
  { key: "tiktok", label: "TikTok API" },
  { key: "youtube", label: "YouTube API" },
  { key: "xApi", label: "X API" },
  { key: "bluesky", label: "Bluesky" },
];

const providerReady = (health: ProviderHealth | null, badge: ProviderBadge) => {
  if (!health) return false;
  const required = badge.requires ?? [badge.key];
  return required.every((key) => health.providers[key]?.configured);
};

function App() {
  const [theme, setTheme] = useStoredState<"light" | "dark">("match-signal-theme", "dark");
  const [fixtures, setFixtures] = useStoredState<Fixture[]>("match-signal-fixtures", seedFixtures);
  const [ratings, setRatings] = useStoredState<TeamRating[]>("match-signal-ratings", seedRatings);
  const [accuracy, setAccuracy] = useStoredState<AccuracyRecord[]>("match-signal-accuracy", []);
  const [selectedId, setSelectedId] = useStoredState<string>("match-signal-selected", seedFixtures[0].id);
  const [aiContent, setAiContent] = useStoredState<Record<string, ContentPack>>("match-signal-ai-content", {});
  const [health, setHealth] = useState<ProviderHealth | null>(null);
  const [copied, setCopied] = useState("");
  const [apiMessage, setApiMessage] = useState("API status not checked");
  const [activeView, setActiveView] = useState<View>("command");
  const [queueSearch, setQueueSearch] = useState("");
  const [queueFilter, setQueueFilter] = useState<"All" | ContentStatus | FixtureStatus>("All");
  const [stateSource, setStateSource] = useState("local");
  const [officialStandings, setOfficialStandings] = useState<StandingGroup[]>([]);
  const [matchIntel, setMatchIntel] = useState<Record<string, MatchIntel>>({});
  const [clipSourcePath, setClipSourcePath] = useStoredState("match-signal-clip-source", "");
  const [clipPlans, setClipPlans] = useState<ClipPlan[]>([]);
  const [selectedClipId, setSelectedClipId] = useState("");
  const [renderMode, setRenderMode] = useState<"rough" | "final">("final");
  const [cropMode, setCropMode] = useState<"fill" | "fit">("fill");
  const [renderJobs, setRenderJobs] = useStoredState<RenderJob[]>("match-signal-render-jobs", []);
  const [renderingClipId, setRenderingClipId] = useState("");

  // Loading states
  const [loading, setLoading] = useState<Record<string, boolean>>({});

  const selectedFixture = fixtures.find((fixture) => fixture.id === selectedId) ?? fixtures[0] ?? seedFixtures[0];
  const selectedIntel = matchIntel[selectedFixture.id] ?? {};
  const prediction = useMemo(() => predictionFor(selectedFixture, ratings), [selectedFixture, ratings]);
  const fallbackContent = useMemo(() => generateContent(selectedFixture, prediction), [selectedFixture, prediction]);
  const content = aiContent[selectedFixture.id] ?? fallbackContent;
  const videoJson = useMemo(() => makeVideoJson(selectedFixture, prediction, content), [selectedFixture, prediction, content]);
  const scenarios = useMemo(() => scenariosFor(selectedFixture, prediction), [selectedFixture, prediction]);
  const marketContext = useMemo(() => marketContextFor(selectedFixture, prediction, fixtures), [selectedFixture, prediction, fixtures]);
  const socialKit = useMemo(() => socialKitFor(selectedFixture, prediction, marketContext), [selectedFixture, prediction, marketContext]);
  const selectedAccuracy = accuracy.find((record) => record.matchId === selectedFixture.id) ?? {
    matchId: selectedFixture.id,
    finalScore: "",
    actualWinner: "",
    modelRead: "Pending" as const,
    lesson: "",
  };
  const rankedFixtures = useMemo(
    () =>
      fixtures
        .map((fixture) => {
          const fixturePrediction = predictionFor(fixture, ratings);
          const score = interestScoreFor(fixture, fixturePrediction);
          return { fixture, prediction: fixturePrediction, score, label: interestLabelFor(score) };
        })
        .sort((a, b) => b.score - a.score),
    [fixtures, ratings],
  );
  const filteredQueue = useMemo(() => {
    const query = queueSearch.trim().toLowerCase();
    return rankedFixtures.filter(({ fixture }) => {
      const matchesQuery =
        !query ||
        [fixture.teamA, fixture.teamB, fixture.stage, fixture.venue, fixture.date, fixture.time]
          .join(" ")
          .toLowerCase()
          .includes(query);
      const matchesFilter =
        queueFilter === "All" || fixture.contentStatus === queueFilter || fixture.status === queueFilter;
      return matchesQuery && matchesFilter;
    });
  }, [queueFilter, queueSearch, rankedFixtures]);
  const queueBreakdown = useMemo(
    () => ({
      draft: fixtures.filter((fixture) => fixture.contentStatus === "Draft").length,
      approved: fixtures.filter((fixture) => fixture.contentStatus === "Approved").length,
      posted: fixtures.filter((fixture) => fixture.contentStatus === "Posted").length,
      live: fixtures.filter((fixture) => fixture.status === "Live").length,
    }),
    [fixtures],
  );
  const completedRecords = accuracy.filter((record) => record.modelRead !== "Pending").length;
  const positiveReads = accuracy.filter((record) => record.modelRead === "Right" || record.modelRead === "Partial").length;
  const accuracyRate = completedRecords ? `${Math.round((positiveReads / completedRecords) * 100)}%` : "Pending";

  const todayCount = fixtures.filter((fixture) => fixture.status !== "Final").length;
  const approvedCount = fixtures.filter((fixture) => fixture.contentStatus === "Approved" || fixture.contentStatus === "Posted").length;
  const providerCount = health ? Object.values(health.providers).filter((provider) => provider.configured).length : 0;
  const providerTotal = health ? Object.keys(health.providers).length : 9;
  const selectedInterest = interestScoreFor(selectedFixture, prediction);
  const selectedClip = clipPlans.find((clip) => clip.id === selectedClipId) ?? clipPlans[0];

  const [watermarkText, setWatermarkText] = useState("THE MATCH SIGNAL");
  const [headlineText, setHeadlineText] = useState("");
  const [captionText, setCaptionText] = useState("");
  const [gpuAcceleration, setGpuAcceleration] = useState(false);
  const [selectedJobsToMerge, setSelectedJobsToMerge] = useState<string[]>([]);
  const sourceVideoRef = React.useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (selectedClip) {
      setHeadlineText(`${selectedFixture.teamA} vs ${selectedFixture.teamB}`);
      setCaptionText(selectedClip.hook || "");
    } else {
      setHeadlineText(`${selectedFixture.teamA} vs ${selectedFixture.teamB}`);
      setCaptionText("This match is closer than people think.");
    }
  }, [selectedClipId, selectedFixture.id, selectedClip]);

  const copy = async (label: string, text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(label);
    window.setTimeout(() => setCopied(""), 1400);
  };

  const checkHealth = async () => {
    setLoading((prev) => ({ ...prev, checkHealth: true }));
    try {
      const result = await api<ProviderHealth>("/api/health");
      setHealth(result);
      const configured = Object.values(result.providers).filter((provider) => provider.configured).length;
      setApiMessage(`${configured}/${Object.keys(result.providers).length} providers configured`);
    } catch (error) {
      setApiMessage(error instanceof Error ? error.message : "API health check failed");
    } finally {
      setLoading((prev) => ({ ...prev, checkHealth: false }));
    }
  };

  useEffect(() => {
    void checkHealth();
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadClipPlans = async () => {
      try {
        const result = await api<{ ok: boolean; plans: ClipPlan[] }>("/api/clips/plan", {
          method: "POST",
          body: JSON.stringify({ fixture: selectedFixture, prediction, content }),
        });
        if (cancelled) return;
        setClipPlans(result.plans);
        setSelectedClipId((current) => result.plans.some((plan) => plan.id === current) ? current : result.plans[0]?.id ?? "");
      } catch (error) {
        if (!cancelled) setApiMessage(error instanceof Error ? error.message : "Clip planning failed");
      }
    };
    void loadClipPlans();
    return () => {
      cancelled = true;
    };
  }, [selectedFixture.id, prediction.winnerLean, prediction.expectedScore, content.videoTitle]);

  const snapshot = (): AppSnapshot => ({ fixtures, ratings, accuracy, aiContent });

  const applySnapshot = (state: Partial<AppSnapshot>) => {
    if (state.fixtures?.length) {
      setFixtures(state.fixtures);
      setSelectedId(state.fixtures.some((fixture) => fixture.id === selectedId) ? selectedId : state.fixtures[0].id);
    }
    if (state.ratings?.length) setRatings(state.ratings);
    if (state.accuracy) setAccuracy(state.accuracy);
    if (state.aiContent) setAiContent(state.aiContent);
  };

  const loadSupabaseState = async ({ silent = false } = {}) => {
    setLoading((prev) => ({ ...prev, loadSupabase: true }));
    try {
      const result = await api<StateResponse>("/api/supabase/state");
      if (!result.state?.fixtures?.length) {
        if (!silent) setApiMessage("Supabase is connected, but no fixtures are saved there yet");
        return false;
      }
      applySnapshot(result.state);
      setStateSource("supabase");
      if (!silent) {
        setApiMessage(`Loaded Supabase state: ${result.counts?.fixtures ?? result.state.fixtures.length} fixtures`);
      }
      return true;
    } catch (error) {
      if (!silent) setApiMessage(error instanceof Error ? error.message : "Supabase load failed");
      return false;
    } finally {
      setLoading((prev) => ({ ...prev, loadSupabase: false }));
    }
  };

  useEffect(() => {
    let cancelled = false;
    const boot = async () => {
      try {
        const result = await api<StateResponse>("/api/supabase/state");
        if (!cancelled && result.state?.fixtures?.length) {
          applySnapshot(result.state);
          setStateSource("supabase");
          setApiMessage(`Loaded Supabase source of truth: ${result.counts?.fixtures ?? result.state.fixtures.length} fixtures`);
          return;
        }
      } catch {
        // Fall back to backend file state/local storage below.
      }

      try {
        const result = await api<StateResponse>("/api/state");
        if (!cancelled && result.state?.fixtures?.length) {
          applySnapshot(result.state);
          setStateSource("backend file");
          setApiMessage("Loaded backend state fallback");
        }
      } catch {
        if (!cancelled) setStateSource("local");
      }
    };

    void boot();
    return () => {
      cancelled = true;
    };
  }, []);

  const saveServerState = async () => {
    setLoading((prev) => ({ ...prev, saveServerState: true }));
    try {
      await api("/api/state", {
        method: "PUT",
        body: JSON.stringify({ ...snapshot(), savedAt: new Date().toISOString() }),
      });
      setApiMessage("Saved to backend state store");
    } catch (error) {
      setApiMessage(error instanceof Error ? error.message : "Save failed");
    } finally {
      setLoading((prev) => ({ ...prev, saveServerState: false }));
    }
  };

  const loadServerState = async () => {
    setLoading((prev) => ({ ...prev, loadServerState: true }));
    try {
      const loadedSupabase = await loadSupabaseState({ silent: true });
      if (loadedSupabase) {
        setApiMessage("Loaded Supabase state");
        return;
      }
      const result = await api<StateResponse>("/api/state");
      if (!result.state) {
        setApiMessage("No backend state has been saved yet");
        return;
      }
      applySnapshot(result.state);
      setStateSource("backend file");
      setApiMessage("Loaded backend state fallback");
    } catch (error) {
      setApiMessage(error instanceof Error ? error.message : "Load failed");
    } finally {
      setLoading((prev) => ({ ...prev, loadServerState: false }));
    }
  };

  const checkVideoEngine = async () => {
    setLoading((prev) => ({ ...prev, checkVideoEngine: true }));
    try {
      const result = await api<{ ok: boolean; ffmpeg: { configured: boolean; version?: string; error?: string }; outputDir: string }>("/api/video/status");
      setApiMessage(result.ffmpeg.configured ? `Video engine ready: ${result.ffmpeg.version}` : `FFmpeg unavailable: ${result.ffmpeg.error}`);
    } catch (error) {
      setApiMessage(error instanceof Error ? error.message : "Video engine check failed");
    } finally {
      setLoading((prev) => ({ ...prev, checkVideoEngine: false }));
    }
  };

  const probeVideoSource = async (pathOverride?: string) => {
    const targetPath = pathOverride || clipSourcePath;
    if (!targetPath.trim()) {
      setApiMessage("Add a local source video path first");
      return;
    }
    setLoading((prev) => ({ ...prev, probeVideo: true }));
    try {
      const result = await api<{ ok: boolean; probe: { format?: { duration?: string }; streams?: Array<{ codec_type?: string; codec_name?: string; width?: number; height?: number }> } }>("/api/video/probe", {
        method: "POST",
        body: JSON.stringify({ sourcePath: targetPath }),
      });
      const video = result.probe.streams?.find((stream) => stream.codec_type === "video");
      const duration = Number(result.probe.format?.duration ?? 0);
      setApiMessage(`Source ready: ${video?.width ?? "?"}x${video?.height ?? "?"}, ${duration ? `${Math.round(duration)}s` : "duration unknown"}`);
    } catch (error) {
      setApiMessage(error instanceof Error ? error.message : "Video probe failed");
    } finally {
      setLoading((prev) => ({ ...prev, probeVideo: false }));
    }
  };

  const createSampleVideo = async () => {
    setLoading((prev) => ({ ...prev, createSample: true }));
    try {
      const result = await api<{ ok: boolean; path: string }>("/api/video/sample", {
        method: "POST",
      });
      setClipSourcePath(result.path);
      await probeVideoSource(result.path);
    } catch (error) {
      setApiMessage(error instanceof Error ? error.message : "Sample video creation failed");
    } finally {
      setLoading((prev) => ({ ...prev, createSample: false }));
    }
  };

  const renderClip = async (clip: ClipPlan) => {
    if (!clipSourcePath.trim()) {
      setApiMessage("Add a local source video path before rendering");
      return;
    }
    setRenderingClipId(clip.id);
    try {
      const result = await api<{ ok: boolean; job: RenderJob }>("/api/clips/render", {
        method: "POST",
        body: JSON.stringify({
          sourcePath: clipSourcePath,
          matchId: selectedFixture.id,
          clipType: clip.clipType,
          title: clip.title,
          startTime: clip.startTime,
          endTime: clip.endTime,
          mode: renderMode,
          cropMode,
          watermarkText,
          headlineText,
          captionText,
          gpuAcceleration,
        }),
      });
      setRenderJobs([result.job, ...renderJobs].slice(0, 12));
      setApiMessage(`Rendered ${clip.preset}: ${result.job.publicUrl}`);
    } catch (error) {
      setApiMessage(error instanceof Error ? error.message : "Clip render failed");
    } finally {
      setRenderingClipId("");
    }
  };

  const mergeClips = async () => {
    if (selectedJobsToMerge.length < 2) {
      setApiMessage("Select at least 2 clips in the output queue to merge");
      return;
    }
    setLoading((prev) => ({ ...prev, mergeClips: true }));
    try {
      const result = await api<{ ok: boolean; job: RenderJob }>("/api/clips/merge", {
        method: "POST",
        body: JSON.stringify({
          clipPaths: selectedJobsToMerge,
          title: `${selectedFixture.teamA} vs ${selectedFixture.teamB} Highlight Reel`,
        }),
      });
      setRenderJobs([result.job, ...renderJobs].slice(0, 12));
      setSelectedJobsToMerge([]);
      setApiMessage(`Merged highlight reel: ${result.job.publicUrl}`);
    } catch (error) {
      setApiMessage(error instanceof Error ? error.message : "Clips merge failed");
    } finally {
      setLoading((prev) => ({ ...prev, mergeClips: false }));
    }
  };

  const saveFixtureSupabase = async (fixture: Fixture) => {
    try {
      await api("/api/supabase/fixture", {
        method: "POST",
        body: JSON.stringify({ fixture }),
      });
      setStateSource("supabase");
    } catch (error) {
      setApiMessage(error instanceof Error ? error.message : "Supabase fixture save failed");
    }
  };

  const saveRatingSupabase = async (rating: TeamRating) => {
    try {
      await api("/api/supabase/rating", {
        method: "POST",
        body: JSON.stringify({ rating }),
      });
      setStateSource("supabase");
    } catch (error) {
      setApiMessage(error instanceof Error ? error.message : "Supabase rating save failed");
    }
  };

  const saveContentSupabase = async (matchId: string, content: ContentPack) => {
    try {
      await api("/api/supabase/content", {
        method: "POST",
        body: JSON.stringify({ matchId, content }),
      });
      setStateSource("supabase");
    } catch (error) {
      setApiMessage(error instanceof Error ? error.message : "Supabase content save failed");
    }
  };

  const importFixtures = async () => {
    const start = "2026-06-11";
    const end = "2026-07-19";
    setLoading((prev) => ({ ...prev, importFixtures: true }));
    try {
      const result = await api<{ ok: boolean; fixtures: Fixture[] }>(`/api/fixtures?dateFrom=${start}&dateTo=${end}&competition=WC`);
      if (!result.fixtures.length) {
        setApiMessage("Fixture API returned no World Cup matches for the tournament window");
        return;
      }
      const byId = new Map(fixtures.map((fixture) => [fixture.id, fixture]));
      for (const fixture of result.fixtures) {
        byId.set(fixture.id, { ...(byId.get(fixture.id) ?? {}), ...fixture, sourceId: byId.get(fixture.id)?.sourceId });
      }
      const next = sortFixtures([...byId.values()]);
      setFixtures(next);
      setSelectedId(result.fixtures[0].id);
      await api("/api/supabase/push", {
        method: "POST",
        body: JSON.stringify({ fixtures: next, ratings, accuracy, aiContent }),
      });
      setStateSource("supabase");
      setApiMessage(`Imported ${result.fixtures.length} World Cup fixture(s)`);
    } catch (error) {
      setApiMessage(error instanceof Error ? error.message : "Fixture import failed");
    } finally {
      setLoading((prev) => ({ ...prev, importFixtures: false }));
    }
  };

  const syncWorldCupSources = async () => {
    setLoading((prev) => ({ ...prev, syncWorldCup: true }));
    try {
      const result = await api<{
        ok: boolean;
        footballDataCount: number;
        sportradarCount: number;
        mergedCount: number;
        enrichedCount: number;
        fixtures: Fixture[];
      }>("/api/fixtures/sync-world-cup", {
        method: "POST",
        body: JSON.stringify({}),
      });
      const next = mergeFixtureSources(fixtures, result.fixtures);
      setFixtures(next);
      setSelectedId(result.fixtures[0]?.id ?? selectedFixture.id);
      setStateSource("supabase");
      setApiMessage(`Dual-source sync: ${result.mergedCount} fixtures, ${result.enrichedCount} with Sportradar event IDs`);
    } catch (error) {
      setApiMessage(error instanceof Error ? error.message : "Dual-source World Cup sync failed");
    } finally {
      setLoading((prev) => ({ ...prev, syncWorldCup: false }));
    }
  };

  const syncOddsApi = async () => {
    setLoading((prev) => ({ ...prev, syncOddsApi: true }));
    try {
      const result = await api<{ ok: boolean; events: any[] }>(`/api/odds-api/sync`);
      if (!result.events || !result.events.length) {
        setApiMessage("Market feed returned no events");
        return;
      }

      const nextFixtures = [...fixtures];
      let matchesFound = 0;
      const changedFixtures: Fixture[] = [];

      for (const event of result.events) {
         const homeName = event.home_team?.toLowerCase() ?? "";
         const awayName = event.away_team?.toLowerCase() ?? "";
         const fixture = nextFixtures.find(
           (f) =>
             (f.teamA.toLowerCase().includes(homeName) || homeName.includes(f.teamA.toLowerCase())) &&
             (f.teamB.toLowerCase().includes(awayName) || awayName.includes(f.teamB.toLowerCase())),
         );

         if (fixture) {
           const homeOddsArr: number[] = [];
           const drawOddsArr: number[] = [];
           const awayOddsArr: number[] = [];

           for (const bookmaker of event.bookmakers ?? []) {
             for (const market of bookmaker.markets ?? []) {
               if (market.key === "h2h") {
                 const home = market.outcomes?.find((o: any) => o.name === event.home_team)?.price;
                 const draw = market.outcomes?.find((o: any) => o.name === "Draw")?.price;
                 const away = market.outcomes?.find((o: any) => o.name === event.away_team)?.price;
                 if (home) homeOddsArr.push(home);
                 if (draw) drawOddsArr.push(draw);
                 if (away) awayOddsArr.push(away);
               }
             }
           }

           if (homeOddsArr.length > 0) {
             fixture.homeOdds = Number((homeOddsArr.reduce((a, b) => a + b, 0) / homeOddsArr.length).toFixed(2));
             fixture.drawOdds = Number((drawOddsArr.reduce((a, b) => a + b, 0) / drawOddsArr.length).toFixed(2));
             fixture.awayOdds = Number((awayOddsArr.reduce((a, b) => a + b, 0) / awayOddsArr.length).toFixed(2));
             matchesFound++;
             changedFixtures.push({ ...fixture });
           }
         }
      }

      setFixtures(nextFixtures);
      changedFixtures.forEach((fixture) => void saveFixtureSupabase(fixture));
      setApiMessage(`Synced market feed: updated price context for ${matchesFound} matches`);
    } catch (error) {
      setApiMessage(error instanceof Error ? error.message : "Market feed sync failed");
    } finally {
      setLoading((prev) => ({ ...prev, syncOddsApi: false }));
    }
  };

  const importSportradarDay = async () => {
    const date = selectedFixture.date || "2026-06-11";
    setLoading((prev) => ({ ...prev, importSportradarDay: true }));
    try {
      const result = await api<{ ok: boolean; fixtures: Fixture[]; rawCount: number }>(`/api/sportradar/schedules/${date}`);
      if (!result.fixtures.length) {
        setApiMessage(`Sportradar returned no soccer events for ${date}`);
        return;
      }
      const next = mergeFixtureSources(fixtures, result.fixtures);
      setFixtures(next);
      await api("/api/supabase/push", {
        method: "POST",
        body: JSON.stringify({ fixtures: next, ratings, accuracy, aiContent }),
      });
      setStateSource("supabase");
      setApiMessage(`Merged ${result.fixtures.length} Sportradar event(s) into Football-data fixtures for ${date}`);
    } catch (error) {
      setApiMessage(error instanceof Error ? error.message : "Sportradar import failed");
    } finally {
      setLoading((prev) => ({ ...prev, importSportradarDay: false }));
    }
  };

  const fetchSportradarStandings = async () => {
    setLoading((prev) => ({ ...prev, standings: true }));
    try {
      const result = await api<{ ok: boolean; standings: any[] }>(`/api/sportradar/seasons/${encodeURIComponent(WORLD_CUP_2026_SPORTRADAR_SEASON_ID)}/standings`);
      const normalized = normalizeSportradarStandings(result.standings);
      setOfficialStandings(normalized);
      setApiMessage(`Loaded official Sportradar standings for ${normalized.length} group(s)`);
    } catch (error) {
      setApiMessage(error instanceof Error ? error.message : "Sportradar standings failed");
    } finally {
      setLoading((prev) => ({ ...prev, standings: false }));
    }
  };

  const fetchSportradarSummary = async () => {
    const eventId = selectedFixture.sourceId ?? (selectedFixture.id.startsWith("sr:") ? selectedFixture.id : "");
    if (!eventId) {
      setApiMessage("Selected match does not have a Sportradar sport_event_id yet");
      return;
    }
    setLoading((prev) => ({ ...prev, fetchSportradarSummary: true }));
    try {
      const result = await api<{ ok: boolean; summary: any }>(`/api/sportradar/sport-events/${encodeURIComponent(eventId)}/summary`);
      setMatchIntel((current) => ({
        ...current,
        [selectedFixture.id]: { ...(current[selectedFixture.id] ?? {}), summary: result.summary },
      }));
      setApiMessage("Fetched Sportradar sport-event summary");
    } catch (error) {
      setApiMessage(error instanceof Error ? error.message : "Sportradar summary failed");
    } finally {
      setLoading((prev) => ({ ...prev, fetchSportradarSummary: false }));
    }
  };

  const fetchSportradarLineups = async () => {
    const eventId = selectedFixture.sourceId ?? (selectedFixture.id.startsWith("sr:") ? selectedFixture.id : "");
    if (!eventId) {
      setApiMessage("Selected match does not have a Sportradar sport_event_id yet");
      return;
    }
    setLoading((prev) => ({ ...prev, fetchSportradarLineups: true }));
    try {
      const result = await api<{ ok: boolean; lineups: any; raw?: any }>(`/api/sportradar/sport-events/${encodeURIComponent(eventId)}/lineups`);
      setMatchIntel((current) => ({
        ...current,
        [selectedFixture.id]: { ...(current[selectedFixture.id] ?? {}), lineups: result.raw ?? result.lineups },
      }));
      setApiMessage("Fetched Sportradar sport-event lineups");
    } catch (error) {
      setApiMessage(error instanceof Error ? error.message : "Sportradar lineups failed");
    } finally {
      setLoading((prev) => ({ ...prev, fetchSportradarLineups: false }));
    }
  };

  const fetchSportradarTimeline = async () => {
    const eventId = selectedFixture.sourceId ?? (selectedFixture.id.startsWith("sr:") ? selectedFixture.id : "");
    if (!eventId) {
      setApiMessage("Selected match does not have a Sportradar sport_event_id yet");
      return;
    }
    setLoading((prev) => ({ ...prev, fetchSportradarTimeline: true }));
    try {
      const result = await api<{ ok: boolean; timeline: any }>(`/api/sportradar/sport-events/${encodeURIComponent(eventId)}/timeline`);
      setMatchIntel((current) => ({
        ...current,
        [selectedFixture.id]: { ...(current[selectedFixture.id] ?? {}), timeline: result.timeline },
      }));
      setApiMessage("Fetched Sportradar sport-event timeline");
    } catch (error) {
      setApiMessage(error instanceof Error ? error.message : "Sportradar timeline failed");
    } finally {
      setLoading((prev) => ({ ...prev, fetchSportradarTimeline: false }));
    }
  };

  const fetchSportradarMomentum = async () => {
    const eventId = selectedFixture.sourceId ?? (selectedFixture.id.startsWith("sr:") ? selectedFixture.id : "");
    if (!eventId) {
      setApiMessage("Selected match does not have a Sportradar sport_event_id yet");
      return;
    }
    setLoading((prev) => ({ ...prev, fetchSportradarMomentum: true }));
    try {
      const result = await api<{ ok: boolean; momentum: any; raw?: any }>(`/api/sportradar/sport-events/${encodeURIComponent(eventId)}/momentum`);
      setMatchIntel((current) => ({
        ...current,
        [selectedFixture.id]: { ...(current[selectedFixture.id] ?? {}), momentum: result.raw ?? result.momentum },
      }));
      setApiMessage("Fetched Sportradar sport-event momentum");
    } catch (error) {
      setApiMessage(error instanceof Error ? error.message : "Sportradar momentum failed");
    } finally {
      setLoading((prev) => ({ ...prev, fetchSportradarMomentum: false }));
    }
  };

  const fetchSportradarLive = async () => {
    setLoading((prev) => ({ ...prev, fetchSportradarLive: true }));
    try {
      await api("/api/sportradar/live/summaries");
      setApiMessage("Fetched Sportradar live summaries");
    } catch (error) {
      setApiMessage(error instanceof Error ? error.message : "Sportradar live summaries failed");
    } finally {
      setLoading((prev) => ({ ...prev, fetchSportradarLive: false }));
    }
  };

  const generateWithAI = async () => {
    setLoading((prev) => ({ ...prev, generateWithAI: true }));
    try {
      const selectedIntel = matchIntel[selectedFixture.id] ?? {};
      const result = await api<{ ok: boolean; content: ContentPack | null; raw: string }>("/api/content/ai", {
        method: "POST",
        body: JSON.stringify({ fixture: selectedFixture, prediction, scenarios, intel: selectedIntel }),
      });
      if (!result.content) {
        setApiMessage("Gemini returned text, but not valid JSON. Check the backend raw response.");
        return;
      }
      setAiContent({ ...aiContent, [selectedFixture.id]: result.content });
      void saveContentSupabase(selectedFixture.id, result.content);
      setApiMessage("Generated content with Gemini");
    } catch (error) {
      setApiMessage(error instanceof Error ? error.message : "AI generation failed");
    } finally {
      setLoading((prev) => ({ ...prev, generateWithAI: false }));
    }
  };

  const generateRatingsWithAI = async () => {
    const teams = [...new Set(fixtures.flatMap((fixture) => [fixture.teamA, fixture.teamB]).filter((team) => team && team.toLowerCase() !== "tbd"))];
    setLoading((prev) => ({ ...prev, generateRatingsWithAI: true }));
    try {
      const result = await api<{ ok: boolean; ratings: TeamRating[]; savedToSupabase: boolean }>("/api/ratings/ai", {
        method: "POST",
        body: JSON.stringify({ teams, fixtures }),
      });
      const incoming = new Map(result.ratings.map((rating) => [rating.team.toLowerCase(), rating]));
      const kept = ratings.filter((rating) => !incoming.has(rating.team.toLowerCase()));
      setRatings([...kept, ...result.ratings].sort((a, b) => a.team.localeCompare(b.team)));
      if (result.savedToSupabase) setStateSource("supabase");
      setApiMessage(`AI rating intelligence generated for ${result.ratings.length} team(s)`);
    } catch (error) {
      setApiMessage(error instanceof Error ? error.message : "AI ratings generation failed");
    } finally {
      setLoading((prev) => ({ ...prev, generateRatingsWithAI: false }));
    }
  };

  const sendTelegramPreview = async () => {
    setLoading((prev) => ({ ...prev, sendTelegramPreview: true }));
    try {
      const fullText = content.bettingAngle && !content.bettingAngle.startsWith("Market context pending")
        ? `${content.telegram}\n\n---\nMarket Context\n${content.bettingAngle}`
        : content.telegram;

      await api("/api/telegram/preview", {
        method: "POST",
        body: JSON.stringify({ text: fullText, matchId: selectedFixture.id }),
      });
      setApiMessage("Sent Telegram admin preview");
    } catch (error) {
      setApiMessage(error instanceof Error ? error.message : "Telegram preview failed");
    } finally {
      setLoading((prev) => ({ ...prev, sendTelegramPreview: false }));
    }
  };

  const setupTelegram = async () => {
    setLoading((prev) => ({ ...prev, setupTelegram: true }));
    try {
      await api("/api/telegram/setup", { method: "POST", body: JSON.stringify({}) });
      setApiMessage("Telegram commands registered");
    } catch (error) {
      setApiMessage(error instanceof Error ? error.message : "Telegram setup failed");
    } finally {
      setLoading((prev) => ({ ...prev, setupTelegram: false }));
    }
  };

  const checkTelegramStatus = async () => {
    setLoading((prev) => ({ ...prev, checkTelegramStatus: true }));
    try {
      const result = await api<{ ok: boolean; bot: { username?: string }; commands: Array<{ command: string }> }>("/api/telegram/status");
      setApiMessage(`Telegram @${result.bot.username ?? "bot"} ready with ${result.commands.length} command(s)`);
    } catch (error) {
      setApiMessage(error instanceof Error ? error.message : "Telegram status failed");
    } finally {
      setLoading((prev) => ({ ...prev, checkTelegramStatus: false }));
    }
  };

  const sendTelegramPublic = async () => {
    setLoading((prev) => ({ ...prev, sendTelegramPublic: true }));
    try {
      await api("/api/telegram/public", {
        method: "POST",
        body: JSON.stringify({ text: content.telegram }),
      });
      setApiMessage("Sent Telegram public post");
    } catch (error) {
      setApiMessage(error instanceof Error ? error.message : "Telegram public post failed");
    } finally {
      setLoading((prev) => ({ ...prev, sendTelegramPublic: false }));
    }
  };

  const sendTelegramBetting = async () => {
    setLoading((prev) => ({ ...prev, sendTelegramBetting: true }));
    try {
      if (!content.bettingAngle || content.bettingAngle.startsWith("Market context pending")) {
        setApiMessage("No valid market context available to send");
        return;
      }
      const fullText = `${selectedFixture.teamA} vs ${selectedFixture.teamB}\nMarket Context:\n\n${content.bettingAngle}`;
      await api("/api/telegram/betting", {
        method: "POST",
        body: JSON.stringify({ text: fullText }),
      });
      setApiMessage("Sent Telegram market context post");
    } catch (error) {
      setApiMessage(error instanceof Error ? error.message : "Telegram market context post failed");
    } finally {
      setLoading((prev) => ({ ...prev, sendTelegramBetting: false }));
    }
  };

  const pushSupabase = async () => {
    setLoading((prev) => ({ ...prev, pushSupabase: true }));
    try {
      await api("/api/supabase/push", {
        method: "POST",
        body: JSON.stringify(snapshot()),
      });
      setApiMessage("Pushed current OS state to Supabase");
    } catch (error) {
      setApiMessage(error instanceof Error ? error.message : "Supabase push failed");
    } finally {
      setLoading((prev) => ({ ...prev, pushSupabase: false }));
    }
  };

  const exportSheets = async () => {
    setLoading((prev) => ({ ...prev, exportSheets: true }));
    try {
      await api("/api/sheets/export", {
        method: "POST",
        body: JSON.stringify(snapshot()),
      });
      setApiMessage("Exported current OS state to Google Sheets");
    } catch (error) {
      setApiMessage(error instanceof Error ? error.message : "Google Sheets export failed");
    } finally {
      setLoading((prev) => ({ ...prev, exportSheets: false }));
    }
  };

  const downloadWorkbook = async () => {
    setLoading((prev) => ({ ...prev, downloadWorkbook: true }));
    try {
      const response = await fetch("/api/spreadsheet/workbook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(snapshot()),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error ?? "Workbook export failed");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "match-signal-os-workbook.xlsx";
      a.click();
      URL.revokeObjectURL(url);
      setApiMessage("Downloaded spreadsheet workbook");
    } catch (error) {
      setApiMessage(error instanceof Error ? error.message : "Workbook export failed");
    } finally {
      setLoading((prev) => ({ ...prev, downloadWorkbook: false }));
    }
  };

  const triggerN8n = async () => {
    setLoading((prev) => ({ ...prev, triggerN8n: true }));
    try {
      await api("/api/n8n/trigger", {
        method: "POST",
        body: JSON.stringify({
          workflow: "manual",
          payload: {
            fixture: selectedFixture,
            prediction,
            content,
            scenarios,
            videoJson,
          },
        }),
      });
      setApiMessage("Triggered n8n workflow");
    } catch (error) {
      setApiMessage(error instanceof Error ? error.message : "n8n trigger failed");
    } finally {
      setLoading((prev) => ({ ...prev, triggerN8n: false }));
    }
  };

  const socialDryRun = async () => {
    setLoading((prev) => ({ ...prev, socialDryRun: true }));
    try {
      const result = await api<{ ok: boolean; provider: string; payload: { platforms: string[] }; dryRun: boolean }>("/api/social/publish", {
        method: "POST",
        body: JSON.stringify({
          provider: "postproxy",
          dryRun: true,
          platforms: ["instagram", "x", "youtube", "tiktok", "threads", "bluesky"],
          text: content.xPost,
          title: content.videoTitle,
          matchId: selectedFixture.id,
          metadata: {
            fixture: `${selectedFixture.teamA} vs ${selectedFixture.teamB}`,
            contentStatus: selectedFixture.contentStatus,
          },
        }),
      });
      setApiMessage(`Social dry run ready for ${result.payload.platforms.length} platform(s) via ${result.provider}`);
    } catch (error) {
      setApiMessage(error instanceof Error ? error.message : "Social dry run failed");
    } finally {
      setLoading((prev) => ({ ...prev, socialDryRun: false }));
    }
  };

  const addFixture = () => {
    const id = `m-${Date.now()}`;
    const next: Fixture = {
      id,
      date: "2026-06-13",
      time: "17:00",
      teamA: "Team A",
      teamB: "Team B",
      stage: "Group stage",
      venue: "Venue",
      status: "Scheduled",
      contentStatus: "Draft",
    };
    setFixtures([...fixtures, next]);
    setSelectedId(id);
    void saveFixtureSupabase(next);
  };

  const updateFixture = (id: string, patch: Partial<Fixture>) => {
    let changed: Fixture | null = null;
    const next = fixtures.map((fixture) => {
      if (fixture.id !== id) return fixture;
      changed = { ...fixture, ...patch };
      return changed;
    });
    setFixtures(next);
    if (changed) void saveFixtureSupabase(changed);
  };

  const updateRating = (team: string, patch: Partial<TeamRating>) => {
    let changed: TeamRating | null = null;
    const next = ratings.map((rating) => {
      if (rating.team !== team) return rating;
      changed = { ...rating, ...patch };
      return changed;
    });
    setRatings(next);
    if (changed) void saveRatingSupabase(changed);
  };

  const updateAccuracy = (patch: Partial<AccuracyRecord>) => {
    const next = { ...selectedAccuracy, ...patch };
    const exists = accuracy.some((record) => record.matchId === selectedFixture.id);
    setAccuracy(exists ? accuracy.map((record) => (record.matchId === selectedFixture.id ? next : record)) : [...accuracy, next]);
  };

  const ensureRating = (team: string) => {
    if (ratings.some((rating) => rating.team.toLowerCase() === team.toLowerCase())) return;
    const rating = { team, form: 6, attack: 6, defense: 6, midfield: 6, depth: 6, coach: 6, injuryImpact: 2, motivation: 7 };
    setRatings([...ratings, rating]);
    void saveRatingSupabase(rating);
  };

  const downloadReport = () => {
    const report = fixtures
      .map((fixture) => generateContent(fixture, predictionFor(fixture, ratings)).reportSection)
      .join("\n\n---\n\n");
    const blob = new Blob([`# The Match Signal Daily Report\n\n${report}`], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "match-signal-daily-report.md";
    a.click();
    URL.revokeObjectURL(url);
  };

  function platformIconFor(platform: string) {
    if (platform.includes("Instagram")) return <Instagram size={20} />;
    if (platform.includes("TikTok")) return <Film size={20} />;
    if (platform.includes("YouTube")) return <Youtube size={20} />;
    if (platform.includes("X")) return <Megaphone size={20} />;
    return <Image size={20} />;
  }

  const navigationTabs = [
    { view: "command" as View, title: "Command center", icon: <Radio size={20} /> },
    { view: "data" as View, title: "World Cup data", icon: <BarChart3 size={20} /> },
    { view: "lab" as View, title: "Prediction lab", icon: <Gauge size={20} /> },
    { view: "brand" as View, title: "Brand studio", icon: <Palette size={20} /> },
    { view: "content" as View, title: "Content queue", icon: <Megaphone size={20} /> },
    { view: "video" as View, title: "Video clipping", icon: <Scissors size={20} /> },
    { view: "automation" as View, title: "Automation", icon: <Activity size={20} /> },
    { view: "review" as View, title: "Review", icon: <ShieldCheck size={20} /> },
  ];

  return (
    <main className={`flex flex-col md:flex-row min-h-screen font-sans selection:bg-signal-gold/30 selection:text-ink relative ${theme === "dark" ? "dark bg-[#101b17] text-[#f6efe0]" : "bg-[#ded6c4] text-[#17211e]"}`}>
      {/* Sidebar for Desktop */}
      <aside className="hidden md:flex flex-col gap-6 py-6 px-4 bg-[#0c1512]/95 border-r border-[#d0b36a]/20 sticky top-0 h-screen z-[100] w-64 flex-shrink-0" aria-label="Match Signal navigation">
        <div className="flex items-center gap-3 border border-[#c9972d]/35 bg-[#c9972d] text-[#101b17] rounded-none font-black text-lg h-12 px-4 font-display tracking-tight select-none">
          <span>MS</span>
          <span className="text-xs uppercase tracking-[0.2em] font-extrabold text-[#101b17]/70">Signal OS</span>
        </div>
        
        <div className="flex flex-col gap-1.5 w-full">
          {navigationTabs.map((tab) => (
            <div key={tab.view} className="relative w-full h-10 flex items-center">
              {activeView === tab.view && (
                <motion.div
                  layoutId="activeRail"
                  className="absolute inset-0 bg-[#f6efe0]"
                  transition={{ type: "spring", stiffness: 380, damping: 30 }}
                />
              )}
              <button
                title={tab.title}
                onClick={() => setActiveView(tab.view)}
                className={`relative z-10 flex items-center gap-3 px-3 h-10 w-full rounded-none transition-colors duration-300 cursor-pointer ${
                  activeView === tab.view ? "text-[#101b17] font-bold" : "text-[#a9b1aa] hover:text-[#f6efe0]"
                }`}
              >
                <span className="flex-shrink-0">{tab.icon}</span>
                <span className="text-[10px] uppercase tracking-wider font-extrabold truncate">{tab.title.split(" ")[0]}</span>
              </button>
            </div>
          ))}
        </div>
      </aside>

      {/* Bottom Navigation for Mobile */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 h-16 bg-[#0a0f1e]/90 backdrop-blur-md border-t border-line-border/30 z-[120] flex justify-around items-center px-2 " aria-label="Mobile Navigation">
        {navigationTabs.map((tab) => {
          const isActive = activeView === tab.view;
          return (
            <button
              key={tab.view}
              onClick={() => setActiveView(tab.view)}
              className={`flex flex-col items-center justify-center gap-0.5 px-2 py-1 rounded-none transition-colors relative cursor-pointer ${
                isActive ? "text-pitch-green font-bold" : "text-muted-text"
              }`}
            >
              {React.cloneElement(tab.icon as React.ReactElement<any>, { size: 18 })}
              <span className="text-[9px] uppercase tracking-wider font-semibold font-mono truncate max-w-[55px]">
                {tab.title.split(" ")[0]}
              </span>
            </button>
          );
        })}
      </nav>

      <section className="flex-1 max-w-[1650px] w-full p-4 md:p-8 pb-24 md:pb-8 overflow-x-hidden flex flex-col gap-6">
        <header className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-[#d0b36a]/25 pb-5 mb-2">
          <div>
            <p className="text-signal-gold text-[10px] font-extrabold uppercase tracking-[0.24em] mb-1">
              Anonymous football intelligence
            </p>
            <h1 className="text-[#17211e] dark:text-[#f6efe0] text-3xl font-black tracking-[-0.04em]">The Match Signal OS</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-none border border-line-border/40 bg-paper-2 text-xs font-semibold text-slate-700 dark:text-ink font-mono">
              <Activity size={14} className="text-pitch-green" /> {todayCount} active
            </span>
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-none border border-line-border/40 bg-paper-2 text-xs font-semibold text-slate-700 dark:text-ink font-mono">
              <CheckCircle2 size={14} className="text-pitch-green" /> {approvedCount} approved
            </span>
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-none border border-line-border/40 bg-paper-2 text-xs font-semibold text-slate-700 dark:text-ink font-mono">
              <BarChart3 size={14} className="text-pitch-green" /> {providerCount}/{providerTotal} APIs
            </span>
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-none border border-line-border/40 bg-paper-2 text-xs font-semibold text-slate-700 dark:text-ink font-mono">
              <ShieldCheck size={14} className="text-pitch-green" /> {stateSource}
            </span>
            <Button
              variant="glass"
              icon={theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              className="h-8 w-8 p-0"
              title="Toggle theme"
            />
            <Button
              variant="primary"
              icon={<Download size={14} />}
              onClick={downloadReport}
              className="h-8 text-xs text-[#060913]"
            >
              Export report
            </Button>
          </div>
        </header>

        {activeView === "command" && (
          <section className="grid grid-cols-1 gap-3 border border-[#d0b36a]/25 bg-[#101b17] p-4 text-[#f6efe0] md:grid-cols-4">
            {[
              ["Desk", `${fixtures.length} fixtures`],
              ["Signal", `${selectedFixture.teamA} vs ${selectedFixture.teamB}`],
              ["Publishing", `${approvedCount} approved`],
              ["Connectors", `${providerCount}/${providerTotal} ready`],
            ].map(([label, value]) => (
              <div key={label} className="border-l border-[#c9972d]/45 pl-4">
                <span className="block text-[10px] font-black uppercase tracking-[0.22em] text-[#c9972d]">{label}</span>
                <strong className="mt-1 block truncate text-sm font-black">{value}</strong>
              </div>
            ))}
          </section>
        )}

        <nav className="flex flex-wrap gap-2 bg-paper-2 border border-line-border/30 rounded-none p-1.5 w-max max-w-full select-none" aria-label="Workspace views">
          {navigationTabs.map((tab) => (
            <button
              key={tab.view}
              className={`relative px-4 py-2 text-xs font-bold uppercase rounded-none transition-colors duration-300 flex items-center gap-2 cursor-pointer ${
                activeView === tab.view ? "text-[#060913]" : "text-muted-text hover:text-ink"
              }`}
              onClick={() => setActiveView(tab.view)}
            >
              {activeView === tab.view && (
                <motion.div
                  layoutId="activeTabPill"
                  className="absolute inset-0 bg-[#c9972d] rounded-none shadow-sm"
                  transition={{ type: "spring", stiffness: 380, damping: 30 }}
                />
              )}
              <span className="relative z-10 flex items-center gap-1.5">
                {React.cloneElement(tab.icon as React.ReactElement<any>, { size: 14 })}
                {tab.title}
              </span>
            </button>
          ))}
        </nav>

        {activeView === "automation" && (
          <section className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
            <article className="border border-[#d0b36a]/25 bg-[#101b17] p-6 md:p-8 text-[#f6efe0] xl:col-span-2">
              <div className="grid gap-6 lg:grid-cols-[1fr_420px] lg:items-end">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.28em] text-[#c9972d]">Social Ops Control</p>
                  <h2 className="mt-4 text-[clamp(2rem,4.4vw,4.6rem)] font-black leading-[0.92] tracking-[-0.055em]">
                    Connect, draft, approve, publish.
                  </h2>
                  <p className="mt-5 max-w-[720px] text-base leading-7 text-[#d9d0bd]">{apiMessage}</p>
                </div>
                <div className="grid grid-cols-2 border border-[#f6efe0]/10 bg-[#f6efe0]/5">
                  {[
                    ["Providers", `${providerCount}/${providerTotal}`],
                    ["Approved", String(approvedCount)],
                    ["Source", stateSource],
                    ["Drafts", String(queueBreakdown.draft)],
                  ].map(([label, value]) => (
                    <div key={label} className="border-b border-r border-[#f6efe0]/10 p-4 odd:border-r">
                      <span className="block text-[10px] font-black uppercase tracking-[0.18em] text-[#c9972d]">{label}</span>
                      <strong className="mt-2 block font-mono text-lg font-black">{value}</strong>
                    </div>
                  ))}
                </div>
              </div>
            </article>

            <article className="border border-line-border/45 bg-paper p-5 md:p-6">
              <div className="flex flex-col gap-4 border-b border-line-border/35 pb-4 md:flex-row md:items-start md:justify-between">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.24em] text-signal-gold">Provider Matrix</p>
                  <h2 className="mt-1 text-xl font-black tracking-[-0.04em] text-ink">Connections</h2>
                </div>
                <Button variant="primary" icon={<Activity size={15} />} onClick={checkHealth} loading={loading.checkHealth}>
                  Check APIs
                </Button>
              </div>
              <div className="mt-5 grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
                {providerBadges.map((badge) => {
                  const ready = providerReady(health, badge);
                  return (
                    <div
                      className={`flex items-center justify-between border p-3 ${
                        ready ? "border-pitch-green/30 bg-pitch-green/10" : "border-pressure-red/30 bg-pressure-red/10"
                      }`}
                      key={badge.key}
                    >
                      <span className="text-sm font-black text-ink">{badge.label}</span>
                      <span className={`font-mono text-[10px] font-black uppercase tracking-[0.12em] ${ready ? "text-pitch-green" : "text-pressure-red"}`}>
                        {ready ? "ready" : "missing"}
                      </span>
                    </div>
                  );
                })}
              </div>
            </article>

            <aside className="grid gap-5">
              <article className="border border-line-border/45 bg-paper p-5 md:p-6">
                <p className="text-[10px] font-black uppercase tracking-[0.24em] text-signal-gold">Publish Stack</p>
                <div className="mt-5 grid gap-3">
                  <Button variant="primary" icon={<Send size={15} />} onClick={socialDryRun} loading={loading.socialDryRun}>Buffer draft</Button>
                  <Button variant="glass" icon={<Radio size={15} />} onClick={sendTelegramPreview} loading={loading.sendTelegramPreview}>Telegram preview</Button>
                  <Button variant="glass" icon={<Send size={15} />} onClick={sendTelegramPublic} loading={loading.sendTelegramPublic}>Telegram public</Button>
                  <Button variant="glass" icon={<BarChart3 size={15} />} onClick={sendTelegramBetting} loading={loading.sendTelegramBetting}>Market context</Button>
                  <Button variant="glass" icon={<Sparkles size={15} />} onClick={triggerN8n} loading={loading.triggerN8n}>Trigger n8n</Button>
                </div>
              </article>

              <article className="border border-line-border/45 bg-[#101b17] p-5 text-[#f6efe0]">
                <p className="text-[10px] font-black uppercase tracking-[0.24em] text-[#c9972d]">Render JSON</p>
                <pre className="mt-4 max-h-[360px] overflow-auto border border-[#f6efe0]/10 bg-[#0c1713] p-4 text-[11px] leading-5 text-[#f6efe0]">{JSON.stringify(videoJson, null, 2)}</pre>
                <Button variant="glass" icon={<Clipboard size={14} />} onClick={() => copy("Video JSON", JSON.stringify(videoJson, null, 2))} className="mt-4 w-full text-xs">
                  {copied === "Video JSON" ? "Copied" : "Copy JSON"}
                </Button>
              </article>
            </aside>

            <article className="border border-line-border/45 bg-paper p-5 md:p-6">
              <div className="border-b border-line-border/35 pb-4">
                <p className="text-[10px] font-black uppercase tracking-[0.24em] text-signal-gold">Data Feeds</p>
                <h2 className="mt-1 text-xl font-black tracking-[-0.04em] text-ink">Source Sync</h2>
              </div>
              <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                <Button onClick={importFixtures} loading={loading.importFixtures}>Football-data</Button>
                <Button onClick={syncWorldCupSources} loading={loading.syncWorldCup}>Dual-source</Button>
                <Button onClick={importSportradarDay} loading={loading.importSportradarDay}>SR day enrich</Button>
                <Button onClick={fetchSportradarStandings} loading={loading.standings}>SR standings</Button>
                <Button onClick={fetchSportradarSummary} loading={loading.fetchSportradarSummary}>SR summary</Button>
                <Button onClick={fetchSportradarLineups} loading={loading.fetchSportradarLineups}>SR lineups</Button>
                <Button onClick={fetchSportradarTimeline} loading={loading.fetchSportradarTimeline}>SR timeline</Button>
                <Button onClick={fetchSportradarMomentum} loading={loading.fetchSportradarMomentum}>SR momentum</Button>
                <Button onClick={fetchSportradarLive} loading={loading.fetchSportradarLive}>SR live</Button>
              </div>
            </article>

            <article className="border border-line-border/45 bg-paper p-5 md:p-6 xl:col-span-2">
              <div className="border-b border-line-border/35 pb-4">
                <p className="text-[10px] font-black uppercase tracking-[0.24em] text-signal-gold">Storage & Export</p>
                <h2 className="mt-1 text-xl font-black tracking-[-0.04em] text-ink">State Control</h2>
              </div>
              <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Button onClick={setupTelegram} loading={loading.setupTelegram}>Telegram setup</Button>
                <Button onClick={checkTelegramStatus} loading={loading.checkTelegramStatus}>Telegram status</Button>
                <Button onClick={pushSupabase} loading={loading.pushSupabase}>Push Supabase</Button>
                <Button onClick={() => void loadSupabaseState()} loading={loading.loadSupabase}>Load Supabase</Button>
                <Button onClick={generateRatingsWithAI} loading={loading.generateRatingsWithAI}>AI ratings</Button>
                <Button onClick={exportSheets} loading={loading.exportSheets}>Export Sheets</Button>
                <Button onClick={downloadWorkbook} loading={loading.downloadWorkbook}>Download XLSX</Button>
                <Button onClick={saveServerState} loading={loading.saveServerState}>Save backend</Button>
                <Button onClick={loadServerState} loading={loading.loadServerState}>Load backend</Button>
              </div>
            </article>
          </section>
        )}

        {activeView === "command" && (
          <section className="grid grid-cols-1 gap-5 xl:grid-cols-[360px_minmax(0,1fr)] xl:items-start">
            <aside className="border border-line-border/45 bg-paper p-5 xl:sticky xl:top-6 xl:max-h-[calc(100dvh-48px)] xl:overflow-y-auto">
              <div className="flex items-start justify-between gap-3 border-b border-line-border/35 pb-4">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.24em] text-signal-gold">Match Queue</p>
                  <h2 className="mt-1 text-xl font-black tracking-[-0.04em] text-ink">Fixture Desk</h2>
                  <p className="mt-2 text-xs leading-5 text-muted-text">
                    Ranked by match interest, content status, and operator readiness.
                  </p>
                </div>
                <Button variant="icon" onClick={addFixture} title="Add fixture" aria-label="Add fixture">
                  <CalendarPlus size={18} />
                </Button>
              </div>

              <div className="mt-4 grid grid-cols-4 border border-line-border/35 bg-field-bg/35 text-center">
                {[
                  ["Draft", queueBreakdown.draft],
                  ["Approved", queueBreakdown.approved],
                  ["Posted", queueBreakdown.posted],
                  ["Live", queueBreakdown.live],
                ].map(([label, value]) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => setQueueFilter(label as ContentStatus | FixtureStatus)}
                    className={`min-h-0 justify-center rounded-none border-0 border-r border-line-border/30 bg-transparent px-2 py-2 last:border-r-0 ${
                      queueFilter === label ? "text-signal-gold" : "text-muted-text hover:text-ink"
                    }`}
                  >
                    <span className="grid gap-0.5">
                      <strong className="font-mono text-sm text-ink">{value}</strong>
                      <span className="text-[9px] font-black uppercase tracking-[0.12em]">{label}</span>
                    </span>
                  </button>
                ))}
              </div>

              <div className="mt-4 flex items-center gap-2 border border-line-border/45 bg-field-bg px-3 py-2">
                <Search size={15} className="shrink-0 text-signal-gold" />
                <input
                  value={queueSearch}
                  onChange={(event) => setQueueSearch(event.target.value)}
                  placeholder="Search team, venue, stage"
                  className="min-h-0 w-full border-0 bg-transparent p-0 text-sm font-bold text-ink outline-none placeholder:text-muted-text"
                />
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                {(["All", "Draft", "Approved", "Posted", "Scheduled", "Live"] as Array<"All" | ContentStatus | FixtureStatus>).map((filter) => (
                  <button
                    key={filter}
                    type="button"
                    onClick={() => setQueueFilter(filter)}
                    className={`min-h-0 rounded-none px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.12em] ${
                      queueFilter === filter
                        ? "border-signal-gold bg-signal-gold text-[#101b17]"
                        : "border-line-border/45 bg-transparent text-muted-text hover:text-ink"
                    }`}
                  >
                    {filter}
                  </button>
                ))}
              </div>

              <div className="mt-5 flex items-center justify-between border-y border-line-border/35 py-2">
                <span className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-text">
                  Showing {filteredQueue.length}/{fixtures.length}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setQueueFilter("All");
                    setQueueSearch("");
                  }}
                  className="min-h-0 rounded-none border-0 bg-transparent px-0 py-0 text-[10px] font-black uppercase tracking-[0.16em] text-signal-gold hover:bg-transparent"
                >
                  Reset
                </button>
              </div>

              <div className="mt-4 grid gap-2">
                {filteredQueue.length ? filteredQueue.map(({ fixture, prediction: fixturePrediction, score, label }, index) => {
                  const isSelected = fixture.id === selectedFixture.id;
                  return (
                    <button
                      key={fixture.id}
                      className={`group w-full border p-0 text-left transition-colors duration-200 ${
                        isSelected
                          ? "border-signal-gold bg-signal-gold/10 text-ink"
                          : "border-line-border/35 bg-field-bg/50 text-ink hover:border-signal-gold/45"
                      }`}
                      onClick={() => setSelectedId(fixture.id)}
                    >
                      <div className="grid grid-cols-[38px_minmax(0,1fr)_52px] items-stretch">
                        <div className={`flex items-center justify-center border-r border-line-border/30 font-mono text-[10px] font-black ${
                          isSelected ? "bg-signal-gold text-[#101b17]" : "text-muted-text"
                        }`}>
                          {String(index + 1).padStart(2, "0")}
                        </div>
                        <div className="min-w-0 px-3 py-2.5">
                          <div className="flex min-w-0 items-start justify-between gap-2">
                            <span className="min-w-0 text-sm font-black leading-tight tracking-[-0.02em]">
                              {fixture.teamA} <span className="text-signal-gold">vs</span> {fixture.teamB}
                            </span>
                          </div>
                          <div className="mt-2 grid gap-1.5 text-[10px] font-bold uppercase tracking-[0.1em] text-muted-text">
                            <span className="truncate font-mono">{fixture.date} / {fixture.time}</span>
                            <span className="truncate">{fixture.stage} / {fixture.venue || "Venue TBD"}</span>
                          </div>
                          <div className="mt-2 flex flex-wrap items-center gap-1.5">
                            <span className="border border-line-border/35 px-2 py-1 text-[9px] font-black uppercase tracking-[0.12em] text-muted-text">{fixture.status}</span>
                            <span className="border border-line-border/35 px-2 py-1 text-[9px] font-black uppercase tracking-[0.12em] text-muted-text">{fixture.contentStatus}</span>
                            <span className="border border-line-border/35 px-2 py-1 text-[9px] font-black uppercase tracking-[0.12em] text-muted-text">{fixturePrediction.upsetRisk} risk</span>
                          </div>
                        </div>
                        <div className="grid place-items-center border-l border-line-border/30 px-2">
                          <span className="font-mono text-lg font-black text-signal-gold">{score}</span>
                          <span className="mt-[-10px] text-[8px] font-black uppercase tracking-[0.1em] text-muted-text">{label}</span>
                        </div>
                      </div>
                    </button>
                  );
                }) : (
                  <div className="border border-dashed border-line-border/55 bg-field-bg/40 p-5">
                    <p className="text-sm font-black text-ink">No fixtures match this queue view.</p>
                    <p className="mt-2 text-xs leading-5 text-muted-text">Clear the search or switch the filter back to All.</p>
                  </div>
                )}
              </div>
            </aside>

            <section className="flex min-w-0 flex-col gap-5">
              <article className="relative overflow-hidden border border-[#d0b36a]/25 bg-[#101b17] p-6 md:p-8 text-[#f6efe0]">
                <div className="absolute right-[-160px] top-[-200px] h-[460px] w-[460px] rounded-full border-[38px] border-[#c9972d]/20" />
                <div className="relative">
                  <p className="text-[10px] font-black uppercase tracking-[0.28em] text-[#c9972d]">Current Signal</p>
                  <div className="mt-5 grid gap-6">
                    <div>
                      <h2 className="max-w-[780px] text-[clamp(2.25rem,4.2vw,4.5rem)] font-black leading-[0.9] tracking-[-0.06em]">
                        {selectedFixture.teamA}
                        <span className="block text-[#c9972d]">vs</span>
                        {selectedFixture.teamB}
                      </h2>
                      <p className="mt-6 max-w-[760px] text-base leading-7 text-[#d9d0bd]">{prediction.storyline}</p>
                    </div>
                    <div className="grid gap-3 border border-[#f6efe0]/10 bg-[#f6efe0]/5 p-4 md:grid-cols-3">
                      <div className="flex items-center justify-between border-b border-[#f6efe0]/10 pb-3 md:block md:border-b-0 md:border-r md:pb-0 md:pr-4">
                        <span className="text-xs font-black uppercase tracking-[0.18em] text-[#c9972d]">Lean</span>
                        <strong className="block text-right text-sm font-black md:mt-2 md:text-left">{prediction.winnerLean}</strong>
                      </div>
                      <div className="flex items-center justify-between border-b border-[#f6efe0]/10 pb-3 md:block md:border-b-0 md:border-r md:pb-0 md:pr-4">
                        <span className="text-xs font-black uppercase tracking-[0.18em] text-[#c9972d]">Score</span>
                        <strong className="block font-mono text-sm font-black md:mt-2">{prediction.expectedScore}</strong>
                      </div>
                      <div className="flex items-center justify-between md:block">
                        <span className="text-xs font-black uppercase tracking-[0.18em] text-[#c9972d]">Confidence</span>
                        <strong className="block font-mono text-sm font-black md:mt-2">{prediction.confidence}/10</strong>
                      </div>
                    </div>
                    <div className="grid gap-3 border-t border-[#f6efe0]/10 pt-4 sm:grid-cols-2 xl:grid-cols-4">
                      <Button variant="primary" icon={<Sparkles size={15} />} onClick={generateWithAI} loading={loading.generateWithAI}>Generate</Button>
                      <Button variant="glass" icon={<Radio size={15} />} onClick={sendTelegramPreview} loading={loading.sendTelegramPreview}>Telegram</Button>
                      <Button variant="glass" icon={<Send size={15} />} onClick={socialDryRun} loading={loading.socialDryRun}>Buffer draft</Button>
                      <Button variant="glass" icon={<ShieldCheck size={15} />} onClick={() => updateFixture(selectedFixture.id, { contentStatus: "Approved" })}>Approve</Button>
                    </div>
                  </div>
                </div>
              </article>

              <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <Metric label="Interest" value={`${interestLabelFor(selectedInterest)} / ${selectedInterest}`} />
                <Metric label="Upset watch" value={prediction.upsetRisk} />
                <Metric label="Goal potential" value={prediction.goalPotential} />
                <Metric label="Fan pressure" value={marketContext.fanPressure} />
              </section>

              <article className="border border-line-border/45 bg-paper p-5 md:p-6">
                <div className="flex flex-col gap-4 border-b border-line-border/35 pb-4 md:flex-row md:items-start md:justify-between">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.24em] text-signal-gold">Fixture Control</p>
                    <h2 className="mt-1 text-xl font-black tracking-[-0.04em] text-ink">Match Metadata</h2>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="glass" icon={<BarChart3 size={15} />} onClick={syncOddsApi} loading={loading.syncOddsApi}>Market feed</Button>
                    <Button variant="primary" icon={<Sparkles size={15} />} onClick={generateWithAI} loading={loading.generateWithAI}>Generate</Button>
                  </div>
                </div>
                <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-6">
                  <div className="xl:col-span-3"><LabeledInput label="Team A" value={selectedFixture.teamA} onChange={(teamA) => { updateFixture(selectedFixture.id, { teamA }); ensureRating(teamA); }} /></div>
                  <div className="xl:col-span-3"><LabeledInput label="Team B" value={selectedFixture.teamB} onChange={(teamB) => { updateFixture(selectedFixture.id, { teamB }); ensureRating(teamB); }} /></div>
                  <LabeledInput label="Date" type="date" value={selectedFixture.date} onChange={(date) => updateFixture(selectedFixture.id, { date })} />
                  <LabeledInput label="Time" type="time" value={selectedFixture.time} onChange={(time) => updateFixture(selectedFixture.id, { time })} />
                  <div className="xl:col-span-2"><LabeledInput label="Stage" value={selectedFixture.stage} onChange={(stage) => updateFixture(selectedFixture.id, { stage })} /></div>
                  <div className="xl:col-span-2"><LabeledInput label="Venue" value={selectedFixture.venue} onChange={(venue) => updateFixture(selectedFixture.id, { venue })} /></div>
                  <div className="md:col-span-2 xl:col-span-6 grid grid-cols-1 gap-3 border border-dashed border-line-border/55 bg-field-bg/35 p-4 md:grid-cols-3">
                    <LabeledInput label="Home price context" type="number" value={String(selectedFixture.homeOdds || "")} onChange={(val) => updateFixture(selectedFixture.id, { homeOdds: parseFloat(val) || undefined })} />
                    <LabeledInput label="Draw price context" type="number" value={String(selectedFixture.drawOdds || "")} onChange={(val) => updateFixture(selectedFixture.id, { drawOdds: parseFloat(val) || undefined })} />
                    <LabeledInput label="Away price context" type="number" value={String(selectedFixture.awayOdds || "")} onChange={(val) => updateFixture(selectedFixture.id, { awayOdds: parseFloat(val) || undefined })} />
                  </div>
                </div>
              </article>

              <section className="grid grid-cols-1 gap-5 lg:grid-cols-2">
                {[selectedFixture.teamA, selectedFixture.teamB].map((team) => {
                  const rating = ratings.find((item) => item.team.toLowerCase() === team.toLowerCase());
                  if (!rating) return null;
                  return <TeamRatingEditor key={team} rating={rating} onChange={(patch) => updateRating(rating.team, patch)} />;
                })}
              </section>

              <MatchIntelPanel fixture={selectedFixture} intel={selectedIntel} />
            </section>

            <aside className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:col-start-2 xl:grid-cols-[1fr_1fr] 2xl:grid-cols-[0.85fr_0.85fr_1fr]">
              <article className="border border-line-border/45 bg-[#101b17] p-5 md:p-6 text-[#f6efe0]">
                <p className="text-[10px] font-black uppercase tracking-[0.24em] text-[#c9972d]">Publishing State</p>
                <div className="mt-5 grid gap-3">
                  {[
                    ["Content", selectedFixture.contentStatus],
                    ["Providers", `${providerCount}/${providerTotal}`],
                    ["Source", stateSource],
                    ["Buffer", "Dry-run safe"],
                  ].map(([label, value]) => (
                    <div key={label} className="flex items-center justify-between border-b border-[#f6efe0]/10 pb-3 last:border-b-0">
                      <span className="text-xs font-black uppercase tracking-[0.16em] text-[#c9972d]">{label}</span>
                      <strong className="text-right text-sm font-black">{value}</strong>
                    </div>
                  ))}
                </div>
              </article>

              <article className="border border-line-border/45 bg-paper p-5 md:col-span-2 md:p-6 2xl:col-span-1">
                <p className="text-[10px] font-black uppercase tracking-[0.24em] text-signal-gold">Scenario Watch</p>
                <div className="mt-5 grid gap-3">
                  {scenarios.map((scenario) => (
                    <div key={scenario.title} className="border-l border-signal-gold/45 pl-4">
                      <strong className="block text-sm font-black text-ink">{scenario.title}</strong>
                      <span className="mt-1 block text-xs leading-5 text-muted-text">{scenario.signal}</span>
                    </div>
                  ))}
                </div>
              </article>
            </aside>
          </section>
        )}

        {activeView === "data" && (
          <WorldCupDataView
            fixtures={fixtures}
            selectedId={selectedFixture.id}
            onSelect={(fixtureId) => {
              setSelectedId(fixtureId);
              setActiveView("command");
            }}
            onImport={importFixtures}
            onDualSync={syncWorldCupSources}
            standings={officialStandings}
            onLoadStandings={fetchSportradarStandings}
            loadingStates={{
              importFixtures: loading.importFixtures,
              syncWorldCup: loading.syncWorldCup,
              standings: loading.standings,
            }}
          />
        )}

        {activeView === "lab" && (
          <section className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
            <article className="border border-[#d0b36a]/25 bg-[#101b17] p-6 md:p-8 text-[#f6efe0] xl:col-span-2">
              <p className="text-[10px] font-black uppercase tracking-[0.28em] text-[#c9972d]">Prediction Lab</p>
              <div className="mt-5 grid gap-6 lg:grid-cols-[1fr_360px] lg:items-end">
                <div>
                  <h2 className="text-[clamp(2rem,4.4vw,4.6rem)] font-black leading-[0.92] tracking-[-0.055em]">
                    Test the match before the timeline moves.
                  </h2>
                  <p className="mt-5 max-w-[720px] text-base leading-7 text-[#d9d0bd]">
                    Build scenario reads, rank volatility, and decide what content angle deserves attention before the match window opens.
                  </p>
                </div>
                <div className="grid gap-3 border border-[#f6efe0]/10 bg-[#f6efe0]/5 p-4">
                  <Metric label="Attention" value={String(marketContext.attentionScore)} />
                  <Metric label="Volatility" value={String(marketContext.volatilityScore)} />
                </div>
              </div>
            </article>

            <article className="border border-line-border/45 bg-paper p-5 md:p-6">
              <div className="border-b border-line-border/35 pb-4">
                <p className="text-[10px] font-black uppercase tracking-[0.24em] text-signal-gold">Scenario Builder</p>
                <h2 className="mt-1 text-xl font-black tracking-[-0.04em] text-ink">{selectedFixture.teamA} vs {selectedFixture.teamB}</h2>
              </div>
              <div className="mt-5 grid gap-4">
                {scenarios.map((scenario, index) => (
                  <article className="border-l border-signal-gold/50 bg-field-bg/55 p-4 pl-5" key={scenario.title}>
                    <span className="font-mono text-[10px] font-black text-signal-gold">0{index + 1}</span>
                    <h3 className="mt-2 text-base font-black tracking-[-0.03em] text-ink">{scenario.title}</h3>
                    <p className="mt-2 text-xs leading-5 text-muted-text"><b className="text-ink">Trigger:</b> {scenario.trigger}</p>
                    <p className="mt-2 text-xs leading-5 text-muted-text"><b className="text-ink">Signal:</b> {scenario.signal}</p>
                    <p className="mt-2 text-xs leading-5 text-muted-text"><b className="text-ink">Angle:</b> {scenario.contentAngle}</p>
                  </article>
                ))}
              </div>
            </article>

            <aside className="border border-line-border/45 bg-paper p-5 md:p-6">
              <div className="border-b border-line-border/35 pb-4">
                <p className="text-[10px] font-black uppercase tracking-[0.24em] text-signal-gold">Content Radar</p>
                <h2 className="mt-1 text-xl font-black tracking-[-0.04em] text-ink">Priority Queue</h2>
              </div>
              <div className="mt-5 grid max-h-[520px] gap-2 overflow-y-auto pr-1">
                {rankedFixtures.map(({ fixture, prediction: fixturePrediction, score, label }, index) => (
                  <button key={fixture.id} className="w-full border border-line-border/35 bg-field-bg/55 p-3 text-left hover:border-signal-gold/45" onClick={() => setSelectedId(fixture.id)}>
                    <div className="flex items-start justify-between gap-3">
                      <span className="font-mono text-[10px] font-black text-signal-gold">{String(index + 1).padStart(2, "0")}</span>
                      <strong className="min-w-0 flex-1 text-sm font-black leading-tight text-ink">{fixture.teamA} vs {fixture.teamB}</strong>
                      <span className="font-mono text-xs font-black text-signal-gold">{score}</span>
                    </div>
                    <p className="mt-2 text-[10px] font-bold uppercase tracking-[0.1em] text-muted-text">
                      {fixturePrediction.upsetRisk} risk / {fixturePrediction.goalPotential} goals / {label}
                    </p>
                  </button>
                ))}
              </div>
            </aside>

            <article className="border border-line-border/45 bg-paper p-5 md:p-6 xl:col-span-2">
              <div className="border-b border-line-border/35 pb-4">
                <p className="text-[10px] font-black uppercase tracking-[0.24em] text-signal-gold">Market Context</p>
                <h2 className="mt-1 text-xl font-black tracking-[-0.04em] text-ink">Attention & Volatility Signals</h2>
              </div>
              <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
                <Metric label="Momentum" value={marketContext.mediaMomentum} />
                <Metric label="Attention score" value={String(marketContext.attentionScore)} />
                <Metric label="Volatility score" value={String(marketContext.volatilityScore)} />
                <Metric label="Content priority" value={interestLabelFor(clamp(marketContext.attentionScore + marketContext.volatilityScore / 2, 0, 100))} />
              </div>
              <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-3">
                {marketContext.signals.map((signal) => (
                  <article className="border border-line-border/35 bg-field-bg/55 p-4" key={signal.label}>
                    <strong className="text-xs font-black uppercase tracking-[0.16em] text-signal-gold">{signal.label}</strong>
                    <span className="mt-3 block font-mono text-2xl font-black text-ink">{signal.score}/100</span>
                    <p className="mt-2 text-xs leading-5 text-muted-text">{signal.note}</p>
                  </article>
                ))}
              </div>
            </article>
          </section>
        )}

        {activeView === "brand" && (
          <section className="flex flex-col gap-6">
            <section className="relative overflow-hidden border border-[#d0b36a]/25 bg-[#101b17] text-[#f6efe0]">
              <div className="absolute inset-y-0 right-0 w-[46%] bg-[#10543f]/55" />
              <div className="absolute right-[-180px] top-[-220px] h-[520px] w-[520px] rounded-full border-[44px] border-[#c9972d]/20" />
              <div className="relative grid gap-0 lg:grid-cols-[1.05fr_0.95fr]">
                <div className="p-7 md:p-10">
                  <p className="text-[10px] font-black uppercase tracking-[0.28em] text-[#c9972d]">Brand Command</p>
                  <h2 className="mt-6 max-w-[760px] text-[clamp(2.25rem,5.2vw,5.5rem)] font-black leading-[0.9] tracking-[-0.055em]">
                    Field Intelligence, built for social velocity.
                  </h2>
                  <p className="mt-6 max-w-[640px] text-base leading-7 text-[#d9d0bd]">
                    The Match Signal now has a premium asset system, platform handles, content pillars, and match-specific captions. This view is the control surface for keeping every post recognizable.
                  </p>
                  <div className="mt-8 grid max-w-[720px] gap-3 sm:grid-cols-3">
                    {[
                      ["Instagram", "@thematchsignal"],
                      ["X", "@thematchsignal"],
                      ["YouTube", "@TheMatchSignal"],
                    ].map(([label, value]) => (
                      <div key={label} className="border border-[#d0b36a]/25 bg-[#f6efe0]/5 p-4">
                        <span className="text-[10px] font-black uppercase tracking-[0.22em] text-[#c9972d]">{label}</span>
                        <strong className="mt-2 block text-sm font-black text-[#f6efe0]">{value}</strong>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="relative min-h-[420px] border-t border-[#f6efe0]/10 lg:border-l lg:border-t-0">
                  <div className="absolute inset-10 border border-[#f6efe0]/10" />
                  <div className="absolute inset-x-10 top-1/2 border-t border-[#f6efe0]/10" />
                  <div className="absolute inset-y-10 left-1/2 border-l border-[#f6efe0]/10" />
                  <div className="absolute left-1/2 top-1/2 grid h-56 w-56 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-[16px] border-[#c9972d] bg-[#10543f]">
                    <div className="text-center">
                      <div className="text-6xl font-black tracking-[-0.08em]">MS</div>
                      <div className="mx-auto mt-4 h-2 w-28 rounded-full bg-[#c9972d]" />
                    </div>
                  </div>
                  <div className="absolute bottom-8 left-8 right-8 flex justify-between text-[10px] font-black uppercase tracking-[0.22em] text-[#c9972d]">
                    <span>Avatar</span>
                    <span>Banner</span>
                    <span>Post</span>
                  </div>
                </div>
              </div>
            </section>

            <section className="grid grid-cols-1 xl:grid-cols-[0.95fr_1.15fr_0.9fr] gap-5">
              <article className="border border-line-border/45 bg-paper p-5 md:p-6">
                <div className="flex items-start justify-between gap-4 border-b border-line-border/35 pb-4">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.24em] text-signal-gold">Premium Files</p>
                    <h2 className="mt-1 text-xl font-black tracking-[-0.04em] text-ink">Use These Assets</h2>
                  </div>
                  <Image size={22} className="text-signal-gold" />
                </div>
                <div className="mt-5 grid gap-3">
                  {[
                    ["Profile avatar", "match-signal-premium-avatar-2048.png", "All social profiles"],
                    ["Instagram intro", "match-signal-instagram-intro-1080x1350.png", "Pinned feed launch"],
                    ["YouTube banner", "match-signal-youtube-banner-2048x1152.png", "Channel art"],
                    ["X header", "match-signal-x-header-1500x500.png", "Profile header"],
                  ].map(([label, file, use]) => (
                    <div key={file} className="border-l border-signal-gold/45 bg-field-bg/50 p-3 pl-4">
                      <strong className="block text-sm font-black text-ink">{label}</strong>
                      <span className="mt-1 block font-mono text-[10px] text-muted-text">{file}</span>
                      <span className="mt-1 block text-xs font-bold text-muted-text">{use}</span>
                    </div>
                  ))}
                </div>
              </article>

              <article className="border border-line-border/45 bg-paper p-5 md:p-6">
                <div className="flex items-start justify-between gap-4 border-b border-line-border/35 pb-4">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.24em] text-signal-gold">Editorial System</p>
                    <h2 className="mt-1 text-xl font-black tracking-[-0.04em] text-ink">Brand Pillars</h2>
                  </div>
                  <Layers size={22} className="text-signal-gold" />
                </div>
                <div className="mt-5 grid gap-4 sm:grid-cols-2">
                  {brandPillars.map((pillar, index) => (
                    <div key={pillar.title} className="border border-line-border/35 bg-field-bg/55 p-4">
                      <span className="font-mono text-[10px] font-black text-signal-gold">0{index + 1}</span>
                      <h3 className="mt-2 text-base font-black tracking-[-0.03em] text-ink">{pillar.title}</h3>
                      <p className="mt-2 text-sm leading-6 text-muted-text">{pillar.detail}</p>
                    </div>
                  ))}
                </div>
              </article>

              <article className="border border-line-border/45 bg-[#101b17] p-5 md:p-6 text-[#f6efe0]">
                <p className="text-[10px] font-black uppercase tracking-[0.24em] text-[#c9972d]">Voice Guardrails</p>
                <h2 className="mt-1 text-xl font-black tracking-[-0.04em]">Publish Without Drift</h2>
                <ul className="mt-5 space-y-3">
                  {voiceRules.map((rule) => (
                    <li key={rule} className="border-b border-[#f6efe0]/10 pb-3 text-sm leading-6 text-[#d9d0bd] last:border-b-0">
                      {rule}
                    </li>
                  ))}
                </ul>
              </article>
            </section>

            <section className="grid grid-cols-1 lg:grid-cols-[0.85fr_1.15fr] gap-5">
              <article className="border border-line-border/45 bg-paper p-5 md:p-6">
                <div className="flex items-start justify-between gap-4 border-b border-line-border/35 pb-4">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.24em] text-signal-gold">Visual Identity</p>
                    <h2 className="mt-1 text-xl font-black tracking-[-0.04em] text-ink">Signal Palette</h2>
                  </div>
                  <Palette size={22} className="text-signal-gold" />
                </div>
                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  {visualSystem.map((item) => (
                    <div className="flex items-center gap-3 border border-line-border/35 bg-field-bg/55 p-3" key={item.label}>
                      <span className="h-10 w-10 border border-[#101b17]/10" style={{ background: item.swatch }} />
                      <div>
                        <strong className="block text-sm font-black text-ink">{item.label}</strong>
                        <small className="font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-muted-text">{item.value}</small>
                      </div>
                    </div>
                  ))}
                </div>
              </article>

              <article className="border border-line-border/45 bg-paper p-5 md:p-6">
                <div className="flex items-start justify-between gap-4 border-b border-line-border/35 pb-4">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.24em] text-signal-gold">Series Engine</p>
                    <h2 className="mt-1 text-xl font-black tracking-[-0.04em] text-ink">Repeatable Content Lanes</h2>
                  </div>
                  <Hash size={22} className="text-signal-gold" />
                </div>
                <div className="mt-5 flex flex-wrap gap-2">
                  {contentPillars.map((pillar) => (
                    <span className="border border-signal-gold/35 bg-signal-gold/10 px-3 py-2 text-xs font-black uppercase tracking-[0.14em] text-ink" key={pillar}>
                      {pillar}
                    </span>
                  ))}
                </div>
              </article>
            </section>

            <section className="border border-line-border/45 bg-paper p-5 md:p-6">
              <div className="flex flex-col gap-4 border-b border-line-border/35 pb-4 md:flex-row md:items-start md:justify-between">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.24em] text-signal-gold">Platform Kit</p>
                  <h2 className="mt-1 text-xl font-black tracking-[-0.04em] text-ink">{selectedFixture.teamA} vs {selectedFixture.teamB}</h2>
                </div>
                <Button variant="glass" icon={<Hash size={14} />} onClick={() => copy("Hashtags", hashtagsFor(selectedFixture).join(" "))} className="h-9 text-xs">
                  {copied === "Hashtags" ? "Copied" : "Copy hashtags"}
                </Button>
              </div>
              <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                {socialKit.map((item) => (
                  <article className="flex min-h-[420px] flex-col justify-between border border-line-border/40 bg-field-bg/60 p-4" key={item.platform}>
                    <div>
                      <div className="flex items-center gap-3 border-b border-line-border/25 pb-3">
                        <span className="text-signal-gold">{platformIconFor(item.platform)}</span>
                        <div>
                          <h3 className="text-sm font-black tracking-[-0.02em] text-ink">{item.platform}</h3>
                          <small className="mt-0.5 block text-[9px] font-black uppercase tracking-[0.18em] text-muted-text">{item.format} / {item.cadence}</small>
                        </div>
                      </div>
                      <div className="mt-4 space-y-3 text-sm leading-6 text-muted-text">
                        <p><b className="font-black text-ink">Hook:</b> {item.hook}</p>
                        <p><b className="font-black text-ink">Creative:</b> {item.creative}</p>
                        <p><b className="font-black text-ink">CTA:</b> {item.cta}</p>
                      </div>
                      <pre className="mt-4 max-h-40 overflow-y-auto border border-[#d0b36a]/20 bg-[#101b17] p-3 font-mono text-[11px] leading-5 text-[#f6efe0] whitespace-pre-wrap">
                        {item.caption}
                      </pre>
                    </div>
                    <Button variant="glass" icon={<Clipboard size={14} />} onClick={() => copy(item.platform, item.caption)} className="mt-4 h-9 w-full text-xs">
                      {copied === item.platform ? "Copied" : "Copy caption"}
                    </Button>
                  </article>
                ))}
              </div>
            </section>
          </section>
        )}

        {activeView === "content" && (
          <section className="flex flex-col gap-6">
            <section className="grid grid-cols-1 gap-5 xl:grid-cols-[1.1fr_0.9fr]">
              <article className="border border-[#d0b36a]/25 bg-[#101b17] p-6 md:p-8 text-[#f6efe0]">
                <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.28em] text-[#c9972d]">Publishing Desk</p>
                    <h2 className="mt-4 max-w-[760px] text-[clamp(2rem,4.8vw,4.8rem)] font-black leading-[0.92] tracking-[-0.055em]">
                      Package the signal. Hold the standard.
                    </h2>
                    <p className="mt-5 max-w-[660px] text-base leading-7 text-[#d9d0bd]">
                      Every output for {selectedFixture.teamA} vs {selectedFixture.teamB} should move from intelligence to channel-native copy without drifting into hype, guesswork, or gambling language.
                    </p>
                  </div>
                  <div className="grid min-w-[260px] gap-3 border border-[#f6efe0]/10 bg-[#f6efe0]/5 p-4">
                    <div className="flex items-center justify-between border-b border-[#f6efe0]/10 pb-3">
                      <span className="text-xs font-black uppercase tracking-[0.18em] text-[#c9972d]">Status</span>
                      <strong className="text-sm font-black">{selectedFixture.contentStatus}</strong>
                    </div>
                    <div className="flex items-center justify-between border-b border-[#f6efe0]/10 pb-3">
                      <span className="text-xs font-black uppercase tracking-[0.18em] text-[#c9972d]">Confidence</span>
                      <strong className="font-mono text-sm font-black">{prediction.confidence}/10</strong>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-black uppercase tracking-[0.18em] text-[#c9972d]">Priority</span>
                      <strong className="text-sm font-black">{interestLabelFor(selectedInterest)}</strong>
                    </div>
                  </div>
                </div>
                <div className="mt-8 grid gap-3 md:grid-cols-4">
                  <Button variant="primary" icon={<Sparkles size={15} />} onClick={generateWithAI} loading={loading.generateWithAI}>
                    Generate Pack
                  </Button>
                  <Button variant="outline" icon={<Radio size={15} />} onClick={sendTelegramPreview} loading={loading.sendTelegramPreview}>
                    Admin Preview
                  </Button>
                  <Button variant="outline" icon={<Send size={15} />} onClick={socialDryRun} loading={loading.socialDryRun}>
                    Buffer Dry Run
                  </Button>
                  <Button variant="outline" icon={<ShieldCheck size={15} />} onClick={() => updateFixture(selectedFixture.id, { contentStatus: "Approved" })}>
                    Approve
                  </Button>
                </div>
              </article>

              <article className="border border-line-border/45 bg-paper p-6 md:p-8">
                <p className="text-[10px] font-black uppercase tracking-[0.24em] text-signal-gold">Channel Readiness</p>
                <h2 className="mt-1 text-xl font-black tracking-[-0.04em] text-ink">Connected Social Stack</h2>
                <div className="mt-6 grid gap-3">
                  {[
                    ["Instagram", "Media required", "Connected via Buffer"],
                    ["X", "Text draft tested", "Buffer write works"],
                    ["TikTok", "Video required", "Connected via Buffer"],
                    ["YouTube", "Short + banner ready", "Connect in Buffer next"],
                  ].map(([channel, requirement, status]) => (
                    <div key={channel} className="grid grid-cols-[1fr_auto] gap-4 border-b border-line-border/35 pb-3 last:border-b-0">
                      <div>
                        <strong className="block text-sm font-black text-ink">{channel}</strong>
                        <span className="mt-1 block text-xs font-bold text-muted-text">{requirement}</span>
                      </div>
                      <span className="self-start border border-signal-gold/35 bg-signal-gold/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-ink">
                        {status}
                      </span>
                    </div>
                  ))}
                </div>
              </article>
            </section>

            <section className="grid grid-cols-1 gap-5 xl:grid-cols-[1fr_1fr]">
              <OutputPanel title="Telegram Brief" icon={<Radio size={18} />} text={content.telegram} onCopy={() => copy("Telegram", content.telegram)} copied={copied === "Telegram"} onPublish={sendTelegramPublic} disabled={loading.sendTelegramPublic} />
              <OutputPanel title="X Post" icon={<Megaphone size={18} />} text={content.xPost} onCopy={() => copy("X Post", content.xPost)} copied={copied === "X Post"} />
              <OutputPanel title="Shorts Script" icon={<Film size={18} />} text={content.shortsScript} onCopy={() => copy("Shorts", content.shortsScript)} copied={copied === "Shorts"} />
              <OutputPanel title="Market Context" icon={<BarChart3 size={18} />} text={content.bettingAngle} onCopy={() => copy("Market Context", content.bettingAngle)} copied={copied === "Market Context"} onPublish={sendTelegramBetting} disabled={loading.sendTelegramBetting} />
            </section>

            <section className="border border-line-border/45 bg-paper p-5 md:p-6">
              <div className="flex flex-col gap-4 border-b border-line-border/35 pb-4 md:flex-row md:items-start md:justify-between">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.24em] text-signal-gold">Platform Variants</p>
                  <h2 className="mt-1 text-xl font-black tracking-[-0.04em] text-ink">Channel-Native Captions</h2>
                </div>
                <Button variant="glass" icon={<Hash size={14} />} onClick={() => copy("Hashtags", hashtagsFor(selectedFixture).join(" "))} className="h-9 text-xs">
                  {copied === "Hashtags" ? "Copied" : "Copy hashtags"}
                </Button>
              </div>
              <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                {socialKit.map((item) => (
                  <article key={item.platform} className="flex min-h-[360px] flex-col justify-between border border-line-border/40 bg-field-bg/60 p-4">
                    <div>
                      <div className="flex items-center gap-3 border-b border-line-border/25 pb-3">
                        <span className="text-signal-gold">{platformIconFor(item.platform)}</span>
                        <div>
                          <h3 className="text-sm font-black tracking-[-0.02em] text-ink">{item.platform}</h3>
                          <small className="mt-0.5 block text-[9px] font-black uppercase tracking-[0.18em] text-muted-text">{item.format}</small>
                        </div>
                      </div>
                      <p className="mt-4 text-sm font-black leading-5 text-ink">{item.hook}</p>
                      <pre className="mt-4 max-h-44 overflow-y-auto border border-[#d0b36a]/20 bg-[#101b17] p-3 font-mono text-[11px] leading-5 text-[#f6efe0] whitespace-pre-wrap">
                        {item.caption}
                      </pre>
                    </div>
                    <Button variant="glass" icon={<Clipboard size={14} />} onClick={() => copy(item.platform, item.caption)} className="mt-4 h-9 w-full text-xs">
                      {copied === item.platform ? "Copied" : "Copy caption"}
                    </Button>
                  </article>
                ))}
              </div>
            </section>

            <OutputPanel title="Report Section" icon={<FileText size={18} />} text={content.reportSection} onCopy={() => copy("Report", content.reportSection)} copied={copied === "Report"} />
          </section>
        )}

        {activeView === "video" && (
          <section className="grid grid-cols-1 lg:grid-cols-[1.2fr_0.8fr] gap-6">
            <article className="bg-paper border border-line-border/50 rounded-none p-5  flex flex-col gap-4">
              <div className="flex justify-between items-center border-b border-line-border/30 pb-3">
                <div>
                  <p className="text-pitch-green text-[10px] font-extrabold uppercase tracking-wider mb-0.5">Clip Factory</p>
                  <h2 className="text-slate-900 dark:text-ink text-base md:text-lg font-black tracking-tight">{selectedFixture.teamA} vs {selectedFixture.teamB}</h2>
                </div>
                <Button variant="glass" icon={<Activity size={14} />} onClick={checkVideoEngine} loading={loading.checkVideoEngine} className="h-8 text-xs">
                  Engine
                </Button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto] gap-3 items-end border-b border-line-border/20 pb-4">
                <label className="flex flex-col gap-1.5 w-full">
                  <span className="text-muted-text text-[10px] font-extrabold uppercase tracking-wider">Source video path</span>
                  <input
                    value={clipSourcePath}
                    onChange={(event) => setClipSourcePath(event.target.value)}
                    placeholder="C:\\Videos\\match-footage.mp4"
                    className="w-full bg-field-bg/85 border border-line-border/60 hover:border-line-border rounded-none h-10 px-3.5 text-sm text-ink focus:border-pitch-green focus:outline-none focus:ring-2 focus:ring-pitch-green/20 transition-all duration-200 font-mono"
                  />
                </label>
                <Button variant="glass" icon={<Film size={15} />} onClick={() => probeVideoSource()} loading={loading.probeVideo} className="h-10 text-xs px-4">
                  Probe
                </Button>
                <Button variant="glass" icon={<Sparkles size={15} />} onClick={createSampleVideo} loading={loading.createSample} className="h-10 text-xs px-4">
                  Create Sample
                </Button>
              </div>

              {/* Local Video Preview Player */}
              {clipSourcePath.trim() && (
                <div className="flex flex-col gap-2.5 bg-paper-2/45 border border-line-border/30 rounded-none p-4 mt-1">
                  <span className="text-muted-text text-[10px] font-extrabold uppercase tracking-wider font-mono">Source Video Streaming Preview</span>
                  <video
                    ref={sourceVideoRef}
                    controls
                    src={`/api/video/stream?path=${encodeURIComponent(clipSourcePath)}`}
                    className="w-full max-h-[300px] bg-[#060913] rounded-none border border-line-border/40 object-contain"
                  />
                  <div className="flex gap-2">
                    <Button
                      variant="glass"
                      className="text-[11px] h-8 flex-1 uppercase tracking-wider font-extrabold"
                      onClick={() => {
                        if (sourceVideoRef.current && selectedClip) {
                          const currentVal = Math.round(sourceVideoRef.current.currentTime);
                          setClipPlans(prev => prev.map(c => c.id === selectedClip.id ? { ...c, startTime: currentVal } : c));
                          setApiMessage(`Set start time to ${currentVal}s`);
                        }
                      }}
                    >
                      Set Clip Start
                    </Button>
                    <Button
                      variant="glass"
                      className="text-[11px] h-8 flex-1 uppercase tracking-wider font-extrabold"
                      onClick={() => {
                        if (sourceVideoRef.current && selectedClip) {
                          const currentVal = Math.round(sourceVideoRef.current.currentTime);
                          setClipPlans(prev => prev.map(c => c.id === selectedClip.id ? { ...c, endTime: currentVal } : c));
                          setApiMessage(`Set end time to ${currentVal}s`);
                        }
                      }}
                    >
                      Set Clip End
                    </Button>
                  </div>
                </div>
              )}

              {/* Text Overlays and GPU Settings */}
              <div className="bg-paper-2/45 border border-line-border/35 rounded-none p-4 flex flex-col gap-3">
                <span className="text-muted-text text-[10px] font-extrabold uppercase tracking-wider block border-b border-line-border/20 pb-1.5 font-mono">
                  Advanced Overlays & Render Settings
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <label className="flex flex-col gap-1 w-full">
                    <span className="text-[10px] text-muted-text uppercase font-extrabold tracking-wider">Watermark text</span>
                    <input
                      value={watermarkText}
                      onChange={(e) => setWatermarkText(e.target.value)}
                      placeholder="THE MATCH SIGNAL"
                      className="bg-field border border-line-border/60 rounded-none h-9 px-2.5 text-xs text-ink focus:border-pitch-green focus:outline-none"
                    />
                  </label>
                  <label className="flex flex-col gap-1 w-full">
                    <span className="text-[10px] text-muted-text uppercase font-extrabold tracking-wider">Headline text</span>
                    <input
                      value={headlineText}
                      onChange={(e) => setHeadlineText(e.target.value)}
                      placeholder="Matchup banner"
                      className="bg-field border border-line-border/60 rounded-none h-9 px-2.5 text-xs text-ink focus:border-pitch-green focus:outline-none"
                    />
                  </label>
                  <label className="flex flex-col gap-1 w-full">
                    <span className="text-[10px] text-muted-text uppercase font-extrabold tracking-wider">Caption text</span>
                    <input
                      value={captionText}
                      onChange={(e) => setCaptionText(e.target.value)}
                      placeholder="Tactical hook description"
                      className="bg-field border border-line-border/60 rounded-none h-9 px-2.5 text-xs text-ink focus:border-pitch-green focus:outline-none"
                    />
                  </label>
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <input
                    type="checkbox"
                    id="gpu-accel"
                    checked={gpuAcceleration}
                    onChange={(e) => setGpuAcceleration(e.target.checked)}
                    className="h-4 w-4 rounded border-line-border/50 text-pitch-green focus:ring-pitch-green cursor-pointer"
                  />
                  <label htmlFor="gpu-accel" className="text-xs font-bold text-slate-700 dark:text-muted-text cursor-pointer select-none">
                    Use GPU Hardware Acceleration (NVENC / AMF)
                  </label>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <label className="flex flex-col gap-1.5 w-full">
                  <span className="text-muted-text text-[10px] font-extrabold uppercase tracking-wider">Render mode</span>
                  <select
                    value={renderMode}
                    onChange={(event) => setRenderMode(event.target.value as "rough" | "final")}
                    className="w-full bg-field-bg border border-line-border/60 rounded-none h-10 px-3.5 text-sm text-ink focus:border-pitch-green focus:outline-none focus:ring-2 focus:ring-pitch-green/20 transition-all duration-200"
                  >
                    <option value="final">Final vertical render</option>
                    <option value="rough">Rough fast cut</option>
                  </select>
                </label>
                <label className="flex flex-col gap-1.5 w-full">
                  <span className="text-muted-text text-[10px] font-extrabold uppercase tracking-wider">Crop mode</span>
                  <select
                    value={cropMode}
                    onChange={(event) => setCropMode(event.target.value as "fill" | "fit")}
                    className="w-full bg-field-bg border border-line-border/60 rounded-none h-10 px-3.5 text-sm text-ink focus:border-pitch-green focus:outline-none focus:ring-2 focus:ring-pitch-green/20 transition-all duration-200"
                  >
                    <option value="fill">Fill 9:16</option>
                    <option value="fit">Fit with padding</option>
                  </select>
                </label>
              </div>

              <div className="flex flex-col gap-3.5 mt-2">
                {clipPlans.map((clip) => (
                  <article
                    className={`bg-paper-2 border rounded-none p-4 flex flex-col gap-3 hover:border-line-border transition-all duration-300 cursor-pointer  ${
                      selectedClip?.id === clip.id ? "border-signal-gold shadow-[0_0_15px_rgba(251,191,36,0.08)] bg-signal-gold/5" : "border-line-border/30"
                    }`}
                    key={clip.id}
                    onClick={() => setSelectedClipId(clip.id)}
                  >
                    <div className="flex justify-between items-start w-full">
                      <div>
                        <p className="text-pitch-green text-[9px] font-extrabold uppercase tracking-wider mb-0.5">{clip.preset}</p>
                        <h3 className="text-slate-900 dark:text-ink text-sm font-bold tracking-tight">{clip.title}</h3>
                      </div>
                      <span className="bg-paper-2 border border-line-border/30 text-muted-text text-xs font-bold px-2 py-0.5 rounded-none font-mono">
                        {clip.duration}s
                      </span>
                    </div>
                    <p className="text-pitch-green font-bold text-xs">{clip.hook}</p>
                    <p className="text-xs text-slate-700 dark:text-muted-text leading-relaxed">{clip.treatment}</p>
                    <div className="flex justify-between items-center mt-1 pt-2 border-t border-line-border/20 text-[10px] text-muted-text font-semibold">
                      <span>{clip.startTime}s - {clip.endTime}s</span>
                      <span>{clip.platforms.join(" / ")}</span>
                    </div>
                    <Button
                      variant="glass"
                      icon={<Scissors size={14} />}
                      onClick={(event) => {
                        event.stopPropagation();
                        void renderClip(clip);
                      }}
                      loading={renderingClipId === clip.id}
                      className="mt-2 text-xs h-8"
                    >
                      {renderingClipId === clip.id ? "Rendering" : "Render"}
                    </Button>
                  </article>
                ))}
              </div>
            </article>

            <article className="bg-paper border border-line-border/50 rounded-none p-5  flex flex-col gap-4">
              <div className="flex justify-between items-center border-b border-line-border/30 pb-3">
                <div>
                  <p className="text-pitch-green text-[10px] font-extrabold uppercase tracking-wider mb-0.5">Rendered Clips</p>
                  <h2 className="text-slate-900 dark:text-ink text-base md:text-lg font-black tracking-tight">Output Queue</h2>
                </div>
                <div className="flex gap-2">
                  {selectedJobsToMerge.length >= 2 && (
                    <Button
                      variant="primary"
                      icon={<Layers size={14} />}
                      onClick={mergeClips}
                      loading={loading.mergeClips}
                      className="h-8 text-xs text-[#060913]"
                    >
                      Merge ({selectedJobsToMerge.length})
                    </Button>
                  )}
                  <Button variant="glass" icon={<Trash2 size={14} />} onClick={() => { setRenderJobs([]); setSelectedJobsToMerge([]); }} className="h-8 text-xs text-pressure-red hover:bg-pressure-red/5 hover:border-pressure-red/25">
                    Clear
                  </Button>
                </div>
              </div>
              {renderJobs.length ? (
                <div className="flex flex-col gap-4 mt-2">
                  {renderJobs.map((job) => (
                    <article className="bg-paper-2 border border-line-border/35 rounded-none p-4 grid grid-cols-[124px_1fr] gap-4  hover:border-line-border transition-colors duration-300 relative" key={job.id}>
                      <div className="absolute top-3 right-3 z-10">
                        <input
                          type="checkbox"
                          checked={selectedJobsToMerge.includes(job.publicUrl)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedJobsToMerge([...selectedJobsToMerge, job.publicUrl]);
                            } else {
                              setSelectedJobsToMerge(selectedJobsToMerge.filter((p) => p !== job.publicUrl));
                            }
                          }}
                          className="h-4.5 w-4.5 rounded border-line-border/60 text-pitch-green focus:ring-pitch-green cursor-pointer"
                        />
                      </div>
                      <video controls src={job.publicUrl} className="aspect-[9/16] bg-[#060913] border border-line-border/30 rounded-none w-full h-[220px] object-cover" />
                      <div className="flex flex-col justify-between py-1">
                        <div className="flex flex-col gap-1 pr-6">
                          <h3 className="text-slate-900 dark:text-ink text-xs font-bold tracking-tight leading-snug">{job.title}</h3>
                          <p className="text-[10px] text-muted-text font-bold uppercase tracking-wider mt-0.5">{job.mode} · {job.cropMode} · {Math.round(job.duration)}s</p>
                        </div>
                        <div className="flex flex-col gap-2 mt-2">
                          <a href={job.publicUrl} target="_blank" rel="noreferrer" className="text-pitch-green hover:underline text-xs font-semibold">Open clip</a>
                          <Button variant="glass" icon={<Clipboard size={12} />} onClick={() => copy("Render Command", job.command.join(" "))} className="h-7 text-[10px]">
                            Copy command
                          </Button>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-text leading-relaxed">
                  Rendered vertical clips will appear here. Add a source video path, choose a planned clip, and render the first cut.
                </p>
              )}
            </article>
          </section>
        )}

        {(activeView === "automation" || activeView === "review") && (
          <section className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            {activeView === "automation" && (
              <div className="bg-paper border border-line-border/50 rounded-none p-5  flex flex-col gap-4">
                <div className="flex justify-between items-center border-b border-line-border/30 pb-3">
                  <div>
                    <p className="text-pitch-green text-[10px] font-extrabold uppercase tracking-wider mb-0.5">Remotion Video Engine</p>
                    <h2 className="text-slate-900 dark:text-ink text-base md:text-lg font-black tracking-tight">Render JSON</h2>
                  </div>
                  <Button variant="glass" icon={<Clipboard size={14} />} onClick={() => copy("Video JSON", JSON.stringify(videoJson, null, 2))} className="h-8 text-xs">
                    {copied === "Video JSON" ? "Copied" : "Copy JSON"}
                  </Button>
                </div>
                <pre className="bg-[#090f1e]/90 border border-line-border/30 rounded-none p-4 text-xs font-mono text-ink overflow-auto max-h-[360px]">{JSON.stringify(videoJson, null, 2)}</pre>
              </div>
            )}

            {activeView === "review" && (
              <article className="border border-[#d0b36a]/25 bg-[#101b17] p-6 md:p-8 text-[#f6efe0] lg:col-span-2">
                <p className="text-[10px] font-black uppercase tracking-[0.28em] text-[#c9972d]">Operator Review</p>
                <div className="mt-5 grid gap-6 lg:grid-cols-[1fr_360px] lg:items-end">
                  <div>
                    <h2 className="text-[clamp(2rem,4.4vw,4.6rem)] font-black leading-[0.92] tracking-[-0.055em]">
                      Approve the signal before it leaves the room.
                    </h2>
                    <p className="mt-5 max-w-[720px] text-base leading-7 text-[#d9d0bd]">
                      Review safety notes, mark outcomes, and feed post-match lessons back into the intelligence loop.
                    </p>
                  </div>
                  <div className="grid gap-3 border border-[#f6efe0]/10 bg-[#f6efe0]/5 p-4">
                    <Button variant="primary" icon={<ShieldCheck size={14} />} onClick={() => updateFixture(selectedFixture.id, { contentStatus: "Approved" })}>
                      Approve match
                    </Button>
                    <Button variant="glass" icon={<RefreshCcw size={14} />} onClick={() => updateFixture(selectedFixture.id, { contentStatus: "Draft" })}>
                      Return to draft
                    </Button>
                    <Button variant="glass" icon={<Sparkles size={14} />} onClick={() => updateFixture(selectedFixture.id, { contentStatus: "Posted" })}>
                      Mark posted
                    </Button>
                  </div>
                </div>
              </article>
            )}

            {activeView === "review" && (
              <article className="border border-line-border/45 bg-paper p-5 md:p-6">
                <div className="border-b border-line-border/35 pb-4">
                  <p className="text-[10px] font-black uppercase tracking-[0.24em] text-signal-gold">Safety Checker</p>
                  <h2 className="mt-1 text-xl font-black tracking-[-0.04em] text-ink">{selectedFixture.teamA} vs {selectedFixture.teamB}</h2>
                </div>
                <div className="mt-5 grid gap-3">
                  {content.safetyNotes.map((note) => (
                    <div key={note} className="border-l border-signal-gold/45 bg-field-bg/55 p-3 pl-4 text-sm leading-6 text-muted-text">
                      {note}
                    </div>
                  ))}
                </div>
                <Button variant="danger" icon={<Trash2 size={14} />} onClick={() => setFixtures(fixtures.filter((fixture) => fixture.id !== selectedFixture.id))} className="mt-5 w-full text-xs">
                  Remove fixture
                </Button>
              </article>
            )}

            {activeView === "review" && (
              <article className="border border-line-border/45 bg-paper p-5 md:p-6">
                <div className="border-b border-line-border/35 pb-4">
                  <p className="text-[10px] font-black uppercase tracking-[0.24em] text-signal-gold">Analytics Agent</p>
                  <h2 className="mt-1 text-xl font-black tracking-[-0.04em] text-ink">Learning Loop</h2>
                </div>
                <div className="mt-5 grid grid-cols-2 gap-3">
                  <Metric label="Prediction coverage" value={`${fixtures.length}/${fixtures.length}`} />
                  <Metric label="Queued videos" value={String(fixtures.length)} />
                  <Metric label="Model read rate" value={accuracyRate} />
                  <Metric label="Reviewed matches" value={`${completedRecords}/${fixtures.length}`} />
                </div>
                <div className="mt-5 grid grid-cols-1 gap-4 border border-line-border/35 bg-field-bg/55 p-4 md:grid-cols-3">
                  <LabeledInput label="Final score" value={selectedAccuracy.finalScore} onChange={(finalScore) => updateAccuracy({ finalScore })} />
                  <LabeledInput label="Actual winner" value={selectedAccuracy.actualWinner} onChange={(actualWinner) => updateAccuracy({ actualWinner })} />
                  <label className="flex flex-col gap-1.5 w-full">
                    <span className="text-muted-text text-[10px] font-extrabold uppercase tracking-wider">Model read</span>
                    <select
                      value={selectedAccuracy.modelRead}
                      onChange={(event) => updateAccuracy({ modelRead: event.target.value as AccuracyRecord["modelRead"] })}
                      className="w-full bg-field-bg border border-line-border/60 rounded-none h-10 px-3.5 text-sm text-ink focus:border-pitch-green focus:outline-none focus:ring-2 focus:ring-pitch-green/20 transition-all duration-200"
                    >
                      <option>Pending</option>
                      <option>Right</option>
                      <option>Partial</option>
                      <option>Wrong</option>
                    </select>
                  </label>
                  <label className="flex flex-col gap-1.5 w-full md:col-span-3">
                    <span className="text-muted-text text-[10px] font-extrabold uppercase tracking-wider">Post-match lesson</span>
                    <textarea
                      value={selectedAccuracy.lesson}
                      onChange={(event) => updateAccuracy({ lesson: event.target.value })}
                      placeholder="What did the model learn from the match?"
                      className="w-full bg-field-bg/85 border border-line-border/60 hover:border-line-border rounded-none min-h-[96px] resize-y p-3 text-sm text-ink focus:border-pitch-green focus:outline-none focus:ring-2 focus:ring-pitch-green/20 transition-all duration-200 font-sans"
                    />
                  </label>
                </div>
                <p className="text-xs text-muted-text leading-relaxed mt-2">
                  This upgrade tracks football-intelligence outcomes and content priority. The next engineering move is wiring these records to Supabase or Google Sheets, then letting n8n trigger Telegram previews and Remotion renders.
                </p>
              </article>
            )}
          </section>
        )}
      </section>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<App />);


