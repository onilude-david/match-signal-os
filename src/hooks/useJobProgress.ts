// Subscribe to /api/video/jobs/:id/events via EventSource and return the
// latest progress + final result. Keeps the UI dumb: components just read
// {status, percent, speedBytes, totalBytes, eta, result, error}.

import { useEffect, useState } from "react";

export type JobEvent =
  | { kind: "initial"; status: JobStatus; progress: ProgressPayload | null; result: any; error: string | null; meta?: Record<string, unknown> }
  | { kind: "status"; message: string }
  | { kind: "progress"; percent: number; totalBytes: number | null; speedBytes: number | null; eta: string }
  | { kind: "destination"; line: string }
  | { kind: "done"; payload: any }
  | { kind: "error"; message: string };

export type JobStatus = "pending" | "running" | "done" | "error";

export type ProgressPayload = {
  percent: number;
  totalBytes: number | null;
  speedBytes: number | null;
  eta: string;
};

export type JobProgressState = {
  status: JobStatus | "idle";
  progress: ProgressPayload | null;
  message: string | null;
  result: any;
  error: string | null;
};

const initialState: JobProgressState = {
  status: "idle",
  progress: null,
  message: null,
  result: null,
  error: null,
};

export function useJobProgress(jobId: string | null): JobProgressState {
  const [state, setState] = useState<JobProgressState>(initialState);

  useEffect(() => {
    if (!jobId) {
      setState(initialState);
      return;
    }
    setState({ ...initialState, status: "pending" });

    const source = new EventSource(`/api/video/jobs/${jobId}/events`);

    source.onmessage = (event) => {
      let parsed: JobEvent;
      try {
        parsed = JSON.parse(event.data) as JobEvent;
      } catch {
        return;
      }
      setState((prev) => {
        switch (parsed.kind) {
          case "initial":
            return {
              status: parsed.status,
              progress: parsed.progress,
              message: null,
              result: parsed.result,
              error: parsed.error,
            };
          case "status":
            return { ...prev, status: "running", message: parsed.message };
          case "progress":
            return {
              ...prev,
              status: "running",
              progress: {
                percent: parsed.percent,
                totalBytes: parsed.totalBytes,
                speedBytes: parsed.speedBytes,
                eta: parsed.eta,
              },
            };
          case "destination":
            return { ...prev, status: "running", message: parsed.line };
          case "done":
            return { ...prev, status: "done", result: parsed.payload };
          case "error":
            return { ...prev, status: "error", error: parsed.message };
          default:
            return prev;
        }
      });
    };

    source.onerror = () => {
      // Browser auto-retries by default, but if the job has clearly ended
      // we should stop. The server closes the stream on done/error so any
      // subsequent error here is a connection blip; ignore unless the job
      // is still pending.
      setState((prev) => {
        if (prev.status === "done" || prev.status === "error") {
          source.close();
          return prev;
        }
        return prev;
      });
    };

    return () => {
      source.close();
    };
  }, [jobId]);

  return state;
}

export function formatBytes(bytes: number | null | undefined) {
  if (bytes == null || !Number.isFinite(bytes)) return "";
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${bytes} B`;
}
