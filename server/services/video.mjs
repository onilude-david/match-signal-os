import { execFile } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "../..");
export const artifactsDir = path.join(rootDir, "artifacts");
export const clipsDir = path.join(artifactsDir, "clips");

export const execFileAsync = promisify(execFile);

export const videoPresets = {
  signal: {
    label: "Signal Clip",
    duration: 24,
    treatment: "Freeze-frame setup, tight crop, tactical label, one clear match signal.",
    platform: ["youtubeShorts", "tiktok", "instagramReels"],
  },
  emotion: {
    label: "Emotion Clip",
    duration: 18,
    treatment: "Fast pacing, crowd/audio emphasis, reaction-first framing, minimal text.",
    platform: ["tiktok", "instagramReels"],
  },
  context: {
    label: "Context Clip",
    duration: 35,
    treatment: "Hook, replay/context beat, short explanation, comment prompt.",
    platform: ["youtubeShorts", "instagramReels", "youtube"],
  },
  recap: {
    label: "Premium Recap",
    duration: 72,
    treatment: "Three-beat story: setup, turning point, lesson. Best for post-match or long Shorts.",
    platform: ["youtube", "instagramReels"],
  },
};

export const clipStartSuggestions = {
  signal: 0,
  emotion: 8,
  context: 15,
  recap: 0,
};

export const asSeconds = (value, fallback = 0) => {
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric >= 0) return numeric;
  if (typeof value !== "string") return fallback;
  const parts = value.split(":").map((part) => Number(part.trim()));
  if (parts.some((part) => !Number.isFinite(part) || part < 0)) return fallback;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return fallback;
};

export const secondsToTimestamp = (seconds) => {
  const safe = Math.max(0, Number(seconds) || 0);
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const secs = Math.floor(safe % 60);
  const ms = Math.round((safe - Math.floor(safe)) * 1000);
  const base = [hours, minutes, secs].map((part) => String(part).padStart(2, "0")).join(":");
  return ms ? `${base}.${String(ms).padStart(3, "0")}` : base;
};

export const slug = (value) =>
  String(value ?? "clip")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "clip";

export const resolveMediaPath = (sourcePath) => {
  const raw = String(sourcePath ?? "").trim();
  if (!raw) return "";
  return path.isAbsolute(raw) ? raw : path.resolve(rootDir, raw);
};

export const buildClipPlans = ({ fixture = {}, prediction = {}, content = {} }) => {
  const matchup = `${fixture.teamA ?? "Team A"} vs ${fixture.teamB ?? "Team B"}`;
  const signal = prediction.storyline || content.shortsScript || "Watch the first control phase and the pressure after the first goal.";
  const base = [
    {
      type: "signal",
      title: `${matchup}: The Signal`,
      hook: "This is the moment to watch.",
      reason: signal,
    },
    {
      type: "emotion",
      title: `${matchup}: Pressure Moment`,
      hook: "The pressure shows before the goal.",
      reason: `${prediction.upsetRisk ?? "Medium"} volatility creates a reaction-first clip candidate.`,
    },
    {
      type: "context",
      title: `${matchup}: Why It Matters`,
      hook: "Here is why this match can swing.",
      reason: `Expected score ${prediction.expectedScore ?? "TBD"} with ${prediction.confidence ?? "?"}/10 confidence.`,
    },
    {
      type: "recap",
      title: `${matchup}: Match Signal Recap`,
      hook: "Three signals from this match.",
      reason: "Use after full-time or for a longer YouTube-native breakdown.",
    },
  ];

  return base.map((item) => {
    const preset = videoPresets[item.type];
    const startTime = clipStartSuggestions[item.type] ?? 0;
    return {
      id: `${fixture.id ?? "match"}-${item.type}`,
      matchId: fixture.id ?? "",
      clipType: item.type,
      preset: preset.label,
      title: item.title,
      hook: item.hook,
      startTime,
      endTime: startTime + preset.duration,
      duration: preset.duration,
      platforms: preset.platform,
      treatment: preset.treatment,
      reason: item.reason,
      status: "Planned",
    };
  });
};

