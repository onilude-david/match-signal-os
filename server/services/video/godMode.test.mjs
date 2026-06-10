import { describe, expect, it } from "vitest";
import { buildClipGodMode } from "./godMode.mjs";

const fixture = {
  id: "clip-god-test",
  teamA: "Brazil",
  teamB: "Japan",
};

describe("buildClipGodMode", () => {
  it("turns scan suggestions into ranked render-ready clip plans", () => {
    const scan = {
      source: "data/sample_video.mp4",
      duration: 90,
      hasAudio: true,
      crop: { recommended: false, width: 1280, height: 720, x: 0, y: 0 },
      peaks: [{ time: 18, duration: 8 }],
      suggestions: [
        { id: "s1", type: "context", start: 40, end: 70, duration: 30, score: 0.8, reason: "Context build." },
        { id: "s2", type: "emotion", start: 18, end: 34, duration: 16, score: 1.8, reason: "Audio peak." },
      ],
    };

    const out = buildClipGodMode({ scan, fixture, maxClips: 2 });

    expect(out.ok).toBe(true);
    expect(out.plans).toHaveLength(2);
    expect(out.plans[0].clipType).toBe("emotion");
    expect(out.plans[0].render.aspects).toContain("9x16");
    expect(out.plans[0].render.mode).toBe("final");
    expect(out.recommendedAspects).toContain("4x5");
    expect(out.score).toBeGreaterThan(0);
  });

  it("falls back to editorial plans when no scan suggestions exist", () => {
    const out = buildClipGodMode({
      scan: {
        source: "data/sample_video.mp4",
        duration: 30,
        hasAudio: false,
        crop: { recommended: false, width: 1280, height: 720, x: 0, y: 0 },
        peaks: [],
        suggestions: [],
      },
      fixture,
      prediction: { storyline: "Brazil control the first phase." },
      maxClips: 3,
    });

    expect(out.plans).toHaveLength(3);
    expect(out.risks).toContain("No audio track detected; emotion scoring is less reliable.");
    expect(out.risks).toContain("No scan suggestions found; using editorial fallback plans.");
  });
});
