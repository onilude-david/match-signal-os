import express from "express";
import { createReadStream } from "node:fs";
import { access, mkdir, stat, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { jsonError } from "../config/env.mjs";
import {
  ffmpegHealth,
  resolveMediaPath,
  buildClipPlans,
  slug,
  asSeconds,
  clipsDir,
  artifactsDir,
  execFileAsync,
} from "../services/video.mjs";
import { scanSource, probeBasics } from "../services/video/scan.mjs";
import { transcribeSource, whisperStatus } from "../services/video/transcribe.mjs";
import {
  ASPECTS,
  renderClipMultiAspect,
  cleanupAssFiles,
} from "../services/video/render.mjs";
import {
  generateThumbnails,
  generateWaveform,
} from "../services/video/thumbnails.mjs";

const router = express.Router();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "../..");
const subtitlesDir = path.join(rootDir, "artifacts", "subtitles");
const transcriptsDir = path.join(rootDir, "artifacts", "transcripts");

// ----------------------------------------------------------------------------
// STATUS

// GET /api/video/status
router.get("/video/status", async (_req, res) => {
  const ffmpeg = await ffmpegHealth();
  const whisper = await whisperStatus();
  res.json({
    ok: true,
    ffmpeg,
    whisper,
    aspects: Object.entries(ASPECTS).map(([key, value]) => ({ key, ...value })),
    outputDir: clipsDir,
    publicBaseUrl: "/artifacts/clips",
  });
});

// GET /api/video/whisper/status
router.get("/video/whisper/status", async (_req, res) => {
  const status = await whisperStatus();
  res.json({ ok: true, whisper: status });
});

// ----------------------------------------------------------------------------
// STREAM (unchanged — used by the in-browser preview)

router.get("/video/stream", async (req, res) => {
  const rawPath = req.query.path;
  if (!rawPath) {
    jsonError(res, 400, "path is required.");
    return;
  }
  const sourcePath = resolveMediaPath(rawPath);
  try {
    await access(sourcePath);
    const stats = await stat(sourcePath);
    const totalSize = stats.size;
    const range = req.headers.range;

    if (range) {
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : totalSize - 1;

      if (start >= totalSize || end >= totalSize || start > end) {
        res.writeHead(416, { "Content-Range": `bytes */${totalSize}` });
        res.end();
        return;
      }

      const chunkSize = end - start + 1;
      const fileStream = createReadStream(sourcePath, { start, end });
      res.writeHead(206, {
        "Content-Range": `bytes ${start}-${end}/${totalSize}`,
        "Accept-Ranges": "bytes",
        "Content-Length": chunkSize,
        "Content-Type": "video/mp4",
      });
      fileStream.pipe(res);
    } else {
      res.writeHead(200, {
        "Content-Length": totalSize,
        "Content-Type": "video/mp4",
      });
      createReadStream(sourcePath).pipe(res);
    }
  } catch (error) {
    jsonError(res, 404, "Video file not found or inaccessible.", error.message);
  }
});

// POST /api/video/sample
router.post("/video/sample", async (_req, res) => {
  const outputPath = resolveMediaPath("data/sample_video.mp4");
  const dataDir = path.dirname(outputPath);
  try {
    await mkdir(dataDir, { recursive: true });
    const args = [
      "-y",
      "-f", "lavfi",
      "-i", "testsrc=duration=30:size=1280x720:rate=30",
      "-f", "lavfi",
      "-i", "sine=frequency=1000:duration=30",
      "-c:v", "libx264",
      "-c:a", "aac",
      "-pix_fmt", "yuv420p",
      outputPath,
    ];
    await execFileAsync("ffmpeg", args, { timeout: 30000 });
    res.json({ ok: true, path: "data/sample_video.mp4" });
  } catch (error) {
    jsonError(res, 500, "Failed to generate sample video.", error.message);
  }
});

// POST /api/video/probe
router.post("/video/probe", async (req, res) => {
  const sourcePath = resolveMediaPath(req.body?.sourcePath);
  if (!sourcePath) {
    jsonError(res, 400, "sourcePath is required.");
    return;
  }
  try {
    await access(sourcePath);
    const { stdout } = await execFileAsync(
      "ffprobe",
      ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", sourcePath],
      { timeout: 15000 },
    );
    res.json({ ok: true, sourcePath, probe: JSON.parse(stdout) });
  } catch (error) {
    jsonError(res, 400, "Video probe failed. Check that the file exists and FFprobe can read it.", error.message);
  }
});

