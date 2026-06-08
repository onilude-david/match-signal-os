// Editorial 1px progress bar for the Match Signal palette.
//   - Background: paper-raised
//   - Fill: gold rule
//   - Width: 100% of parent
// Sits under the Get-video button while a download is running.

import React from "react";
import { formatBytes, JobProgressState } from "../hooks/useJobProgress";

export function ProgressBar({ state, label }: { state: JobProgressState; label?: string }) {
  if (state.status === "idle") return null;

  const percent = state.progress?.percent ?? 0;
  const pct = Math.max(0, Math.min(100, percent));

  return (
    <div className="mt-3 flex flex-col gap-1.5">
      <div className="flex justify-between text-[0.75rem] tracking-[0.04em] uppercase text-[var(--ink-muted)]">
        <span>
          {label ? `${label} · ` : ""}
          {state.status === "pending" && "Queued"}
          {state.status === "running" && (
            <>
              <span className="figure text-ink tabular-nums">{pct.toFixed(1)}%</span>
              {state.progress?.totalBytes ? ` · ${formatBytes(state.progress.totalBytes)}` : ""}
              {state.progress?.speedBytes ? ` · ${formatBytes(state.progress.speedBytes)}/s` : ""}
              {state.progress?.eta ? ` · ETA ${state.progress.eta}` : ""}
            </>
          )}
          {state.status === "done" && <span className="text-pitch">Complete</span>}
          {state.status === "error" && <span className="text-[var(--red)]">Failed</span>}
        </span>
        {state.message && state.status === "running" && (
          <span className="text-[var(--ink-quiet)] truncate max-w-[60%]">{state.message}</span>
        )}
      </div>
      <div className="h-px w-full bg-[var(--paper-raised)] relative overflow-hidden border-t border-[var(--rule)]">
        <div
          className="absolute inset-y-0 left-0 transition-[width] duration-200 ease-out"
          style={{
            width: state.status === "error" ? "100%" : `${pct}%`,
            background: state.status === "error" ? "var(--red)" : "var(--gold)",
          }}
        />
      </div>
      {state.status === "error" && state.error && (
        <p className="text-[0.75rem] text-[var(--red)] leading-[1.45]">{state.error}</p>
      )}
    </div>
  );
}
