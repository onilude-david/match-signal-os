// Editor-class timeline for the Clip Factory.
//
// Layers (top to bottom):
//   1. caption rail            — current time + in/out readout
//   2. waveform PNG backdrop   — full-track audio shape (paper-raised tint)
//   3. thumbnail strip         — N evenly-spaced JPEGs (cached server-side)
//   4. scene-marker ticks      — vertical hairlines from scan results
//   5. selected-window overlay — gold-bordered band between in and out
//   6. draggable in/out handles + playhead caret
//
// Interaction:
//   - Click empty timeline       -> seek video to that point
//   - Drag IN handle             -> updates clip.startTime
//   - Drag OUT handle            -> updates clip.endTime
//   - Drag selection band middle -> moves whole window, preserving duration
//   - Hotkeys (when timeline is focused):
//       J = jump back 2s     K = pause/play     L = jump forward 2s
//       I = set in to playhead
//       O = set out to playhead
//       ← → = frame-step (1/fps)
//       , . = jump 0.5s     [ ] = jump 5s
//
// Performance note: thumbnails are <img loading="lazy">. Even 240 of them at
// 180px wide is ~50kB each = ~12MB lazy-loaded across the page. Plenty fast.

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ScanResult } from "../types";

export type TimelineThumb = { index: number; time: number; url: string };
export type TimelineWaveform = { url: string; duration: number; width: number; height: number };

export type ClipTimelineProps = {
  duration: number;
  fps?: number;
  inTime: number;
  outTime: number;
  thumbs?: TimelineThumb[];
  waveform?: TimelineWaveform | null;
  scan?: ScanResult | null;
  videoRef?: React.RefObject<HTMLVideoElement | null>;
  onTrim: (next: { inTime: number; outTime: number }) => void;
  onSeek?: (time: number) => void;
};