// ----------------------------------------------------------------------------
// NEW: THUMBNAILS — N evenly-spaced JPEGs for the timeline scrubber

router.post("/video/thumbnails", async (req, res) => {
  const sourcePath = resolveMediaPath(req.body?.sourcePath);
  if (!sourcePath) {
    jsonError(res, 400, "sourcePath is required.");
    return;
  }
  const count = Math.max(20, Math.min(240, Number(req.body?.count) || 120));
  const width = Math.max(60, Math.min(360, Number(req.body?.width) || 180));
  try {
    await access(sourcePath);
    const result = await generateThumbnails({ sourcePath, count, width });
    res.json({ ok: true, thumbnails: result });
  } catch (error) {
    jsonError(res, 500, "Thumbnail generation failed.", error.stderr || error.message);
  }
});

// ----------------------------------------------------------------------------
// NEW: WAVEFORM — wide PNG of the audio waveform for the timeline backdrop

router.post("/video/waveform", async (req, res) => {
  const sourcePath = resolveMediaPath(req.body?.sourcePath);
  if (!sourcePath) {
    jsonError(res, 400, "sourcePath is required.");
    return;
  }
  const width = Math.max(640, Math.min(3840, Number(req.body?.width) || 1920));
  const height = Math.max(48, Math.min(240, Number(req.body?.height) || 96));
  try {
    await access(sourcePath);
    const result = await generateWaveform({ sourcePath, width, height });
    res.json({ ok: true, waveform: result });
  } catch (error) {
    jsonError(res, 500, "Waveform generation failed.", error.stderr || error.message);
  }
});

// ----------------------------------------------------------------------------
// NEW: SCAN — scene + audio peak + cropdetect in one pass; returns suggestions

// POST /api/video/scan
router.post("/video/scan", async (req, res) => {
  const sourcePath = resolveMediaPath(req.body?.sourcePath);
  if (!sourcePath) {
    jsonError(res, 400, "sourcePath is required.");
    return;
  }
  const sceneThreshold = Number(req.body?.sceneThreshold ?? 0.4);
  const silenceNoiseDb = Number(req.body?.silenceNoiseDb ?? -28);
  const silenceMinDuration = Number(req.body?.silenceMinDuration ?? 0.3);

  try {
    await access(sourcePath);
    const result = await scanSource({
      sourcePath,
      sceneThreshold: Number.isFinite(sceneThreshold) ? sceneThreshold : 0.4,
      silenceNoiseDb: Number.isFinite(silenceNoiseDb) ? silenceNoiseDb : -28,
      silenceMinDuration: Number.isFinite(silenceMinDuration) ? silenceMinDuration : 0.3,
    });
    res.json({ ok: true, scan: result });
  } catch (error) {
    jsonError(res, 500, "Scan failed.", error.stderr || error.message);
  }
});

// ----------------------------------------------------------------------------
// NEW: TRANSCRIBE — local Whisper, returns SRT path and JSON cues

// POST /api/video/transcribe
router.post("/video/transcribe", async (req, res) => {
  const sourcePath = resolveMediaPath(req.body?.sourcePath);
  if (!sourcePath) {
    jsonError(res, 400, "sourcePath is required.");
    return;
  }
  const startSeconds = asSeconds(req.body?.startTime, 0);
  const requestedEnd = req.body?.endTime === undefined ? null : asSeconds(req.body.endTime, startSeconds + 30);
  const requestedDuration = req.body?.duration === undefined ? null : asSeconds(req.body.duration, 30);
  const durationSeconds = requestedEnd !== null
    ? Math.max(0.5, requestedEnd - startSeconds)
    : Math.max(0.5, requestedDuration ?? 30);
  const language = String(req.body?.language ?? "auto");
  const basename = `${Date.now()}-${slug(req.body?.title ?? "transcript")}`;

  try {
    await access(sourcePath);
    const result = await transcribeSource({
      sourcePath,
      startSeconds,
      durationSeconds,
      language,
      destDir: transcriptsDir,
      basename,
    });
    // Trim cue timestamps to clip-local already because we used -ss/-t.
    const cues = result.cues.map((c) => ({
      ...c,
      // Clamp to clip window in case Whisper overshoots.
      start: Math.max(0, Math.min(durationSeconds, c.start)),
      end: Math.max(0, Math.min(durationSeconds, c.end)),
    }));
    res.json({
      ok: true,
      transcript: {
        modelPath: result.modelPath,
        startSeconds,
        durationSeconds,
        cues,
        srtPath: `/artifacts/transcripts/${path.basename(result.srtPath)}`,
        jsonPath: `/artifacts/transcripts/${path.basename(result.jsonPath)}`,
        log: result.log,
      },
    });
  } catch (error) {
    const status = error.code === "WHISPER_MODEL_MISSING" ? 501 : 500;
    jsonError(res, status, "Transcription failed.", error.message);
  }
});

