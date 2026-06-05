export type FixtureStatus = "Scheduled" | "Live" | "Final";
export type ContentStatus = "Draft" | "Approved" | "Posted";
export type View = "command" | "data" | "lab" | "brand" | "content" | "video" | "automation" | "review";

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

export type RenderJob = {
  id: string;
  title: string;
  matchId: string;
  clipType: string;
  mode: string;
  cropMode: string;
  startTime: number;
  duration: number;
  sourcePath: string;
  outputPath: string;
  publicUrl: string;
  completedAt: string;
  command: string[];
};
