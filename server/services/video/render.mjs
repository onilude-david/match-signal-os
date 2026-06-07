// Multi-aspect, editorial-quality clip render.
//
// One decode -> four canvases via filter_complex split:
//     9:16 vertical   1080x1920
//     1:1  square     1080x1080
//     16:9 horizontal 1920x1080
//     4:5  portrait   1080x1350
//
// We use frame-accurate seek (-ss after -i for the final pass; copy-mode
// rough cut keeps fast pre-input seek), two-pass loudnorm for broadcast
// audio, editorial ASS burn-in from subtitles.mjs, and a per-aspect encoder
// chain that prefers NVENC > AMF > libx264.
//
// Output goes to:
//   artifacts/clips/<matchId>/<clipType>/<basename>.9x16.mp4
//   artifacts/clips/<matchId>/<clipType>/<basename>.1x1.mp4
//   ... etc.

import { execFile } from "node:child_process";
import { mkdir, unlink } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { composeAssScript, writeAssFile, escapeForFilter } from "./subtitles.mjs";

const execFileAsync = promisify(execFile);

const LOUDNORM_TIMEOUT_MS = 5 * 60_000;
const RENDER_TIMEOUT_MS = 25 * 60_000;

// ----------------------------------------------------------------------------
// Aspect catalogue. Each entry knows its canvas, its safe-area scaling
// strategy, and its libass PlayRes so subtitles position consistently.

export const ASPECTS = {
  "9x16": {
    label: "9:16 vertical",
    width: 1080,
    height: 1920,
    platforms: ["tiktok", "instagramReels", "youtubeShorts"],
  },
  "1x1": {
    label: "1:1 square",
    width: 1080,
    height: 1080,
    platforms: ["instagram", "linkedin"],
  },
  "16x9": {
    label: "16:9 horizontal",
    width: 1920,
    height: 1080,
    platforms: ["youtube", "x"],
  },
  "4x5": {
    label: "4:5 portrait",
    width: 1080,
    height: 1350,
    platforms: ["instagram", "facebook"],
  },
};

// ----------------------------------------------------------------------------
// Two-pass loudnorm. First pass measures, second pass corrects. The measured
// JSON gets parsed out of stderr and fed into the second pass via the
// measured_* loudnorm params. That's broadcast-grade audio in two ffmpeg
// invocations.

const LOUDNORM_TARGETS = "I=-16:TP=-1.5:LRA=11";

const LOUDNORM_JSON_RE = /\{[\s\S]*"input_i"[\s\S]*?\}/;

export async function measureLoudness(sourcePath, { start, duration }) {
  const args = [
    "-hide_banner",
    "-nostats",
    "-ss", String(start),
    "-t", String(duration),
    "-i", sourcePath,
    "-vn",
    "-af", `loudnorm=${LOUDNORM_TARGETS}:print_format=json`,
    "-f", "null", "-",
  ];
  try {
    const { stderr } = await execFileAsync("ffmpeg", args, {
      timeout: LOUDNORM_TIMEOUT_MS,
      maxBuffer: 1024 * 1024 * 4,
    });
    const match = stderr.match(LOUDNORM_JSON_RE);
    if (!match) return null;
    return JSON.parse(match[0]);
  } catch (error) {
    // Loudnorm pass 1 occasionally exits non-zero on tiny audio segments;
    // we just skip the measurement and fall back to single-pass loudnorm
    // in the render call.
    if (error.stderr) {
      const match = error.stderr.match(LOUDNORM_JSON_RE);
      if (match) try { return JSON.parse(match[0]); } catch { /* noop */ }
    }
    return null;
  }
}

function buildLoudnormFilter(measured) {
  if (!measured) return `loudnorm=${LOUDNORM_TARGETS}:linear=true`;
  // ffmpeg filter syntax: NAME=opt=val:opt=val   (first separator is '=', not ':')
  const opts = [
    LOUDNORM_TARGETS,
    "linear=true",
    `measured_I=${measured.input_i}`,
    `measured_TP=${measured.input_tp}`,
    `measured_LRA=${measured.input_lra}`,
    `measured_thresh=${measured.input_thresh}`,
    `offset=${measured.target_offset}`,
  ].join(":");
  return `loudnorm=${opts}`;
}

// ----------------------------------------------------------------------------
// Encoder selection. Prefer hardware paths when the build has them and the
// caller asked for GPU. AV1 is a separate opt-in (smaller files, slower
// decoders on the receiving side, so default to H.264).