export const ffmpegHealth = async () => {
  try {
    const { stdout: versionOut } = await execFileAsync("ffmpeg", ["-version"], { timeout: 8000 });
    const { stdout: encodersOut } = await execFileAsync("ffmpeg", ["-encoders"], { timeout: 8000 });
    const version = versionOut.split(/\r?\n/)[0];
    const hasNvenc = encodersOut.includes("h264_nvenc");
    const hasAmf = encodersOut.includes("h264_amf");
    return {
      configured: true,
      version,
      encoders: {
        h264_nvenc: hasNvenc,
        h264_amf: hasAmf,
      },
    };
  } catch (error) {
    return { configured: false, error: error.message };
  }
};

export const buildRenderArgs = ({
  sourcePath,
  outputPath,
  startTime,
  duration,
  mode,
  cropMode,
  watermarkText = "",
  headlineText = "",
  captionText = "",
  gpuAcceleration = false,
  availableEncoders = {},
}) => {
  const start = secondsToTimestamp(startTime);
  const length = secondsToTimestamp(duration);
  if (mode === "rough") {
    return ["-y", "-ss", start, "-i", sourcePath, "-t", length, "-map", "0", "-c", "copy", "-movflags", "+faststart", outputPath];
  }

  let videoFilter = cropMode === "fit"
    ? "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:black,setsar=1"
    : "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1";

  const fontPath = "C\\:/Windows/Fonts/arial.ttf";

  if (watermarkText) {
    const cleanWatermark = watermarkText.replace(/'/g, "'\\\\''").replace(/:/g, "\\:");
    videoFilter += `,drawtext=fontfile='${fontPath}':text='${cleanWatermark}':fontcolor=0xC8962F:fontsize=28:x=(w-tw)/2:y=100:box=1:boxcolor=black@0.4:boxborderw=10`;
  }

  if (headlineText) {
    const cleanHeadline = headlineText.replace(/'/g, "'\\\\''").replace(/:/g, "\\:");
    videoFilter += `,drawtext=fontfile='${fontPath}':text='${cleanHeadline}':fontcolor=white:fontsize=44:x=(w-tw)/2:y=200:box=1:boxcolor=black@0.5:boxborderw=15`;
  }

  if (captionText) {
    const cleanCaption = captionText.replace(/'/g, "'\\\\''").replace(/:/g, "\\:");
    videoFilter += `,drawtext=fontfile='${fontPath}':text='${cleanCaption}':fontcolor=0x10b981:fontsize=36:x=(w-tw)/2:y=h-260:box=1:boxcolor=black@0.5:boxborderw=12`;
  }

  let vcodec = "libx264";
  let encoderArgs = ["-c:v", vcodec];
  if (gpuAcceleration) {
    if (availableEncoders?.h264_nvenc) {
      vcodec = "h264_nvenc";
      encoderArgs = ["-c:v", vcodec, "-preset", "fast", "-b:v", "4M"];
    } else if (availableEncoders?.h264_amf) {
      vcodec = "h264_amf";
      encoderArgs = ["-c:v", vcodec, "-b:v", "4M"];
    } else {
      encoderArgs = ["-c:v", vcodec, "-preset", "veryfast", "-crf", "20"];
    }
  } else {
    encoderArgs = ["-c:v", vcodec, "-preset", "veryfast", "-crf", "20"];
  }

  return [
    "-y",
    "-ss",
    start,
    "-i",
    sourcePath,
    "-t",
    length,
    "-vf",
    videoFilter,
    "-af",
    "loudnorm=I=-16:TP=-1.5:LRA=11",
    ...encoderArgs,
    "-c:a",
    "aac",
    "-b:a",
    "192k",
    "-movflags",
    "+faststart",
    outputPath,
  ];
};
