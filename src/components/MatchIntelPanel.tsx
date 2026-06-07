import React from "react";
import { Fixture, MatchIntel } from "../types";

type MatchIntelPanelProps = {
  fixture: Fixture;
  intel: MatchIntel;
};

type Panel = {
  eyebrow: string;
  count: number;
  items: Array<string>;
  emptyHint: string;
};

export function MatchIntelPanel({ fixture, intel }: MatchIntelPanelProps) {
  const summaryEvent = intel.summary?.sport_event ?? intel.summary?.summary?.sport_event;
  const summaryStatus = intel.summary?.sport_event_status ?? intel.summary?.summary?.sport_event_status;
  const timelineEvents: any[] = intel.timeline?.timeline ?? intel.timeline?.events ?? [];
  const lineups: any[] = intel.lineups?.lineups ?? intel.lineups?.sport_event_lineups ?? intel.lineups?.competitors ?? [];
  const momentum: any[] = intel.momentum?.momentum ?? intel.momentum?.graph ?? [];

  const summaryItems = summaryEvent || summaryStatus
    ? [
        `Kickoff: ${summaryEvent?.start_time ?? `${fixture.date} ${fixture.time}`}`,
        `Status: ${summaryStatus?.status ?? fixture.status}`,
        `Venue: ${summaryEvent?.venue?.name ?? (fixture.venue || "TBD")}`,
        `Coverage: ${summaryEvent?.coverage?.type ?? "Pending"}`,
      ]
    : [];

  const panels: Panel[] = [
    {
      eyebrow: "Summary",
      count: summaryItems.length,
      items: summaryItems,
      emptyHint: "Fetch SR summary to load official match status, coverage, venue, and timing.",
    },
    {
      eyebrow: "Lineups & formations",
      count: Array.isArray(lineups) ? lineups.length : 0,
      items: (Array.isArray(lineups) ? lineups : [])
        .slice(0, 5)
        .map((item: any, i: number) => item.name ?? item.competitor?.name ?? item.type ?? `Lineup ${i + 1}`),
      emptyHint: "Fetch SR lineups near match time to show XI, bench, formations, and player availability.",
    },
    {
      eyebrow: "Timeline",
      count: Array.isArray(timelineEvents) ? timelineEvents.length : 0,
      items: (Array.isArray(timelineEvents) ? timelineEvents : [])
        .slice(0, 5)
        .map((event: any) => `${event.time ? `${event.time}' ` : ""}${event.type ?? event.match_status ?? "Timeline event"}`),
      emptyHint: "Fetch SR timeline for goals, cards, substitutions, and live match contexts.",
    },
    {
      eyebrow: "Momentum",
      count: Array.isArray(momentum) ? momentum.length : 0,
      items: (Array.isArray(momentum) ? momentum : [])
        .slice(-5)
        .map((point: any, i: number) => `${point.minute ?? point.time ?? i + 1}': ${point.value ?? point.momentum ?? "signal"}`),
      emptyHint: "Fetch SR momentum during live windows to show match pressure swings.",
    },
  ];

  return (
    <section>
      <div className="flex flex-wrap items-baseline justify-between gap-3 pb-3 border-b border-[var(--rule-strong)]">
        <div>
          <p className="eyebrow gold">Match Intel · Sportradar</p>
          <h2 className="mt-1 text-ink">{fixture.sourceId ?? "No event ID loaded"}</h2>
        </div>
        <span className="caption">{fixture.teamA} vs {fixture.teamB}</span>
      </div>
      <div className="match-intel-grid">
        {panels.map((panel) => (
          <article className="data-panel" key={panel.eyebrow}>
            <p className="eyebrow pitch">{panel.eyebrow}</p>
            <h3 className="mt-1 text-ink font-display [font-variation-settings:'opsz'_60] font-medium text-[1.05rem] tracking-[-0.015em]">
              {panel.count} {panel.count === 1 ? "record" : "records"}
            </h3>
            {panel.items.length ? (
              <div className="intel-list">
                {panel.items.map((item, i) => (
                  <span key={`${panel.eyebrow}-${i}`}>{item}</span>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-[0.875rem] leading-[1.55] text-[var(--ink-muted)] max-w-[36ch]">
                {panel.emptyHint}
              </p>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}

export default MatchIntelPanel;