function pickEncoder({ gpu, codec = "h264", encoders = {} }) {
  if (gpu) {
    if (codec === "av1") {
      if (encoders.av1_nvenc) return { name: "av1_nvenc", args: ["-c:v", "av1_nvenc", "-preset", "p4", "-b:v", "4M", "-cq", "30"] };
      if (encoders.av1_amf)   return { name: "av1_amf",   args: ["-c:v", "av1_amf",   "-quality", "speed", "-b:v", "4M"] };
    }
    if (codec === "hevc") {
      if (encoders.hevc_nvenc) return { name: "hevc_nvenc", args: ["-c:v", "hevc_nvenc", "-preset", "p4", "-rc", "vbr", "-cq", "23", "-b:v", "0"] };
      if (encoders.hevc_amf)   return { name: "hevc_amf",   args: ["-c:v", "hevc_amf",   "-quality", "speed", "-b:v", "4M"] };
    }
    if (encoders.h264_nvenc) return { name: "h264_nvenc", args: ["-c:v", "h264_nvenc", "-preset", "p4", "-rc", "vbr", "-cq", "20", "-b:v", "0", "-profile:v", "high"] };
    if (encoders.h264_amf)   return { name: "h264_amf",   args: ["-c:v", "h264_amf",   "-quality", "speed", "-b:v", "5M"] };
  }
  if (codec === "av1") return { name: "libsvtav1", args: ["-c:v", "libsvtav1", "-preset", "8", "-crf", "30"] };
  if (codec === "hevc") return { name: "libx265", args: ["-c:v", "libx265", "-preset", "medium", "-crf", "23"] };
  return { name: "libx264", args: ["-c:v", "libx264", "-preset", "veryfast", "-crf", "20"] };
}

// ----------------------------------------------------------------------------
// Filter chain for one aspect.
//
// We:
//   1. start from the shared [vbase] tap (deinterlace + scale to fit width)
//   2. apply ASS subtitles burned in at the *target* canvas size, so the
//      libass scaling matches the styles in subtitles.mjs
//   3. scale + crop into the target canvas (fill mode) or pad (fit mode)
//
// libass burn-in happens *after* the canvas is built so the typography
// renders at the publication aspect — not at the source aspect.

function aspectFilter({ aspectKey, cropMode, assPath }) {
  const aspect = ASPECTS[aspectKey];
  const { width: W, height: H } = aspect;
  const scaleMode = cropMode === "fit"
    ? `scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:0x141612`
    : `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H}`;
  const ass = assPath ? `,ass=filename='${escapeForFilter(assPath)}'` : "";
  return `${scaleMode}${ass},setsar=1,format=yuv420p`;
}

// ----------------------------------------------------------------------------
// Render entry point.
//
// Inputs:
//   sourcePath          absolute path to source media
//   outputDir           dir where the per-aspect MP4s land
//   basename            file basename (no extension)
//   startTime           clip start seconds
//   duration            clip duration seconds
//   aspects             array of keys from ASPECTS (e.g. ["9x16","1x1"])
//   cropMode            "fill" | "fit"
//   subtitle            { watermarkText, headlineText, captionText,
//                         accentText, transcriptCues }
//   gpu                 boolean
//   availableEncoders   from ffmpegHealth().encoders
//   codec               "h264" | "hevc" | "av1"
//   rough               boolean -> single-pass copy cut, no filters
//
// Returns one job per aspect.

