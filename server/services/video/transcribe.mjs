// Local Whisper transcription via the ffmpeg `whisper` filter.
//
// The build at `ffmpeg -hide_banner -h filter=whisper` exposes the same
// options as whisper.cpp:
//   model       path to a ggml model file
//   language    'auto' or ISO code
//   destination output path
//   format      text | srt | json
//
// We point it at a ggml model (default: models/ggml-small.en.bin) and parse
// the JSON cue stream back so the editorial subtitle layer can burn them in
// time-aligned to the clip.
//
// First-run setup:
//   download https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.en.bin
//   into ./models/ggml-small.en.bin
//   (or override with WHISPER_MODEL_PATH)

import { execFile } from "node:child_process";
import { readFile, mkdir, unlink, access, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "../../..");

const TRANSCRIBE_TIMEOUT_MS = 20 * 60_000; // 20 min — small.en is ~1x speed

export function resolveWhisperModel() {
  const fromEnv = (process.env.WHISPER_MODEL_PATH ?? "").trim();
  if (fromEnv) {
    return path.isAbsolute(fromEnv) ? fromEnv : path.resolve(rootDir, fromEnv);
  }
  return path.join(rootDir, "models", "ggml-small.en.bin");
}

export async function whisperStatus() {
  const modelPath = resolveWhisperModel();
  const present = existsSync(modelPath);
  return {
    configured: present,
    modelPath,
    suggestion: present
      ? null
      : "Download ggml-small.en.bin from https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.en.bin into ./models/ and restart.",
  };
}

// ----------------------------------------------------------------------------
// Run the whisper filter. We use the JSON destination format because it
// includes per-segment start/end timestamps — those drive the editorial
// caption layer in subtitles.mjs.

export async function transcribeSource({
  sourcePath,
  startSeconds = 0,
  durationSeconds = null,
  language = "auto",
  destDir,
  basename,
}) {
  const status = await whisperStatus();
  if (!status.configured) {
    const err = new Error(`Whisper model not found at ${status.modelPath}. ${status.suggestion}`);
    err.code = "WHISPER_MODEL_MISSING";
    err.modelPath = status.modelPath;
    throw err;
  }

  await mkdir(destDir, { recursive: true });
  const jsonPath = path.join(destDir, `${basename}.json`);
  const srtPath = path.join(destDir, `${basename}.srt`);

  // Build whisper filter — escape model path the same way as ass filter.
  const modelArg = filterEscape(status.modelPath);
  const jsonArg = filterEscape(jsonPath);
  const whisperFilter = [
    `model=${modelArg}`,
    `language=${language}`,
    `format=json`,
    `destination=${jsonArg}`,
    `queue=3`,
  ].join(":");

  const seekArgs = [];
  if (startSeconds > 0) {
    seekArgs.push("-ss", String(startSeconds));
  }
  if (durationSeconds && durationSeconds > 0) {
    seekArgs.push("-t", String(durationSeconds));
  }

  const args = [
    "-hide_banner",
    "-nostats",
    "-y",
    ...seekArgs,
    "-i", sourcePath,
    "-vn",
    "-af", `whisper=${whisperFilter}`,
    "-f", "null", "-",
  ];

  let stderr = "";
  try {
    const result = await execFileAsync("ffmpeg", args, {
      timeout: TRANSCRIBE_TIMEOUT_MS,
      maxBuffer: 1024 * 1024 * 16,
    });
    stderr = result.stderr;
  } catch (error) {
    // Whisper writes its output then ffmpeg exits 0 normally. Treat
    // non-zero with a present JSON file as success; otherwise re-throw.
    if (!existsSync(jsonPath)) {
      const err = new Error(`Whisper failed: ${error.stderr || error.message}`);
      err.cause = error;
      throw err;
    }
    stderr = error.stderr || "";
  }

  let cues = [];
  try {
    const raw = await readFile(jsonPath, "utf-8");
    cues = parseWhisperJson(raw);
  } catch (error) {
    throw new Error(`Could not read Whisper output at ${jsonPath}: ${error.message}`);
  }

  // Always also write SRT for downstream tooling (caption editors, YouTube).
  await writeFile(srtPath, cuesToSrt(cues), "utf-8");

  // The relative timestamps in cues are clip-local because we used -ss/-t.
  return {
    modelPath: status.modelPath,
    sourcePath,
    startSeconds,
    durationSeconds,
    jsonPath,
    srtPath,
    cues,
    log: stderr.split(/\r?\n/).slice(-12).join("\n"),
  };
}

// ----------------------------------------------------------------------------
// Parse the whisper filter's JSON. The filter emits a stream of objects, not
// a single array, so we parse one JSON value at a time.

function parseWhisperJson(raw) {
  const text = raw.trim();
  if (!text) return [];

  // Common shape #1: a single JSON array of {start,end,text}.
  if (text.startsWith("[")) {
    try {
      const arr = JSON.parse(text);
      return normaliseCues(arr);
    } catch {
      /* fall through to NDJSON */
    }
  }

  // Common shape #2: NDJSON, one segment per line.
  const out = [];
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const obj = JSON.parse(trimmed);
      if (Array.isArray(obj)) {
        out.push(...normaliseCues(obj));
      } else {
        const [cue] = normaliseCues([obj]);
        if (cue) out.push(cue);
      }
    } catch {
      // ignore malformed lines — whisper occasionally prints headers
    }
  }
  return out;
}

function normaliseCues(arr) {
  return arr
    .map((c) => {
      const start = Number(c.start ?? c.t0 ?? c.startTime ?? 0);
      const end = Number(c.end ?? c.t1 ?? c.endTime ?? start + 2);
      const text = String(c.text ?? c.transcript ?? "").trim();
      if (!text) return null;
      if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
      return { start, end, text };
    })
    .filter(Boolean);
}

function cuesToSrt(cues) {
  return cues.map((cue, i) => {
    return [
      String(i + 1),
      `${srtTs(cue.start)} --> ${srtTs(cue.end)}`,
      cue.text,
      "",
    ].join("\n");
  }).join("\n");
}

function srtTs(s) {
  const safe = Math.max(0, Number(s) || 0);
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const sec = Math.floor(safe % 60);
  const ms = Math.round((safe - Math.floor(safe)) * 1000);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")},${String(ms).padStart(3, "0")}`;
}

function filterEscape(p) {
  return String(p)
    .replace(/\\/g, "/")
    .replace(/:/g, "\\:")
    .replace(/'/g, "\\'");
}
