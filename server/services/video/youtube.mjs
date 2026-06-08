// YouTube source ingestion via yt-dlp.
//
// yt-dlp is the maintained fork of youtube-dl. It speaks YouTube's auth and
// stream-splitting protocols correctly, and we hand the resulting MP4 to
// the existing clipper pipeline (probe -> timeline -> scan -> render).
//
// We detect three install forms, in priority order:
//   1. yt-dlp binary on PATH       (winget, brew, choco, manual)
//   2. python -m yt_dlp            (pip install yt-dlp)
//   3. yt-dlp.exe in ./bin/        (drop-in for portable installs)
//
// First-run setup if none of the above works:
//   pip install --user yt-dlp     # OR
//   winget install yt-dlp         # OR
//   brew install yt-dlp

import { execFile, spawn } from "node:child_process";
import { mkdir, access, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "../../..");

const SOURCES_ROOT = path.join(rootDir, "artifacts", "sources");

const PROBE_TIMEOUT_MS = 30_000;
const DOWNLOAD_TIMEOUT_MS = 30 * 60_000;
const MAX_BUFFER = 32 * 1024 * 1024;

// ----------------------------------------------------------------------------
// Resolver — figure out *how* to invoke yt-dlp on this machine.
//
// We cache the resolution because every endpoint hit otherwise does three
// version probes. The cache is invalidated on process restart, which is
// fine for an install change.

let cachedResolver = null;

export async function resolveYtDlp() {
  if (cachedResolver) return cachedResolver;

  // 1. Plain `yt-dlp`.
  const plain = await tryVersion(["yt-dlp", "--version"]);
  if (plain.ok) {
    cachedResolver = { kind: "binary", cmd: "yt-dlp", args: [], version: plain.version };
    return cachedResolver;
  }

  // 2. `python -m yt_dlp` — covers pip installs that didn't add a shim.
  for (const pyName of ["python", "python3", "py"]) {
    const r = await tryVersion([pyName, "-m", "yt_dlp", "--version"]);
    if (r.ok) {
      cachedResolver = { kind: "python", cmd: pyName, args: ["-m", "yt_dlp"], version: r.version };
      return cachedResolver;
    }
  }

  // 3. Bundled fallback under ./bin/yt-dlp.exe (or yt-dlp).
  const bundled = process.platform === "win32"
    ? path.join(rootDir, "bin", "yt-dlp.exe")
    : path.join(rootDir, "bin", "yt-dlp");
  if (existsSync(bundled)) {
    const r = await tryVersion([bundled, "--version"]);
    if (r.ok) {
      cachedResolver = { kind: "bundled", cmd: bundled, args: [], version: r.version };
      return cachedResolver;
    }
  }

  cachedResolver = { kind: "missing", cmd: null, args: [], version: null };
  return cachedResolver;
}

async function tryVersion(argv) {
  try {
    const [cmd, ...rest] = argv;
    const { stdout } = await execFileAsync(cmd, rest, { timeout: 6_000 });
    return { ok: true, version: stdout.trim().split(/\r?\n/)[0] };
  } catch {
    return { ok: false, version: null };
  }
}

export async function ytdlpStatus() {
  const r = await resolveYtDlp();
  if (r.kind === "missing") {
    return {
      configured: false,
      kind: "missing",
      version: null,
      suggestion: "Install yt-dlp via 'pip install --user yt-dlp', 'winget install yt-dlp', or 'brew install yt-dlp', then restart the API.",
    };
  }
  return {
    configured: true,
    kind: r.kind,
    version: r.version,
    suggestion: null,
  };
}

// ----------------------------------------------------------------------------
// Build the argv prefix for yt-dlp regardless of resolver kind.

function buildArgv(extraArgs) {
  if (!cachedResolver || cachedResolver.kind === "missing") {
    throw missingError();
  }
  return [cachedResolver.cmd, [...cachedResolver.args, ...extraArgs]];
}

function missingError() {
  const err = new Error("yt-dlp is not installed. Run 'pip install --user yt-dlp' or 'winget install yt-dlp' and restart the API.");
  err.code = "YTDLP_MISSING";
  return err;
}

// ----------------------------------------------------------------------------
// Probe — metadata only, no download. ~1-3s round-trip.

