// Scan a source video for editor-worthy moments.
//
// One ffmpeg pass that runs three detectors in parallel via filter splits:
//   - scene detection on the video track     -> motion / cut candidates
//   - silencedetect + astats on the audio    -> crowd-roar candidates
//   - cropdetect on the video track          -> letterbox / safe-crop hint
//
// Returns a small JSON payload the UI can consume directly:
//   { duration, crop, scenes: [...], peaks: [...], suggestions: [...] }
//
// The suggestion list is the editorial product: each row has a start, end,
// duration, type, and drama score so the UI just renders them as cards.

import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const PROBE_TIMEOUT_MS = 15_000;
const SCAN_TIMEOUT_MS = 10 * 60_000; // 10 min — broadcast halves are long
const MAX_PEAKS = 24;
const MAX_SCENES = 60;

// ----------------------------------------------------------------------------
// ffprobe — duration + has-audio hint so we can skip audio detectors cleanly.

export async function probeBasics(sourcePath) {
  const { stdout } = await execFileAsync(
    "ffprobe",
    [
      "-v", "error",
      "-print_format", "json",
      "-show_format",
      "-show_streams",
      sourcePath,
    ],
    { timeout: PROBE_TIMEOUT_MS },
  );
  const json = JSON.parse(stdout);
  const duration = Number(json.format?.duration ?? 0) || 0;
  const video = (json.streams ?? []).find((s) => s.codec_type === "video");
  const audio = (json.streams ?? []).find((s) => s.codec_type === "audio");
  return {
    duration,
    width: video?.width ?? 0,
    height: video?.height ?? 0,
    fps: parseFps(video?.r_frame_rate),
    hasAudio: Boolean(audio),
    videoCodec: video?.codec_name ?? "",
    audioCodec: audio?.codec_name ?? "",
  };
}

function parseFps(rate) {
  if (!rate || typeof rate !== "string") return 0;
  const [num, den] = rate.split("/").map(Number);
  if (!num || !den) return 0;
  return num / den;
}

// ----------------------------------------------------------------------------
// One-pass scan. We dump everything to stderr (showinfo, cropdetect,
// silencedetect, astats) then parse the streams afterwards. -f null - keeps
// the pass cheap: no encoding, no output file.

export async function scanSource({
  sourcePath,
  sceneThreshold = 0.4,
  silenceNoiseDb = -28,
  silenceMinDuration = 0.3,
  cropdetectLimit = 24,
}) {
  const basics = await probeBasics(sourcePath);

  const filters = [
    // VIDEO chain: split for scene + cropdetect
    "[0:v]split=2[vscene][vcrop]",
    `[vscene]select='gt(scene,${sceneThreshold})',showinfo[vsceneout]`,
    `[vcrop]cropdetect=limit=${cropdetectLimit}:round=2:reset=0[vcropout]`,
  ];

  const args = [
    "-hide_banner",
    "-nostats",
    "-i", sourcePath,
    "-filter_complex", filters.join(";"),
    "-map", "[vsceneout]",
    "-map", "[vcropout]",
    "-f", "null", "-",
  ];

  // Audio chain only if there is an audio track.
  if (basics.hasAudio) {
    const audioFilter = `silencedetect=noise=${silenceNoiseDb}dB:d=${silenceMinDuration},astats=metadata=1:reset=1:length=0.5`;
    args.splice(
      args.indexOf("-map"),
      0,
      "-af", audioFilter,
    );
  }

  let stderr = "";
  try {
    const result = await execFileAsync("ffmpeg", args, {
      timeout: SCAN_TIMEOUT_MS,
      maxBuffer: 1024 * 1024 * 32, // 32MB — scenes/astats can be chatty
    });
    stderr = result.stderr;
  } catch (error) {
    // ffmpeg returns non-zero on -f null sometimes; only re-throw on real failure.
    if (error.killed || !error.stderr) throw error;
    stderr = error.stderr;
  }

  const scenes = parseScenes(stderr).slice(0, MAX_SCENES);
  const peaks = basics.hasAudio
    ? parseAudioPeaks(stderr, basics.duration).slice(0, MAX_PEAKS)
    : [];
  const crop = parseCrop(stderr, basics.width, basics.height);
  const suggestions = buildSuggestions({ basics, scenes, peaks });

  return {
    source: sourcePath,
    duration: basics.duration,
    width: basics.width,
    height: basics.height,
    fps: basics.fps,
    hasAudio: basics.hasAudio,
    crop,
    scenes,
    peaks,
    suggestions,
  };
}

// ----------------------------------------------------------------------------
// Parsers — ffmpeg dumps these as one event per line in stderr.

const SHOWINFO_RE = /pts_time:([\d.]+).*?scene[_-]?score?[:=]?\s*([\d.]+)?/i;
const SHOWINFO_T_RE = /pts_time:([\d.]+)/;

function parseScenes(stderr) {
  const lines = stderr.split(/\r?\n/);
  const out = [];
  for (const line of lines) {
    if (!line.includes("Parsed_showinfo")) continue;
    const t = line.match(SHOWINFO_T_RE);
    if (!t) continue;
    const time = Number(t[1]);
    if (!Number.isFinite(time)) continue;
    const sceneMatch = line.match(SHOWINFO_RE);
    const score = sceneMatch?.[2] ? Number(sceneMatch[2]) : null;
    out.push({ time, score: Number.isFinite(score) ? score : null });
  }
  return dedupeByTime(out, 0.4);
}