export function ClipTimeline({
  duration,
  fps = 30,
  inTime,
  outTime,
  thumbs = [],
  waveform = null,
  scan = null,
  videoRef,
  onTrim,
  onSeek,
}: ClipTimelineProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [playhead, setPlayhead] = useState(0);
  const [dragging, setDragging] = useState<null | "in" | "out" | "band" | "seek">(null);
  const dragOffsetRef = useRef(0);
  const dragInitialRef = useRef({ inTime, outTime });

  const safeDuration = Math.max(0.1, duration);
  const inPct = clamp01(inTime / safeDuration) * 100;
  const outPct = clamp01(outTime / safeDuration) * 100;

  // ---------- playhead sync ----------------------------------------------
  // Drive the playhead from the <video> element's timeupdate / animation
  // frame so it stays smooth even when seeks come from outside the timeline.
  useEffect(() => {
    const video = videoRef?.current;
    if (!video) return;
    let raf = 0;
    const tick = () => {
      if (video.currentTime !== playhead) setPlayhead(video.currentTime);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [videoRef, playhead]);

  // ---------- pixel <-> time helpers -------------------------------------
  const pixelToTime = useCallback((clientX: number) => {
    const el = containerRef.current;
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    const ratio = clamp01((clientX - rect.left) / rect.width);
    return ratio * safeDuration;
  }, [safeDuration]);

  // ---------- drag flow ---------------------------------------------------
  useEffect(() => {
    if (!dragging) return;

    const onMove = (e: PointerEvent) => {
      e.preventDefault();
      const t = pixelToTime(e.clientX);
      if (dragging === "in") {
        const next = clamp(t, 0, outTime - 1 / fps);
        onTrim({ inTime: next, outTime });
      } else if (dragging === "out") {
        const next = clamp(t, inTime + 1 / fps, safeDuration);
        onTrim({ inTime, outTime: next });
      } else if (dragging === "band") {
        const desiredStart = t - dragOffsetRef.current;
        const windowLen = dragInitialRef.current.outTime - dragInitialRef.current.inTime;
        const start = clamp(desiredStart, 0, safeDuration - windowLen);
        onTrim({ inTime: start, outTime: start + windowLen });
      } else if (dragging === "seek") {
        seekVideo(t);
      }
    };

    const onUp = () => setDragging(null);

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [dragging, fps, inTime, outTime, onTrim, pixelToTime, safeDuration]);

  const seekVideo = (t: number) => {
    const video = videoRef?.current;
    if (video) video.currentTime = clamp(t, 0, safeDuration);
    onSeek?.(t);
  };

  // ---------- hotkeys -----------------------------------------------------
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const video = videoRef?.current;
    if (!video) return;
    const frame = 1 / fps;
    switch (e.key.toLowerCase()) {
      case "j": seekVideo(video.currentTime - 2); break;
      case "k": video.paused ? video.play() : video.pause(); break;
      case "l": seekVideo(video.currentTime + 2); break;
      case "i": onTrim({ inTime: clamp(video.currentTime, 0, outTime - frame), outTime }); break;
      case "o": onTrim({ inTime, outTime: clamp(video.currentTime, inTime + frame, safeDuration) }); break;
      case "arrowleft": seekVideo(video.currentTime - frame); break;
      case "arrowright": seekVideo(video.currentTime + frame); break;
      case ",": seekVideo(video.currentTime - 0.5); break;
      case ".": seekVideo(video.currentTime + 0.5); break;
      case "[": seekVideo(video.currentTime - 5); break;
      case "]": seekVideo(video.currentTime + 5); break;
      default: return;
    }
    e.preventDefault();
  };

  // ---------- click empty timeline ---------------------------------------
  const onTimelinePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).dataset.handle) return;
    const t = pixelToTime(e.clientX);
    seekVideo(t);
    setDragging("seek");
    (e.currentTarget as HTMLDivElement).focus();
  };

  // ---------- scene markers ---------------------------------------------
  const sceneTicks = useMemo(() => {
    if (!scan?.scenes) return [];
    return scan.scenes
      .filter((s) => s.time > 0 && s.time < safeDuration)
      .map((s) => ({ time: s.time, score: s.score ?? 0.5 }));
  }, [scan, safeDuration]);

  const peakBands = useMemo(() => {
    if (!scan?.peaks) return [];
    return scan.peaks
      .filter((p) => p.duration > 1.5)
      .map((p) => ({ start: p.time, end: p.time + p.duration }));
  }, [scan]);

  // ---------- render ------------------------------------------------------
  return (
    <div className="clip-timeline" tabIndex={0} onKeyDown={onKeyDown}>
      {/* Caption / readout rail */}
      <div className="flex justify-between text-[0.75rem] tracking-[0.04em] uppercase text-[var(--ink-muted)] pb-1">
        <span>
          <span className="text-[var(--ink-quiet)]">In</span>{" "}
          <span className="figure text-ink tabular-nums">{tc(inTime, fps)}</span>
          <span className="text-[var(--ink-quiet)]"> · Out </span>
          <span className="figure text-ink tabular-nums">{tc(outTime, fps)}</span>
          <span className="text-[var(--ink-quiet)]"> · Δ </span>
          <span className="figure text-ink tabular-nums">{tc(Math.max(0, outTime - inTime), fps)}</span>
        </span>
        <span>
          <span className="text-[var(--ink-quiet)]">Playhead </span>
          <span className="figure text-ink tabular-nums">{tc(playhead, fps)}</span>
          <span className="text-[var(--ink-quiet)]"> / </span>
          <span className="figure tabular-nums">{tc(safeDuration, fps)}</span>
        </span>
      </div>

      {/* Timeline canvas */}
      <div
        ref={containerRef}
        className="clip-timeline-canvas"
        onPointerDown={onTimelinePointerDown}
      >
        {/* Waveform backdrop */}
        {waveform && (
          <img
            src={waveform.url}
            alt=""
            className="absolute inset-0 w-full h-full object-fill opacity-25 pointer-events-none select-none"
            draggable={false}
          />
        )}

        {/* Thumbnail strip */}
        <div className="absolute inset-0 flex pointer-events-none select-none">
          {thumbs.map((t) => (
            <img
              key={t.index}
              src={t.url}
              alt=""
              loading="lazy"
              draggable={false}
              className="h-full object-cover flex-1 min-w-0"
              style={{ borderRight: "1px solid rgba(20,22,18,0.08)" }}
            />
          ))}
          {thumbs.length === 0 && (
            <div className="flex-1 flex items-center justify-center text-[0.75rem] text-[var(--ink-quiet)] tracking-[0.04em] uppercase">
              Generate thumbnails to scrub
            </div>
          )}
        </div>

        {/* Loud-audio peak bands (subtle gold tint) */}
        {peakBands.map((b, i) => (
          <div
            key={`peak-${i}`}
            className="absolute top-0 bottom-0 pointer-events-none"
            style={{
              left: `${(b.start / safeDuration) * 100}%`,
              width: `${((b.end - b.start) / safeDuration) * 100}%`,
              background: "linear-gradient(180deg, rgba(184,134,42,0.18) 0%, rgba(184,134,42,0.04) 100%)",
            }}
          />
        ))}

        {/* Scene-cut ticks */}
        {sceneTicks.map((s, i) => (
          <div
            key={`scene-${i}`}
            className="absolute top-0 bottom-0 w-px pointer-events-none"
            style={{
              left: `${(s.time / safeDuration) * 100}%`,
              background: `rgba(20,22,18,${0.35 + Math.min(0.4, s.score * 0.4)})`,
            }}
          />
        ))}

        {/* Selected window band */}
        <div
          className="absolute top-0 bottom-0 cursor-grab"
          data-handle="band"
          style={{
            left: `${inPct}%`,
            width: `${Math.max(0, outPct - inPct)}%`,
            background: "rgba(184,134,42,0.10)",
            borderLeft: "2px solid var(--gold)",
            borderRight: "2px solid var(--gold)",
          }}
          onPointerDown={(e) => {
            e.stopPropagation();
            const t = pixelToTime(e.clientX);
            dragOffsetRef.current = t - inTime;
            dragInitialRef.current = { inTime, outTime };
            setDragging("band");
          }}
        />

        {/* IN handle */}
        <div
          className="absolute top-0 bottom-0 w-3 -translate-x-1/2 cursor-ew-resize"
          data-handle="in"
          style={{ left: `${inPct}%` }}
          onPointerDown={(e) => { e.stopPropagation(); setDragging("in"); }}
        >
          <div className="h-full" style={{ borderLeft: "3px solid var(--gold)" }} />
        </div>

        {/* OUT handle */}
        <div
          className="absolute top-0 bottom-0 w-3 -translate-x-1/2 cursor-ew-resize"
          data-handle="out"
          style={{ left: `${outPct}%` }}
          onPointerDown={(e) => { e.stopPropagation(); setDragging("out"); }}
        >
          <div className="h-full" style={{ borderRight: "3px solid var(--gold)" }} />
        </div>

        {/* Playhead */}
        <div
          className="absolute top-0 bottom-0 w-px pointer-events-none"
          style={{
            left: `${clamp01(playhead / safeDuration) * 100}%`,
            background: "var(--ink)",
            boxShadow: "0 0 0 0.5px var(--ink)",
          }}
        />
      </div>

      {/* Hotkey legend */}
      <p className="mt-2 text-[0.7rem] tracking-[0.04em] uppercase text-[var(--ink-quiet)]">
        J / K / L scrub · I / O set in / out · ← → frame · [ ] 5s · , . half-sec
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers

function clamp(v: number, lo: number, hi: number) {
  return Math.min(Math.max(v, lo), hi);
}

function clamp01(v: number) {
  return clamp(v, 0, 1);
}

// Frame-accurate timecode (HH:MM:SS:FF). For short clips we drop the hour.
function tc(seconds: number, fps: number) {
  const safe = Math.max(0, seconds);
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = Math.floor(safe % 60);
  const f = Math.floor((safe - Math.floor(safe)) * fps);
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  const ff = String(f).padStart(2, "0");
  return h ? `${h}:${mm}:${ss}:${ff}` : `${mm}:${ss}:${ff}`;
}