export async function probeYouTube(url) {
  await resolveYtDlp();
  if (cachedResolver.kind === "missing") throw missingError();

  const [cmd, argv] = buildArgv([
    "--dump-single-json",
    "--no-warnings",
    "--no-call-home",
    "--no-playlist",
    "--skip-download",
    url,
  ]);

  let stdout;
  try {
    const result = await execFileAsync(cmd, argv, {
      timeout: PROBE_TIMEOUT_MS,
      maxBuffer: MAX_BUFFER,
    });
    stdout = result.stdout;
  } catch (error) {
    throw new Error(`yt-dlp probe failed: ${ytdlpErrorSummary(error)}`);
  }

  let info;
  try {
    info = JSON.parse(stdout);
  } catch (error) {
    throw new Error(`yt-dlp returned non-JSON metadata: ${error.message}`);
  }

  // Pick a reasonable thumbnail — yt-dlp returns an array sorted ascending
  // by quality; we want a mid/high one for the card.
  const thumb =
    info.thumbnails?.find((t) => t.width >= 320 && t.width <= 720)?.url ??
    info.thumbnails?.[Math.floor((info.thumbnails?.length ?? 0) / 2)]?.url ??
    info.thumbnail ??
    null;

  // Best progressive (combined v+a) MP4 height for "default" download.
  const heights = (info.formats ?? [])
    .filter((f) => f.vcodec && f.vcodec !== "none" && f.acodec && f.acodec !== "none")
    .map((f) => f.height)
    .filter(Boolean);
  const bestProgressiveHeight = heights.length ? Math.max(...heights) : null;

  return {
    id: info.id,
    title: info.title,
    channel: info.channel ?? info.uploader,
    channelUrl: info.channel_url ?? info.uploader_url,
    duration: Number(info.duration ?? 0),
    uploadDate: info.upload_date ?? null,
    viewCount: Number(info.view_count ?? 0),
    description: (info.description ?? "").slice(0, 600),
    thumbnail: thumb,
    webpageUrl: info.webpage_url ?? url,
    bestProgressiveHeight,
    isLive: Boolean(info.is_live),
  };
}

// ----------------------------------------------------------------------------
// Download — pulls the video to artifacts/sources/<id>/<id>.mp4
//
// Options:
//   url            target URL
//   maxHeight      cap resolution (default 1080). yt-dlp will pick the best
//                  available format at or below this height and merge a/v
//                  via ffmpeg if necessary.
//   sectionRange   optional "HH:MM:SS-HH:MM:SS" to download just a segment
//                  (great for cutting long broadcasts before clipping).
//   onProgress     callback called with parsed progress objects from yt-dlp
//                  (used by the SSE route).
//
// Returns { id, sourcePath, sourceRelPath, info } — sourceRelPath is the
// path relative to the project root, which the existing render pipeline
// understands directly.

export async function downloadYouTube({
  url,
  maxHeight = 1080,
  sectionRange = null,
  onProgress = null,
  cookiesFromBrowser = null,
}) {
  await resolveYtDlp();
  if (cachedResolver.kind === "missing") throw missingError();

  // First do a probe to get the video id. We use that as the cache dir.
  const info = await probeYouTube(url);
  if (info.isLive) {
    throw new Error("Cannot ingest a live stream — wait until the VOD is available.");
  }

  const videoId = info.id;
  const outDir = path.join(SOURCES_ROOT, videoId);
  await mkdir(outDir, { recursive: true });

  // Cache hit: an .mp4 already exists in the dir and no sectionRange was
  // requested (sections produce a different file).
  if (!sectionRange) {
    try {
      const files = await readdir(outDir);
      const cached = files.find((f) => f.endsWith(".mp4"));
      if (cached) {
        const cachedPath = path.join(outDir, cached);
        await access(cachedPath);
        return {
          id: videoId,
          sourcePath: cachedPath,
          sourceRelPath: path.relative(rootDir, cachedPath).split(path.sep).join("/"),
          publicUrl: `/artifacts/sources/${videoId}/${cached}`,
          cached: true,
          info,
        };
      }
    } catch { /* miss */ }
  }

  // Build the format selector. Prefer mp4-friendly streams so we can hand
  // the file straight to ffmpeg without a remux.
  //
  // bestvideo[ext=mp4][height<=H]+bestaudio[ext=m4a]/best[ext=mp4][height<=H]
  //   first try video+audio merge, fall back to combined progressive.
  const formatSelector = `bestvideo[ext=mp4][height<=${maxHeight}]+bestaudio[ext=m4a]/best[ext=mp4][height<=${maxHeight}]/best`;

  const outputTemplate = path.join(outDir, "%(id)s.%(ext)s");
  const args = [
    "--no-warnings",
    "--no-call-home",
    "--no-playlist",
    "--format", formatSelector,
    "--merge-output-format", "mp4",
    "--restrict-filenames",
    "--newline",
    "--progress",
    "--output", outputTemplate,
  ];

  if (sectionRange) {
    args.push("--download-sections", `*${sectionRange}`);
  }

  if (cookiesFromBrowser) {
    // e.g. "chrome", "firefox", "edge" — yt-dlp reads cookies for
    // age-gated or region-locked videos when the user is signed in.
    args.push("--cookies-from-browser", cookiesFromBrowser);
  }

  args.push(url);

  const [cmd, argv] = buildArgv(args);
  await runWithProgress({ cmd, argv, onProgress });

  // Find the resulting file. yt-dlp may write <id>.mp4 or <id>.mkv depending
  // on the merge; we glob the dir and pick the .mp4 first.
  const files = await readdir(outDir);
  const mp4 = files.find((f) => f.startsWith(videoId) && f.endsWith(".mp4"))
    ?? files.find((f) => f.startsWith(videoId));
  if (!mp4) {
    throw new Error("yt-dlp finished but no output file was found.");
  }
  const sourcePath = path.join(outDir, mp4);

  return {
    id: videoId,
    sourcePath,
    sourceRelPath: path.relative(rootDir, sourcePath).split(path.sep).join("/"),
    publicUrl: `/artifacts/sources/${videoId}/${mp4}`,
    cached: false,
    info,
  };
}

