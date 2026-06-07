// Server-side thumbnail-strip + waveform generation for the timeline UI.
//
// Both call sites cache by a hash of the source path so re-scrubbing the
// same file is instant. The hash also rolls when the source is replaced
// (mtime changes), so the cache is correct.
//
// THUMBNAILS
//   - We generate N (default 120) evenly-spaced JPEGs across the source.
//   - Each thumb is small (180px wide) so the strip is cheap to load.
//   - One ffmpeg invocation with `fps=N/duration` produces all of them.
//
// WAVEFORM
//   - `showwavespic` renders a wide PNG of the full audio waveform.
//   - We use the editorial palette (pitch green on paper) so it sits
//     under the thumbnail strip without fighting the design.

import { execFile } from "node:child_process";
import { mkdir, stat, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "../../..");

const THUMBS_ROOT = path.join(rootDir, "artifacts", "thumbs");
const WAVES_ROOT = path.join(rootDir, "artifacts", "waves");

const THUMB_TIMEOUT_MS = 4 * 60_000;
const WAVE_TIMEOUT_MS = 4 * 60_000;

// ----------------------------------------------------------------------------
// Cache key. We mix the source path + mtime + size + any params that
// affect the generated output (count, width). That way swapping the file
// busts the cache, and asking for a different N or width doesn't return
// stale thumbnails from an earlier call.

async function cacheKey(sourcePath, extras = {}) {
  const stats = await stat(sourcePath);
  const hash = createHash("sha1");
  hash.update(sourcePath);
  hash.update(String(stats.size));
  hash.update(String(stats.mtimeMs));
  for (const [k, v] of Object.entries(extras)) {
    hash.update(`${k}=${v};`);
  }
  return hash.digest("hex").slice(0, 16);
}

// ----------------------------------------------------------------------------
// Probe duration (single ffprobe). Cheaper than re-using scan.

async function probeDuration(sourcePath) {
  const { stdout } = await execFileAsync(
    "ffprobe",
    [
      "-v", "error",
      "-show_entries", "format=duration",
      "-of", "default=noprint_wrappers=1:nokey=1",
      sourcePath,
    ],
    { timeout: 10_000 },
  );
  const duration = Number(stdout.trim());
  return Number.isFinite(duration) && duration > 0 ? duration : 0;
}

// ----------------------------------------------------------------------------
// Thumbnails — N JPEGs at evenly spaced timestamps.

export async function generateThumbnails({ sourcePath, count = 120, width = 180 }) {
  const key = await cacheKey(sourcePath, { count, width });
  const outDir = path.join(THUMBS_ROOT, key);
  const duration = await probeDuration(sourcePath);
  if (!duration) {
    throw new Error("Source duration is unknown; cannot build thumbnail strip.");
  }

  // Already cached? Return the indexed list. Now that the cache key folds
  // in count + width, presence of any thumbs means the cache matches.
  if (existsSync(outDir)) {
    const files = (await readdir(outDir)).filter((f) => f.endsWith(".jpg")).sort();
    if (files.length > 0) {
      return finalisePayload({ key, files, duration, count: files.length, width });
    }
  }

  await mkdir(outDir, { recursive: true });

  // `fps=count/duration` gives us exactly `count` frames evenly distributed
  // across the source. We let ffmpeg name them sequentially (thumb-%04d.jpg).
  const fps = count / duration;
  const pattern = path.join(outDir, "thumb-%04d.jpg");
  const args = [
    "-y", "-hide_banner", "-nostats",
    "-i", sourcePath,
    "-vf", `fps=${fps},scale=${width}:-2`,
    "-q:v", "5",
    "-frames:v", String(count),
    pattern,
  ];
  await execFileAsync("ffmpeg", args, {
    timeout: THUMB_TIMEOUT_MS,
    maxBuffer: 1024 * 1024 * 8,
  });

  const files = (await readdir(outDir)).filter((f) => f.endsWith(".jpg")).sort();
  return finalisePayload({ key, files, duration, count: files.length, width });
}

function finalisePayload({ key, files, duration, count, width }) {
  const step = count > 0 ? duration / count : 0;
  return {
    cacheKey: key,
    count,
    duration,
    width,
    thumbs: files.map((name, i) => ({
      index: i,
      time: round(step * i, 3),
      url: `/artifacts/thumbs/${key}/${name}`,
    })),
  };
}

// ----------------------------------------------------------------------------
// Waveform — one wide PNG using showwavespic.

export async function generateWaveform({ sourcePath, width = 1920, height = 96 }) {
  const key = await cacheKey(sourcePath, { wave: 1 });
  const outDir = path.join(WAVES_ROOT, key);
  const outFile = path.join(outDir, `wave-${width}x${height}.png`);
  const duration = await probeDuration(sourcePath);

  if (existsSync(outFile)) {
    return {
      cacheKey: key,
      url: `/artifacts/waves/${key}/${path.basename(outFile)}`,
      width,
      height,
      duration,
    };
  }

  await mkdir(outDir, { recursive: true });

  // Editorial palette:
  //   colors=#13513F   (pitch green, brand accent)
  //   background paper #F4EFE3 (we render transparent and let the UI place
  //   it on a paper-raised div; this avoids the PNG fighting the page tint).
  const filter = [
    `showwavespic=s=${width}x${height}`,
    `colors=0x13513F`,
    `split_channels=0`,
  ].join(":");

  const args = [
    "-y", "-hide_banner", "-nostats",
    "-i", sourcePath,
    "-filter_complex", `[0:a]${filter}`,
    "-frames:v", "1",
    outFile,
  ];
  await execFileAsync("ffmpeg", args, {
    timeout: WAVE_TIMEOUT_MS,
    maxBuffer: 1024 * 1024 * 8,
  });

  return {
    cacheKey: key,
    url: `/artifacts/waves/${key}/${path.basename(outFile)}`,
    width,
    height,
    duration,
  };
}

function round(v, places) {
  const m = 10 ** places;
  return Math.round(v * m) / m;
}
