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
import {
  ytdlpStatus,
  probeYouTube,
  downloadYouTube,
} from "../services/video/youtube.mjs";
import {
  createJob,
  emitJobEvent,
  attachSseStream,
  getJob,
} from "../services/video/jobs.mjs";
import { telegramSendVideo } from "../services/telegram.mjs";
import { publicSafetyCheck } from "../services/safetyFilter.mjs";
import { geminiScanYouTube } from "../services/video/geminiScan.mjs";
import { searchVideoSources } from "../services/video/sources.mjs";
import { buildClipGodMode } from "../services/video/godMode.mjs";

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
  const youtube = await ytdlpStatus();
  res.json({
    ok: true,
    ffmpeg,
    whisper,
    youtube,
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

// GET /api/video/youtube/status — yt-dlp install + version
router.get("/video/youtube/status", async (_req, res) => {
  const status = await ytdlpStatus();
  res.json({ ok: true, youtube: status });
});

// POST /api/video/youtube/probe — metadata only, no download
router.post("/video/youtube/probe", async (req, res) => {
  const url = String(req.body?.url ?? "").trim();
  if (!url) {
    jsonError(res, 400, "url is required.");
    return;
  }
  try {
    const info = await probeYouTube(url);
    res.json({ ok: true, info });
  } catch (error) {
    const status = error.code === "YTDLP_MISSING" ? 501 : 400;
    jsonError(res, status, "YouTube probe failed.", error.message);
  }
});

// GET /api/video/jobs/:id/events — SSE progress for any background job
router.get("/video/jobs/:id/events", (req, res) => {
  attachSseStream(res, req.params.id);
});

// GET /api/video/jobs/:id — snapshot lookup (used as SSE fallback)
router.get("/video/jobs/:id", (req, res) => {
  const job = getJob(req.params.id);
  if (!job) {
    jsonError(res, 404, "Unknown job id.");
    return;
  }
  res.json({
    ok: true,
    job: {
      id: job.id,
      kind: job.kind,
      status: job.status,
      progress: job.progress,
      result: job.result,
      error: job.error,
      meta: job.meta,
    },
  });
});

// POST /api/video/youtube/download/start — async variant. Returns {jobId}
// immediately and runs yt-dlp in the background. Subscribe to
// GET /api/video/jobs/:id/events to follow progress.
router.post("/video/youtube/download/start", async (req, res) => {
  const url = String(req.body?.url ?? "").trim();
  if (!url) {
    jsonError(res, 400, "url is required.");
    return;
  }
  const maxHeight = Math.max(360, Math.min(2160, Number(req.body?.maxHeight) || 1080));
  const sectionRange = req.body?.sectionRange ? String(req.body.sectionRange) : null;
  const cookiesFromBrowser = req.body?.cookiesFromBrowser ? String(req.body.cookiesFromBrowser) : null;

  const job = createJob({ kind: "download", meta: { url, maxHeight, sectionRange } });
  res.json({ ok: true, jobId: job.id });

  // Fire-and-forget — never throws out of this handler.
  (async () => {
    emitJobEvent(job.id, { kind: "status", message: "Starting yt-dlp…" });
    try {
      const result = await downloadYouTube({
        url,
        maxHeight,
        sectionRange,
        cookiesFromBrowser,
        onProgress: (event) => emitJobEvent(job.id, event),
      });
      emitJobEvent(job.id, {
        kind: "done",
        payload: {
          id: result.id,
          sourceRelPath: result.sourceRelPath,
          publicUrl: result.publicUrl,
          cached: result.cached,
          info: result.info,
        },
      });
    } catch (error) {
      emitJobEvent(job.id, {
        kind: "error",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  })();
});

// POST /api/video/youtube/download — pulls the video and returns a source path
// the rest of the pipeline (timeline / scan / render) can consume.
router.post("/video/youtube/download", async (req, res) => {
  const url = String(req.body?.url ?? "").trim();
  if (!url) {
    jsonError(res, 400, "url is required.");
    return;
  }
  const maxHeight = Math.max(360, Math.min(2160, Number(req.body?.maxHeight) || 1080));
  const sectionRange = req.body?.sectionRange ? String(req.body.sectionRange) : null;
  const cookiesFromBrowser = req.body?.cookiesFromBrowser ? String(req.body.cookiesFromBrowser) : null;

  try {
    const result = await downloadYouTube({
      url,
      maxHeight,
      sectionRange,
      cookiesFromBrowser,
    });
    res.json({
      ok: true,
      download: {
        id: result.id,
        sourceRelPath: result.sourceRelPath,
        publicUrl: result.publicUrl,
        cached: result.cached,
        info: result.info,
      },
    });
  } catch (error) {
    const status = error.code === "YTDLP_MISSING" ? 501 : 500;
    jsonError(res, status, "YouTube download failed.", error.message);
  }
});

// GET /api/video/sources/search
// Discovers official/rights-aware video candidates. First provider: ScoreBat.
router.get("/video/sources/search", async (req, res) => {
  try {
    const result = await searchVideoSources({
      query: req.query.query,
      team: req.query.team,
      competition: req.query.competition,
      date: req.query.date,
      providers: req.query.providers ? String(req.query.providers).split(",") : ["scorebat", "highlightly", "youtube"],
      creativeCommonsOnly: req.query.creativeCommonsOnly === "true",
      limit: req.query.limit,
    });
    res.json({ ok: true, ...result });
  } catch (error) {
    jsonError(res, error.status ?? 502, "Video source search failed.", error.details ?? error.message);
  }
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
// NEW: GEMINI SCAN — football-semantic moment detection via Gemini 2.5
//
// Body: { youtubeUrl, fixtureContext?, model?, maxClips? }
// Returns: { ok, scan: { suggestions, summary, model, duration, usage } }
//
// This route is intentionally side-by-side with /api/video/scan (FFmpeg
// scene + audio peak). The UI picks one based on what's available — the
// Gemini path is the smart default when GEMINI_API_KEY is set and the
// source is a YouTube URL (no download required, native YouTube ingest).

router.post("/video/gemini-scan", async (req, res) => {
  const youtubeUrl = String(req.body?.youtubeUrl ?? "").trim();
  if (!youtubeUrl) {
    jsonError(res, 400, "youtubeUrl is required.");
    return;
  }
  const fixtureContext = String(req.body?.fixtureContext ?? "").trim();
  const maxClips = Math.max(3, Math.min(12, Number(req.body?.maxClips) || 8));
  const model = ["gemini-2.5-flash", "gemini-2.5-pro"].includes(req.body?.model)
    ? req.body.model
    : "gemini-2.5-flash";

  try {
    const result = await geminiScanYouTube({
      youtubeUrl,
      fixtureContext,
      maxClips,
      model,
    });
    res.json({
      ok: true,
      scan: {
        source: youtubeUrl,
        duration: result.duration,
        suggestions: result.suggestions,
        summary: result.summary,
        model: result.model,
        usage: result.usage,
        // Shape parity with the FFmpeg scan so the UI can render either:
        scenes: [],
        peaks: [],
        crop: { recommended: false, width: 0, height: 0, x: 0, y: 0 },
        hasAudio: true,
      },
    });
  } catch (error) {
    const status = error.code === "GEMINI_NOT_CONFIGURED" ? 501 : 500;
    jsonError(res, status, "Gemini scan failed.", error.message);
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

// POST /api/clips/god-mode
// Director layer for the clipping workflow. It consumes an existing scan result
// or runs /api/video/scan internally, then returns a ranked edit decision list
// with recommended aspects, render mode, crop mode, and overlay text.
router.post("/clips/god-mode", async (req, res) => {
  const sourcePath = resolveMediaPath(req.body?.sourcePath);
  const scan = req.body?.scan;
  const maxClips = Math.max(1, Math.min(12, Number(req.body?.maxClips) || 6));

  try {
    let scanResult = scan;
    if (!scanResult) {
      if (!sourcePath) {
        jsonError(res, 400, "sourcePath or scan is required.");
        return;
      }
      await access(sourcePath);
      scanResult = await scanSource({ sourcePath });
    }
    const godMode = buildClipGodMode({
      scan: scanResult,
      fixture: req.body?.fixture ?? {},
      prediction: req.body?.prediction ?? {},
      content: req.body?.content ?? {},
      maxClips,
    });
    res.json({ ok: true, godMode });
  } catch (error) {
    jsonError(res, 500, "Clip God Mode failed.", error.stderr || error.message);
  }
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

// Parse a render request body into a normalised inputs object, or return a
// {error, status} pair the caller can hand to jsonError. Used by both the
// sync and async render endpoints so the validation never drifts.
function parseRenderRequest(body) {
  const sourcePath = resolveMediaPath(body?.sourcePath);
  const title = String(body?.title ?? "match-signal-clip");
  const matchId = slug(body?.matchId ?? "match");
  const clipType = slug(body?.clipType ?? "clip");
  const rough = body?.mode === "rough";
  const cropMode = body?.cropMode === "fit" ? "fit" : "fill";
  const startTime = asSeconds(body?.startTime, 0);
  const requestedEnd = body?.endTime === undefined ? null : asSeconds(body.endTime, startTime + 20);
  const requestedDuration = body?.duration === undefined ? null : asSeconds(body.duration, 20);
  const duration = Math.max(0.5, requestedEnd !== null ? requestedEnd - startTime : requestedDuration ?? 20);

  const requestedAspectsRaw = Array.isArray(body?.aspects) && body.aspects.length
    ? body.aspects
    : ["9x16"];
  const aspects = requestedAspectsRaw.map(String).filter((k) => ASPECTS[k]);

  if (!sourcePath) return { error: "sourcePath is required.", status: 400 };
  if (!aspects.length) {
    return {
      error: `Unknown aspect ratios. Allowed: ${Object.keys(ASPECTS).join(", ")}`,
      status: 400,
    };
  }
  if (duration <= 0) return { error: "Clip duration must be greater than zero.", status: 400 };

  const subtitle = {
    watermarkText: String(body?.watermarkText ?? ""),
    headlineText: String(body?.headlineText ?? ""),
    captionText: String(body?.captionText ?? ""),
    accentText: String(body?.accentText ?? ""),
    transcriptCues: Array.isArray(body?.transcriptCues) ? body.transcriptCues : [],
  };

  const gpu = !!body?.gpuAcceleration;
  const codec = ["h264", "hevc", "av1"].includes(body?.codec) ? body.codec : "h264";

  return {
    inputs: {
      sourcePath, title, matchId, clipType, rough, cropMode,
      startTime, duration, aspects, subtitle, gpu, codec,
    },
  };
}

// Run the actual render (with GPU→CPU fallback) and assemble the per-aspect
// RenderJob payloads. Optional onProgress is forwarded to the FFmpeg call.
async function runRender(inputs, { onProgress } = {}) {
  const { sourcePath, title, matchId, clipType, rough, cropMode, startTime,
    duration, aspects, subtitle, gpu, codec } = inputs;

  await access(sourcePath);

  const healthInfo = await ffmpegHealth();
  const availableEncoders = healthInfo.configured ? healthInfo.encoders : {};

  const outputDir = path.join(clipsDir, matchId, clipType);
  const basename = `${new Date().toISOString().replace(/[:.]/g, "-")}-${slug(title)}`;

  let result;
  let usedGpu = gpu;
  try {
    result = await renderClipMultiAspect({
      sourcePath, outputDir, basename, startTime, duration, aspects,
      cropMode, subtitle, gpu, availableEncoders, codec, rough,
      subtitlesDir, onProgress,
    });
  } catch (error) {
    if (!gpu || rough) throw error;
    usedGpu = false;
    result = await renderClipMultiAspect({
      sourcePath, outputDir, basename, startTime, duration, aspects,
      cropMode, subtitle, gpu: false, availableEncoders, codec, rough,
      subtitlesDir, onProgress,
    });
  }

  const jobs = result.aspects.map((a) => {
    const relFromArtifacts = path.relative(artifactsDir, a.outputPath).split(path.sep).join("/");
    return {
      id: `${basename}-${a.aspect}`,
      title, matchId, clipType,
      aspect: a.aspect,
      mode: rough ? "rough" : "final",
      cropMode, startTime, duration,
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

  await cleanupAssFiles(result.ass);

  return {
    jobs,
    loudnorm: result.loudnorm,
    command: result.command,
    logTail: result.logTail,
  };
}

// POST /api/clips/render/start — async variant. Returns {jobId} immediately
// and renders in the background, emitting progress events the UI can
// subscribe to via GET /api/video/jobs/:id/events. Identical body shape to
// the sync /api/clips/render route.
router.post("/clips/render/start", async (req, res) => {
  const parsed = parseRenderRequest(req.body);
  if (parsed.error) {
    jsonError(res, parsed.status, parsed.error);
    return;
  }

  const job = createJob({
    kind: "render",
    meta: {
      title: parsed.inputs.title,
      matchId: parsed.inputs.matchId,
      clipType: parsed.inputs.clipType,
      aspects: parsed.inputs.aspects,
      duration: parsed.inputs.duration,
    },
  });
  res.json({ ok: true, jobId: job.id });

  (async () => {
    emitJobEvent(job.id, { kind: "status", message: "Measuring loudness…" });
    try {
      const result = await runRender(parsed.inputs, {
        onProgress: (event) => emitJobEvent(job.id, event),
      });
      emitJobEvent(job.id, { kind: "done", payload: result });
    } catch (error) {
      emitJobEvent(job.id, {
        kind: "error",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  })();
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
  const parsed = parseRenderRequest(req.body);
  if (parsed.error) {
    jsonError(res, parsed.status, parsed.error);
    return;
  }
  try {
    const result = await runRender(parsed.inputs);
    res.json({ ok: true, ...result });
  } catch (error) {
    jsonError(res, 500, "Clip render failed.", error.stderr || error.message);
  }
});

// Map a destination key to a Telegram chatId + env-gate check. Returns a
// {chatId, error?} pair. Future destinations (Buffer, Ayrshare) plug in by
// adding cases here and a new sender function below.
function resolveTelegramDestination(key) {
  switch (key) {
    case "telegram-admin":
      return process.env.TELEGRAM_ADMIN_CHAT_ID
        ? { chatId: process.env.TELEGRAM_ADMIN_CHAT_ID }
        : { error: "TELEGRAM_ADMIN_CHAT_ID is not configured." };
    case "telegram-public":
      return process.env.TELEGRAM_PUBLIC_CHANNEL_ID
        ? { chatId: process.env.TELEGRAM_PUBLIC_CHANNEL_ID }
        : { error: "TELEGRAM_PUBLIC_CHANNEL_ID is not configured." };
    case "telegram-vip":
      if (!process.env.TELEGRAM_BETTING_CHANNEL_ID) {
        return { error: "TELEGRAM_BETTING_CHANNEL_ID is not configured." };
      }
      if (process.env.VIP_PUBLISH_ENABLED === "false" || !String(process.env.VIP_JURISDICTIONS ?? "").trim()) {
        return { error: "VIP publishing is not enabled. Set VIP_JURISDICTIONS in .env." };
      }
      return { chatId: process.env.TELEGRAM_BETTING_CHANNEL_ID };
    default:
      return { error: `Unknown destination: ${key}` };
  }
}

function resolveLocalClipPath(input) {
  if (!input) return null;
  // Accept either a relative artifacts URL (/artifacts/clips/...) or a real
  // path resolvable by resolveMediaPath.
  if (typeof input === "string" && input.startsWith("/artifacts/")) {
    const rel = input.replace(/^\//, ""); // -> artifacts/clips/...
    return resolveMediaPath(rel);
  }
  return resolveMediaPath(input);
}

// POST /api/clips/ship
// Body: {
//   items: [{ publicUrl | sourcePath, caption?, width?, height?, duration? }],
//   destinations: ["telegram-admin", "telegram-public", "telegram-vip", ...],
//   parseMode?: "Markdown" | "MarkdownV2" | "HTML",
//   defaultCaption?: string,
// }
//
// Iterates every (clip × destination) pair and reports per-pair status.
// Never throws — a failure for one pair is reported in the row but does not
// abort the rest. Public-safety filter is applied to each caption before
// any upload happens.
router.post("/clips/ship", async (req, res) => {
  const items = Array.isArray(req.body?.items) ? req.body.items : [];
  const destinations = Array.isArray(req.body?.destinations) ? req.body.destinations : [];
  const parseMode = req.body?.parseMode || null;
  const defaultCaption = String(req.body?.defaultCaption ?? "");

  if (!items.length) {
    jsonError(res, 400, "items[] is required.");
    return;
  }
  if (!destinations.length) {
    jsonError(res, 400, "destinations[] is required.");
    return;
  }

  const results = [];

  for (const item of items) {
    const clipPath = resolveLocalClipPath(item.publicUrl ?? item.sourcePath);
    if (!clipPath) {
      results.push({ clip: item.publicUrl ?? item.sourcePath ?? null, error: "Unresolvable clip path." });
      continue;
    }
    try {
      await access(clipPath);
    } catch {
      results.push({ clip: item.publicUrl ?? item.sourcePath, error: `Clip file not found at ${clipPath}.` });
      continue;
    }

    const caption = String(item.caption ?? defaultCaption ?? "");
    if (caption) {
      const verdict = publicSafetyCheck(caption);
      if (!verdict.ok) {
        results.push({
          clip: item.publicUrl ?? item.sourcePath,
          error: "Public-safety filter rejected the caption.",
          verdict,
        });
        continue;
      }
    }

    for (const destinationKey of destinations) {
      // For now, every supported destination is a Telegram chat. Other
      // vendors plug in by branching here on the prefix.
      if (!destinationKey.startsWith("telegram-")) {
        results.push({
          clip: item.publicUrl ?? item.sourcePath,
          destination: destinationKey,
          ok: false,
          error: `Destination not implemented: ${destinationKey}. Add a handler in /api/clips/ship.`,
        });
        continue;
      }

      const resolved = resolveTelegramDestination(destinationKey);
      if (resolved.error) {
        results.push({
          clip: item.publicUrl ?? item.sourcePath,
          destination: destinationKey,
          ok: false,
          error: resolved.error,
        });
        continue;
      }

      try {
        const tgResult = await telegramSendVideo({
          chatId: resolved.chatId,
          videoPath: clipPath,
          caption,
          parseMode,
          duration: item.duration,
          width: item.width,
          height: item.height,
        });
        results.push({
          clip: item.publicUrl ?? item.sourcePath,
          destination: destinationKey,
          ok: true,
          messageId: tgResult.result?.message_id ?? null,
        });
      } catch (error) {
        results.push({
          clip: item.publicUrl ?? item.sourcePath,
          destination: destinationKey,
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  const summary = {
    total: results.length,
    ok: results.filter((r) => r.ok).length,
    failed: results.filter((r) => r.ok === false || r.error).length,
  };
  res.json({ ok: true, summary, results });
});

export default router;
