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
  Mic,
  Palette,
  Radar,
  Radio,
  RefreshCcw,
  Search,
  Scissors,
  ShieldCheck,
  Sparkles,
  Trash2,
  Wand2,
  Youtube,
  Send,
  Loader2,
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
  AspectKey,
  Pick,
  VipPreviewResponse,
  VipPublishResponse,
  ClipSuggestion,
  ScanResult,
  TranscriptCue,
  VideoSourceCandidate,
  VideoSourceSearchResponse,
  YouTubeInfo,
  YouTubeDownloadResult,
  YouTubeStatus,
} from "./types";

// Import components
import { Metric } from "./components/Metric";
import { LabeledInput } from "./components/LabeledInput";
import { ClipTimeline, TimelineThumb, TimelineWaveform } from "./components/ClipTimeline";
import { ProgressBar } from "./components/ProgressBar";
import { ClipRenderProgress } from "./components/ClipRenderProgress";
import { useJobProgress } from "./hooks/useJobProgress";
import { OutputPanel } from "./components/OutputPanel";
import { TeamRatingEditor } from "./components/TeamRatingEditor";
import { MatchIntelPanel } from "./components/MatchIntelPanel";
import { WorldCupDataView } from "./components/WorldCupDataView";
import { Button } from "./components/ui/Button";

// Import api client
import { api, apiHeaders, withApiKey } from "./utils/api";

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
    title: "Two tiers, one discipline",
    detail: "Public surface is editorial only. The VIP channel carries value picks with EV, fractional Kelly stake, and a responsible-gambling footer — and never crosses back to public.",
  },
];

