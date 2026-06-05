import React from "react";
import { CalendarPlus, Layers, BarChart3 } from "lucide-react";
import { Fixture, StandingGroup } from "../types";
import { Metric } from "./Metric";
import { Button } from "./ui/Button";

type WorldCupDataViewProps = {
  fixtures: Fixture[];
  selectedId: string;
  onSelect: (fixtureId: string) => void;
  onImport: () => void;
  onDualSync: () => void;
  standings: StandingGroup[];
  onLoadStandings: () => void;
  loadingStates?: {
    importFixtures?: boolean;
    syncWorldCup?: boolean;
    standings?: boolean;
  };
};

const prettyStage = (value: string) => value.replace(/_/g, " ");

const groupNameFor = (fixture: Fixture) => {
  const parts = fixture.stage.split("/");
  return parts[1]?.trim() ?? "Knockout";
};

const matchdayFor = (fixture: Fixture) => {
  const group = groupNameFor(fixture);
  return group.startsWith("GROUP_")
    ? group.replace("GROUP_", "Group ")
    : prettyStage(fixture.stage.split("/")[0]?.trim() || "Match");
};

const sortFixtures = (items: Fixture[]) =>
  [...items].sort((a, b) => `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`));

const groupFixturesBy = (fixtures: Fixture[], getKey: (fixture: Fixture) => string) =>
  sortFixtures(fixtures).reduce<Record<string, Fixture[]>>((groups, fixture) => {
    const key = getKey(fixture);
    groups[key] = [...(groups[key] ?? []), fixture];
    return groups;
  }, {});

const buildGroupTables = (fixtures: Fixture[]) => {
  const groups = groupFixturesBy(
    fixtures.filter((fixture) => groupNameFor(fixture).startsWith("GROUP_")),
    groupNameFor,
  );

  return Object.fromEntries(
    Object.entries(groups).map(([group, matches]) => {
      const teams = Array.from(
        new Set(
          matches
            .flatMap((match) => [match.teamA, match.teamB])
            .filter((team) => team && team !== "TBD"),
        ),
      ).sort();
      return [
        group.replace("GROUP_", "Group "),
        teams.map((team) => ({
          team,
          played: 0,
          wins: 0,
          draws: 0,
          losses: 0,
          goalsFor: 0,
          goalsAgainst: 0,
          goalDifference: 0,
          points: 0,
        })),
      ];
    }),
  );
};