// ----------------------------------------------------------------------------
// CLIPS — plan, merge, render (multi-aspect)

// POST /api/clips/plan
router.post("/clips/plan", (req, res) => {
  res.json({
    ok: true,
    plans: buildClipPlans(req.body ?? {}),
  });
});

// POST /api/clips/merge — concat several rendered clips into one
router.post("/clips/merge", async (req, res) => {
  const clipPathsInput = req.body?.clipPaths;
  if (!Array.isArray(clipPathsInput) || clipPathsInput.length < 2) {
    jsonError(res, 400, "clipPaths array with at least two paths is required.");
    return;
  }

  const resolvedPaths = clipPathsInput.map((p) => {
    if (p.startsWith("/artifacts/clips/")) {
      const rel = p.replace("/artifacts/clips/", "");
      return path.join(clipsDir, rel);
    }
    return resolveMediaPath(p);
  });

  try {
    for (const p of resolvedPaths) {
      await access(p);
    }

    await mkdir(clipsDir, { recursive: true });
    const tempTxtName = `temp-concat-${Date.now()}.txt`;
    const tempTxtPath = path.join(clipsDir, tempTxtName);

    const fileContent = resolvedPaths
      .map((p) => `file '${p.replace(/'/g, "'\\''").replace(/\\/g, "/")}'`)
      .join("\n");

    await writeFile(tempTxtPath, fileContent, "utf-8");

    const outputName = `merged-${Date.now()}-${slug(req.body?.title ?? "collection")}.mp4`;
    const outputPath = path.join(clipsDir, outputName);

    const args = ["-y", "-f", "concat", "-safe", "0", "-i", tempTxtPath, "-c", "copy", "-movflags", "+faststart", outputPath];

    const startedAt = new Date().toISOString();
    const { stderr } = await execFileAsync("ffmpeg", args, { timeout: 5 * 60 * 1000 });

    await unlink(tempTxtPath).catch(() => {});

    res.json({
      ok: true,
      job: {
        id: outputName.replace(/\.mp4$/, ""),
        title: req.body?.title ?? "Merged Highlight Reel",
        matchId: "merged",
        clipType: "merged",
        mode: "concat",
        cropMode: "fill",
        startTime: 0,
        duration: 0,
        sourcePath: resolvedPaths[0],
        outputPath,
        publicUrl: `/artifacts/clips/${outputName}`,
        startedAt,
        completedAt: new Date().toISOString(),
        command: ["ffmpeg", ...args],
        logTail: stderr.split(/\r?\n/).slice(-10).join("\n"),
      },
    });
  } catch (error) {
    jsonError(res, 500, "Clips merge failed.", error.stderr || error.message);
  }
});