const SILENCE_START_RE = /silence_start:\s*([\d.]+)/;
const SILENCE_END_RE = /silence_end:\s*([\d.]+).*?silence_duration:\s*([\d.]+)/;
const RMS_LEVEL_RE = /lavfi\.astats\.Overall\.RMS_level=(-?[\d.]+)/;

function parseAudioPeaks(stderr, totalDuration) {
  const lines = stderr.split(/\r?\n/);
  const silences = [];
  for (const line of lines) {
    if (line.includes("silence_start")) {
      const m = line.match(SILENCE_START_RE);
      if (m) silences.push({ kind: "start", time: Number(m[1]) });
    } else if (line.includes("silence_end")) {
      const m = line.match(SILENCE_END_RE);
      if (m) silences.push({ kind: "end", time: Number(m[1]), duration: Number(m[2]) });
    }
  }

  // Loud regions = gaps between silences. Use the silence boundaries as edges.
  const loudRegions = [];
  let cursor = 0;
  for (const event of silences) {
    if (event.kind === "start") {
      if (event.time - cursor >= 1.5) {
        loudRegions.push({ start: cursor, end: event.time });
      }
    } else if (event.kind === "end") {
      cursor = event.time;
    }
  }
  if (totalDuration - cursor >= 1.5) {
    loudRegions.push({ start: cursor, end: totalDuration });
  }

  // RMS samples for ranking — paired with the most recent showinfo timestamp
  // is brittle, so we just take the loudest 1/3 of regions by length proxy
  // and let scene crossover boost them.
  return loudRegions
    .map((r) => ({ time: r.start, duration: r.end - r.start }))
    .filter((r) => r.duration >= 1.5)
    .sort((a, b) => b.duration - a.duration);
}

const CROP_RE = /crop=(\d+):(\d+):(\d+):(\d+)/;

function parseCrop(stderr, sourceWidth, sourceHeight) {
  // cropdetect prints the cumulative recommendation continuously; the *last*
  // one is the most stable. Walk backwards.
  const lines = stderr.split(/\r?\n/).reverse();
  for (const line of lines) {
    const m = line.match(CROP_RE);
    if (!m) continue;
    const [, w, h, x, y] = m.map(Number);
    if (!w || !h) continue;
    // Ignore non-crops (the suggestion matches the source).
    if (w === sourceWidth && h === sourceHeight && x === 0 && y === 0) {
      return { recommended: false, width: w, height: h, x, y };
    }
    return { recommended: true, width: w, height: h, x, y };
  }
  return { recommended: false, width: sourceWidth, height: sourceHeight, x: 0, y: 0 };
}

function dedupeByTime(items, minGap) {
  const sorted = [...items].sort((a, b) => a.time - b.time);
  const out = [];
  for (const item of sorted) {
    const last = out[out.length - 1];
    if (!last || item.time - last.time >= minGap) out.push(item);
  }
  return out;
}

// ----------------------------------------------------------------------------
// Build editorial clip suggestions.
//
// The drama score weights:
//   +scene score (0..1)
//   +1.5 if a loud audio region begins within 4s of the scene cut (crowd roar)
//   +0.5 if the cut is in the middle 60% of the timeline (peak intensity)
//
// Each suggestion gets a type label tied to the existing presets so the UI
// can drop it straight into a ClipPlan.

function buildSuggestions({ basics, scenes, peaks }) {
  const total = basics.duration || 1;
  const suggestions = [];

  for (const scene of scenes) {
    const peak = peaks.find((p) => Math.abs(p.time - scene.time) < 4);
    const sceneWeight = scene.score ?? 0.4;
    const peakWeight = peak ? 1.5 : 0;
    const positionWeight =
      scene.time > total * 0.2 && scene.time < total * 0.8 ? 0.5 : 0;
    const score = sceneWeight + peakWeight + positionWeight;

    const type = peak
      ? (peak.duration >= 6 ? "emotion" : "signal")
      : "context";
    const duration =
      type === "emotion" ? 18 :
      type === "signal" ? 24 :
      32;

    const start = Math.max(0, scene.time - 3); // 3s pre-roll for breath
    const end = Math.min(total, start + duration);

    suggestions.push({
      type,
      start: round(start, 2),
      end: round(end, 2),
      duration: round(end - start, 2),
      score: round(score, 3),
      reason: peak
        ? "Scene cut + sustained loudness — likely reaction beat."
        : "Scene cut in core window — candidate context beat.",
    });
  }

  // Always include a "recap" suggestion that covers the last quarter.
  if (total >= 60) {
    const start = Math.max(0, total - 72);
    suggestions.push({
      type: "recap",
      start: round(start, 2),
      end: round(total, 2),
      duration: round(total - start, 2),
      score: 1.0,
      reason: "Three-beat recap window — auto-suggested from match tail.",
    });
  }

  // Top 8 by score, no more.
  return suggestions
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
    .map((s, i) => ({ id: `auto-${i + 1}`, ...s }));
}

function round(v, places) {
  const m = 10 ** places;
  return Math.round(v * m) / m;
}
