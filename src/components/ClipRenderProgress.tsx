// Per-clip render progress bar. Wraps useJobProgress so each ClipPlan card
// can have its own SSE subscription without violating the rules of hooks
// (no hooks-in-loops in the parent).
//
// Fires onDone(payload) exactly once when the job transitions to done so
// the parent can merge `payload.jobs[]` into the render queue.

import { useEffect, useRef } from "react";
import { useJobProgress } from "../hooks/useJobProgress";
import { ProgressBar } from "./ProgressBar";

export type ClipRenderProgressProps = {
  jobId: string | null;
  onDone: (payload: any) => void;
  onError?: (message: string) => void;
};

export function ClipRenderProgress({ jobId, onDone, onError }: ClipRenderProgressProps) {
  const state = useJobProgress(jobId);
  const settledRef = useRef<string | null>(null);

  useEffect(() => {
    if (!jobId) return;
    if (settledRef.current === jobId) return;
    if (state.status === "done" && state.result) {
      settledRef.current = jobId;
      onDone(state.result);
    } else if (state.status === "error" && state.error) {
      settledRef.current = jobId;
      onError?.(state.error);
    }
  }, [jobId, state.status, state.result, state.error, onDone, onError]);

  if (!jobId) return null;
  return <ProgressBar state={state} label="ffmpeg" />;
}
