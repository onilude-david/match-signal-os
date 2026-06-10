import { buildClipPlans, slug, videoPresets } from "../video.mjs";

const round = (value, places = 2) => {
  const factor = 10 ** places;
  return Math.round((Number(value) || 0) * factor) / factor;
};

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const titleFor = ({ fixture, suggestion, index }) => {
  const matchup = `${fixture?.teamA ?? "Team A"} vs ${fixture?.teamB ?? "Team B"}`;
  const label = {
    signal: "The Signal",
    emotion: "Pressure Moment",
    context: "Why It Matters",
    recap: "Match Recap",
  }[suggestion.type] ?? "Clip";
  return `${matchup}: ${label} ${index + 1}`;
};

const hookFor = (suggestion) => ({
  signal: "This is the moment the match starts to tilt.",
  emotion: "You can hear the pressure before you see the outcome.",
  context: "The setup explains the swing.",
  recap: "Three beats that explain the match.",
}[suggestion.type] ?? "Watch the signal here.");

const treatmentFor = (suggestion, scan) => {
  const cropNote = scan.crop?.recommended
    ? "Use fill crop; cropdetect found letterbox space worth removing."
    : "Use fill crop for vertical, fit only if the tactical shape matters more than pace.";
  return `${videoPresets[suggestion.type]?.treatment ?? "Tight editorial cut with clear hook."} ${cropNote}`;
};

const scoreSuggestion = (suggestion, scan, index) => {
  const base = Number(suggestion.score ?? 0);
  const duration = Number(suggestion.duration ?? (suggestion.end - suggestion.start));
  const durationFit =
    duration >= 12 && duration <= 35 ? 0.18 :
    duration >= 8 && duration <= 55 ? 0.08 :
    -0.08;
  const earlyPenalty = suggestion.start < 2 ? -0.04 : 0;
  const audioBoost = (scan.peaks ?? []).some((peak) => Math.abs(peak.time - suggestion.start) < 5) ? 0.14 : 0;
  const rankDecay = Math.max(0, 0.08 - index * 0.015);
  return round(clamp(base / 2.2 + durationFit + audioBoost + rankDecay + earlyPenalty, 0, 1), 3);
};

export const buildClipGodMode = ({ scan, fixture = {}, prediction = {}, content = {}, maxClips = 6 }) => {
  const fallbackPlans = buildClipPlans({ fixture, prediction, content });
  const suggestions = Array.isArray(scan?.suggestions) && scan.suggestions.length
    ? scan.suggestions
    : fallbackPlans.map((plan) => ({
        id: plan.id,
        type: plan.clipType,
        start: plan.startTime,
        end: plan.endTime,
        duration: plan.duration,
        score: 0.55,
        reason: plan.reason,
      }));

  const duration = Math.max(1, Number(scan?.duration ?? 0) || 0);
  const ranked = suggestions
    .map((suggestion, index) => {
      const preset = videoPresets[suggestion.type] ?? videoPresets.signal;
      const start = clamp(Number(suggestion.start ?? 0), 0, Math.max(0, duration - 0.5));
      const desiredDuration = Number(suggestion.duration ?? preset.duration);
      const clipDuration = clamp(desiredDuration, 8, suggestion.type === "recap" ? 90 : 45);
      const end = clamp(Number(suggestion.end ?? start + clipDuration), start + 0.5, duration || start + clipDuration);
      const finalDuration = round(Math.max(0.5, end - start), 2);
      const score = scoreSuggestion({ ...suggestion, start, end, duration: finalDuration }, scan ?? {}, index);
      const quality = score >= 0.75 ? "A" : score >= 0.58 ? "B" : score >= 0.42 ? "C" : "Hold";
      return {
        id: `${fixture?.id ?? "match"}-god-${slug(suggestion.type)}-${index + 1}`,
        matchId: fixture?.id ?? "",
        clipType: suggestion.type,
        preset: preset.label,
        title: titleFor({ fixture, suggestion, index }),
        hook: hookFor(suggestion),
        startTime: round(start, 2),
        endTime: round(end, 2),
        duration: finalDuration,
        platforms: preset.platform,
        treatment: treatmentFor(suggestion, scan ?? {}),
        reason: suggestion.reason ?? "Ranked by God Mode from scan signals.",
        status: "God Mode",
        score,
        quality,
        render: {
          aspects: suggestion.type === "recap" ? ["9x16", "16x9"] : ["9x16", "1x1", "4x5"],
          mode: score >= 0.55 ? "final" : "rough",
          cropMode: scan?.crop?.recommended === false && suggestion.type === "context" ? "fit" : "fill",
          codec: "h264",
          headlineText: titleFor({ fixture, suggestion, index }).replace(`${fixture?.teamA ?? "Team A"} vs ${fixture?.teamB ?? "Team B"}: `, ""),
          captionText: hookFor(suggestion),
          accentText: quality === "A" ? "Priority cut" : quality === "B" ? "Strong candidate" : "Review before render",
        },
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(1, maxClips));

  const avgScore = ranked.length
    ? ranked.reduce((sum, plan) => sum + plan.score, 0) / ranked.length
    : 0;
  const grade = avgScore >= 0.72 ? "A" : avgScore >= 0.55 ? "B" : avgScore >= 0.38 ? "C" : "Hold";
  const recommendedAspects = [...new Set(ranked.flatMap((plan) => plan.render.aspects))];
  const risks = [];
  if (!scan?.hasAudio) risks.push("No audio track detected; emotion scoring is less reliable.");
  if (!scan?.suggestions?.length) risks.push("No scan suggestions found; using editorial fallback plans.");
  if (scan?.crop?.recommended) risks.push("Letterbox/crop issue detected; review framing before final render.");

  return {
    ok: true,
    grade,
    score: round(avgScore, 3),
    summary: `${ranked.length} ranked clip${ranked.length === 1 ? "" : "s"} ready for review.`,
    source: scan?.source ?? null,
    duration,
    recommendedAspects,
    risks,
    plans: ranked,
  };
};