const voiceRules = [
  "Say what to watch, not what is guaranteed",
  "Use short sentences and concrete match language",
  "Avoid official World Cup affiliation claims",
  "Keep betting language out of public social copy — picks live only in the gated VIP channel",
  "Every VIP send carries the 18+/RG footer; the public surface never mentions odds, books, units, or EV",
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

const round3 = (n: number) => Math.round(n * 1000) / 1000;

const formatViews = (n: number) => {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
};

// yt-dlp upload_date is "YYYYMMDD" — render as YYYY-MM-DD.
const formatUploadDate = (d: string) => {
  if (!d || d.length !== 8) return d;
  return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
};

// Conservative check before we fire the auto-probe. Catches the formats
// yt-dlp accepts (watch?v=, youtu.be/, /shorts/, /live/, /embed/).
const looksLikeYouTubeUrl = (raw: string) => {
  const url = raw.trim();
  if (!url) return false;
  return /(?:youtube\.com\/(?:watch\?|shorts\/|live\/|embed\/)|youtu\.be\/)/i.test(url);
};

const useStoredState = <T,>(key: string, fallback: T) => {
  const [value, setValue] = useState<T>(() => {
    const stored = localStorage.getItem(key);
    return stored ? (JSON.parse(stored) as T) : fallback;
  });

  // Accept either a new value or a (prev -> next) updater, matching the
  // React.useState contract. Pulls current value out of the React state so
  // the stored value never lags behind the updater.
  const setStoredValue = (next: T | ((prev: T) => T)) => {
    setValue((current) => {
      const resolved = typeof next === "function" ? (next as (prev: T) => T)(current) : next;
      localStorage.setItem(key, JSON.stringify(resolved));
      return resolved;
    });
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
    marketContext: "Market context pending. Generate AI content to unlock editorial pressure, attention, and volatility notes.",
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
  const [sourceSearchQuery, setSourceSearchQuery] = useStoredState("match-signal-video-source-query", "");
  const [videoSources, setVideoSources] = useState<VideoSourceCandidate[]>([]);
  const [sourceProviderNote, setSourceProviderNote] = useState("");
  const [sourceCatalog, setSourceCatalog] = useState<VideoSourceSearchResponse["catalog"]>([]);
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
  const [accentText, setAccentText] = useState("");
  const [gpuAcceleration, setGpuAcceleration] = useState(false);
  const [selectedJobsToMerge, setSelectedJobsToMerge] = useState<string[]>([]);

  // Ship-to-channels state. We track per-job ship status so each queue card
  // can render a small "✓ admin / ✗ public" row right after shipping.
  type ShipDestination = "telegram-admin" | "telegram-public" | "telegram-vip";
  const ALL_SHIP_DESTINATIONS: ShipDestination[] = ["telegram-admin", "telegram-public", "telegram-vip"];
  const [shipDestinations, setShipDestinations] = useStoredState<ShipDestination[]>(
    "match-signal-ship-destinations",
    ["telegram-admin"],
  );
  // Map<job.id, { destination, ok, error?, messageId? }[]>
  const [shipResults, setShipResults] = useState<Record<string, Array<{ destination: string; ok: boolean; error?: string; messageId?: number | null }>>>({});
  const [shippingJobIds, setShippingJobIds] = useState<Record<string, boolean>>({});
  const toggleShipDestination = (key: ShipDestination) => {
    setShipDestinations((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );
  };
  const sourceVideoRef = React.useRef<HTMLVideoElement | null>(null);

  // Next-gen clip engine state
  const ALL_ASPECTS: AspectKey[] = ["9x16", "1x1", "16x9", "4x5"];
  const [aspectSelection, setAspectSelection] = useStoredState<AspectKey[]>(
    "match-signal-aspects",
    ALL_ASPECTS,
  );
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [transcriptCues, setTranscriptCues] = useState<TranscriptCue[]>([]);
  const [whisperConfigured, setWhisperConfigured] = useState<boolean | null>(null);
  // null = not yet checked; true/false after the engine probe runs.
  const [gpuAvailable, setGpuAvailable] = useState<boolean | null>(null);
  const [timelineThumbs, setTimelineThumbs] = useState<TimelineThumb[]>([]);
  const [timelineWave, setTimelineWave] = useState<TimelineWaveform | null>(null);
  const [timelineDuration, setTimelineDuration] = useState(0);
  const [timelineFps, setTimelineFps] = useState(30);

  // YouTube source ingestion via yt-dlp
  const [sourceMode, setSourceMode] = useStoredState<"local" | "youtube">("match-signal-source-mode", "local");
  const [youtubeUrl, setYoutubeUrl] = useStoredState("match-signal-youtube-url", "");
  const [youtubeInfo, setYoutubeInfo] = useState<YouTubeInfo | null>(null);
  const [youtubeStatus, setYoutubeStatus] = useState<YouTubeStatus | null>(null);
  // Optional segment trim "MM:SS-MM:SS" — only used for long videos so we
  // don't pull a full 90-min broadcast when we want one ten-minute window.
  const [youtubeSection, setYoutubeSection] = useStoredState("match-signal-youtube-section", "");
  // Async download job id — subscribed via useJobProgress for live progress.
  const [downloadJobId, setDownloadJobId] = useState<string | null>(null);
  const downloadProgress = useJobProgress(downloadJobId);

  // Per-clip render job ids. Each entry keys a ClipRenderProgress child that
  // owns its own SSE subscription (avoids hooks-in-loop in the parent).
  const [renderJobIds, setRenderJobIds] = useState<Record<string, string>>({});

  const toggleAspect = (key: AspectKey) => {
    setAspectSelection((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );
  };

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

  // Auto-recompute VIP picks when the selected fixture, its odds, or ratings change.
  // Picks are pure math server-side, so this is cheap and always reflects current state.
  useEffect(() => {
    if (!selectedFixture?.id) return;
    if (!selectedFixture.homeOdds || !selectedFixture.awayOdds) {
      setVipPicks([]);
      setVipMessage("");
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const result = await api<VipPreviewResponse>("/api/telegram/vip/preview", {
          method: "POST",
          body: JSON.stringify({ fixture: selectedFixture, teamRatings: ratings }),
        });
        if (cancelled) return;
        setVipPicks(result.picks ?? []);
        setVipMessage(result.message ?? "");
        setVipPublishEnabled(Boolean(result.vipPublishEnabled));
        setVipJurisdictions(result.jurisdictions ?? []);
      } catch {
        if (!cancelled) {
          setVipPicks([]);
          setVipMessage("");
        }
      }
    })();
    return () => { cancelled = true; };
  }, [selectedFixture.id, selectedFixture.homeOdds, selectedFixture.drawOdds, selectedFixture.awayOdds, ratings]);

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
    type EngineStatus = {
      ok: boolean;
      ffmpeg: {
        configured: boolean;
        version?: string;
        error?: string;
        gpuAvailable?: boolean;
        runtimeChecks?: Record<string, { present: boolean; runtime: boolean; error: string | null }>;
      };
      whisper?: { configured: boolean; modelPath: string };
      outputDir: string;
    };
    try {
      const result = await api<EngineStatus>("/api/video/status");
      setWhisperConfigured(result.whisper?.configured ?? false);
      // Record GPU availability so the checkbox can be honest about whether
      // hardware acceleration actually works on this machine.
      setGpuAvailable(result.ffmpeg?.gpuAvailable ?? false);
      const ffmpegLine = result.ffmpeg.configured
        ? `FFmpeg: ${result.ffmpeg.version}`
        : `FFmpeg unavailable: ${result.ffmpeg.error}`;
      const gpuLine = result.ffmpeg.configured
        ? result.ffmpeg.gpuAvailable ? "GPU: ready" : "GPU: none (using libx264)"
        : "";
      const whisperLine = result.whisper
        ? result.whisper.configured
          ? "Whisper: ready"
          : "Whisper: model missing"
        : "Whisper: unknown";
      setApiMessage([ffmpegLine, gpuLine, whisperLine].filter(Boolean).join(" · "));
    } catch (error) {
      setApiMessage(error instanceof Error ? error.message : "Video engine check failed");
    } finally {
      setLoading((prev) => ({ ...prev, checkVideoEngine: false }));
    }
  };

  // ----- YouTube ingestion via yt-dlp ---------------------------------------
  // Probe runs automatically on URL change (see the debounced effect below);
  // the only manual action the operator takes is the single "Get video"
  // button which downloads and hands off to the rest of the pipeline.

  const downloadYouTube = async () => {
    const url = youtubeUrl.trim();
    if (!url) {
      setApiMessage("Paste a YouTube URL first");
      return;
    }
    // Async path: server returns a jobId; SSE drives the progress bar.
    setDownloadJobId(null);
    try {
      const sectionRange = youtubeSection.trim() || null;
      const result = await api<{ ok: boolean; jobId: string }>(
        "/api/video/youtube/download/start",
        {
          method: "POST",
          body: JSON.stringify({ url, maxHeight: 1080, sectionRange }),
        },
      );
      setDownloadJobId(result.jobId);
      setApiMessage("Download started — watching progress…");
    } catch (error) {
      setApiMessage(error instanceof Error ? error.message : "YouTube download failed");
    }
  };

  // When the async download finishes, hand the new source path off to the
  // rest of the pipeline. Runs once per job-id completion.
  useEffect(() => {
    if (downloadProgress.status !== "done" || !downloadProgress.result) return;
    const payload = downloadProgress.result as YouTubeDownloadResult;
    setClipSourcePath(payload.sourceRelPath);
    setYoutubeInfo(payload.info);
    setApiMessage(
      payload.cached
        ? `Using cached ${payload.info.title}`
        : `Downloaded ${payload.info.title}`,
    );
    void probeVideoSource(payload.sourceRelPath);
    // We deliberately do not clear downloadJobId here so the green "Complete"
    // bar stays visible. It clears on the next download.
  }, [downloadProgress.status, downloadProgress.result?.id]);

  // Surface download errors in the toast.
  useEffect(() => {
    if (downloadProgress.status === "error" && downloadProgress.error) {
      setApiMessage(`Download failed: ${downloadProgress.error}`);
    }
  }, [downloadProgress.status, downloadProgress.error]);

  // Pull yt-dlp install state alongside the engine check.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const result = await api<{ ok: boolean; youtube: YouTubeStatus }>("/api/video/youtube/status");
        if (!cancelled) setYoutubeStatus(result.youtube);
      } catch {
        if (!cancelled) setYoutubeStatus({ configured: false, kind: "missing", version: null, suggestion: null });
      }
    })();
    // Also probe ffmpeg/whisper/gpu on mount so the GPU checkbox renders
    // honestly without the operator needing to click "Engine status".
    (async () => {
      try {
        const status = await api<{ ok: boolean; ffmpeg: { gpuAvailable?: boolean }; whisper?: { configured: boolean } }>(
          "/api/video/status",
        );
        if (cancelled) return;
        setGpuAvailable(status.ffmpeg?.gpuAvailable ?? false);
        setWhisperConfigured(status.whisper?.configured ?? false);
      } catch {
        if (!cancelled) setGpuAvailable(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Auto-probe on URL change. Debounce by 600ms so we don't hammer yt-dlp
  // while the user is mid-paste. Cancels in-flight when the URL changes.
  useEffect(() => {
    if (sourceMode !== "youtube") return;
    if (!youtubeStatus?.configured) return;
    if (!looksLikeYouTubeUrl(youtubeUrl)) {
      // Clear the card if the URL is no longer plausibly a YouTube URL.
      if (youtubeInfo && !youtubeUrl.trim()) setYoutubeInfo(null);
      return;
    }
    // Don't re-probe if the card already matches the current URL.
    if (youtubeInfo && youtubeUrl.includes(youtubeInfo.id)) return;

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setLoading((prev) => ({ ...prev, probeYouTube: true }));
      try {
        const result = await api<{ ok: boolean; info: YouTubeInfo }>("/api/video/youtube/probe", {
          method: "POST",
          body: JSON.stringify({ url: youtubeUrl.trim() }),
        });
        if (!cancelled) setYoutubeInfo(result.info);
      } catch {
        // Silent — the user will see the error on download attempt.
        if (!cancelled) setYoutubeInfo(null);
      } finally {
        if (!cancelled) setLoading((prev) => ({ ...prev, probeYouTube: false }));
      }
    }, 600);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [youtubeUrl, sourceMode, youtubeStatus?.configured]);

  const loadTimelineAssets = async (targetPath: string) => {
    setLoading((prev) => ({ ...prev, timelineAssets: true }));
    try {
      const [thumbsResult, waveResult] = await Promise.all([
        api<{ ok: boolean; thumbnails: { thumbs: TimelineThumb[]; duration: number } }>("/api/video/thumbnails", {
          method: "POST",
          body: JSON.stringify({ sourcePath: targetPath, count: 120 }),
        }).catch(() => null),
        api<{ ok: boolean; waveform: TimelineWaveform }>("/api/video/waveform", {
          method: "POST",
          body: JSON.stringify({ sourcePath: targetPath, width: 1600, height: 88 }),
        }).catch(() => null),
      ]);
      if (thumbsResult?.thumbnails) {
        setTimelineThumbs(thumbsResult.thumbnails.thumbs);
        if (thumbsResult.thumbnails.duration) setTimelineDuration(thumbsResult.thumbnails.duration);
      }
      if (waveResult?.waveform) setTimelineWave(waveResult.waveform);
    } finally {
      setLoading((prev) => ({ ...prev, timelineAssets: false }));
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
      const result = await api<{ ok: boolean; probe: { format?: { duration?: string }; streams?: Array<{ codec_type?: string; codec_name?: string; width?: number; height?: number; r_frame_rate?: string }> } }>("/api/video/probe", {
        method: "POST",
        body: JSON.stringify({ sourcePath: targetPath }),
      });
      const video = result.probe.streams?.find((stream) => stream.codec_type === "video");
      const duration = Number(result.probe.format?.duration ?? 0);
      if (duration) setTimelineDuration(duration);
      // r_frame_rate is "30000/1001" or "30/1" — parse to a float.
      const rateRaw = video?.r_frame_rate ?? "30/1";
      const [num, den] = rateRaw.split("/").map(Number);
      const parsedFps = num && den ? num / den : 30;
      setTimelineFps(Number.isFinite(parsedFps) && parsedFps > 0 ? parsedFps : 30);
      setApiMessage(`Source ready: ${video?.width ?? "?"}x${video?.height ?? "?"}, ${duration ? `${Math.round(duration)}s` : "duration unknown"}`);
      // Fire-and-forget timeline asset generation so the scrubber lights up.
      void loadTimelineAssets(targetPath);
    } catch (error) {
      setApiMessage(error instanceof Error ? error.message : "Video probe failed");
    } finally {
      setLoading((prev) => ({ ...prev, probeVideo: false }));
    }
  };

  const searchFootageSources = async () => {
    const query = sourceSearchQuery.trim() || `${selectedFixture.teamA} ${selectedFixture.teamB}`;
    setLoading((prev) => ({ ...prev, sourceSearch: true }));
    try {
      const params = new URLSearchParams({
        query,
        limit: "18",
      });
      const result = await api<VideoSourceSearchResponse>(`/api/video/sources/search?${params.toString()}`);
      setVideoSources(result.sources);
      setSourceCatalog(result.catalog ?? []);
      const providerText = result.providers
        .map((provider) => `${provider.label}: ${provider.mode.replace("_", " ")}, ${provider.rightsMode.replace("_", " ")}`)
        .join(" · ");
      setSourceProviderNote(providerText);
      const errorText = result.errors.length ? ` (${result.errors.map((error) => `${error.provider}: ${error.message}`).join("; ")})` : "";
      setApiMessage(`Found ${result.sources.length} video source candidate(s)${errorText}`);
    } catch (error) {
      setApiMessage(error instanceof Error ? error.message : "Video source search failed");
    } finally {
      setLoading((prev) => ({ ...prev, sourceSearch: false }));
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
    if (aspectSelection.length === 0) {
      setApiMessage("Pick at least one aspect ratio before rendering");
      return;
    }
    // Already rendering? Bail out — the user is just impatient.
    if (renderJobIds[clip.id]) {
      setApiMessage("This clip is already rendering — watch the progress bar.");
      return;
    }
    setRenderingClipId(clip.id);
    try {
      const result = await api<{ ok: boolean; jobId: string }>("/api/clips/render/start", {
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
          aspects: aspectSelection,
          watermarkText,
          headlineText,
          captionText,
          accentText,
          transcriptCues,
          gpuAcceleration,
        }),
      });
      setRenderJobIds((prev) => ({ ...prev, [clip.id]: result.jobId }));
      setApiMessage(`Rendering ${clip.preset} — watching ffmpeg progress…`);
    } catch (error) {
      setApiMessage(error instanceof Error ? error.message : "Clip render failed");
    } finally {
      setRenderingClipId("");
    }
  };

  // Batch: fire renderClip for every clip plan that isn't already rendering.
  // The async endpoint returns a jobId immediately, so this is a fast loop —
  // the actual ffmpeg work happens in parallel in the background and each
  // card animates its own progress bar.
  const renderAllClips = async () => {
    if (!clipSourcePath.trim()) {
      setApiMessage("Add a source video path before rendering");
      return;
    }
    if (aspectSelection.length === 0) {
      setApiMessage("Pick at least one aspect ratio before rendering");
      return;
    }
    const pending = clipPlans.filter(
      (c) => !renderJobIds[c.id] && Math.max(0, c.endTime - c.startTime) > 0.4,
    );
    if (pending.length === 0) {
      setApiMessage("Nothing to render — every clip is already in flight or has zero duration.");
      return;
    }
    setApiMessage(`Queueing ${pending.length} render${pending.length === 1 ? "" : "s"}…`);
    // Sequential POST so the jobs land in order, but ffmpeg work runs in
    // parallel because each /start returns instantly.
    for (const clip of pending) {
      // eslint-disable-next-line no-await-in-loop
      await renderClip(clip);
    }
  };

  // Called by ClipRenderProgress when an SSE job finishes. Merges the
  // resulting per-aspect RenderJobs into the queue and clears the in-flight
  // jobId so the user can re-render the same clip plan again.
  const handleRenderDone = (clipId: string, payload: { jobs?: RenderJob[] } | null) => {
    if (payload?.jobs?.length) {
      setRenderJobs((prev) => [...payload.jobs!, ...prev].slice(0, 24));
      setApiMessage(
        `Rendered ${payload.jobs.length} aspect${payload.jobs.length === 1 ? "" : "s"}`,
      );
    }
    // Keep the "Complete" bar visible for ~6s, then clear so the card
    // becomes re-renderable.
    window.setTimeout(() => {
      setRenderJobIds((prev) => {
        const next = { ...prev };
        delete next[clipId];
        return next;
      });
    }, 6_000);
  };

  const handleRenderError = (clipId: string, message: string) => {
    setApiMessage(`Render failed: ${message}`);
    setRenderJobIds((prev) => {
      const next = { ...prev };
      delete next[clipId];
      return next;
    });
  };

  const scanForMoments = async () => {
    if (!clipSourcePath.trim()) {
      setApiMessage("Add a source video path before scanning");
      return;
    }
    setLoading((prev) => ({ ...prev, scan: true }));
    try {
      const result = await api<{ ok: boolean; scan: ScanResult }>("/api/video/scan", {
        method: "POST",
        body: JSON.stringify({ sourcePath: clipSourcePath }),
      });
      setScanResult(result.scan);
      setApiMessage(
        `Scan: ${result.scan.scenes.length} cuts · ${result.scan.peaks.length} loud windows · ${result.scan.suggestions.length} suggestions`,
      );
    } catch (error) {
      setApiMessage(error instanceof Error ? error.message : "Scan failed");
    } finally {
      setLoading((prev) => ({ ...prev, scan: false }));
    }
  };

  // Smart scan via Gemini 2.5: sends the YouTube URL directly to Gemini and
  // gets back football-semantic clip suggestions + a match summary. No
  // download required — Gemini ingests YouTube natively. Falls back into
  // the same ScanResult shape so the suggestions strip renders identically.
  const geminiScan = async () => {
    const url = youtubeUrl.trim();
    if (!url) {
      setApiMessage("Paste a YouTube URL first for smart scan");
      return;
    }
    setLoading((prev) => ({ ...prev, geminiScan: true }));
    try {
      const fixtureContext = `${selectedFixture.teamA} vs ${selectedFixture.teamB} · ${selectedFixture.stage}${selectedFixture.venue ? ` · ${selectedFixture.venue}` : ""}`;
      const result = await api<{ ok: boolean; scan: ScanResult & { summary?: string; model?: string } }>(
        "/api/video/gemini-scan",
        {
          method: "POST",
          body: JSON.stringify({
            youtubeUrl: url,
            fixtureContext,
            maxClips: 8,
            model: "gemini-2.5-flash",
          }),
        },
      );
      setScanResult(result.scan);
      const count = result.scan.suggestions?.length ?? 0;
      const modelLabel = result.scan.model ?? "gemini-2.5-flash";
      setApiMessage(`Smart scan (${modelLabel}): ${count} clip${count === 1 ? "" : "s"} identified`);
    } catch (error) {
      setApiMessage(error instanceof Error ? error.message : "Gemini scan failed");
    } finally {
      setLoading((prev) => ({ ...prev, geminiScan: false }));
    }
  };

  const transcribeClip = async (clip: ClipPlan) => {
    if (!clipSourcePath.trim()) {
      setApiMessage("Add a source video path before transcribing");
      return;
    }
    setLoading((prev) => ({ ...prev, transcribe: true }));
    try {
      const result = await api<{
        ok: boolean;
        transcript: { cues: TranscriptCue[]; modelPath: string };
      }>("/api/video/transcribe", {
        method: "POST",
        body: JSON.stringify({
          sourcePath: clipSourcePath,
          startTime: clip.startTime,
          endTime: clip.endTime,
          title: clip.title,
        }),
      });
      setTranscriptCues(result.transcript.cues);
      setApiMessage(`Whisper produced ${result.transcript.cues.length} cue${result.transcript.cues.length === 1 ? "" : "s"}`);
    } catch (error) {
      setApiMessage(error instanceof Error ? error.message : "Transcription failed");
    } finally {
      setLoading((prev) => ({ ...prev, transcribe: false }));
    }
  };

  const applySuggestion = (suggestion: ClipSuggestion) => {
    if (!selectedClip) return;
    setClipPlans((prev) =>
      prev.map((c) =>
        c.id === selectedClip.id
          ? {
              ...c,
              startTime: suggestion.start,
              endTime: suggestion.end,
              duration: suggestion.duration,
            }
          : c,
      ),
    );
    setApiMessage(`Applied auto-suggestion (${suggestion.type}, score ${suggestion.score.toFixed(2)})`);
  };

  // Ship a single rendered RenderJob to every destination currently selected.
  // Captions default to "<teamA> vs <teamB> — <title>"; the caller can override.
  const shipClip = async (job: RenderJob, captionOverride?: string) => {
    if (!shipDestinations.length) {
      setApiMessage("Pick at least one destination first.");
      return;
    }
    setShippingJobIds((prev) => ({ ...prev, [job.id]: true }));
    try {
      const caption = captionOverride ?? `${selectedFixture.teamA} vs ${selectedFixture.teamB} — ${job.title}`;
      const payload = {
        items: [{
          publicUrl: job.publicUrl,
          caption,
          duration: job.duration,
          width: job.width ?? null,
          height: job.height ?? null,
        }],
        destinations: shipDestinations,
      };
      const result = await api<{
        ok: boolean;
        summary: { total: number; ok: number; failed: number };
        results: Array<{ destination: string; ok: boolean; error?: string; messageId?: number | null }>;
      }>("/api/clips/ship", { method: "POST", body: JSON.stringify(payload) });
      setShipResults((prev) => ({ ...prev, [job.id]: result.results }));
      setApiMessage(
        `Shipped ${job.aspect ?? "clip"}: ${result.summary.ok} ok · ${result.summary.failed} failed`,
      );
    } catch (error) {
      setApiMessage(error instanceof Error ? error.message : "Ship failed");
    } finally {
      setShippingJobIds((prev) => {
        const next = { ...prev };
        delete next[job.id];
        return next;
      });
    }
  };

  // Ship every rendered clip in the queue to all selected destinations.
  // One round-trip per clip so each card lights up its own status row as
  // the responses arrive.
  const shipAllClips = async () => {
    if (!renderJobs.length) {
      setApiMessage("Nothing to ship — render some clips first.");
      return;
    }
    if (!shipDestinations.length) {
      setApiMessage("Pick at least one destination first.");
      return;
    }
    setApiMessage(`Shipping ${renderJobs.length} clip${renderJobs.length === 1 ? "" : "s"} to ${shipDestinations.length} destination${shipDestinations.length === 1 ? "" : "s"}…`);
    for (const job of renderJobs) {
      // eslint-disable-next-line no-await-in-loop
      await shipClip(job);
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
      const marketCtx = content.marketContext || content.bettingAngle;
      const fullText = marketCtx && !marketCtx.startsWith("Market context pending")
        ? `${content.telegram}\n\n---\nMarket Context\n${marketCtx}`
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

  const sendTelegramMarketContext = async () => {
    setLoading((prev) => ({ ...prev, sendTelegramMarketContext: true }));
    try {
      const marketCtx = content.marketContext || content.bettingAngle;
      if (!marketCtx || marketCtx.startsWith("Market context pending")) {
        setApiMessage("No valid market context available to send");
        return;
      }
      const fullText = `${selectedFixture.teamA} vs ${selectedFixture.teamB}\nMarket Context:\n\n${marketCtx}`;
      await api("/api/telegram/market-context", {
        method: "POST",
        body: JSON.stringify({ text: fullText, target: "admin" }),
      });
      setApiMessage("Sent Telegram market context to admin inbox");
    } catch (error) {
      setApiMessage(error instanceof Error ? error.message : "Telegram market context post failed");
    } finally {
      setLoading((prev) => ({ ...prev, sendTelegramMarketContext: false }));
    }
  };

  // VIP picks lifecycle. Preview computes EV/Kelly server-side; publish gates on
  // VIP_JURISDICTIONS + TELEGRAM_BETTING_CHANNEL_ID + VIP_PUBLISH_ENABLED.
  const [vipPicks, setVipPicks] = useState<Pick[]>([]);
  const [vipMessage, setVipMessage] = useState<string>("");
  const [vipPublishEnabled, setVipPublishEnabled] = useState<boolean>(false);
  const [vipJurisdictions, setVipJurisdictions] = useState<string[]>([]);

  const previewVipPicks = async (fixtureForPreview = selectedFixture) => {
    setLoading((prev) => ({ ...prev, previewVipPicks: true }));
    try {
      const result = await api<VipPreviewResponse>("/api/telegram/vip/preview", {
        method: "POST",
        body: JSON.stringify({ fixture: fixtureForPreview, teamRatings: ratings }),
      });
      setVipPicks(result.picks ?? []);
      setVipMessage(result.message ?? "");
      setVipPublishEnabled(Boolean(result.vipPublishEnabled));
      setVipJurisdictions(result.jurisdictions ?? []);
      setApiMessage(result.picks?.length ? `${result.picks.length} value pick(s) found` : "No value picks at current prices");
    } catch (error) {
      setApiMessage(error instanceof Error ? error.message : "VIP preview failed");
    } finally {
      setLoading((prev) => ({ ...prev, previewVipPicks: false }));
    }
  };

  const sendTelegramVip = async () => {
    setLoading((prev) => ({ ...prev, sendTelegramVip: true }));
    try {
      const result = await api<VipPublishResponse>("/api/telegram/vip", {
        method: "POST",
        body: JSON.stringify({ fixture: selectedFixture, teamRatings: ratings }),
      });
      if (result.published) {
        setApiMessage(`Published ${result.pickCount ?? 0} VIP pick(s)${result.audit?.logged ? " · audit logged" : ""}`);
      } else {
        setApiMessage(result.reason || "Nothing was published");
      }
    } catch (error) {
      setApiMessage(error instanceof Error ? error.message : "VIP publish failed");
    } finally {
      setLoading((prev) => ({ ...prev, sendTelegramVip: false }));
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
        headers: { "Content-Type": "application/json", ...apiHeaders() },
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
    { view: "vip" as View, title: "VIP desk", icon: <Hash size={20} /> },
  ];

  return (
    <main className="app-shell font-sans selection:bg-[var(--gold-soft)] selection:text-ink relative" style={{ color: "var(--ink)" }}>
      {/* ===== Editorial rail ===== */}
      <aside className="rail hidden md:flex" aria-label="Match Signal navigation">
        <div className="mark" aria-label="The Match Signal OS">MS</div>
        {navigationTabs.map((tab) => (
          <button
            key={tab.view}
            title={tab.title}
            aria-current={activeView === tab.view ? "page" : undefined}
            onClick={() => setActiveView(tab.view)}
            className={`rail-button ${activeView === tab.view ? "active" : ""}`}
          >
            {React.cloneElement(tab.icon as React.ReactElement<any>, { size: 18 })}
          </button>
        ))}
      </aside>

      {/* ===== Mobile rail (top, ruled) ===== */}
      <nav
        className="md:hidden fixed top-0 left-0 right-0 h-14 bg-[var(--paper)] border-b border-[var(--rule)] z-[120] flex justify-around items-center px-2"
        aria-label="Mobile navigation"
      >
        {navigationTabs.map((tab) => {
          const isActive = activeView === tab.view;
          return (
            <button
              key={tab.view}
              onClick={() => setActiveView(tab.view)}
              className="flex flex-col items-center justify-center gap-0.5 px-2 py-1 transition-colors relative cursor-pointer"
              style={{
                color: isActive ? "var(--ink)" : "var(--ink-quiet)",
                borderBottom: isActive ? "2px solid var(--ink)" : "2px solid transparent",
                fontWeight: isActive ? 600 : 500,
              }}
            >
              {React.cloneElement(tab.icon as React.ReactElement<any>, { size: 16 })}
              <span className="text-[9px] uppercase tracking-[0.08em] truncate max-w-[55px]">
                {tab.title.split(" ")[0]}
              </span>
            </button>
          );
        })}
      </nav>

      <section className="workspace pt-16 md:pt-0 pb-24 md:pb-10 overflow-x-hidden flex flex-col gap-7">
        {/* ===== Editorial masthead ===== */}
        <header className="topbar">
          <div className="flex flex-col gap-2">
            <p className="eyebrow gold">Anonymous football intelligence · World Cup 2026</p>
            <h1>The Match Signal OS</h1>
          </div>
          <div className="operator-strip">
            <span>
              <Activity size={12} style={{ color: "var(--pitch)" }} />
              <b>{todayCount}</b> active
            </span>
            <span>
              <CheckCircle2 size={12} style={{ color: "var(--pitch)" }} />
              <b>{approvedCount}</b> approved
            </span>
            <span>
              <BarChart3 size={12} style={{ color: "var(--pitch)" }} />
              <b>{providerCount}/{providerTotal}</b> APIs
            </span>
            <span>
              <ShieldCheck size={12} style={{ color: "var(--pitch)" }} />
              <b>{stateSource}</b>
            </span>
            <Button variant="primary" icon={<Download size={13} />} onClick={downloadReport}>
              Export report
            </Button>
          </div>
        </header>

        {/* ===== Command-center byline (only on command view) ===== */}
        {activeView === "command" && (
          <section className="grid grid-cols-2 md:grid-cols-4 border-y border-[var(--rule)]">
            {[
              ["Desk", `${fixtures.length} fixtures`],
              ["Signal", `${selectedFixture.teamA} vs ${selectedFixture.teamB}`],
              ["Publishing", `${approvedCount} approved`],
              ["Connectors", `${providerCount}/${providerTotal} ready`],
            ].map(([label, value]) => (
              <div
                key={label}
                className="flex flex-col gap-1.5 py-5 pr-6 border-r last:border-r-0 border-[var(--rule)]"
              >
                <span className="caption">{label}</span>
                <strong className="figure text-[clamp(1.2rem,1.8vw,1.6rem)] text-ink leading-tight truncate">
                  {value}
                </strong>
              </div>
            ))}
          </section>
        )}

        {/* ===== View tabs (ruled segmented) ===== */}
        <nav className="view-tabs" aria-label="Workspace views">
          {navigationTabs.map((tab) => (
            <button
              key={tab.view}
              className={activeView === tab.view ? "active" : ""}
              onClick={() => setActiveView(tab.view)}
            >
              <span className="inline-flex items-center gap-2">
                {React.cloneElement(tab.icon as React.ReactElement<any>, { size: 14 })}
                {tab.title}
              </span>
            </button>
          ))}
        </nav>

        {activeView === "automation" && (
          <section className="flex flex-col gap-12">
            {/* Masthead */}
            <header className="border-t-2 border-ink pt-7 grid grid-cols-1 lg:grid-cols-[minmax(0,1.5fr)_minmax(280px,1fr)] gap-x-12 gap-y-6">
              <div>
                <p className="eyebrow gold">Social Ops Control</p>
                <h1 className="mt-3 text-ink">Connect, draft, approve, publish.</h1>
                <p className="mt-5 max-w-[58ch] text-[1rem] leading-[1.55] text-[var(--ink-muted)]">{apiMessage}</p>
                <div className="hr-gold mt-4" />
              </div>
              <div className="self-end grid grid-cols-2 border-t border-[var(--rule)]">
                {[
                  ["Providers", `${providerCount}/${providerTotal}`],
                  ["Approved", String(approvedCount)],
                  ["Source", stateSource],
                  ["Drafts", String(queueBreakdown.draft)],
                ].map(([label, value]) => (
                  <div key={label} className="flex flex-col gap-1.5 py-4 pr-5 border-r last:border-r-0 odd:border-r border-[var(--rule)] border-b odd:[&:nth-last-child(-n+2)]:border-b-0 even:[&:nth-last-child(-n+2)]:border-b-0">
                    <span className="caption">{label}</span>
                    <strong className="figure text-[clamp(1.2rem,1.8vw,1.6rem)] text-ink leading-none truncate">{value}</strong>
                  </div>
                ))}
              </div>
            </header>

            {/* Provider matrix */}
            <section>
              <div className="flex flex-wrap items-baseline justify-between gap-3 pb-3 border-b border-[var(--rule-strong)]">
                <div>
                  <p className="eyebrow pitch">Provider Matrix</p>
                  <h2 className="mt-1 text-ink">Connections</h2>
                </div>
                <Button variant="primary" icon={<Activity size={14} />} onClick={checkHealth} loading={loading.checkHealth}>
                  Check APIs
                </Button>
              </div>
              <div className="mt-5 grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-x-6 gap-y-3">
                {providerBadges.map((badge) => {
                  const ready = providerReady(health, badge);
                  return (
                    <div
                      key={badge.key}
                      className="flex items-baseline justify-between gap-3 py-3 border-b border-[var(--rule)]"
                    >
                      <span className="text-[0.9rem] text-ink font-medium">{badge.label}</span>
                      <span
                        className="caption"
                        style={{ color: ready ? "var(--pitch)" : "var(--ink-quiet)" }}
                      >
                        {ready ? "ready" : "missing"}
                      </span>
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="grid grid-cols-1 lg:grid-cols-2 gap-x-12 gap-y-10">
              <article>
                <div className="pb-3 border-b border-[var(--rule-strong)]">
                  <p className="eyebrow pitch">Publish stack</p>
                  <h2 className="mt-1 text-ink">Channels &amp; previews</h2>
                </div>
                <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Button variant="primary" icon={<Send size={14} />} onClick={socialDryRun} loading={loading.socialDryRun}>Buffer draft</Button>
                  <Button variant="secondary" icon={<Radio size={14} />} onClick={sendTelegramPreview} loading={loading.sendTelegramPreview}>Telegram preview</Button>
                  <Button variant="secondary" icon={<Send size={14} />} onClick={sendTelegramPublic} loading={loading.sendTelegramPublic}>Telegram public</Button>
                  <Button variant="secondary" icon={<BarChart3 size={14} />} onClick={sendTelegramMarketContext} loading={loading.sendTelegramMarketContext}>Market context</Button>
                  <Button variant="secondary" icon={<Sparkles size={14} />} onClick={triggerN8n} loading={loading.triggerN8n}>Trigger n8n</Button>
                </div>
              </article>

              <article>
                <div className="flex items-baseline justify-between pb-3 border-b border-[var(--rule-strong)]">
                  <div>
                    <p className="eyebrow pitch">Data feeds</p>
                    <h2 className="mt-1 text-ink">Source sync</h2>
                  </div>
                </div>
                <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
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
            </section>

            <section>
              <div className="pb-3 border-b border-[var(--rule-strong)]">
                <p className="eyebrow pitch">Storage &amp; export</p>
                <h2 className="mt-1 text-ink">State control</h2>
              </div>
              <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
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
            </section>

            <section>
              <div className="flex items-baseline justify-between pb-3 border-b border-[var(--rule-strong)]">
                <div>
                  <p className="eyebrow pitch">Remotion video engine</p>
                  <h2 className="mt-1 text-ink">Render JSON</h2>
                </div>
                <Button variant="ghost" icon={<Clipboard size={13} />} onClick={() => copy("Video JSON", JSON.stringify(videoJson, null, 2))}>
                  {copied === "Video JSON" ? "Copied" : "Copy JSON"}
                </Button>
              </div>
              <pre className="mt-4 max-h-[360px]">{JSON.stringify(videoJson, null, 2)}</pre>
            </section>
          </section>
        )}

        {activeView === "command" && (
          <section className="grid grid-cols-1 gap-12 xl:grid-cols-[320px_minmax(0,1fr)] xl:items-start">
            {/* Fixture queue */}
            <aside className="xl:sticky xl:top-6 xl:max-h-[calc(100dvh-48px)] xl:overflow-y-auto xl:pr-5 xl:border-r xl:border-[var(--rule)]">
              <div className="flex items-start justify-between gap-3 pb-4 border-b border-[var(--rule-strong)]">
                <div>
                  <p className="eyebrow gold">Match Queue</p>
                  <h2 className="mt-2 text-ink">Fixture Desk</h2>
                  <p className="mt-2 text-sm text-[var(--ink-muted)] max-w-[36ch]">
                    Ranked by match interest, content status, and operator readiness.
                  </p>
                </div>
                <Button variant="icon" onClick={addFixture} title="Add fixture" aria-label="Add fixture">
                  <CalendarPlus size={16} />
                </Button>
              </div>

              <div className="mt-5 grid grid-cols-4 border-b border-[var(--rule)]">
                {[
                  ["Draft", queueBreakdown.draft],
                  ["Approved", queueBreakdown.approved],
                  ["Posted", queueBreakdown.posted],
                  ["Live", queueBreakdown.live],
                ].map(([label, value]) => (
                  <button
                    key={label as string}
                    type="button"
                    onClick={() => setQueueFilter(label as ContentStatus | FixtureStatus)}
                    className="min-h-0 flex flex-col gap-1 py-3 px-1 border-0 border-r border-[var(--rule)] last:border-r-0 bg-transparent text-left items-start"
                    style={{
                      color: queueFilter === label ? "var(--ink)" : "var(--ink-quiet)",
                    }}
                  >
                    <strong className="figure text-[1.4rem] leading-none text-ink">{value}</strong>
                    <span className="caption">{label as string}</span>
                  </button>
                ))}
              </div>

              <div className="mt-5 flex items-center gap-2 border-b border-[var(--rule-strong)] py-1.5">
                <Search size={14} className="shrink-0 text-[var(--ink-quiet)]" />
                <input
                  value={queueSearch}
                  onChange={(event) => setQueueSearch(event.target.value)}
                  placeholder="Search team, venue, stage"
                  className="min-h-0 w-full border-0 bg-transparent p-0 text-sm text-ink outline-none placeholder:text-[var(--ink-quiet)]"
                  style={{ borderBottom: "none" }}
                />
              </div>

              <div className="mt-4 flex flex-wrap gap-1.5">
                {(["All", "Draft", "Approved", "Posted", "Scheduled", "Live"] as Array<"All" | ContentStatus | FixtureStatus>).map((filter) => {
                  const isOn = queueFilter === filter;
                  return (
                    <button
                      key={filter}
                      type="button"
                      onClick={() => setQueueFilter(filter)}
                      className="min-h-0 px-2 py-1 text-[0.7rem] uppercase tracking-[0.08em] font-semibold border bg-transparent"
                      style={{
                        color: isOn ? "var(--paper)" : "var(--ink-muted)",
                        background: isOn ? "var(--ink)" : "transparent",
                        borderColor: isOn ? "var(--ink)" : "var(--rule-strong)",
                      }}
                    >
                      {filter}
                    </button>
                  );
                })}
              </div>

              <div className="mt-5 flex items-baseline justify-between border-b border-[var(--rule)] pb-2">
                <span className="caption">
                  Showing {filteredQueue.length}/{fixtures.length}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setQueueFilter("All");
                    setQueueSearch("");
                  }}
                  className="min-h-0 bg-transparent px-0 py-0 text-[0.72rem] font-semibold tracking-[0.04em] text-pitch hover:underline"
                >
                  Reset
                </button>
              </div>

              <div className="mt-2 grid gap-0">
                {filteredQueue.length ? filteredQueue.map(({ fixture, prediction: fixturePrediction, score, label }, index) => {
                  const isSelected = fixture.id === selectedFixture.id;
                  return (
                    <button
                      key={fixture.id}
                      className="group w-full text-left transition-colors min-h-0 p-0 border-0"
                      onClick={() => setSelectedId(fixture.id)}
                      style={{
                        borderBottom: "1px solid var(--rule)",
                        borderLeft: isSelected ? "2px solid var(--gold)" : "2px solid transparent",
                        background: isSelected ? "var(--paper-raised)" : "transparent",
                        paddingLeft: 12,
                      }}
                    >
                      <div className="grid grid-cols-[28px_minmax(0,1fr)_44px] items-start py-3">
                        <span className="caption tabular pt-0.5">{String(index + 1).padStart(2, "0")}</span>
                        <div className="min-w-0">
                          <span className="block text-[0.95rem] font-medium leading-tight text-ink truncate">
                            {fixture.teamA}
                            <span className="text-[var(--ink-quiet)] mx-1.5 italic font-display [font-variation-settings:'opsz'_60]">vs</span>
                            {fixture.teamB}
                          </span>
                          <span className="block tabular text-[0.72rem] text-[var(--ink-quiet)] mt-1">
                            {fixture.date} · {fixture.time} · {fixture.stage}
                          </span>
                          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[0.68rem] uppercase tracking-[0.08em] text-[var(--ink-quiet)]">
                            <span>{fixture.status}</span>
                            <span>·</span>
                            <span>{fixture.contentStatus}</span>
                            <span>·</span>
                            <span>{fixturePrediction.upsetRisk} risk</span>
                          </div>
                        </div>
                        <div className="grid place-items-end pr-1">
                          <span className="figure text-[1.5rem] leading-none text-ink">{score}</span>
                          <span className="caption text-[0.62rem] mt-0.5">{label}</span>
                        </div>
                      </div>
                    </button>
                  );
                }) : (
                  <p className="text-sm text-[var(--ink-muted)] py-6">
                    No fixtures match this queue view. Clear the search or switch the filter back to All.
                  </p>
                )}
              </div>
            </aside>

            {/* Main column */}
            <section className="flex min-w-0 flex-col gap-12">
              {/* Editorial signal hero */}
              <article className="border-t-2 border-ink pt-7">
                <p className="eyebrow gold">Current Signal · {selectedFixture.stage}</p>
                <h1 className="mt-3 text-ink max-w-[18ch]">
                  {selectedFixture.teamA}
                  <span className="block text-[var(--ink-muted)] italic font-display font-normal text-[0.45em] mt-1 [font-variation-settings:'opsz'_60]">
                    versus
                  </span>
                  {selectedFixture.teamB}
                </h1>
                <p className="mt-6 max-w-[60ch] text-[1rem] leading-[1.6] text-[var(--ink-muted)]">
                  {prediction.storyline}
                </p>
                <div className="mt-7 grid grid-cols-1 md:grid-cols-3 border-y border-[var(--rule)]">
                  {[
                    ["Lean", prediction.winnerLean],
                    ["Score", prediction.expectedScore],
                    ["Confidence", `${prediction.confidence}/10`],
                  ].map(([k, v]) => (
                    <div key={k} className="flex flex-col gap-1.5 py-5 pr-6 border-r last:border-r-0 border-[var(--rule)]">
                      <span className="caption">{k}</span>
                      <span className="figure text-[clamp(1.4rem,2vw,1.85rem)] text-ink leading-none">{v}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-6 flex flex-wrap gap-2">
                  <Button variant="primary" icon={<Sparkles size={14} />} onClick={generateWithAI} loading={loading.generateWithAI}>Generate</Button>
                  <Button variant="secondary" icon={<Radio size={14} />} onClick={sendTelegramPreview} loading={loading.sendTelegramPreview}>Telegram preview</Button>
                  <Button variant="secondary" icon={<Send size={14} />} onClick={socialDryRun} loading={loading.socialDryRun}>Buffer draft</Button>
                  <Button variant="success" icon={<ShieldCheck size={14} />} onClick={() => updateFixture(selectedFixture.id, { contentStatus: "Approved" })}>Approve</Button>
                </div>
              </article>

              {/* Signal meters */}
              <section className="signal-meters border-y border-[var(--rule)]">
                <Metric label="Interest" value={`${interestLabelFor(selectedInterest)} · ${selectedInterest}`} />
                <Metric label="Upset watch" value={prediction.upsetRisk} />
                <Metric label="Goal potential" value={prediction.goalPotential} />
                <Metric label="Fan pressure" value={marketContext.fanPressure} />
              </section>

              {/* Fixture metadata editor */}
              <article>
                <div className="flex flex-wrap items-end justify-between gap-3 pb-3 border-b border-[var(--rule-strong)]">
                  <div>
                    <p className="eyebrow pitch">Fixture Control</p>
                    <h2 className="mt-1 text-ink">Match metadata</h2>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="secondary" icon={<BarChart3 size={14} />} onClick={syncOddsApi} loading={loading.syncOddsApi}>Market feed</Button>
                    <Button variant="primary" icon={<Sparkles size={14} />} onClick={generateWithAI} loading={loading.generateWithAI}>Generate</Button>
                  </div>
                </div>
                <div className="mt-5 grid grid-cols-1 gap-x-8 gap-y-5 md:grid-cols-2 xl:grid-cols-6">
                  <div className="xl:col-span-3"><LabeledInput label="Team A" value={selectedFixture.teamA} onChange={(teamA) => { updateFixture(selectedFixture.id, { teamA }); ensureRating(teamA); }} /></div>
                  <div className="xl:col-span-3"><LabeledInput label="Team B" value={selectedFixture.teamB} onChange={(teamB) => { updateFixture(selectedFixture.id, { teamB }); ensureRating(teamB); }} /></div>
                  <LabeledInput label="Date" type="date" value={selectedFixture.date} onChange={(date) => updateFixture(selectedFixture.id, { date })} />
                  <LabeledInput label="Time" type="time" value={selectedFixture.time} onChange={(time) => updateFixture(selectedFixture.id, { time })} />
                  <div className="xl:col-span-2"><LabeledInput label="Stage" value={selectedFixture.stage} onChange={(stage) => updateFixture(selectedFixture.id, { stage })} /></div>
                  <div className="xl:col-span-2"><LabeledInput label="Venue" value={selectedFixture.venue} onChange={(venue) => updateFixture(selectedFixture.id, { venue })} /></div>
                  <div className="md:col-span-2 xl:col-span-6 grid grid-cols-1 gap-x-8 gap-y-5 md:grid-cols-3 pt-5 border-t border-[var(--rule)]">
                    <LabeledInput label="Home price context" type="number" value={String(selectedFixture.homeOdds || "")} onChange={(val) => updateFixture(selectedFixture.id, { homeOdds: parseFloat(val) || undefined })} />
                    <LabeledInput label="Draw price context" type="number" value={String(selectedFixture.drawOdds || "")} onChange={(val) => updateFixture(selectedFixture.id, { drawOdds: parseFloat(val) || undefined })} />
                    <LabeledInput label="Away price context" type="number" value={String(selectedFixture.awayOdds || "")} onChange={(val) => updateFixture(selectedFixture.id, { awayOdds: parseFloat(val) || undefined })} />
                  </div>
                </div>
              </article>

              {/* Ratings */}
              <section className="grid grid-cols-1 gap-x-10 gap-y-7 lg:grid-cols-2">
                {[selectedFixture.teamA, selectedFixture.teamB].map((team) => {
                  const rating = ratings.find((item) => item.team.toLowerCase() === team.toLowerCase());
                  if (!rating) return null;
                  return <TeamRatingEditor key={team} rating={rating} onChange={(patch) => updateRating(rating.team, patch)} />;
                })}
              </section>

              <MatchIntelPanel fixture={selectedFixture} intel={selectedIntel} />

              {/* Right-column dashboard, now below as a ruled grid */}
              <section className="grid grid-cols-1 gap-x-10 md:grid-cols-2">
                <article className="md:border-r md:border-[var(--rule)] md:pr-8 pb-6">
                  <p className="eyebrow pitch">Publishing State</p>
                  <h3 className="mt-1 text-ink font-display [font-variation-settings:'opsz'_60] font-medium text-[1.1rem] tracking-[-0.015em] pb-3 mb-3 border-b border-[var(--rule)]">
                    Ready to ship
                  </h3>
                  <dl className="grid gap-3">
                    {[
                      ["Content", selectedFixture.contentStatus],
                      ["Providers", `${providerCount}/${providerTotal}`],
                      ["Source", stateSource],
                      ["Buffer", "Dry-run safe"],
                    ].map(([k, v]) => (
                      <div key={k} className="flex items-baseline justify-between gap-3 border-b border-[var(--rule)] pb-2 last:border-b-0">
                        <dt className="caption">{k}</dt>
                        <dd className="text-sm text-ink font-medium">{v}</dd>
                      </div>
                    ))}
                  </dl>
                </article>
                <article className="pb-6 md:pl-2">
                  <p className="eyebrow gold">Scenario Watch</p>
                  <h3 className="mt-1 text-ink font-display [font-variation-settings:'opsz'_60] font-medium text-[1.1rem] tracking-[-0.015em] pb-3 mb-3 border-b border-[var(--rule)]">
                    What changes the read
                  </h3>
                  <div className="grid gap-4">
                    {scenarios.map((scenario) => (
                      <div key={scenario.title} className="border-l-2 border-[var(--gold)] pl-4">
                        <strong className="block text-[0.95rem] font-medium text-ink font-display [font-variation-settings:'opsz'_60]">
                          {scenario.title}
                        </strong>
                        <span className="mt-1 block text-[0.85rem] leading-[1.55] text-[var(--ink-muted)]">{scenario.signal}</span>
                      </div>
                    ))}
                  </div>
                </article>
              </section>
            </section>
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
          <section className="flex flex-col gap-12">
            {/* Masthead */}
            <header className="border-t-2 border-ink pt-7 grid grid-cols-1 lg:grid-cols-[minmax(0,1.5fr)_minmax(280px,1fr)] gap-x-10 gap-y-6">
              <div>
                <p className="eyebrow gold">Prediction Lab — pre-window read</p>
                <h1 className="mt-3 text-ink">Test the match before the timeline moves.</h1>
                <p className="mt-5 max-w-[58ch] text-[1rem] leading-[1.55] text-[var(--ink-muted)]">
                  Build scenario reads, rank volatility, and decide what content angle deserves attention before the match window opens.
                </p>
                <div className="hr-gold mt-4" />
              </div>
              <div className="lg:pt-2 grid grid-cols-2 border-t border-[var(--rule)] self-end">
                <Metric label="Attention" value={String(marketContext.attentionScore)} />
                <Metric label="Volatility" value={String(marketContext.volatilityScore)} />
              </div>
            </header>

            {/* Scenario builder + content radar */}
            <section className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.4fr)_minmax(280px,1fr)] gap-x-12 gap-y-10">
              <article>
                <div className="flex items-baseline justify-between gap-3 pb-3 border-b border-[var(--rule-strong)]">
                  <div>
                    <p className="eyebrow pitch">Scenario Builder</p>
                    <h2 className="mt-1 text-ink">{selectedFixture.teamA} vs {selectedFixture.teamB}</h2>
                  </div>
                  <span className="caption">{scenarios.length} cases</span>
                </div>
                <div className="mt-5 grid gap-0 border-t border-[var(--rule)]">
                  {scenarios.map((scenario, index) => (
                    <article className="grid grid-cols-[48px_minmax(0,1fr)] gap-5 py-5 border-b border-[var(--rule)]" key={scenario.title}>
                      <span className="figure text-[1.4rem] leading-none text-[var(--ink-quiet)] pt-1">{String(index + 1).padStart(2, "0")}</span>
                      <div>
                        <h3 className="text-ink font-display [font-variation-settings:'opsz'_60] font-medium text-[1.1rem] tracking-[-0.015em]">{scenario.title}</h3>
                        <dl className="mt-3 grid gap-1.5 text-[0.875rem] leading-[1.55] text-[var(--ink-muted)]">
                          <div><dt className="inline caption pr-1">Trigger</dt><dd className="inline">{scenario.trigger}</dd></div>
                          <div><dt className="inline caption pr-1">Signal</dt><dd className="inline">{scenario.signal}</dd></div>
                          <div><dt className="inline caption pr-1">Angle</dt><dd className="inline">{scenario.contentAngle}</dd></div>
                        </dl>
                      </div>
                    </article>
                  ))}
                </div>
              </article>

              <aside>
                <div className="flex items-baseline justify-between gap-3 pb-3 border-b border-[var(--rule-strong)]">
                  <div>
                    <p className="eyebrow pitch">Content Radar</p>
                    <h2 className="mt-1 text-ink">Priority queue</h2>
                  </div>
                  <span className="caption">{rankedFixtures.length} matches</span>
                </div>
                <div className="mt-2 grid max-h-[560px] gap-0 overflow-y-auto -mr-2 pr-2">
                  {rankedFixtures.map(({ fixture, prediction: fixturePrediction, score, label }, index) => {
                    const isSelected = fixture.id === selectedFixture.id;
                    return (
                      <button
                        key={fixture.id}
                        className="w-full text-left min-h-0 p-0 border-0"
                        onClick={() => setSelectedId(fixture.id)}
                        style={{
                          borderBottom: "1px solid var(--rule)",
                          borderLeft: isSelected ? "2px solid var(--gold)" : "2px solid transparent",
                          background: isSelected ? "var(--paper-raised)" : "transparent",
                          paddingLeft: 12,
                        }}
                      >
                        <div className="flex items-baseline justify-between gap-3 py-3 pr-2">
                          <span className="caption tabular pt-0.5">{String(index + 1).padStart(2, "0")}</span>
                          <strong className="min-w-0 flex-1 text-[0.9rem] font-medium leading-tight text-ink truncate">
                            {fixture.teamA}
                            <span className="text-[var(--ink-quiet)] mx-1.5 italic font-display [font-variation-settings:'opsz'_60]">vs</span>
                            {fixture.teamB}
                          </strong>
                          <span className="figure text-[1.2rem] leading-none text-ink">{score}</span>
                        </div>
                        <p className="pb-3 pr-2 text-[0.72rem] uppercase tracking-[0.08em] text-[var(--ink-quiet)]">
                          {fixturePrediction.upsetRisk} risk · {fixturePrediction.goalPotential} goals · {label}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </aside>
            </section>

            {/* Market context */}
            <section className="market-context">
              <div className="flex items-baseline justify-between gap-3 pb-3 border-b border-[var(--rule-strong)]">
                <div>
                  <p className="eyebrow pitch">Market Context</p>
                  <h2 className="mt-1 text-ink">Attention &amp; volatility signals</h2>
                </div>
                <span className="caption">editorial — not betting</span>
              </div>
              <div className="context-meters">
                <Metric label="Momentum" value={marketContext.mediaMomentum} />
                <Metric label="Attention score" value={String(marketContext.attentionScore)} />
                <Metric label="Volatility score" value={String(marketContext.volatilityScore)} />
                <Metric label="Content priority" value={interestLabelFor(clamp(marketContext.attentionScore + marketContext.volatilityScore / 2, 0, 100))} />
              </div>
              <div className="context-signal-list">
                {marketContext.signals.map((signal) => (
                  <article className="context-signal" key={signal.label}>
                    <strong>{signal.label}</strong>
                    <span>{signal.score}<span className="text-[var(--ink-quiet)] text-[0.85rem]">/100</span></span>
                    <p>{signal.note}</p>
                  </article>
                ))}
              </div>
            </section>
          </section>
        )}

        {activeView === "brand" && (
          <section className="flex flex-col gap-12">
            {/* Masthead */}
            <header className="border-t-2 border-ink pt-7 grid grid-cols-1 lg:grid-cols-[minmax(0,1.5fr)_minmax(280px,1fr)] gap-x-12 gap-y-6">
              <div>
                <p className="eyebrow gold">Brand Command — editorial system</p>
                <h1 className="mt-3 text-ink">Field Intelligence, built for social velocity.</h1>
                <p className="mt-5 max-w-[58ch] text-[1rem] leading-[1.55] text-[var(--ink-muted)]">
                  The Match Signal has a premium asset system, platform handles, content pillars, and match-specific captions. This view is the control surface for keeping every post recognisable.
                </p>
                <div className="hr-gold mt-4" />
              </div>
              <div className="self-end grid grid-cols-3 border-t border-[var(--rule)]">
                {[
                  ["Instagram", "@thematchsignal"],
                  ["X", "@thematchsignal"],
                  ["YouTube", "@TheMatchSignal"],
                ].map(([label, value]) => (
                  <div key={label} className="flex flex-col gap-1.5 py-4 pr-4 border-r last:border-r-0 border-[var(--rule)]">
                    <span className="caption">{label}</span>
                    <strong className="text-[0.95rem] font-medium text-ink truncate">{value}</strong>
                  </div>
                ))}
              </div>
            </header>

            {/* Pillars */}
            <section>
              <div className="flex items-baseline justify-between gap-3 pb-3 border-b border-[var(--rule-strong)]">
                <div>
                  <p className="eyebrow pitch">Editorial system</p>
                  <h2 className="mt-1 text-ink">Brand pillars</h2>
                </div>
                <span className="caption">{brandPillars.length} pillars</span>
              </div>
              <div className="pillar-grid">
                {brandPillars.map((pillar, index) => (
                  <article className="pillar-card" key={pillar.title}>
                    <span className="caption tabular">{String(index + 1).padStart(2, "0")}</span>
                    <h3 className="mt-2">{pillar.title}</h3>
                    <p>{pillar.detail}</p>
                  </article>
                ))}
              </div>
            </section>

            {/* Voice + assets, side by side */}
            <section className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-x-12 gap-y-10">
              <article>
                <div className="flex items-baseline justify-between gap-3 pb-3 border-b border-[var(--rule-strong)]">
                  <div>
                    <p className="eyebrow pitch">Voice guardrails</p>
                    <h2 className="mt-1 text-ink">Publish without drift</h2>
                  </div>
                  <span className="caption">{voiceRules.length} rules</span>
                </div>
                <ol className="mt-5 grid gap-0 border-t border-[var(--rule)]">
                  {voiceRules.map((rule, i) => (
                    <li key={rule} className="grid grid-cols-[40px_minmax(0,1fr)] py-4 border-b border-[var(--rule)] text-[0.95rem] leading-[1.55] text-[var(--ink-muted)]">
                      <span className="figure text-[1.1rem] text-[var(--ink-quiet)]">{String(i + 1).padStart(2, "0")}</span>
                      <span className="text-ink">{rule}</span>
                    </li>
                  ))}
                </ol>
              </article>

              <article>
                <div className="flex items-baseline justify-between gap-3 pb-3 border-b border-[var(--rule-strong)]">
                  <div>
                    <p className="eyebrow pitch">Premium files</p>
                    <h2 className="mt-1 text-ink">Use these assets</h2>
                  </div>
                  <Image size={16} className="text-[var(--ink-quiet)]" />
                </div>
                <div className="mt-5 grid gap-0 border-t border-[var(--rule)]">
                  {[
                    ["Profile avatar", "match-signal-premium-avatar-2048.png", "All social profiles"],
                    ["Instagram intro", "match-signal-instagram-intro-1080x1350.png", "Pinned feed launch"],
                    ["YouTube banner", "match-signal-youtube-banner-2048x1152.png", "Channel art"],
                    ["X header", "match-signal-x-header-1500x500.png", "Profile header"],
                  ].map(([label, file, use]) => (
                    <div key={file} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-6 gap-y-1 py-4 border-b border-[var(--rule)]">
                      <strong className="text-[0.95rem] font-medium text-ink font-display [font-variation-settings:'opsz'_60]">{label}</strong>
                      <span className="caption text-[var(--ink-quiet)] text-right">{use}</span>
                      <span className="col-span-2 font-mono text-[0.72rem] text-[var(--ink-quiet)] truncate">{file}</span>
                    </div>
                  ))}
                </div>
              </article>
            </section>

            {/* Palette + content pillars */}
            <section className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-x-12 gap-y-10">
              <article>
                <div className="flex items-baseline justify-between gap-3 pb-3 border-b border-[var(--rule-strong)]">
                  <div>
                    <p className="eyebrow pitch">Visual identity</p>
                    <h2 className="mt-1 text-ink">Signal palette</h2>
                  </div>
                  <Palette size={16} className="text-[var(--ink-quiet)]" />
                </div>
                <div className="swatch-grid">
                  {visualSystem.map((item) => (
                    <div className="swatch-card" key={item.label}>
                      <span className="swatch" style={{ background: item.swatch }} />
                      <div>
                        <strong className="block text-[0.95rem] font-medium text-ink">{item.label}</strong>
                        <small>{item.value}</small>
                      </div>
                    </div>
                  ))}
                </div>
              </article>

              <article>
                <div className="flex items-baseline justify-between gap-3 pb-3 border-b border-[var(--rule-strong)]">
                  <div>
                    <p className="eyebrow pitch">Series engine</p>
                    <h2 className="mt-1 text-ink">Repeatable content lanes</h2>
                  </div>
                  <Hash size={16} className="text-[var(--ink-quiet)]" />
                </div>
                <div className="tag-cloud">
                  {contentPillars.map((pillar) => (
                    <span key={pillar}>{pillar}</span>
                  ))}
                </div>
              </article>
            </section>

            {/* Platform kit */}
            <section>
              <div className="flex flex-wrap items-baseline justify-between gap-3 pb-3 border-b border-[var(--rule-strong)]">
                <div>
                  <p className="eyebrow pitch">Platform kit</p>
                  <h2 className="mt-1 text-ink">{selectedFixture.teamA} vs {selectedFixture.teamB}</h2>
                </div>
                <Button variant="secondary" icon={<Hash size={14} />} onClick={() => copy("Hashtags", hashtagsFor(selectedFixture).join(" "))}>
                  {copied === "Hashtags" ? "Copied" : "Copy hashtags"}
                </Button>
              </div>
              <div className="platform-grid">
                {socialKit.map((item) => (
                  <article className="platform-card" key={item.platform}>
                    <div className="platform-heading">
                      {platformIconFor(item.platform)}
                      <div>
                        <h3>{item.platform}</h3>
                        <small>{item.format} · {item.cadence}</small>
                      </div>
                    </div>
                    <p className="text-[0.85rem]"><span className="caption pr-1">Hook</span>{item.hook}</p>
                    <p className="text-[0.85rem]"><span className="caption pr-1">Creative</span>{item.creative}</p>
                    <p className="text-[0.85rem]"><span className="caption pr-1">CTA</span>{item.cta}</p>
                    <pre>{item.caption}</pre>
                    <Button variant="ghost" icon={<Clipboard size={13} />} onClick={() => copy(item.platform, item.caption)}>
                      {copied === item.platform ? "Copied" : "Copy caption"}
                    </Button>
                  </article>
                ))}
              </div>
            </section>
          </section>
        )}

        {activeView === "content" && (
          <section className="flex flex-col gap-12">
            {/* Masthead */}
            <header className="border-t-2 border-ink pt-7 grid grid-cols-1 lg:grid-cols-[minmax(0,1.5fr)_minmax(280px,1fr)] gap-x-12 gap-y-6">
              <div>
                <p className="eyebrow gold">Publishing Desk · matchday output</p>
                <h1 className="mt-3 text-ink">Package the signal. Hold the standard.</h1>
                <p className="mt-5 max-w-[58ch] text-[1rem] leading-[1.55] text-[var(--ink-muted)]">
                  Every output for {selectedFixture.teamA} vs {selectedFixture.teamB} moves from intelligence to channel-native copy without drifting into hype, guesswork, or gambling language.
                </p>
                <div className="hr-gold mt-4" />
              </div>
              <div className="self-end grid grid-cols-3 border-t border-[var(--rule)]">
                {[
                  ["Status", selectedFixture.contentStatus],
                  ["Confidence", `${prediction.confidence}/10`],
                  ["Priority", interestLabelFor(selectedInterest)],
                ].map(([k, v]) => (
                  <div key={k} className="flex flex-col gap-1.5 py-4 pr-4 border-r last:border-r-0 border-[var(--rule)]">
                    <span className="caption">{k}</span>
                    <strong className="figure text-[clamp(1.1rem,1.6vw,1.4rem)] text-ink leading-none truncate">{v}</strong>
                  </div>
                ))}
              </div>
            </header>

            <div className="flex flex-wrap gap-2">
              <Button variant="primary" icon={<Sparkles size={14} />} onClick={generateWithAI} loading={loading.generateWithAI}>Generate pack</Button>
              <Button variant="secondary" icon={<Radio size={14} />} onClick={sendTelegramPreview} loading={loading.sendTelegramPreview}>Admin preview</Button>
              <Button variant="secondary" icon={<Send size={14} />} onClick={socialDryRun} loading={loading.socialDryRun}>Buffer dry run</Button>
              <Button variant="success" icon={<ShieldCheck size={14} />} onClick={() => updateFixture(selectedFixture.id, { contentStatus: "Approved" })}>Approve</Button>
            </div>

            {/* Channel readiness */}
            <section>
              <div className="flex items-baseline justify-between gap-3 pb-3 border-b border-[var(--rule-strong)]">
                <div>
                  <p className="eyebrow pitch">Channel readiness</p>
                  <h2 className="mt-1 text-ink">Connected social stack</h2>
                </div>
                <span className="caption">4 channels</span>
              </div>
              <div className="mt-2 grid gap-0">
                {[
                  ["Instagram", "Media required", "Connected via Buffer"],
                  ["X", "Text draft tested", "Buffer write works"],
                  ["TikTok", "Video required", "Connected via Buffer"],
                  ["YouTube", "Short + banner ready", "Connect in Buffer next"],
                ].map(([channel, requirement, status]) => (
                  <div key={channel} className="grid grid-cols-[180px_minmax(0,1fr)_auto] items-baseline gap-4 py-4 border-b border-[var(--rule)]">
                    <strong className="text-[1rem] font-medium text-ink font-display [font-variation-settings:'opsz'_60]">{channel}</strong>
                    <span className="text-[0.9rem] text-[var(--ink-muted)]">{requirement}</span>
                    <span className="caption text-pitch">{status}</span>
                  </div>
                ))}
              </div>
            </section>

            {/* Outputs */}
            <section className="grid grid-cols-1 gap-x-12 gap-y-10 xl:grid-cols-2">
              <OutputPanel title="Telegram Brief" icon={<Radio size={16} />} text={content.telegram} onCopy={() => copy("Telegram", content.telegram)} copied={copied === "Telegram"} onPublish={sendTelegramPublic} disabled={loading.sendTelegramPublic} />
              <OutputPanel title="X Post" icon={<Megaphone size={16} />} text={content.xPost} onCopy={() => copy("X Post", content.xPost)} copied={copied === "X Post"} />
              <OutputPanel title="Shorts Script" icon={<Film size={16} />} text={content.shortsScript} onCopy={() => copy("Shorts", content.shortsScript)} copied={copied === "Shorts"} />
              <OutputPanel title="Market Context" icon={<BarChart3 size={16} />} text={content.marketContext || content.bettingAngle} onCopy={() => copy("Market Context", content.marketContext || content.bettingAngle)} copied={copied === "Market Context"} onPublish={sendTelegramMarketContext} disabled={loading.sendTelegramMarketContext} />
            </section>

            {/* Platform-native captions */}
            <section>
              <div className="flex flex-wrap items-baseline justify-between gap-3 pb-3 border-b border-[var(--rule-strong)]">
                <div>
                  <p className="eyebrow pitch">Platform variants</p>
                  <h2 className="mt-1 text-ink">Channel-native captions</h2>
                </div>
                <Button variant="secondary" icon={<Hash size={14} />} onClick={() => copy("Hashtags", hashtagsFor(selectedFixture).join(" "))}>
                  {copied === "Hashtags" ? "Copied" : "Copy hashtags"}
                </Button>
              </div>
              <div className="platform-grid">
                {socialKit.map((item) => (
                  <article key={item.platform} className="platform-card">
                    <div className="platform-heading">
                      {platformIconFor(item.platform)}
                      <div>
                        <h3>{item.platform}</h3>
                        <small>{item.format}</small>
                      </div>
                    </div>
                    <p className="text-[0.95rem] text-ink font-display [font-variation-settings:'opsz'_60] font-medium leading-tight">{item.hook}</p>
                    <pre>{item.caption}</pre>
                    <Button variant="ghost" icon={<Clipboard size={13} />} onClick={() => copy(item.platform, item.caption)}>
                      {copied === item.platform ? "Copied" : "Copy caption"}
                    </Button>
                  </article>
                ))}
              </div>
            </section>

            <OutputPanel title="Report Section" icon={<FileText size={16} />} text={content.reportSection} onCopy={() => copy("Report", content.reportSection)} copied={copied === "Report"} />
          </section>
        )}

        {activeView === "video" && (
          <section className="flex flex-col gap-12">
            {/* Masthead */}
            <header className="border-t-2 border-ink pt-7 grid grid-cols-1 lg:grid-cols-[minmax(0,1.5fr)_minmax(280px,1fr)] gap-x-12 gap-y-6">
              <div>
                <p className="eyebrow gold">Clip factory · {selectedFixture.teamA} vs {selectedFixture.teamB}</p>
                <h1 className="mt-3 text-ink">Cut the moment. Ship the vertical.</h1>
                <p className="mt-5 max-w-[58ch] text-[1rem] leading-[1.55] text-[var(--ink-muted)]">
                  Point to a local source, lift the in/out marks off the scrubber, and render planned clips with branded overlays. The output queue holds the last twelve renders.
                </p>
                <div className="hr-gold mt-4" />
              </div>
              <div className="lg:self-end flex flex-wrap lg:justify-end gap-2">
                <Button variant="secondary" icon={<Activity size={14} />} onClick={checkVideoEngine} loading={loading.checkVideoEngine}>Engine status</Button>
                <Button variant="secondary" icon={<Sparkles size={14} />} onClick={createSampleVideo} loading={loading.createSample}>Create sample</Button>
              </div>
            </header>

            <section className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.3fr)_minmax(320px,0.9fr)] gap-x-12 gap-y-12">
              {/* Left column: source + plans */}
              <article className="flex flex-col gap-10 min-w-0">
                <div>
                  <p className="eyebrow gold">Source hub</p>
                  <h2 className="mt-1 text-ink pb-3 border-b border-[var(--rule-strong)]">Official video discovery</h2>
                  <p className="mt-3 max-w-[72ch] text-[0.92rem] leading-[1.55] text-[var(--ink-muted)]">
                    Search official highlight embeds first. These are reference/embed sources unless the provider explicitly grants downloadable editing rights.
                  </p>
                  <div className="mt-4 grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-x-4 gap-y-3 items-end">
                    <label className="field">
                      <span>Search match, team, or competition</span>
                      <input
                        value={sourceSearchQuery}
                        onChange={(event) => setSourceSearchQuery(event.target.value)}
                        placeholder={`${selectedFixture.teamA} ${selectedFixture.teamB}`}
                      />
                    </label>
                    <Button variant="secondary" icon={<Search size={14} />} onClick={searchFootageSources} loading={loading.sourceSearch}>
                      Search sources
                    </Button>
                  </div>
                  {sourceProviderNote && <p className="caption mt-2">{sourceProviderNote}</p>}

                  {sourceCatalog && sourceCatalog.length > 0 && (
                    <details className="mt-3 border-y border-[var(--rule)] py-3">
                      <summary className="caption cursor-pointer">Provider map · editable feeds require licenses</summary>
                      <div className="mt-3 grid gap-0">
                        {sourceCatalog.map((provider) => (
                          <div key={provider.key} className="grid grid-cols-1 md:grid-cols-[160px_150px_minmax(0,1fr)_auto] gap-2 md:gap-4 py-3 border-t border-[var(--rule)]">
                            <strong className="text-[0.9rem] text-ink">{provider.label}</strong>
                            <span className="caption">{provider.status.replace(/_/g, " ")}</span>
                            <span className="text-[0.8rem] text-[var(--ink-muted)]">{provider.note}</span>
                            <a className="caption text-pitch" href={provider.docs} target="_blank" rel="noreferrer">Docs</a>
                          </div>
                        ))}
                      </div>
                    </details>
                  )}

                  {videoSources.length > 0 && (
                    <div className="mt-4 grid gap-0 border-t border-[var(--rule)]">
                      {videoSources.map((source) => (
                        <article key={source.id} className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_auto] gap-4 py-4 border-b border-[var(--rule)]">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                              <h3 className="text-[1rem] font-medium text-ink font-display [font-variation-settings:'opsz'_60]">{source.matchTitle || source.title}</h3>
                              <span className={`caption ${source.editable ? "pitch" : "gold"}`}>{source.rightsLabel}</span>
                            </div>
                            <p className="mt-1 text-[0.86rem] text-[var(--ink-muted)]">{source.title} · {source.competition || "Competition unknown"} · {source.date || "Date unknown"}</p>
                            <p className="mt-2 text-[0.8rem] text-[var(--ink-muted)]">{source.reason}</p>
                          </div>
                          <div className="flex flex-wrap md:justify-end gap-2">
                            {source.sourceUrl && (
                              <a className="button-link" href={source.sourceUrl} target="_blank" rel="noreferrer">Open source</a>
                            )}
                            {source.embed && (
                              <Button variant="ghost" icon={<Clipboard size={13} />} onClick={() => copy("Source Embed", source.embed || "")}>
                                Copy embed
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              icon={<ShieldCheck size={13} />}
                              onClick={() => setApiMessage(source.notes)}
                            >
                              Rights note
                            </Button>
                          </div>
                        </article>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <p className="eyebrow pitch">Source</p>
                  <h2 className="mt-1 text-ink pb-3 border-b border-[var(--rule-strong)]">Footage</h2>

                  {/* Source mode toggle */}
                  <div className="mt-4 inline-flex border border-[var(--rule)]">
                    {(["local", "youtube"] as const).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => setSourceMode(mode)}
                        className={`px-4 py-2 text-[0.875rem] tracking-[0.02em] uppercase font-medium transition-colors ${
                          sourceMode === mode
                            ? "bg-[var(--ink)] text-[var(--paper)]"
                            : "text-[var(--ink-muted)] hover:text-ink"
                        }`}
                      >
                        {mode === "local" ? "Local file" : "YouTube URL"}
                      </button>
                    ))}
                  </div>

                  {sourceMode === "youtube" ? (
                    <>
                      <div className="mt-4 grid grid-cols-1 sm:grid-cols-[1fr_auto_auto] gap-x-4 gap-y-3 items-end">
                        <label className="field">
                          <span>YouTube URL · paste to auto-probe</span>
                          <input
                            value={youtubeUrl}
                            onChange={(event) => setYoutubeUrl(event.target.value)}
                            placeholder="https://www.youtube.com/watch?v=…"
                            className="font-mono"
                          />
                        </label>
                        <Button
                          variant="secondary"
                          icon={<Sparkles size={14} />}
                          onClick={geminiScan}
                          loading={loading.geminiScan}
                          disabled={!looksLikeYouTubeUrl(youtubeUrl) || loading.geminiScan}
                          title="Smart scan via Gemini 2.5 — football-semantic moment detection without downloading the video"
                        >
                          Smart scan
                        </Button>
                        <Button
                          variant="primary"
                          icon={<Download size={14} />}
                          onClick={downloadYouTube}
                          loading={downloadProgress.status === "pending" || downloadProgress.status === "running"}
                          disabled={!youtubeStatus?.configured || !looksLikeYouTubeUrl(youtubeUrl) || downloadProgress.status === "running"}
                        >
                          {downloadProgress.status === "running"
                            ? `Downloading ${downloadProgress.progress?.percent != null ? downloadProgress.progress.percent.toFixed(0) + "%" : "…"}`
                            : "Get video"}
                        </Button>
                      </div>

                      {/* Live progress bar — only renders when a job is active or just finished. */}
                      <ProgressBar state={downloadProgress} label="yt-dlp" />

                      {!youtubeStatus?.configured && (
                        <p className="mt-3 text-[0.8rem] text-[var(--ink-muted)] leading-[1.55]">
                          yt-dlp not detected. Install it with <code className="font-mono text-ink">pip install --user yt-dlp</code>, <code className="font-mono text-ink">winget install yt-dlp</code>, or <code className="font-mono text-ink">brew install yt-dlp</code>, then restart the API.
                        </p>
                      )}
                      {youtubeStatus?.configured && (
                        <p className="mt-2 text-[0.75rem] text-[var(--ink-quiet)] tracking-[0.02em]">
                          yt-dlp {youtubeStatus.version} · {youtubeStatus.kind}
                          {loading.probeYouTube ? " · reading metadata…" : ""}
                        </p>
                      )}

                      {/* Section trim — only useful for long broadcasts. Surfaces
                          automatically when the auto-probe reports duration > 5 min. */}
                      {youtubeInfo && youtubeInfo.duration > 300 && (
                        <label className="field mt-4 max-w-[420px]">
                          <span>
                            Trim section before download (optional) · long video, {Math.floor(youtubeInfo.duration / 60)} min
                          </span>
                          <input
                            value={youtubeSection}
                            onChange={(event) => setYoutubeSection(event.target.value)}
                            placeholder="e.g. 12:00-22:00"
                            className="font-mono"
                          />
                        </label>
                      )}

                      {youtubeInfo && (
                        <article className="mt-5 grid grid-cols-[160px_minmax(0,1fr)] gap-x-5 gap-y-2 border-t border-[var(--rule)] pt-5">
                          {youtubeInfo.thumbnail ? (
                            <img
                              src={youtubeInfo.thumbnail}
                              alt=""
                              className="w-full aspect-video object-cover border border-[var(--rule)]"
                            />
                          ) : (
                            <div className="w-full aspect-video bg-[var(--paper-raised)] border border-[var(--rule)]" />
                          )}
                          <div className="flex flex-col gap-1 min-w-0">
                            <p className="eyebrow gold">{youtubeInfo.channel}</p>
                            <h3 className="text-ink font-display [font-variation-settings:'opsz'_60] text-[1.1rem] leading-tight">
                              {youtubeInfo.title}
                            </h3>
                            <p className="caption">
                              <span className="figure text-ink tabular-nums">
                                {Math.floor(youtubeInfo.duration / 60)}:{String(Math.round(youtubeInfo.duration % 60)).padStart(2, "0")}
                              </span>
                              {youtubeInfo.viewCount ? ` · ${formatViews(youtubeInfo.viewCount)} views` : ""}
                              {youtubeInfo.uploadDate ? ` · ${formatUploadDate(youtubeInfo.uploadDate)}` : ""}
                              {youtubeInfo.isLive ? " · LIVE — wait for VOD" : ""}
                            </p>
                            {youtubeInfo.description && (
                              <p className="text-[0.8rem] text-[var(--ink-muted)] leading-[1.5] max-w-[60ch] mt-1 line-clamp-3">
                                {youtubeInfo.description}
                              </p>
                            )}
                          </div>
                        </article>
                      )}
                    </>
                  ) : (
                    <div className="mt-4 grid grid-cols-1 sm:grid-cols-[1fr_auto_auto] gap-x-4 gap-y-3 items-end">
                      <label className="field">
                        <span>Source video path</span>
                        <input
                          value={clipSourcePath}
                          onChange={(event) => setClipSourcePath(event.target.value)}
                          placeholder="C:\\Videos\\match-footage.mp4"
                          className="font-mono"
                        />
                      </label>
                      <Button variant="secondary" icon={<Film size={14} />} onClick={() => probeVideoSource()} loading={loading.probeVideo}>
                        Probe
                      </Button>
                      <Button variant="secondary" icon={<Radar size={14} />} onClick={scanForMoments} loading={loading.scan}>
                        Scan for moments
                      </Button>
                    </div>
                  )}

                  {/* Once a source is chosen (either mode), expose the Scan button below
                      so YouTube workflows can scan after download. */}
                  {sourceMode === "youtube" && clipSourcePath.trim() && (
                    <div className="mt-4">
                      <Button variant="secondary" icon={<Radar size={14} />} onClick={scanForMoments} loading={loading.scan}>
                        Scan for moments
                      </Button>
                    </div>
                  )}

                  {clipSourcePath.trim() && (
                    <div className="mt-6 flex flex-col gap-3">
                      <p className="caption">Source preview</p>
                      <video
                        ref={sourceVideoRef}
                        controls
                        src={withApiKey(`/api/video/stream?path=${encodeURIComponent(clipSourcePath)}`)}
                        className="w-full max-h-[300px] bg-[var(--ink)] border border-[var(--rule)] object-contain"
                        onLoadedMetadata={(e) => {
                          const v = e.currentTarget;
                          if (v.duration && Number.isFinite(v.duration)) {
                            setTimelineDuration(v.duration);
                          }
                        }}
                      />

                      {/* Editor-class timeline: thumbnails + waveform + handles + hotkeys */}
                      <ClipTimeline
                        duration={timelineDuration || 30}
                        fps={timelineFps}
                        inTime={selectedClip?.startTime ?? 0}
                        outTime={selectedClip?.endTime ?? Math.min(20, timelineDuration || 30)}
                        thumbs={timelineThumbs}
                        waveform={timelineWave}
                        scan={scanResult}
                        videoRef={sourceVideoRef}
                        onTrim={({ inTime, outTime }) => {
                          if (!selectedClip) return;
                          setClipPlans((prev) =>
                            prev.map((c) =>
                              c.id === selectedClip.id
                                ? {
                                    ...c,
                                    startTime: round3(inTime),
                                    endTime: round3(outTime),
                                    duration: round3(Math.max(0.1, outTime - inTime)),
                                  }
                                : c,
                            ),
                          );
                        }}
                      />

                      {timelineThumbs.length === 0 && (
                        <div className="flex items-center gap-3">
                          <Button
                            variant="secondary"
                            icon={<Film size={13} />}
                            onClick={() => loadTimelineAssets(clipSourcePath)}
                            loading={loading.timelineAssets}
                          >
                            Generate thumbnails &amp; waveform
                          </Button>
                          <span className="caption">Required once per source — cached after.</span>
                        </div>
                      )}
                    </div>
                  )}

                  {scanResult && (
                    <div className="mt-7">
                      <div className="flex items-baseline justify-between pb-2 border-b border-[var(--rule)]">
                        <p className="eyebrow gold">
                          {scanResult.model ? `Smart scan · ${scanResult.model}` : "Auto-suggested moments"}
                        </p>
                        <span className="caption">
                          {scanResult.model ? (
                            <>
                              {scanResult.suggestions.length} clip{scanResult.suggestions.length === 1 ? "" : "s"} ·
                              {" "}{Math.round(scanResult.duration)}s
                              {scanResult.usage?.totalTokenCount ? ` · ${(scanResult.usage.totalTokenCount / 1000).toFixed(1)}k tokens` : ""}
                            </>
                          ) : (
                            <>
                              {scanResult.scenes.length} cut{scanResult.scenes.length === 1 ? "" : "s"} ·
                              {" "}{scanResult.peaks.length} loud window{scanResult.peaks.length === 1 ? "" : "s"} ·
                              {" "}{Math.round(scanResult.duration)}s
                            </>
                          )}
                        </span>
                      </div>
                      {scanResult.summary && (
                        <p className="mt-3 text-[0.875rem] text-ink leading-[1.6] max-w-[70ch] font-display [font-variation-settings:'opsz'_60]">
                          {scanResult.summary}
                        </p>
                      )}
                      {scanResult.crop.recommended && (
                        <p className="mt-2 text-[0.8rem] text-[var(--ink-muted)]">
                          Letterbox detected: cropdetect suggests {scanResult.crop.width}×{scanResult.crop.height} at offset {scanResult.crop.x},{scanResult.crop.y}.
                        </p>
                      )}
                      <ol className="mt-3 grid gap-0">
                        {scanResult.suggestions.length === 0 ? (
                          <li className="py-3 text-[var(--ink-muted)] text-[0.875rem]">
                            No drama detected in this pass. Try a longer source, or lower the scene threshold.
                          </li>
                        ) : scanResult.suggestions.map((suggestion, i) => (
                          <li
                            key={suggestion.id}
                            className="grid grid-cols-[36px_minmax(0,1fr)_auto_auto] items-baseline gap-4 py-3 border-b border-[var(--rule)] cursor-pointer hover:bg-[var(--paper-raised)]"
                            onClick={() => applySuggestion(suggestion)}
                          >
                            <span className="figure text-[0.95rem] text-[var(--ink-quiet)]">
                              {String(i + 1).padStart(2, "0")}
                            </span>
                            <div className="min-w-0">
                              <p className="text-[0.9rem] text-ink leading-tight">{suggestion.reason}</p>
                              <p className="caption mt-0.5">
                                {suggestion.type} · {suggestion.start.toFixed(1)}s – {suggestion.end.toFixed(1)}s
                              </p>
                            </div>
                            <span className="figure text-[0.95rem] text-[var(--ink)] tabular-nums">
                              score {suggestion.score.toFixed(2)}
                            </span>
                            <Button
                              variant="ghost"
                              icon={<Wand2 size={13} />}
                              onClick={(event) => { event.stopPropagation(); applySuggestion(suggestion); }}
                            >
                              Apply
                            </Button>
                          </li>
                        ))}
                      </ol>
                    </div>
                  )}
                </div>

                <div>
                  <p className="eyebrow pitch">Overlays &amp; render settings</p>
                  <h2 className="mt-1 text-ink pb-3 border-b border-[var(--rule-strong)]">Branding</h2>
                  <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-5">
                    <label className="field"><span>Watermark (eyebrow)</span><input value={watermarkText} onChange={(e) => setWatermarkText(e.target.value)} placeholder="THE MATCH SIGNAL" /></label>
                    <label className="field"><span>Headline (serif lead)</span><input value={headlineText} onChange={(e) => setHeadlineText(e.target.value)} placeholder="Matchup banner" /></label>
                    <label className="field"><span>Caption (bottom slab)</span><input value={captionText} onChange={(e) => setCaptionText(e.target.value)} placeholder="Tactical hook description" /></label>
                    <label className="field"><span>Accent (gold pull-quote)</span><input value={accentText} onChange={(e) => setAccentText(e.target.value)} placeholder="Optional score / stat line" /></label>
                  </div>

                  {/* Aspect picker */}
                  <div className="mt-7">
                    <div className="flex items-baseline justify-between pb-2 border-b border-[var(--rule)]">
                      <p className="eyebrow pitch">Aspects</p>
                      <span className="caption">{aspectSelection.length} of {ALL_ASPECTS.length}</span>
                    </div>
                    <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-x-3 gap-y-2">
                      {ALL_ASPECTS.map((key) => {
                        const labels: Record<AspectKey, string> = {
                          "9x16": "9:16 vertical",
                          "1x1": "1:1 square",
                          "16x9": "16:9 horizontal",
                          "4x5": "4:5 portrait",
                        };
                        const active = aspectSelection.includes(key);
                        return (
                          <button
                            key={key}
                            type="button"
                            onClick={() => toggleAspect(key)}
                            className={`text-left px-3 py-2 border transition-colors ${
                              active
                                ? "border-[var(--ink)] bg-[var(--paper-raised)] text-ink"
                                : "border-[var(--rule)] text-[var(--ink-muted)] hover:border-[var(--ink-muted)]"
                            }`}
                          >
                            <span className="figure block text-[0.95rem] tabular-nums">{key.replace("x", ":")}</span>
                            <span className="caption block mt-0.5">{labels[key].split(" ").slice(1).join(" ")}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Render mode + crop */}
                  <div className="mt-7 grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-5">
                    <label className="field">
                      <span>Render mode</span>
                      <select value={renderMode} onChange={(event) => setRenderMode(event.target.value as "rough" | "final")}>
                        <option value="final">Final · multi-aspect, ASS subs, 2-pass loudnorm</option>
                        <option value="rough">Rough fast cut · stream copy</option>
                      </select>
                    </label>
                    <label className="field">
                      <span>Crop mode</span>
                      <select value={cropMode} onChange={(event) => setCropMode(event.target.value as "fill" | "fit")}>
                        <option value="fill">Fill (centre crop)</option>
                        <option value="fit">Fit (letterbox to ink)</option>
                      </select>
                    </label>
                  </div>

                  {/* Transcript / Whisper row */}
                  <div className="mt-5 flex flex-wrap items-baseline justify-between gap-3 pb-2 border-b border-[var(--rule)]">
                    <div>
                      <p className="eyebrow pitch">Transcript</p>
                      <span className="caption">
                        {whisperConfigured === null
                          ? "Whisper status unknown — run engine check"
                          : whisperConfigured
                          ? `Whisper ready · ${transcriptCues.length} cue${transcriptCues.length === 1 ? "" : "s"} loaded`
                          : "Whisper model missing — download ggml-small.en.bin into ./models/"}
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="secondary"
                        icon={<Mic size={13} />}
                        onClick={() => selectedClip && transcribeClip(selectedClip)}
                        loading={loading.transcribe}
                        disabled={!selectedClip}
                      >
                        Transcribe selected clip
                      </Button>
                      {transcriptCues.length > 0 && (
                        <Button variant="ghost" icon={<Trash2 size={12} />} onClick={() => setTranscriptCues([])}>
                          Clear cues
                        </Button>
                      )}
                    </div>
                  </div>

                  <label
                    className={`mt-5 flex items-center gap-2 text-[0.875rem] select-none ${
                      gpuAvailable === false ? "text-[var(--ink-quiet)] cursor-not-allowed" : "text-[var(--ink-muted)] cursor-pointer"
                    }`}
                    title={
                      gpuAvailable === false
                        ? "FFmpeg runtime probe found no working NVENC/AMF encoder on this machine — likely an MX-series GPU with no video block, or no AMD GPU. Renders run on libx264."
                        : gpuAvailable === null
                        ? "Click 'Engine status' to probe GPU encoders."
                        : "NVENC / AMF detected — renders use it; CPU fallback engages on per-render failure."
                    }
                  >
                    <input
                      type="checkbox"
                      id="gpu-accel"
                      checked={gpuAcceleration && gpuAvailable !== false}
                      onChange={(e) => setGpuAcceleration(e.target.checked)}
                      disabled={gpuAvailable === false}
                      className="h-4 w-4 cursor-pointer"
                      style={{ accentColor: "var(--ink)" }}
                    />
                    {gpuAvailable === false
                      ? "GPU acceleration · not available on this machine (using libx264)"
                      : "Use GPU hardware acceleration (NVENC / AMF)"}
                  </label>
                </div>

                <div>
                  <div className="flex items-baseline justify-between pb-3 border-b border-[var(--rule-strong)] gap-4 flex-wrap">
                    <div>
                      <p className="eyebrow pitch">Clip plans</p>
                      <h2 className="mt-1 text-ink">Suggested cuts</h2>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="caption">
                        {Object.keys(renderJobIds).length > 0
                          ? `Rendering ${Object.keys(renderJobIds).length} of ${clipPlans.length}`
                          : `${clipPlans.length} plan${clipPlans.length === 1 ? "" : "s"}`}
                      </span>
                      <Button
                        variant="primary"
                        icon={<Scissors size={13} />}
                        onClick={renderAllClips}
                        disabled={
                          !clipSourcePath.trim() ||
                          aspectSelection.length === 0 ||
                          clipPlans.length === 0 ||
                          clipPlans.every((c) => Boolean(renderJobIds[c.id]))
                        }
                      >
                        Render all
                      </Button>
                    </div>
                  </div>
                  <div className="clip-plan-list">
                    {clipPlans.map((clip) => (
                      <article
                        className={`clip-plan-card ${selectedClip?.id === clip.id ? "active" : ""}`}
                        key={clip.id}
                        onClick={() => setSelectedClipId(clip.id)}
                      >
                        <div className="clip-plan-heading">
                          <div>
                            <p className="eyebrow pitch">{clip.preset}</p>
                            <h3>{clip.title}</h3>
                          </div>
                          <strong>{clip.duration}s</strong>
                        </div>
                        <p className="clip-hook">{clip.hook}</p>
                        <p>{clip.treatment}</p>
                        <div className="clip-meta-row">
                          <span>{clip.startTime}s – {clip.endTime}s</span>
                          <span>{clip.platforms.join(" · ")}</span>
                        </div>
                        <Button
                          variant="primary"
                          icon={<Scissors size={13} />}
                          onClick={(event) => {
                            event.stopPropagation();
                            void renderClip(clip);
                          }}
                          loading={renderingClipId === clip.id || Boolean(renderJobIds[clip.id])}
                          disabled={Boolean(renderJobIds[clip.id])}
                        >
                          {renderJobIds[clip.id] ? "Rendering…" : renderingClipId === clip.id ? "Starting" : "Render"}
                        </Button>
                        {/* Live ffmpeg progress for this clip's render. */}
                        <ClipRenderProgress
                          jobId={renderJobIds[clip.id] ?? null}
                          onDone={(payload) => handleRenderDone(clip.id, payload)}
                          onError={(message) => handleRenderError(clip.id, message)}
                        />
                      </article>
                    ))}
                    {clipPlans.length === 0 && (
                      <p className="text-[var(--ink-muted)] py-6">No plans yet — set a source and probe to generate clip suggestions.</p>
                    )}
                  </div>
                </div>
              </article>

              {/* Right column: output queue */}
              <aside className="min-w-0">
                <div className="flex items-baseline justify-between pb-3 border-b border-[var(--rule-strong)] gap-3 flex-wrap">
                  <div>
                    <p className="eyebrow pitch">Rendered clips</p>
                    <h2 className="mt-1 text-ink">Output queue</h2>
                  </div>
                  <div className="flex gap-2 items-center">
                    {selectedJobsToMerge.length >= 2 && (
                      <Button variant="primary" icon={<Layers size={13} />} onClick={mergeClips} loading={loading.mergeClips}>
                        Merge ({selectedJobsToMerge.length})
                      </Button>
                    )}
                    <Button
                      variant="primary"
                      icon={<Send size={13} />}
                      onClick={shipAllClips}
                      disabled={!renderJobs.length || !shipDestinations.length || Object.keys(shippingJobIds).length > 0}
                    >
                      Ship all
                    </Button>
                    <Button variant="danger" icon={<Trash2 size={13} />} onClick={() => { setRenderJobs([]); setSelectedJobsToMerge([]); setShipResults({}); }}>
                      Clear
                    </Button>
                  </div>
                </div>

                {/* Destination chip strip — persisted in localStorage. */}
                <div className="mt-3 flex items-center gap-x-2 gap-y-1 flex-wrap pb-3 border-b border-[var(--rule)]">
                  <span className="caption">Ship to:</span>
                  {ALL_SHIP_DESTINATIONS.map((key) => {
                    const labels: Record<ShipDestination, string> = {
                      "telegram-admin": "Telegram admin",
                      "telegram-public": "Telegram public",
                      "telegram-vip": "Telegram VIP",
                    };
                    const active = shipDestinations.includes(key);
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => toggleShipDestination(key)}
                        className={`px-3 py-1 text-[0.75rem] uppercase tracking-[0.04em] border transition-colors ${
                          active
                            ? "border-[var(--ink)] bg-[var(--paper-raised)] text-ink"
                            : "border-[var(--rule)] text-[var(--ink-muted)] hover:border-[var(--ink-muted)]"
                        }`}
                      >
                        {labels[key]}
                      </button>
                    );
                  })}
                </div>
                {renderJobs.length ? (
                  <div className="render-list">
                    {renderJobs.map((job) => {
                      const dims = job.width && job.height ? `${job.width}×${job.height}` : null;
                      const aspectLabel = job.aspect && job.aspect !== "source"
                        ? job.aspect.replace("x", ":")
                        : "source";
                      return (
                        <article className="render-card relative" key={job.id}>
                          <video controls src={job.publicUrl} />
                          <div>
                            <div className="flex items-start justify-between gap-3">
                              <h3 className="text-[0.95rem]">{job.title}</h3>
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
                                className="h-4 w-4 cursor-pointer mt-1"
                                style={{ accentColor: "var(--ink)" }}
                              />
                            </div>
                            <p className="caption">
                              <span className="figure text-ink tabular-nums">{aspectLabel}</span>
                              {dims ? ` · ${dims}` : ""}
                              {" · "}{job.mode} · {job.cropMode} · {Math.round(job.duration)}s
                              {job.encoder ? ` · ${job.encoder}` : ""}
                              {job.gpuFallback ? " · GPU→CPU fallback" : ""}
                            </p>
                            <a href={job.publicUrl} target="_blank" rel="noreferrer">Open clip</a>
                            <div className="flex gap-2 flex-wrap items-center">
                              <Button
                                variant="primary"
                                icon={<Send size={12} />}
                                onClick={() => shipClip(job)}
                                loading={shippingJobIds[job.id]}
                                disabled={!shipDestinations.length || shippingJobIds[job.id]}
                              >
                                Ship
                              </Button>
                              {job.command && (
                                <Button variant="ghost" icon={<Clipboard size={12} />} onClick={() => copy("Render Command", job.command!.join(" "))}>
                                  Copy command
                                </Button>
                              )}
                            </div>

                            {/* Ship results per destination — gold check for success,
                                red dot + tooltip on the error message for failures. */}
                            {shipResults[job.id]?.length ? (
                              <div className="flex flex-wrap gap-2 pt-1 text-[0.7rem] tracking-[0.04em] uppercase">
                                {shipResults[job.id].map((r, i) => {
                                  const labels: Record<string, string> = {
                                    "telegram-admin": "tg/admin",
                                    "telegram-public": "tg/public",
                                    "telegram-vip": "tg/vip",
                                  };
                                  const label = labels[r.destination] ?? r.destination;
                                  return (
                                    <span
                                      key={`${r.destination}-${i}`}
                                      title={r.error || (r.messageId ? `Message #${r.messageId}` : "")}
                                      className="flex items-center gap-1 border border-[var(--rule)] px-2 py-0.5"
                                      style={{ color: r.ok ? "var(--pitch)" : "var(--red)" }}
                                    >
                                      <span>{r.ok ? "✓" : "✗"}</span>
                                      <span className="text-[var(--ink-muted)]">{label}</span>
                                    </span>
                                  );
                                })}
                              </div>
                            ) : null}
                          </div>
                        </article>
                      );
                    })}
                  </div>
                ) : (
                  <p className="mt-5 text-[var(--ink-muted)] max-w-[44ch]">
                    Rendered clips will appear here, one per aspect ratio. Pick aspects, set a source path, and render a plan.
                  </p>
                )}
              </aside>
            </section>
          </section>
        )}

        {activeView === "review" && (
          <section className="flex flex-col gap-12">
            {/* Masthead */}
            <header className="border-t-2 border-ink pt-7 grid grid-cols-1 lg:grid-cols-[minmax(0,1.5fr)_minmax(280px,1fr)] gap-x-12 gap-y-6">
              <div>
                <p className="eyebrow gold">Operator Review · {selectedFixture.teamA} vs {selectedFixture.teamB}</p>
                <h1 className="mt-3 text-ink">Approve the signal before it leaves the room.</h1>
                <p className="mt-5 max-w-[58ch] text-[1rem] leading-[1.55] text-[var(--ink-muted)]">
                  Review safety notes, mark outcomes, and feed post-match lessons back into the intelligence loop.
                </p>
                <div className="hr-gold mt-4" />
              </div>
              <div className="lg:self-end flex flex-col gap-2">
                <Button variant="primary" icon={<ShieldCheck size={14} />} onClick={() => updateFixture(selectedFixture.id, { contentStatus: "Approved" })}>
                  Approve match
                </Button>
                <Button variant="secondary" icon={<RefreshCcw size={14} />} onClick={() => updateFixture(selectedFixture.id, { contentStatus: "Draft" })}>
                  Return to draft
                </Button>
                <Button variant="secondary" icon={<Sparkles size={14} />} onClick={() => updateFixture(selectedFixture.id, { contentStatus: "Posted" })}>
                  Mark posted
                </Button>
              </div>
            </header>

            {/* Safety checker */}
            <section>
              <div className="flex items-baseline justify-between pb-3 border-b border-[var(--rule-strong)]">
                <div>
                  <p className="eyebrow pitch">Safety checker</p>
                  <h2 className="mt-1 text-ink">Pre-publish guard</h2>
                </div>
                <span className="caption">{content.safetyNotes.length} note{content.safetyNotes.length === 1 ? "" : "s"}</span>
              </div>
              <ol className="mt-5 grid gap-0 border-t border-[var(--rule)]">
                {content.safetyNotes.map((note, i) => (
                  <li key={note} className="grid grid-cols-[40px_minmax(0,1fr)] py-4 border-b border-[var(--rule)] border-l-2 border-l-[var(--gold)] pl-3 text-[0.95rem] leading-[1.55] text-[var(--ink-muted)]">
                    <span className="figure text-[1.1rem] text-[var(--ink-quiet)]">{String(i + 1).padStart(2, "0")}</span>
                    <span className="text-ink">{note}</span>
                  </li>
                ))}
              </ol>
              <Button variant="danger" icon={<Trash2 size={14} />} onClick={() => setFixtures(fixtures.filter((fixture) => fixture.id !== selectedFixture.id))} className="mt-5">
                Remove fixture
              </Button>
            </section>

            {/* Learning loop */}
            <section>
              <div className="flex items-baseline justify-between pb-3 border-b border-[var(--rule-strong)]">
                <div>
                  <p className="eyebrow pitch">Analytics agent</p>
                  <h2 className="mt-1 text-ink">Learning loop</h2>
                </div>
                <span className="caption">model read rate · {accuracyRate}</span>
              </div>

              <section className="signal-meters border-y border-[var(--rule)] mt-5">
                <Metric label="Prediction coverage" value={`${fixtures.length}/${fixtures.length}`} />
                <Metric label="Queued videos" value={String(fixtures.length)} />
                <Metric label="Model read rate" value={accuracyRate} />
                <Metric label="Reviewed matches" value={`${completedRecords}/${fixtures.length}`} />
              </section>

              <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-x-8 gap-y-5">
                <LabeledInput label="Final score" value={selectedAccuracy.finalScore} onChange={(finalScore) => updateAccuracy({ finalScore })} />
                <LabeledInput label="Actual winner" value={selectedAccuracy.actualWinner} onChange={(actualWinner) => updateAccuracy({ actualWinner })} />
                <label className="field">
                  <span>Model read</span>
                  <select
                    value={selectedAccuracy.modelRead}
                    onChange={(event) => updateAccuracy({ modelRead: event.target.value as AccuracyRecord["modelRead"] })}
                  >
                    <option>Pending</option>
                    <option>Right</option>
                    <option>Partial</option>
                    <option>Wrong</option>
                  </select>
                </label>
                <label className="field md:col-span-3">
                  <span>Post-match lesson</span>
                  <textarea
                    value={selectedAccuracy.lesson}
                    onChange={(event) => updateAccuracy({ lesson: event.target.value })}
                    placeholder="What did the model learn from the match?"
                  />
                </label>
              </div>
              <p className="mt-4 max-w-[68ch] text-[0.875rem] leading-[1.55] text-[var(--ink-muted)]">
                This view tracks football-intelligence outcomes and content priority. The next engineering move is wiring these records to Supabase or Google Sheets, then letting n8n trigger Telegram previews and Remotion renders.
              </p>
            </section>
          </section>
        )}

        {activeView === "vip" && (
          <section className="flex flex-col gap-12">
            {/* Masthead */}
            <header className="border-t-2 border-ink pt-7 grid grid-cols-1 lg:grid-cols-[minmax(0,1.5fr)_minmax(280px,1fr)] gap-x-12 gap-y-6">
              <div>
                <p className="eyebrow gold">VIP Desk — gated picks layer</p>
                <h1 className="mt-3 text-ink">Value picks, sober delivery.</h1>
                <p className="mt-5 max-w-[58ch] text-[1rem] leading-[1.55] text-[var(--ink-muted)]">
                  Picks are computed server-side from team-rating model probability and current book prices: fractional Kelly stake (0.25×, capped 2u), minimum +4% EV, responsible-gambling footer auto-appended. Only published to the private VIP channel — never public Telegram, never social.
                </p>
                <div className="hr-gold mt-4" />
              </div>
              <div className="lg:self-end flex flex-col gap-2">
                <Button variant="secondary" icon={<RefreshCcw size={14} />} onClick={() => void previewVipPicks()} loading={loading.previewVipPicks}>
                  Recompute picks
                </Button>
                <Button
                  variant="primary"
                  icon={<Send size={14} />}
                  onClick={sendTelegramVip}
                  loading={loading.sendTelegramVip}
                  disabled={!vipPublishEnabled || vipPicks.length === 0}
                >
                  Send to VIP channel
                </Button>
              </div>
            </header>

            {/* Scope banner — non-dismissible */}
            <section
              className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-x-10 gap-y-3 py-5 border-y"
              style={{ borderColor: "var(--rule-strong)", background: "var(--paper-raised)" }}
            >
              <div>
                <p className="eyebrow gold">VIP scope</p>
                <p className="mt-1 text-[0.92rem] leading-[1.55] text-ink max-w-[58ch]">
                  Audience: opt-in subscribers in jurisdictions where sports-wagering content is permitted. 18+ / 21+ where required. No public re-broadcast of any pick or odds line.
                </p>
              </div>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                <dt className="caption">Channel configured</dt>
                <dd className="text-ink">{vipPublishEnabled ? "Yes" : "No"}</dd>
                <dt className="caption">Jurisdictions</dt>
                <dd className="text-ink">{vipJurisdictions.length ? vipJurisdictions.join(", ") : "—"}</dd>
                <dt className="caption">Fixture</dt>
                <dd className="text-ink truncate">{selectedFixture.teamA} vs {selectedFixture.teamB}</dd>
                <dt className="caption">Open picks</dt>
                <dd className="text-ink">{vipPicks.length}</dd>
              </dl>
            </section>

            {/* Picks list */}
            <section>
              <div className="flex items-baseline justify-between pb-3 border-b border-[var(--rule-strong)]">
                <div>
                  <p className="eyebrow pitch">Open value picks</p>
                  <h2 className="mt-1 text-ink">{selectedFixture.teamA} vs {selectedFixture.teamB}</h2>
                </div>
                <span className="caption">
                  {selectedFixture.homeOdds ? `Home ${Number(selectedFixture.homeOdds).toFixed(2)}` : "Home —"}
                  {" · "}
                  {selectedFixture.drawOdds ? `Draw ${Number(selectedFixture.drawOdds).toFixed(2)}` : "Draw —"}
                  {" · "}
                  {selectedFixture.awayOdds ? `Away ${Number(selectedFixture.awayOdds).toFixed(2)}` : "Away —"}
                </span>
              </div>
              {vipPicks.length === 0 ? (
                <p className="mt-5 max-w-[60ch] text-[var(--ink-muted)]">
                  No value picks at current prices. Either the book has the line right (no edge), or odds haven't been loaded yet. Use the Market Feed action in Command to pull current prices, then recompute.
                </p>
              ) : (
                <div className="mt-2 grid gap-0 border-t border-[var(--rule)]">
                  {vipPicks.map((pick) => (
                    <article key={pick.id} className="grid grid-cols-[56px_minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)] gap-x-6 py-5 border-b border-[var(--rule)] items-baseline">
                      <span className="figure text-[1.6rem] leading-none text-ink">{(pick.ev * 100).toFixed(1)}<span className="text-[var(--ink-quiet)] text-[0.7rem]">%EV</span></span>
                      <div>
                        <h3 className="text-ink font-display [font-variation-settings:'opsz'_60] font-medium text-[1.05rem] tracking-[-0.015em]">
                          {pick.market} · {pick.side}
                          <span className="text-[var(--ink-quiet)] font-normal italic font-display ml-2">({pick.label})</span>
                        </h3>
                        <p className="caption mt-1">{pick.bookName} @ <span className="figure">{pick.bookPrice.toFixed(2)}</span></p>
                      </div>
                      <div>
                        <p className="caption">Model vs implied</p>
                        <p className="mt-1 text-ink"><span className="figure">{(pick.modelProb * 100).toFixed(1)}%</span> <span className="text-[var(--ink-quiet)]">/ {(pick.impliedProb * 100).toFixed(1)}%</span></p>
                      </div>
                      <div>
                        <p className="caption">Stake · confidence</p>
                        <p className="mt-1 text-ink"><span className="figure">{pick.stakeUnits.toFixed(2)}u</span> <span className="text-[var(--ink-quiet)]">· {pick.confidence}</span></p>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>

            {/* VIP message preview */}
            <section>
              <div className="flex items-baseline justify-between pb-3 border-b border-[var(--rule-strong)]">
                <div>
                  <p className="eyebrow pitch">VIP channel preview</p>
                  <h2 className="mt-1 text-ink">Exact text that will be sent</h2>
                </div>
                {vipMessage && (
                  <Button variant="ghost" icon={<Clipboard size={13} />} onClick={() => copy("VIP", vipMessage)}>
                    {copied === "VIP" ? "Copied" : "Copy"}
                  </Button>
                )}
              </div>
              {vipMessage ? (
                <pre className="mt-4 max-h-[420px]">{vipMessage}</pre>
              ) : (
                <p className="mt-5 max-w-[60ch] text-[var(--ink-muted)]">
                  Nothing to preview yet. Picks must exist before a message is built.
                </p>
              )}
            </section>

            {/* Operator notes */}
            <section className="grid grid-cols-1 md:grid-cols-3 gap-x-10 gap-y-4 py-5 border-y border-[var(--rule)]">
              <div>
                <p className="eyebrow pitch">Public surfaces</p>
                <p className="mt-2 text-[0.92rem] leading-[1.55] text-[var(--ink-muted)]">
                  Editorial Telegram, public channel, and social pass through a server-side safety filter. Any pick/odds/EV/book token gets rejected with HTTP 422.
                </p>
              </div>
              <div>
                <p className="eyebrow pitch">Stake discipline</p>
                <p className="mt-2 text-[0.92rem] leading-[1.55] text-[var(--ink-muted)]">
                  Stake = 0.25 × full Kelly, capped at 2u, floor 0.25u. Anything below the floor publishes as zero — the channel stays small and disciplined.
                </p>
              </div>
              <div>
                <p className="eyebrow pitch">Audit trail</p>
                <p className="mt-2 text-[0.92rem] leading-[1.55] text-[var(--ink-muted)]">
                  Every published pick writes a row to <span className="font-mono text-ink">pick_log</span> in Supabase (best-effort): market, side, model prob, book price, EV, stake, timestamp. Used later for closing-line value tracking.
                </p>
              </div>
            </section>
          </section>
        )}
      </section>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<App />);