// ----------------------------------------------------------------------------
// Run yt-dlp and stream progress.
//
// yt-dlp prints progress like:
//   [download]   3.2% of   80.20MiB at  2.05MiB/s ETA 00:38
// We parse those lines into structured progress events so the SSE route can
// forward them as JSON.

const PROGRESS_RE = /\[download\]\s+([\d.]+)%\s+of\s+~?\s*([\d.]+)([KMG]i?B)\s+at\s+([\d.]+)([KMG]i?B)\/s\s+ETA\s+(\S+)/i;
const DEST_RE = /\[download\] Destination:\s*(.+)$/;

function runWithProgress({ cmd, argv, onProgress }) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, argv, {
      windowsHide: true,
    });

    let stderrTail = "";
    let lastEmit = 0;

    child.stdout.on("data", (chunk) => {
      const text = chunk.toString("utf-8");
      for (const line of text.split(/\r?\n/)) {
        if (!line.trim()) continue;
        const m = line.match(PROGRESS_RE);
        if (m && onProgress) {
          const now = Date.now();
          if (now - lastEmit < 200) continue; // throttle to 5 Hz
          lastEmit = now;
          onProgress({
            kind: "progress",
            percent: Number(m[1]),
            totalBytes: parseBytes(m[2], m[3]),
            speedBytes: parseBytes(m[4], m[5]),
            eta: m[6],
          });
        } else if (DEST_RE.test(line) && onProgress) {
          onProgress({ kind: "destination", line });
        }
      }
    });

    child.stderr.on("data", (chunk) => {
      stderrTail = (stderrTail + chunk.toString("utf-8")).slice(-4096);
    });

    const timer = setTimeout(() => {
      try { child.kill("SIGKILL"); } catch { /* noop */ }
      reject(new Error(`yt-dlp timed out after ${DOWNLOAD_TIMEOUT_MS}ms`));
    }, DOWNLOAD_TIMEOUT_MS);

    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) {
        if (onProgress) onProgress({ kind: "done" });
        resolve(true);
      } else {
        reject(new Error(`yt-dlp exited with code ${code}: ${stderrTail.split(/\r?\n/).slice(-3).join(" / ")}`));
      }
    });
  });
}

function parseBytes(num, unit) {
  const n = Number(num);
  if (!Number.isFinite(n)) return null;
  const u = unit.toUpperCase();
  if (u.startsWith("K")) return n * 1024;
  if (u.startsWith("M")) return n * 1024 * 1024;
  if (u.startsWith("G")) return n * 1024 * 1024 * 1024;
  return n;
}

function ytdlpErrorSummary(error) {
  const text = error.stderr || error.stdout || error.message || "";
  return text.split(/\r?\n/).filter(Boolean).slice(-3).join(" / ");
}
