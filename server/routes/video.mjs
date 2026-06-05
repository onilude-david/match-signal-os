import express from "express";
import { createReadStream } from "node:fs";
import { access, mkdir, stat, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import { jsonError } from "../config/env.mjs";
import {
  ffmpegHealth,
  resolveMediaPath,
  buildClipPlans,
  slug,
  asSeconds,
  clipsDir,
  buildRenderArgs,
  execFileAsync,
} from "../services/video.mjs";

const router = express.Router();

// GET /api/video/status
router.get("/video/status", async (_req, res) => {
  const ffmpeg = await ffmpegHealth();
  res.json({
    ok: true,
    ffmpeg,
    outputDir: clipsDir,
    publicBaseUrl: "/artifacts/clips",
  });
});

// GET /api/video/stream
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
router.post("/video/sample", async (req, res) => {
  const outputPath = resolveMediaPath("data/sample_video.mp4");
  const dataDir = path.dirname(outputPath);
  try {
    await mkdir(dataDir, { recursive: true });
    const args = [
      "-y",
      "-f",
      "lavfi",
      "-i",
      "testsrc=duration=30:size=1280x720:rate=30",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=1000:duration=30",
      "-c:v",
      "libx264",
      "-c:a",
      "aac",
      "-pix_fmt",
      "yuv420p",
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
    const { stdout } = await execFileAsync("ffprobe", [
      "-v",
      "error",
      "-print_format",
      "json",
      "-show_format",
      "-show_streams",
      sourcePath,
    ], { timeout: 15000 });
    res.json({ ok: true, sourcePath, probe: JSON.parse(stdout) });
  } catch (error) {
    jsonError(res, 400, "Video probe failed. Check that the file exists and FFprobe can read it.", error.message);
  }
});

// POST /api/clips/plan
router.post("/clips/plan", (req, res) => {
  res.json({
    ok: true,
    plans: buildClipPlans(req.body ?? {}),
  });
});

// POST /api/clips/merge
router.post("/clips/merge", async (req, res) => {
  const clipPathsInput = req.body?.clipPaths;
  if (!Array.isArray(clipPathsInput) || clipPathsInput.length < 2) {
    jsonError(res, 400, "clipPaths array with at least two paths is required.");
    return;
  }

  const resolvedPaths = clipPathsInput.map((p) => {
    if (p.startsWith("/artifacts/clips/")) {
      const filename = p.replace("/artifacts/clips/", "");
      return path.join(clipsDir, filename);
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
router.post("/clips/render", async (req, res) => {
  const sourcePath = resolveMediaPath(req.body?.sourcePath);
  const title = String(req.body?.title ?? "match-signal-clip");
  const matchId = slug(req.body?.matchId ?? "match");
  const clipType = slug(req.body?.clipType ?? "clip");
  const mode = req.body?.mode === "rough" ? "rough" : "final";
  const cropMode = req.body?.cropMode === "fit" ? "fit" : "fill";
  const startTime = asSeconds(req.body?.startTime, 0);
  const requestedEnd = req.body?.endTime === undefined ? null : asSeconds(req.body.endTime, startTime + 20);
  const requestedDuration = req.body?.duration === undefined ? null : asSeconds(req.body.duration, 20);
  const duration = Math.max(0.5, requestedEnd !== null ? requestedEnd - startTime : requestedDuration ?? 20);

  const watermarkText = req.body?.watermarkText ?? "";
  const headlineText = req.body?.headlineText ?? "";
  const captionText = req.body?.captionText ?? "";
  const gpuAcceleration = !!req.body?.gpuAcceleration;

  if (!sourcePath) {
    jsonError(res, 400, "sourcePath is required.");
    return;
  }
  if (duration <= 0) {
    jsonError(res, 400, "Clip duration must be greater than zero.");
    return;
  }

  try {
    await access(sourcePath);
    await mkdir(clipsDir, { recursive: true });
    const outputName = `${new Date().toISOString().replace(/[:.]/g, "-")}-${matchId}-${clipType}-${slug(title)}.mp4`;
    const outputPath = path.join(clipsDir, outputName);

    const healthInfo = await ffmpegHealth();
    const availableEncoders = healthInfo.configured ? healthInfo.encoders : {};

    let args = buildRenderArgs({
      sourcePath,
      outputPath,
      startTime,
      duration,
      mode,
      cropMode,
      watermarkText,
      headlineText,
      captionText,
      gpuAcceleration,
      availableEncoders,
    });

    const startedAt = new Date().toISOString();
    let usedGpuAcceleration = gpuAcceleration;
    let fallbackLog = "";
    let stderr = "";
    try {
      ({ stderr } = await execFileAsync("ffmpeg", args, { timeout: 10 * 60 * 1000, maxBuffer: 1024 * 1024 * 8 }));
    } catch (error) {
      if (!gpuAcceleration || mode === "rough") throw error;
      fallbackLog = error.stderr || error.message;
      usedGpuAcceleration = false;
      args = buildRenderArgs({
        sourcePath,
        outputPath,
        startTime,
        duration,
        mode,
        cropMode,
        watermarkText,
        headlineText,
        captionText,
        gpuAcceleration: false,
        availableEncoders,
      });
      ({ stderr } = await execFileAsync("ffmpeg", args, { timeout: 10 * 60 * 1000, maxBuffer: 1024 * 1024 * 8 }));
    }

    res.json({
      ok: true,
      job: {
        id: outputName.replace(/\.mp4$/, ""),
        title,
        matchId,
        clipType,
        mode,
        cropMode,
        startTime,
        duration,
        sourcePath,
        outputPath,
        publicUrl: `/artifacts/clips/${outputName}`,
        startedAt,
        completedAt: new Date().toISOString(),
        command: ["ffmpeg", ...args],
        gpuAcceleration: usedGpuAcceleration,
        gpuFallback: gpuAcceleration && !usedGpuAcceleration,
        logTail: `${fallbackLog ? `GPU fallback activated:\n${fallbackLog.split(/\r?\n/).slice(-8).join("\n")}\n\n` : ""}${stderr.split(/\r?\n/).slice(-18).join("\n")}`,
      },
    });
  } catch (error) {
    jsonError(res, 500, "Clip render failed.", error.stderr || error.message);
  }
});

export default router;
