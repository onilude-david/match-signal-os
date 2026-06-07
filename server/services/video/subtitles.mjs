// Editorial ASS subtitle generation for libass burn-in.
//
// Replaces the legacy drawtext overlays (Arial + neon cyan #10b981) with
// typography that matches the Match Signal design context:
//   - Display: serif (Fraunces if available, Georgia fallback) for headline
//   - Body:    sans  (Inter Tight if available, Segoe UI fallback) for caption
//   - Tag:     serif italic for the watermark eyebrow
//
// Palette (from .impeccable.md):
//   --paper  #F4EFE3   --ink  #141612   --pitch #13513F
//   --gold   #B8862A   --red  #9F3A31   --blue  #254E70
//
// ASS color format is &HAABBGGRR& (alpha + BGR). The helper handles that.
//
// Output: a path to an .ass file on disk + the playResX/Y the caller passed
// in (so the ass filter knows how to scale the styles for the target canvas).

import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

export const BRAND = {
  paper: { r: 0xF4, g: 0xEF, b: 0xE3 },
  paperRaised: { r: 0xFB, g: 0xF7, b: 0xEC },
  ink: { r: 0x14, g: 0x16, b: 0x12 },
  inkMuted: { r: 0x5C, g: 0x5A, b: 0x52 },
  pitch: { r: 0x13, g: 0x51, b: 0x3F },
  gold: { r: 0xB8, g: 0x86, b: 0x2A },
  red: { r: 0x9F, g: 0x3A, b: 0x31 },
  blue: { r: 0x25, g: 0x4E, b: 0x70 },
};

// ASS color = &H + AA + BB + GG + RR  (alpha is 00 = opaque, FF = transparent)
function ass(color, alpha = 0) {
  const a = alpha.toString(16).padStart(2, "0").toUpperCase();
  const b = color.b.toString(16).padStart(2, "0").toUpperCase();
  const g = color.g.toString(16).padStart(2, "0").toUpperCase();
  const r = color.r.toString(16).padStart(2, "0").toUpperCase();
  return `&H${a}${b}${g}${r}`;
}

function ts(seconds) {
  // ASS uses H:MM:SS.cs (centiseconds).
  const safe = Math.max(0, Number(seconds) || 0);
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = Math.floor(safe % 60);
  const cs = Math.round((safe - Math.floor(safe)) * 100);
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
}

function escapeAss(text) {
  return String(text ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/\{/g, "(")
    .replace(/\}/g, ")")
    .replace(/\r?\n/g, "\\N");
}

// ----------------------------------------------------------------------------
// Style headers. PlayResX/PlayResY define the virtual canvas; libass scales
// to the real frame size. We use 1080x1920 (9:16) as the base — the same
// styles render cleanly when scaled to 1080x1080 or 1920x1080 by libass.

function buildHeader({ playResX, playResY, serifFont, sansFont }) {
  return [
    "[Script Info]",
    "Title: Match Signal editorial subtitles",
    "ScriptType: v4.00+",
    "WrapStyle: 0",
    "ScaledBorderAndShadow: yes",
    "YCbCr Matrix: TV.709",
    `PlayResX: ${playResX}`,
    `PlayResY: ${playResY}`,
    "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    // Eyebrow watermark — small, tracked, gold, top-centre on a gold hairline tag.
    `Style: Eyebrow,${serifFont},36,${ass(BRAND.paper)},${ass(BRAND.paper)},${ass(BRAND.ink)},${ass(BRAND.ink, 0x80)},1,1,0,0,100,100,6,0,3,2,0,8,80,80,80,1`,
    // Headline — large serif, paper-on-ink slab, top third.
    `Style: Headline,${serifFont},78,${ass(BRAND.paper)},${ass(BRAND.paper)},${ass(BRAND.ink)},${ass(BRAND.ink, 0x40)},1,0,0,0,100,100,-1,0,3,3,3,8,80,80,200,1`,
    // Caption — sans, paper-on-ink slab, bottom third.
    `Style: Caption,${sansFont},58,${ass(BRAND.paper)},${ass(BRAND.paper)},${ass(BRAND.ink)},${ass(BRAND.ink, 0x40)},1,0,0,0,100,100,-1,0,3,3,3,2,80,80,240,1`,
    // Transcript — sans, smaller, ink-on-paper editorial block.
    `Style: Transcript,${sansFont},44,${ass(BRAND.ink)},${ass(BRAND.ink)},${ass(BRAND.paper)},${ass(BRAND.paper, 0x18)},1,0,0,0,100,100,-1,0,3,2,2,2,120,120,160,1`,
    // Pitch accent — pull-quote in pitch green for stat or score.
    `Style: Accent,${serifFont},64,${ass(BRAND.gold)},${ass(BRAND.gold)},${ass(BRAND.ink)},${ass(BRAND.ink, 0x40)},1,1,0,0,100,100,2,0,3,3,3,5,80,80,80,1`,
    "",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
  ];
}

