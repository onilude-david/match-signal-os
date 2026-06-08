// In-memory job store with Server-Sent Events.
//
// Used by the async download + render endpoints so the UI can render a live
// progress bar. Two design constraints:
//
//   1. Jobs survive a few seconds after completion so a late SSE subscriber
//      still sees the "done" event. We GC after JOB_TTL_MS.
//   2. We never crash on an unsubscribed emitter — the EventEmitter listener
//      cap defaults to 10 and the SSE route is the only consumer, so this is
//      a non-issue in practice.
//
// Event shape (one of):
//   { kind: "progress", percent, totalBytes, speedBytes, eta }
//   { kind: "destination", line }
//   { kind: "status", message }
//   { kind: "done", payload }
//   { kind: "error", message }

import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";

const JOB_TTL_MS = 5 * 60_000; // keep finished jobs around for 5 min
const HEARTBEAT_MS = 25_000;   // SSE keepalive so proxies don't drop us

const jobs = new Map(); // id -> Job

export function createJob({ kind, meta = {} }) {
  const id = randomUUID();
  const emitter = new EventEmitter();
  emitter.setMaxListeners(32);
  const job = {
    id,
    kind,                              // "download" | "render"
    meta,                              // freeform: url, title, etc.
    status: "pending",                 // pending | running | done | error
    progress: null,                    // last progress event payload
    result: null,                      // final payload (set on done)
    error: null,                       // error message (set on error)
    createdAt: Date.now(),
    finishedAt: null,
    emitter,
  };
  jobs.set(id, job);
  return job;
}

export function updateJob(id, patch) {
  const job = jobs.get(id);
  if (!job) return null;
  Object.assign(job, patch);
  return job;
}

export function getJob(id) {
  return jobs.get(id) ?? null;
}

// Emit an event to subscribers AND store the latest progress on the job
// so late-joining subscribers can catch up in their `initial` payload.
export function emitJobEvent(id, event) {
  const job = jobs.get(id);
  if (!job) return;
  if (event.kind === "progress") job.progress = event;
  if (event.kind === "status") job.status = "running";
  if (event.kind === "done") {
    job.status = "done";
    job.finishedAt = Date.now();
    job.result = event.payload ?? null;
    scheduleGc(id);
  }
  if (event.kind === "error") {
    job.status = "error";
    job.finishedAt = Date.now();
    job.error = event.message ?? "Unknown error";
    scheduleGc(id);
  }
  job.emitter.emit("event", event);
}

function scheduleGc(id) {
  setTimeout(() => {
    const job = jobs.get(id);
    if (!job) return;
    job.emitter.removeAllListeners();
    jobs.delete(id);
  }, JOB_TTL_MS);
}

// ----------------------------------------------------------------------------
// SSE writer. Attaches to res and pumps the job's emitter.

export function attachSseStream(res, jobId) {
  const job = jobs.get(jobId);
  if (!job) {
    res.status(404).json({ ok: false, error: "Unknown job id." });
    return;
  }

  // Standard SSE headers.
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no", // disable Nginx buffering if behind a proxy
  });
  // Flush headers so the client knows the connection is live before the
  // first event arrives.
  if (typeof res.flushHeaders === "function") res.flushHeaders();

  // Send the current state immediately so reconnects don't see a blank UI.
  writeEvent(res, {
    kind: "initial",
    status: job.status,
    progress: job.progress,
    result: job.result,
    error: job.error,
    meta: job.meta,
  });

  // If the job has already finished, close after sending its final event.
  if (job.status === "done" || job.status === "error") {
    writeEvent(res, job.status === "done"
      ? { kind: "done", payload: job.result }
      : { kind: "error", message: job.error });
    res.end();
    return;
  }

  const listener = (event) => {
    writeEvent(res, event);
    if (event.kind === "done" || event.kind === "error") {
      clearInterval(heartbeat);
      res.end();
    }
  };
  job.emitter.on("event", listener);

  // Keep-alive ping every 25s so proxies (and the browser) don't drop us
  // during a long download.
  const heartbeat = setInterval(() => {
    res.write(": ping\n\n");
  }, HEARTBEAT_MS);

  res.on("close", () => {
    clearInterval(heartbeat);
    job.emitter.off("event", listener);
  });
}

function writeEvent(res, payload) {
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}
