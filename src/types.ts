export type FixtureStatus = "Scheduled" | "Live" | "Final";
export type ContentStatus = "Draft" | "Approved" | "Posted";
export type View = "command" | "data" | "lab" | "brand" | "content" | "video" | "automation" | "review" | "vip";

// A single value pick. Numbers come from server/services/picks.mjs (Kelly +
// EV math), not from the model's freeform text. Confidence is derived from EV.
export type Pick = {
  id: string;
  fixtureId: string;
  market: "1X2" | "Over/Under" | "BTTS";
  side: "Home" | "Draw" | "Away" | "Over" | "Under" | "Yes" | "No";
  label: string;
  line?: number | null;
  modelProb: number;
  fairProb?: number | null;
  edge?: number | null;
  devigMethod?: string | null;
  bookName: string;
  bookPrice: number;
  impliedProb: number;
  ev: number;
  stakeUnits: number;
  confidence: "Low" | "Medium" | "High";
  createdAt: string;
};

export type GodModeModel = {
  lambdaHome: number;
  lambdaAway: number;
  expectedTotal: number;
  markets: {
    oneXtwo: { home: number; draw: number; away: number };
    doubleChance: { homeOrDraw: number; homeOrAway: number; drawOrAway: number };
    totals: Array<{ line: number; over: number; under: number }>;
    btts: { yes: number; no: number };
    drawNoBet: { home: number; away: number };
  };
  topScorelines: Array<{ score: string; home: number; away: number; prob: number }>;
};

export type GodModeDiagnosticCandidate = {
  market: Pick["market"];
  side: Pick["side"];
  label: string;
  line?: number | null;
  modelProb: number;
  fairProb?: number | null;
  edge?: number | null;
  bookName?: string;
  bookPrice?: number | null;
  impliedProb?: number | null;
  ev?: number | null;
  stakeUnits: number;
  confidence: Pick["confidence"];
  status: "qualified" | "watchlist";
  reasons: string[];
};

export type GodModeDiagnostics = {
  grade: "Attack" | "Measured" | "Small edge" | "No bet" | "Needs odds";
  signalScore: number;
  thresholds: {
    minEv: number;
    minEdge: number;
    maxExposureUnits: number;
    kellyFraction: number;
    unitBankrollPct: number;
  };
  exposure: {
    totalStake: number;
    pickCount: number;
    capped: boolean;
  };
  riskFlags: string[];
  watchlist: GodModeDiagnosticCandidate[];
  marketDiagnostics: GodModeDiagnosticCandidate[];
};

export type VipPreviewResponse = {
  ok: boolean;
  picks: Pick[];
  message: string | null;
  model?: GodModeModel | null;
  diagnostics?: GodModeDiagnostics | null;
  totalStake?: number;
  vipPublishEnabled: boolean;
  jurisdictions: string[];
};

export type VipPublishResponse = {
  ok: boolean;
  published?: boolean;
  pickCount?: number;
  picks?: Pick[];
  model?: GodModeModel | null;
  diagnostics?: GodModeDiagnostics | null;
  totalStake?: number;
  audit?: { logged: boolean; count?: number; error?: string };
  reason?: string;
};

export type Fixture = {
  id: string;
  date: string;
  time: string;
  teamA: string;
  teamB: string;
  stage: string;
  venue: string;
  status: FixtureStatus;
  contentStatus: ContentStatus;
  sourceId?: string;
  homeOdds?: number;
  drawOdds?: number;
  awayOdds?: number;
};

export type TeamRating = {
  team: string;
  form: number;
  attack: number;
  defense: number;
  midfield: number;
  depth: number;
  coach: number;
  injuryImpact: number;
  motivation: number;
};

export type Prediction = {
  matchId: string;
  winnerLean: string;
  expectedScore: string;
  confidence: number;
  upsetRisk: "Low" | "Medium" | "High";
  goalPotential: "Low" | "Medium" | "High";
  redFlags: string[];
  storyline: string;
  keyPlayer: string;
  marketRead?: string;
};

export type Scenario = {
  title: string;
  trigger: string;
  signal: string;
  contentAngle: string;
};

export type AccuracyRecord = {
  matchId: string;
  finalScore: string;
  actualWinner: string;
  modelRead: "Right" | "Partial" | "Wrong" | "Pending";
  lesson: string;
};

export type ContextSignal = {
  label: string;
  score: number;
  note: string;
};

export type MarketContext = {
  attentionScore: number;
  volatilityScore: number;
  mediaMomentum: "Low" | "Medium" | "High";
  fanPressure: "Low" | "Medium" | "High";
  signals: ContextSignal[];
};

export type ProviderHealth = {
  ok: boolean;
  providers: Record<string, { configured: boolean; envName: string }>;
};

export type AppSnapshot = {
  fixtures: Fixture[];
  ratings: TeamRating[];
  accuracy: AccuracyRecord[];
  aiContent: Record<string, ContentPack>;
};

export type StandingRow = {
  team: string;
  rank: number;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
  outcome?: string;
};

export type StandingGroup = {
  group: string;
  rows: StandingRow[];
};

export type MatchIntel = {
  summary?: any;
  lineups?: any;
  timeline?: any;
  momentum?: any;
};