export function WorldCupDataView({
  fixtures,
  selectedId,
  onSelect,
  onImport,
  onDualSync,
  standings,
  onLoadStandings,
  loadingStates = {},
}: WorldCupDataViewProps) {
  const worldCupFixtures = sortFixtures(
    fixtures.filter((fixture) => fixture.id.startsWith("fd-") || fixture.sourceId?.startsWith("sr:")),
  );
  const displayFixtures = worldCupFixtures.length ? worldCupFixtures : sortFixtures(fixtures);
  const groupTables = buildGroupTables(displayFixtures);
  const tableGroups = standings.length
    ? standings
    : Object.entries(groupTables).map(([group, rows]) => ({
        group,
        rows: rows.map((row, index) => ({ ...row, rank: index + 1 })),
      }));
  const byGroup = groupFixturesBy(displayFixtures, groupNameFor);
  const byMatchday = groupFixturesBy(displayFixtures, matchdayFor);
  const groupFixtureCount = displayFixtures.filter((fixture) => groupNameFor(fixture).startsWith("GROUP_")).length;
  const knockoutFixtureCount = displayFixtures.length - groupFixtureCount;
  const footballDataCount = displayFixtures.filter((fixture) => fixture.id.startsWith("fd-")).length;
  const sportradarEnrichedCount = displayFixtures.filter((fixture) => fixture.sourceId?.startsWith("sr:")).length;

  return (
    <section className="flex flex-col gap-6">
      <div className="bg-paper border border-line-border/50 rounded-none p-5  flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <p className="text-pitch-green text-[10px] font-extrabold uppercase tracking-wider mb-1">
            World Cup 2026 Data
          </p>
          <h2 className="text-ink text-xl font-black tracking-tight">Tournament Schedule</h2>
          <p className="text-sm text-muted-text max-w-xl mt-1 leading-relaxed">
            Live API fixtures are converted into match queues, group standings, content priorities, and prediction workflows.
          </p>
        </div>
        <div className="flex flex-wrap gap-2.5">
          <Button
            variant="glass"
            icon={<CalendarPlus size={15} />}
            onClick={onImport}
            loading={loadingStates.importFixtures}
          >
            Football-data sync
          </Button>
          <Button
            variant="glass"
            icon={<Layers size={15} />}
            onClick={onDualSync}
            loading={loadingStates.syncWorldCup}
          >
            Dual-source sync
          </Button>
          <Button
            variant="glass"
            icon={<BarChart3 size={15} />}
            onClick={onLoadStandings}
            loading={loadingStates.standings}
          >
            Official standings
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <Metric label="Matches loaded" value={String(displayFixtures.length)} />
        <Metric label="Football-data rows" value={String(footballDataCount)} />
        <Metric label="Sportradar IDs" value={String(sportradarEnrichedCount)} />
        <Metric label="Group fixtures" value={String(groupFixtureCount)} />
        <Metric label="Knockout fixtures" value={String(knockoutFixtureCount)} />
        <Metric label="Official groups" value={String(standings.length)} />
      </div>

      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {tableGroups.map(({ group, rows }) => (
          <article
            className="bg-paper border border-line-border/50 rounded-none p-5  flex flex-col gap-4"
            key={group}
          >
            <div className="flex justify-between items-baseline border-b border-line-border/30 pb-2.5">
              <h2 className="text-ink font-black text-base md:text-lg tracking-tight">{group}</h2>
              <small className="text-[10px] text-muted-text uppercase font-bold tracking-wider">
                {standings.length ? "official" : "generated"} · {rows.length} teams
              </small>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs md:text-sm">
                <thead>
                  <tr className="border-b border-line-border/40 text-[10px] text-muted-text font-bold uppercase tracking-wider">
                    <th className="py-2 pr-2">#</th>
                    <th className="py-2 pr-2">Team</th>
                    <th className="py-2 pr-2">P</th>
                    <th className="py-2 pr-2">W</th>
                    <th className="py-2 pr-2">D</th>
                    <th className="py-2 pr-2">L</th>
                    <th className="py-2 pr-2">GD</th>
                    <th className="py-2">Pts</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line-border/10 text-ink">
                  {rows.map((row) => (
                    <tr key={row.team} className="hover:bg-white/5 transition-colors duration-150">
                      <td className="py-2.5 pr-2 font-mono font-bold text-pitch-green">{row.rank}</td>
                      <td className="py-2.5 pr-2 font-semibold text-ink truncate max-w-[120px]">
                        {row.team}
                      </td>
                      <td className="py-2.5 pr-2 font-mono">{row.played}</td>
                      <td className="py-2.5 pr-2 font-mono">{row.wins}</td>
                      <td className="py-2.5 pr-2 font-mono">{row.draws}</td>
                      <td className="py-2.5 pr-2 font-mono">{row.losses}</td>
                      <td className="py-2.5 pr-2 font-mono text-muted-text">{row.goalDifference}</td>
                      <td className="py-2.5 font-bold font-mono text-pitch-green">{row.points}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>
        ))}
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <article className="bg-paper border border-line-border/50 rounded-none p-5  flex flex-col gap-4 lg:col-span-2">
          <div className="border-b border-line-border/30 pb-3">
            <p className="text-pitch-green text-[10px] font-extrabold uppercase tracking-wider mb-0.5">
              All Matches
            </p>
            <h2 className="text-ink text-base md:text-lg font-black tracking-tight">
              Schedule Table
            </h2>
          </div>
          <div className="overflow-auto max-h-[600px]">
            <table className="w-full text-left border-collapse text-xs md:text-sm">
              <thead className="sticky top-0 z-10 bg-field-bg/95 backdrop-blur-md">
                <tr className="border-b border-line-border/50 text-[10px] text-muted-text font-bold uppercase tracking-wider">
                  <th className="py-3 px-3">Date</th>
                  <th className="py-3 px-2">Time UTC</th>
                  <th className="py-3 px-3">Match</th>
                  <th className="py-3 px-3">Stage</th>
                  <th className="py-3 px-3">Source</th>
                  <th className="py-3 px-2">Status</th>
                  <th className="py-3 px-3">Content</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line-border/10 text-ink">
                {displayFixtures.map((fixture) => (
                  <tr
                    key={fixture.id}
                    onClick={() => onSelect(fixture.id)}
                    className={`cursor-pointer hover:bg-pitch-green/5 transition-colors duration-150 ${
                      fixture.id === selectedId ? "bg-pitch-green/8 text-ink font-semibold" : ""
                    }`}
                  >
                    <td className="py-3.5 px-3 font-mono text-muted-text whitespace-nowrap">
                      {fixture.date}
                    </td>
                    <td className="py-3.5 px-2 font-mono text-slate-400">{fixture.time}</td>
                    <td className="py-3.5 px-3">
                      <span className="text-ink">{fixture.teamA}</span>
                      <span className="text-muted-text mx-1.5 font-light">vs</span>
                      <span className="text-ink">{fixture.teamB}</span>
                    </td>
                    <td className="py-3.5 px-3 text-muted-text whitespace-nowrap">
                      {prettyStage(fixture.stage)}
                    </td>
                    <td className="py-3.5 px-3 text-xs text-muted-text truncate max-w-[120px]">
                      {fixture.id.startsWith("fd-") && fixture.sourceId
                        ? "dual-source"
                        : fixture.id.startsWith("fd-")
                        ? "football-data"
                        : fixture.sourceId
                        ? "sportradar"
                        : "local"}
                    </td>
                    <td className="py-3.5 px-2 whitespace-nowrap">
                      <span
                        className={`inline-flex px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                          fixture.status === "Live"
                            ? "bg-pressure-red/10 text-pressure-red border border-pressure-red/20"
                            : "bg-paper-2 text-muted-text border border-line-border/30"
                        }`}
                      >
                        {fixture.status}
                      </span>
                    </td>
                    <td className="py-3.5 px-3 whitespace-nowrap">
                      <span
                        className={`inline-flex px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                          fixture.contentStatus === "Approved" || fixture.contentStatus === "Posted"
                            ? "bg-pitch-green/10 text-pitch-green border border-pitch-green/20"
                            : "bg-signal-gold/10 text-signal-gold border border-signal-gold/20"
                        }`}
                      >
                        {fixture.contentStatus}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>

        <article className="bg-paper border border-line-border/50 rounded-none p-5  flex flex-col gap-4">
          <div>
            <p className="text-pitch-green text-[10px] font-extrabold uppercase tracking-wider mb-0.5">
              Matchday Buckets
            </p>
            <h2 className="text-ink text-base md:text-lg font-black tracking-tight">
              Groups & Stages
            </h2>
          </div>
          <div className="flex flex-col gap-2.5 overflow-y-auto max-h-[600px] pr-1">
            {Object.entries(byMatchday).map(([label, matches]) => (
              <details
                key={label}
                className="group border border-line-border/40 rounded-none bg-field-bg/60 overflow-hidden"
                open={label === "Group A"}
              >
                <summary className="flex items-center justify-between p-3.5 font-bold text-ink cursor-pointer hover:bg-white/5 list-none select-none transition-colors duration-150">
                  <span className="text-sm tracking-tight">{label}</span>
                  <span className="bg-pitch-green/15 text-pitch-green border border-pitch-green/30 text-[11px] font-bold px-2 py-0.5 rounded-full font-mono">
                    {matches.length}
                  </span>
                </summary>
                <div className="p-2 flex flex-col gap-1.5 border-t border-line-border/20 bg-[#090f1e]/40">
                  {matches.map((fixture) => (
                    <button
                      key={fixture.id}
                      onClick={() => onSelect(fixture.id)}
                      className="w-full text-left p-2.5 rounded-none border border-transparent hover:border-line-border/40 hover:bg-white/5 flex flex-col gap-1 transition-all duration-200"
                    >
                      <div className="flex justify-between items-center w-full">
                        <span className="text-ink text-xs font-semibold">
                          {fixture.teamA} vs {fixture.teamB}
                        </span>
                      </div>
                      <small className="text-[10px] text-muted-text font-mono">
                        {fixture.date} · {fixture.time} UTC
                      </small>
                    </button>
                  ))}
                </div>
              </details>
            ))}
          </div>
        </article>
      </section>

      <section className="bg-paper border border-line-border/50 rounded-none p-5  flex flex-col gap-4">
        <div>
          <p className="text-pitch-green text-[10px] font-extrabold uppercase tracking-wider mb-0.5">
            Group Fixtures
          </p>
          <h2 className="text-ink text-base md:text-lg font-black tracking-tight">
            Fixture Blocks
          </h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Object.entries(byGroup).map(([group, matches]) => (
            <article
              className="border border-line-border/40 rounded-none p-4 bg-field-bg/50 flex flex-col gap-3.5 hover:border-line-border transition-colors duration-300"
              key={group}
            >
              <h3 className="text-ink text-xs font-extrabold uppercase tracking-wider border-b border-line-border/20 pb-1.5">
                {prettyStage(group.replace("GROUP_", "Group "))}
              </h3>
              <div className="flex flex-col gap-2">
                {matches.map((fixture) => (
                  <button
                    key={fixture.id}
                    onClick={() => onSelect(fixture.id)}
                    className="w-full text-left p-2 rounded-none border border-transparent hover:border-line-border/40 hover:bg-white/5 transition-all duration-200"
                  >
                    <span className="text-ink text-xs block font-semibold truncate">
                      {fixture.teamA} vs {fixture.teamB}
                    </span>
                    <small className="text-[10px] text-muted-text font-mono block mt-0.5">
                      {fixture.date} · {fixture.time} UTC
                    </small>
                  </button>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>
    </section>
  );
}

export default WorldCupDataView;