// POST /api/clips/render
// Body:
//   sourcePath, title, matchId, clipType
//   mode: "rough" | "final"
//   startTime, endTime | duration
//   cropMode: "fill" | "fit"
//   aspects: ["9x16","1x1","16x9","4x5"]
//   watermarkText, headlineText, captionText, accentText
//   transcriptCues: [{ start, end, text }]
//   gpuAcceleration: boolean
//   codec: "h264" | "hevc" | "av1"
//
// Returns: { ok, jobs: [RenderJob, ...] } — one per requested aspect.
router.post("/clips/render", async (req, res) => {
  const sourcePath = resolveMediaPath(req.body?.sourcePath);
  const title = String(req.body?.title ?? "match-signal-clip");
  const matchId = slug(req.body?.matchId ?? "match");
  const clipType = slug(req.body?.clipType ?? "clip");
  const rough = req.body?.mode === "rough";
  const cropMode = req.body?.cropMode === "fit" ? "fit" : "fill";
  const startTime = asSeconds(req.body?.startTime, 0);
  const requestedEnd = req.body?.endTime === undefined ? null : asSeconds(req.body.endTime, startTime + 20);
  const requestedDuration = req.body?.duration === undefined ? null : asSeconds(req.body.duration, 20);
  const duration = Math.max(0.5, requestedEnd !== null ? requestedEnd - startTime : requestedDuration ?? 20);

  const requestedAspectsRaw = Array.isArray(req.body?.aspects) && req.body.aspects.length
    ? req.body.aspects
    : ["9x16"];
  const aspects = requestedAspectsRaw
    .map(String)
    .filter((k) => ASPECTS[k]);

  if (!aspects.length) {
    jsonError(res, 400, `Unknown aspect ratios. Allowed: ${Object.keys(ASPECTS).join(", ")}`);
    return;
  }

  if (!sourcePath) {
    jsonError(res, 400, "sourcePath is required.");
    return;
  }
  if (duration <= 0) {
    jsonError(res, 400, "Clip duration must be greater than zero.");
    return;
  }

  const subtitle = {
    watermarkText: String(req.body?.watermarkText ?? ""),
    headlineText: String(req.body?.headlineText ?? ""),
    captionText: String(req.body?.captionText ?? ""),
    accentText: String(req.body?.accentText ?? ""),
    transcriptCues: Array.isArray(req.body?.transcriptCues) ? req.body.transcriptCues : [],
  };

  const gpu = !!req.body?.gpuAcceleration;
  const codec = ["h264", "hevc", "av1"].includes(req.body?.codec) ? req.body.codec : "h264";

  try {
    await access(sourcePath);

    const healthInfo = await ffmpegHealth();
    const availableEncoders = healthInfo.configured ? healthInfo.encoders : {};

    // Group outputs under artifacts/clips/<matchId>/<clipType>/
    const outputDir = path.join(clipsDir, matchId, clipType);
    const basename = `${new Date().toISOString().replace(/[:.]/g, "-")}-${slug(title)}`;

    let result;
    let usedGpu = gpu;
    try {
      result = await renderClipMultiAspect({
        sourcePath,
        outputDir,
        basename,
        startTime,
        duration,
        aspects,
        cropMode,
        subtitle,
        gpu,
        availableEncoders,
        codec,
        rough,
        subtitlesDir,
      });
    } catch (error) {
      // GPU fallback: retry on CPU if the first pass was GPU and we're not rough-cutting.
      if (!gpu || rough) throw error;
      usedGpu = false;
      result = await renderClipMultiAspect({
        sourcePath,
        outputDir,
        basename,
        startTime,
        duration,
        aspects,
        cropMode,
        subtitle,
        gpu: false,
        availableEncoders,
        codec,
        rough,
        subtitlesDir,
      });
    }

    // Build per-aspect RenderJob payloads for the UI.
    const jobs = result.aspects.map((a) => {
      const relFromArtifacts = path.relative(artifactsDir, a.outputPath).split(path.sep).join("/");
      return {
        id: `${basename}-${a.aspect}`,
        title,
        matchId,
        clipType,
        aspect: a.aspect,
        mode: rough ? "rough" : "final",
        cropMode,
        startTime,
        duration,
        width: a.width ?? null,
        height: a.height ?? null,
        platforms: a.platforms ?? [],
        encoder: a.encoder,
        sourcePath,
        outputPath: a.outputPath,
        publicUrl: `/artifacts/${relFromArtifacts}`,
        startedAt: a.startedAt,
        completedAt: a.completedAt,
        gpuAcceleration: usedGpu,
        gpuFallback: gpu && !usedGpu,
      };
    });

    // Cleanup .ass scratch files.
    await cleanupAssFiles(result.ass);

    res.json({
      ok: true,
      jobs,
      loudnorm: result.loudnorm,
      command: result.command,
      logTail: result.logTail,
    });
  } catch (error) {
    jsonError(res, 500, "Clip render failed.", error.stderr || error.message);
  }
});

export default router;