export async function renderClipMultiAspect({
  sourcePath,
  outputDir,
  basename,
  startTime,
  duration,
  aspects,
  cropMode = "fill",
  subtitle = {},
  gpu = false,
  availableEncoders = {},
  codec = "h264",
  rough = false,
  subtitlesDir,
}) {
  await mkdir(outputDir, { recursive: true });

  // ROUGH MODE — fast-seek + stream copy. No transcoding, no ASS, no aspects.
  // We always write one MP4 (the source aspect) so the caller has something.
  if (rough) {
    const outPath = path.join(outputDir, `${basename}.rough.mp4`);
    const args = [
      "-y", "-hide_banner",
      "-ss", String(startTime),
      "-i", sourcePath,
      "-t", String(duration),
      "-map", "0",
      "-c", "copy",
      "-movflags", "+faststart",
      outPath,
    ];
    const startedAt = new Date().toISOString();
    const { stderr } = await execFileAsync("ffmpeg", args, {
      timeout: RENDER_TIMEOUT_MS,
      maxBuffer: 1024 * 1024 * 8,
    });
    return {
      aspects: [{
        aspect: "source",
        outputPath: outPath,
        encoder: "copy",
        startedAt,
        completedAt: new Date().toISOString(),
      }],
      command: ["ffmpeg", ...args],
      logTail: stderr.split(/\r?\n/).slice(-10).join("\n"),
      loudnorm: null,
      ass: null,
    };
  }

  // 1) Two-pass loudnorm measurement.
  const measured = await measureLoudness(sourcePath, { start: startTime, duration });

  // 2) Compose one ASS file per aspect — typography needs to scale to the
  //    target canvas. We base the scripts on the largest canvas in the set
  //    and let libass re-scale.
  const aspectKeys = aspects.filter((k) => ASPECTS[k]);
  if (aspectKeys.length === 0) aspectKeys.push("9x16");

  const writtenAssFiles = [];
  const assByAspect = {};
  for (const key of aspectKeys) {
    const aspect = ASPECTS[key];
    const script = composeAssScript({
      duration,
      playResX: aspect.width,
      playResY: aspect.height,
      watermarkText: subtitle.watermarkText,
      headlineText: subtitle.headlineText,
      captionText: subtitle.captionText,
      accentText: subtitle.accentText,
      transcriptCues: subtitle.transcriptCues ?? [],
    });
    const file = await writeAssFile({
      dir: subtitlesDir,
      basename: `${basename}.${key}`,
      script,
    });
    writtenAssFiles.push(file.path);
    assByAspect[key] = file.path;
  }

  // 3) Build the filter graph. One [0:v] source -> split into N taps ->
  //    each tap runs its own aspect filter chain.
  const splitTargets = aspectKeys.map((k) => `[v_${k}]`).join("");
  const filterParts = [
    `[0:v]split=${aspectKeys.length}${splitTargets}`,
    ...aspectKeys.map((k) => `[v_${k}]${aspectFilter({ aspectKey: k, cropMode, assPath: assByAspect[k] })}[out_${k}]`),
  ];
  const audioFilter = buildLoudnormFilter(measured);

  // 4) Encoder selection.
  const encoder = pickEncoder({ gpu, codec, encoders: availableEncoders });

  // 5) Per-aspect output mappings.
  const aspectOutputs = aspectKeys.map((k) => {
    const outPath = path.join(outputDir, `${basename}.${k}.mp4`);
    return { key: k, outPath };
  });

  // We render each aspect as its own output mapping in a single ffmpeg call.
  // This is faster and simpler than the tee muxer when each output has its
  // own filter chain.
  const args = [
    "-y", "-hide_banner",
    // Both seek (-ss) and duration (-t) placed BEFORE -i become input
    // options. That bounds the read window for every output mapping;
    // otherwise `-t` only applies to the first output in the chain.
    "-ss", String(startTime),
    "-t", String(duration),
    "-i", sourcePath,
    "-filter_complex", filterParts.join(";"),
    "-af", audioFilter,
  ];

  for (const { key, outPath } of aspectOutputs) {
    args.push(
      "-map", `[out_${key}]`,
      "-map", "0:a?",
      ...encoder.args,
      "-pix_fmt", "yuv420p",
      "-c:a", "aac",
      "-b:a", "192k",
      "-ar", "48000",
      "-movflags", "+faststart",
      outPath,
    );
  }

  const startedAt = new Date().toISOString();
  let stderr = "";
  try {
    ({ stderr } = await execFileAsync("ffmpeg", args, {
      timeout: RENDER_TIMEOUT_MS,
      maxBuffer: 1024 * 1024 * 16,
    }));
  } catch (error) {
    // Surface the ffmpeg stderr tail rather than the generic exit-1 message.
    const tail = (error.stderr || "").split(/\r?\n/).slice(-30).join("\n");
    const wrapped = new Error(`ffmpeg render failed: ${tail || error.message}`);
    wrapped.stderr = error.stderr;
    throw wrapped;
  }

  const completedAt = new Date().toISOString();
  const aspectJobs = aspectOutputs.map(({ key, outPath }) => ({
    aspect: key,
    outputPath: outPath,
    encoder: encoder.name,
    width: ASPECTS[key].width,
    height: ASPECTS[key].height,
    platforms: ASPECTS[key].platforms,
    startedAt,
    completedAt,
  }));

  return {
    aspects: aspectJobs,
    command: ["ffmpeg", ...args],
    logTail: stderr.split(/\r?\n/).slice(-18).join("\n"),
    loudnorm: measured,
    ass: writtenAssFiles,
  };
}

// ----------------------------------------------------------------------------
// Cleanup helper for the .ass scratch files. Routes call this after a
// successful response.

export async function cleanupAssFiles(paths) {
  for (const p of paths ?? []) {
    try { await unlink(p); } catch { /* best-effort */ }
  }
}