// ----------------------------------------------------------------------------
// Event helpers. Each layer is opt-in.

function eventLine({ style, start, end, text, layer = 0 }) {
  return `Dialogue: ${layer},${ts(start)},${ts(end)},${style},,0,0,0,,${escapeAss(text)}`;
}

// Build a tag prefix using ASS override codes.
//   \fad — fade in/out in ms
//   \an  — anchor (1..9, numpad layout; 8 = top centre, 2 = bottom centre)
//   \bord, \shad — outline / shadow
function tag(parts) {
  const inner = parts.filter(Boolean).join("");
  return inner ? `{${inner}}` : "";
}

// ----------------------------------------------------------------------------
// Compose an editorial subtitle file for one clip.
//
// All times are relative to the clip itself (0 = clip start), so libass
// burns them in regardless of where in the source we cut from.

export function composeAssScript({
  duration,
  playResX = 1080,
  playResY = 1920,
  serifFont = "Georgia",
  sansFont = "Segoe UI",
  watermarkText = "",
  headlineText = "",
  captionText = "",
  accentText = "",
  transcriptCues = [],
}) {
  const lines = buildHeader({ playResX, playResY, serifFont, sansFont });

  // Eyebrow: visible the full duration with a gentle 320ms fade.
  if (watermarkText) {
    lines.push(eventLine({
      style: "Eyebrow",
      start: 0,
      end: duration,
      text: `${tag(["\\fad(320,320)"])}${watermarkText.toUpperCase()}`,
    }));
  }

  // Headline: shown for the first 60% of the clip, fade in 280, fade out 400.
  if (headlineText) {
    const end = Math.min(duration, Math.max(2.5, duration * 0.6));
    lines.push(eventLine({
      style: "Headline",
      start: 0,
      end,
      text: `${tag(["\\fad(280,400)"])}${headlineText}`,
    }));
  }

  // Caption: shown from 25% to end, fade in 320, fade out 240.
  if (captionText) {
    const start = Math.min(duration - 0.8, duration * 0.25);
    lines.push(eventLine({
      style: "Caption",
      start: Math.max(0, start),
      end: duration,
      text: `${tag(["\\fad(320,240)"])}${captionText}`,
    }));
  }

  // Accent (optional pull-quote / score line) — middle 40% of the clip.
  if (accentText) {
    const start = duration * 0.35;
    const end = Math.min(duration, duration * 0.85);
    lines.push(eventLine({
      style: "Accent",
      start,
      end,
      text: `${tag(["\\fad(260,260)"])}${accentText}`,
      layer: 1,
    }));
  }

  // Transcript cues (Whisper output). These are at the bottom safe area.
  for (const cue of transcriptCues ?? []) {
    const start = Number(cue.start) || 0;
    const end = Math.min(duration, Number(cue.end) || start + 2);
    if (end <= start) continue;
    if (!cue.text) continue;
    lines.push(eventLine({
      style: "Transcript",
      start,
      end,
      text: `${tag(["\\fad(140,140)"])}${cue.text}`,
    }));
  }

  return lines.join("\n");
}

// ----------------------------------------------------------------------------
// Write the .ass to disk and return its path + libass-safe filter arg.
//
// The `subtitles=...` filter wants forward slashes and an escaped colon on
// Windows. We return both the raw path (for cleanup) and the escaped form
// (for the filter string).

export async function writeAssFile({
  dir,
  basename,
  script,
}) {
  await mkdir(dir, { recursive: true });
  const filename = `${basename}.ass`;
  const fullPath = path.join(dir, filename);
  await writeFile(fullPath, script, "utf-8");
  return {
    path: fullPath,
    filterValue: escapeForFilter(fullPath),
  };
}

// Escape a path for use inside an ffmpeg filter graph value:
//   - convert backslashes to forward slashes
//   - escape the drive-letter colon  (C: -> C\:)
//   - escape any remaining ' that libass might choke on
export function escapeForFilter(p) {
  return String(p)
    .replace(/\\/g, "/")
    .replace(/:/g, "\\:")
    .replace(/'/g, "\\'");
}