export type StateResponse = {
  ok: boolean;
  source?: string;
  state: null | Partial<AppSnapshot>;
  counts?: Record<string, number>;
};

export type ProviderBadge = {
  key: string;
  label: string;
  requires?: string[];
};

export type ContentPack = {
  telegram: string;
  xPost: string;
  thread: string;
  shortsScript: string;
  videoTitle: string;
  reportSection: string;
  /**
   * Editorial market signal — attention, volatility, narrative pressure.
   * Public-safe. No picks, no odds, no book names, no stake language.
   */
  marketContext: string;
  /**
   * @deprecated kept for Supabase row back-compat. Use marketContext.
   */
  bettingAngle: string;
  safetyNotes: string[];
};

export type SocialPlatform = {
  platform: string;
  format: string;
  creative: string;
  caption: string;
  hook: string;
  cta: string;
  cadence: string;
};

export type ClipPlan = {
  id: string;
  matchId: string;
  clipType: string;
  preset: string;
  title: string;
  hook: string;
  startTime: number;
  endTime: number;
  duration: number;
  platforms: string[];
  treatment: string;
  reason: string;
  status: string;
};

export type AspectKey = "9x16" | "1x1" | "16x9" | "4x5";

export type RenderJob = {
  id: string;
  title: string;
  matchId: string;
  clipType: string;
  aspect?: AspectKey | "source";
  mode: string;
  cropMode: string;
  startTime: number;
  duration: number;
  width?: number | null;
  height?: number | null;
  platforms?: string[];
  encoder?: string;
  sourcePath: string;
  outputPath: string;
  publicUrl: string;
  startedAt?: string;
  completedAt: string;
  command?: string[];
  gpuAcceleration?: boolean;
  gpuFallback?: boolean;
};

export type VideoSourceCandidate = {
  id: string;
  provider: string;
  title: string;
  matchTitle: string;
  competition: string;
  date: string;
  thumbnail?: string;
  embed?: string;
  url?: string;
  sourceUrl?: string;
  rightsStatus: "editable" | "embed_only" | "needs_rights_check" | string;
  rightsLabel: string;
  editable: boolean;
  importable: boolean;
  reason: string;
  notes: string;
};

export type VideoSourceSearchResponse = {
  ok: boolean;
  sources: VideoSourceCandidate[];
  providers: Array<{
    key: string;
    label: string;
    configured: boolean;
    mode: string;
    rightsMode: string;
  }>;
  errors: Array<{ provider: string; message: string; status?: number; details?: unknown }>;
  catalog?: Array<{
    key: string;
    label: string;
    category: string;
    status: string;
    editable: boolean | "license_dependent";
    docs: string;
    note: string;
  }>;
};

// /api/video/scan -> ScanResult
export type ClipSuggestion = {
  id: string;
  type: "signal" | "emotion" | "context" | "recap";
  start: number;
  end: number;
  duration: number;
  score: number;
  reason: string;
};

export type ScanScene = { time: number; score: number | null };
export type ScanPeak = { time: number; duration: number };
export type ScanCrop = {
  recommended: boolean;
  width: number;
  height: number;
  x: number;
  y: number;
};

export type ScanResult = {
  source: string;
  duration: number;
  width?: number;
  height?: number;
  fps?: number;
  hasAudio?: boolean;
  crop: ScanCrop;
  scenes: ScanScene[];
  peaks: ScanPeak[];
  suggestions: ClipSuggestion[];
  // Present when the scan came from /api/video/gemini-scan:
  summary?: string;
  model?: string;
  usage?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
  };
};

// /api/video/transcribe -> TranscriptCue[]
export type TranscriptCue = {
  start: number;
  end: number;
  text: string;
};

export type TranscriptResult = {
  modelPath: string;
  startSeconds: number;
  durationSeconds: number;
  cues: TranscriptCue[];
  srtPath: string;
  jsonPath: string;
  log: string;
};

// /api/video/youtube/probe -> YouTubeInfo
export type YouTubeInfo = {
  id: string;
  title: string;
  channel: string;
  channelUrl?: string;
  duration: number;
  uploadDate?: string | null;
  viewCount?: number;
  description?: string;
  thumbnail?: string | null;
  webpageUrl: string;
  bestProgressiveHeight?: number | null;
  isLive?: boolean;
};

export type YouTubeDownloadResult = {
  id: string;
  sourceRelPath: string;
  publicUrl: string;
  cached: boolean;
  info: YouTubeInfo;
};

export type YouTubeStatus = {
  configured: boolean;
  kind: "binary" | "python" | "bundled" | "missing";
  version: string | null;
  suggestion: string | null;
};

// /api/video/status -> aspects array element
export type AspectInfo = {
  key: AspectKey;
  label: string;
  width: number;
  height: number;
  platforms: string[];
};

export type VideoEngineStatus = {
  ok: boolean;
  ffmpeg: {
    configured: boolean;
    version?: string;
    error?: string;
    encoders?: Record<string, boolean>;
  };
  whisper: {
    configured: boolean;
    modelPath: string;
    suggestion: string | null;
  };
  aspects: AspectInfo[];
  outputDir: string;
  publicBaseUrl: string;
};
