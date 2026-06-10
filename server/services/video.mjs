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

// Media files only ever live under data/ (source videos) or artifacts/
// (renders, downloads, transcripts). We intentionally do NOT allow the whole
// project root: .env, server source, and package files sit there too.
export const MEDIA_ROOTS = [
  path.resolve(rootDir, "data"),
  path.resolve(rootDir, "artifacts"),
];

// Resolve a caller-supplied media path to an absolute path, but ONLY if it
// lands inside one of MEDIA_ROOTS. Without this containment check the routes
// that feed user input here — /api/video/stream, /api/video/probe,
// /api/clips/render — would read or stream arbitrary host files, including
// this project's own .env (?path=.env) or any file via ?path=..\..\secret.
// Anything outside the media roots resolves to "", which the callers already
// treat as a 400/404.
export const resolveMediaPath = (sourcePath) => {
  const raw = String(sourcePath ?? "").trim();
  if (!raw) return "";
  const resolved = path.isAbsolute(raw) ? path.resolve(raw) : path.resolve(rootDir, raw);
  const allowed = MEDIA_ROOTS.some(
    (root) => resolved === root || resolved.startsWith(root + path.sep),
  );
  return allowed ? resolved : "";
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

// Runtime-probe an encoder by actually trying to encode 1 frame of testsrc.
// FFmpeg may *advertise* `h264_nvenc` because it was compiled in, but the
// runtime can still fail on hardware without an NVENC silicon block (e.g.
// the NVIDIA MX-series, where CUDA cores exist but video engine doesn't).
// We cache the result for the lifetime of the process so we never pay this
// probe more than once.
const encoderProbeCache = new Map(); // name -> { ok, error? }

async function probeEncoderRuntime(name, extraArgs = []) {
  if (encoderProbeCache.has(name)) return encoderProbeCache.get(name);
  const args = [
    "-y", "-hide_banner", "-nostats",
    "-f", "lavfi",
    "-i", "color=c=black:s=320x180:d=0.04:r=25",
    "-frames:v", "1",
    "-c:v", name,
    ...extraArgs,
    "-f", "null", "-",
  ];
  try {
    await execFileAsync("ffmpeg", args, { timeout: 12_000 });
    const result = { ok: true };
    encoderProbeCache.set(name, result);
    return result;
  } catch (error) {
    const tail = (error.stderr || error.message || "")
      .split(/\r?\n/).filter(Boolean).slice(-2).join(" / ");
    const result = { ok: false, error: tail };
    encoderProbeCache.set(name, result);
    return result;
  }
}

export const ffmpegHealth = async () => {
  try {
    const { stdout: versionOut } = await execFileAsync("ffmpeg", ["-version"], { timeout: 8000 });
    const { stdout: encodersOut } = await execFileAsync("ffmpeg", ["-encoders"], { timeout: 8000 });
    const version = versionOut.split(/\r?\n/)[0];

    // Candidate GPU encoders that the build advertises.
    const candidates = [
      { name: "h264_nvenc",  present: encodersOut.includes("h264_nvenc") },
      { name: "h264_amf",    present: encodersOut.includes("h264_amf") },
      { name: "hevc_nvenc",  present: encodersOut.includes("hevc_nvenc") },
      { name: "hevc_amf",    present: encodersOut.includes("hevc_amf") },
      { name: "av1_nvenc",   present: encodersOut.includes("av1_nvenc") },
      { name: "av1_amf",     present: encodersOut.includes("av1_amf") },
    ];

    // Runtime-validate each candidate in parallel. The probes are tiny
    // (~50ms each on a working encoder, ~500ms on a failure) so this barely
    // costs anything per health check, and the result is cached anyway.
    const probed = await Promise.all(
      candidates.map(async (c) => {
        if (!c.present) return { ...c, runtime: false };
        const result = await probeEncoderRuntime(c.name);
        return { ...c, runtime: result.ok, runtimeError: result.error ?? null };
      }),
    );

    // Shape stays backwards-compatible with the existing render pipeline:
    // each encoder key is a plain boolean. We also expose `runtimeChecks`
    // with the per-encoder error so the UI can surface "why".
    const encoders = {};
    const runtimeChecks = {};
    for (const p of probed) {
      encoders[p.name] = p.runtime;
      runtimeChecks[p.name] = { present: p.present, runtime: p.runtime, error: p.runtimeError };
    }
    const anyGpu = Object.values(encoders).some(Boolean);

    return {
      configured: true,
      version,
      encoders,
      runtimeChecks,
      gpuAvailable: anyGpu,
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
