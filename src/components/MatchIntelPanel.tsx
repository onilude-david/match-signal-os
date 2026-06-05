import React from "react";
import { Fixture, MatchIntel } from "../types";

type MatchIntelPanelProps = {
  fixture: Fixture;
  intel: MatchIntel;
};

export function MatchIntelPanel({ fixture, intel }: MatchIntelPanelProps) {
  const summaryEvent = intel.summary?.sport_event ?? intel.summary?.summary?.sport_event;
  const summaryStatus = intel.summary?.sport_event_status ?? intel.summary?.summary?.sport_event_status;
  const timelineEvents = intel.timeline?.timeline ?? intel.timeline?.events ?? [];
  const lineups = intel.lineups?.lineups ?? intel.lineups?.sport_event_lineups ?? intel.lineups?.competitors ?? [];
  const momentum = intel.momentum?.momentum ?? intel.momentum?.graph ?? [];

  return (
    <section className="grid grid-cols-1 gap-5 mt-4 md:grid-cols-2">
      {/* Summary */}
      <article className="bg-paper border border-line-border/45 rounded-none p-5 flex flex-col gap-3 hover:border-signal-gold/45 transition-colors duration-300">
        <div>
          <p className="text-signal-gold text-[10px] font-extrabold uppercase tracking-[0.18em] mb-0.5">
            Sportradar Summary
          </p>
          <h2 className="text-ink text-sm font-bold tracking-tight truncate">
            {fixture.sourceId ?? "No event ID loaded"}
          </h2>
        </div>
        {summaryEvent || summaryStatus ? (
          <div className="flex flex-col gap-2 mt-2">
            <span className="bg-paper-2 border border-line-border/30 rounded-none p-2.5 text-xs text-ink">
              Kickoff: {summaryEvent?.start_time ?? `${fixture.date} ${fixture.time}`}
            </span>
            <span className="bg-paper-2 border border-line-border/30 rounded-none p-2.5 text-xs text-ink">
              Status: {summaryStatus?.status ?? fixture.status}
            </span>
            <span className="bg-paper-2 border border-line-border/30 rounded-none p-2.5 text-xs text-ink">
              Venue: {summaryEvent?.venue?.name ?? (fixture.venue || "TBD")}
            </span>
            <span className="bg-paper-2 border border-line-border/30 rounded-none p-2.5 text-xs text-ink">
              Coverage: {summaryEvent?.coverage?.type ?? "Pending"}
            </span>
          </div>
        ) : (
          <p className="text-xs text-muted-text leading-relaxed mt-2">
            Fetch SR summary to load official match status, coverage, venue, and timing.
          </p>
        )}
      </article>

      {/* Lineups */}
      <article className="bg-paper border border-line-border/45 rounded-none p-5 flex flex-col gap-3 hover:border-signal-gold/45 transition-colors duration-300">
        <div>
          <p className="text-signal-gold text-[10px] font-extrabold uppercase tracking-[0.18em] mb-0.5">
            Lineups & Formations
          </p>
          <h2 className="text-ink text-sm font-bold tracking-tight truncate">
            {Array.isArray(lineups) ? lineups.length : 0} records
          </h2>
        </div>
        {Array.isArray(lineups) && lineups.length ? (
          <div className="flex flex-col gap-2 mt-2">
            {lineups.slice(0, 5).map((item: any, index: number) => (
              <span
                key={`${item.id ?? item.name ?? "lineup"}-${index}`}
                className="bg-paper-2 border border-line-border/30 rounded-none p-2.5 text-xs text-ink truncate"
              >
                {item.name ?? item.competitor?.name ?? item.type ?? `Lineup ${index + 1}`}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-text leading-relaxed mt-2">
            Fetch SR lineups near match time to show XI, bench, formations, and player availability.
          </p>
        )}
      </article>

      {/* Timeline */}
      <article className="bg-paper border border-line-border/45 rounded-none p-5 flex flex-col gap-3 hover:border-signal-gold/45 transition-colors duration-300">
        <div>
          <p className="text-signal-gold text-[10px] font-extrabold uppercase tracking-[0.18em] mb-0.5">
            Timeline
          </p>
          <h2 className="text-ink text-sm font-bold tracking-tight truncate">
            {Array.isArray(timelineEvents) ? timelineEvents.length : 0} events
          </h2>
        </div>
        {Array.isArray(timelineEvents) && timelineEvents.length ? (
          <div className="flex flex-col gap-2 mt-2">
            {timelineEvents.slice(0, 5).map((event: any, index: number) => (
              <span
                key={`${event.id ?? event.time ?? "event"}-${index}`}
                className="bg-paper-2 border border-line-border/30 rounded-none p-2.5 text-xs text-ink truncate"
              >
                {event.time ? `${event.time}' ` : ""}
                {event.type ?? event.match_status ?? "Timeline event"}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-text leading-relaxed mt-2">
            Fetch SR timeline for goals, cards, substitutions, and live match contexts.
          </p>
        )}
      </article>

      {/* Momentum */}
      <article className="bg-paper border border-line-border/45 rounded-none p-5 flex flex-col gap-3 hover:border-signal-gold/45 transition-colors duration-300">
        <div>
          <p className="text-signal-gold text-[10px] font-extrabold uppercase tracking-[0.18em] mb-0.5">
            Momentum
          </p>
          <h2 className="text-ink text-sm font-bold tracking-tight truncate">
            {Array.isArray(momentum) ? momentum.length : 0} points
          </h2>
        </div>
        {Array.isArray(momentum) && momentum.length ? (
          <div className="flex flex-col gap-2 mt-2">
            {momentum.slice(-5).map((point: any, index: number) => (
              <span
                key={`${point.minute ?? point.time ?? "momentum"}-${index}`}
                className="bg-paper-2 border border-line-border/30 rounded-none p-2.5 text-xs text-ink truncate"
              >
                {point.minute ?? point.time ?? index + 1}': {point.value ?? point.momentum ?? "signal"}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-text leading-relaxed mt-2">
            Fetch SR momentum during live windows to show match pressure swings.
          </p>
        )}
      </article>
    </section>
  );
}

export default MatchIntelPanel;
