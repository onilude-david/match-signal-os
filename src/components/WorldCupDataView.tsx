import React from "react";
import { CalendarPlus, Layers, BarChart3 } from "lucide-react";
import { Fixture, StandingGroup } from "../types";
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

const sourceLabel = (fixture: Fixture) => {
  if (fixture.id.startsWith("fd-") && fixture.sourceId) return "Dual";
  if (fixture.id.startsWith("fd-")) return "Football-data";
  if (fixture.sourceId) return "Sportradar";
  return "Local";
};

type StatProps = { label: string; value: string | number; note?: string };
const Stat = ({ label, value, note }: StatProps) => (
  <div className="flex flex-col gap-1.5 py-5 pr-6 border-r last:border-r-0 border-[var(--rule)]">
    <span className="caption">{label}</span>
    <span className="figure text-[clamp(1.6rem,2.4vw,2.2rem)] text-ink leading-none">{value}</span>
    {note && <span className="text-[0.75rem] text-[var(--ink-quiet)] tracking-[0.02em]">{note}</span>}
  </div>
);

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
  const groupFixtureCount = displayFixtures.filter((fixture) =>
    groupNameFor(fixture).startsWith("GROUP_"),
  ).length;
  const knockoutFixtureCount = displayFixtures.length - groupFixtureCount;
  const footballDataCount = displayFixtures.filter((fixture) => fixture.id.startsWith("fd-")).length;
  const sportradarEnrichedCount = displayFixtures.filter((fixture) =>
    fixture.sourceId?.startsWith("sr:"),
  ).length;
  const standingsSource = standings.length ? "Official, via Sportradar" : "Generated locally";

  return (
    <section className="flex flex-col gap-12 pt-2">
      {/* ===== Masthead ===== */}
      <header className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.5fr)_minmax(280px,1fr)] gap-x-10 gap-y-6 pt-2 pb-7 border-t-2 border-ink">
        <div className="flex flex-col gap-3 pt-5">
          <p className="eyebrow gold">World Cup 2026 — The Data Desk</p>
          <h1 className="text-ink">Tournament Schedule</h1>
          <p className="text-[var(--ink-muted)] max-w-[58ch] text-[1rem] leading-[1.55] mt-1">
            Live API fixtures from football-data.org and Sportradar, merged into one matchday queue
            with group standings and content priorities. Selecting a row sets the active fixture
            across every other view.
          </p>
          <div className="hr-gold mt-3" />
        </div>
        <div className="flex flex-col gap-3 lg:items-end lg:justify-end lg:pt-5">
          <span className="caption text-[var(--ink-quiet)]">Sync sources</span>
          <div className="flex flex-wrap lg:justify-end gap-2">
            <Button
              variant="secondary"
              icon={<CalendarPlus size={14} />}
              onClick={onImport}
              loading={loadingStates.importFixtures}
            >
              Football-data
            </Button>
            <Button
              variant="secondary"
              icon={<Layers size={14} />}
              onClick={onDualSync}
              loading={loadingStates.syncWorldCup}
            >
              Dual-source
            </Button>
            <Button
              variant="secondary"
              icon={<BarChart3 size={14} />}
              onClick={onLoadStandings}
              loading={loadingStates.standings}
            >
              Official standings
            </Button>
          </div>
        </div>
      </header>

      {/* ===== Stat strip ===== */}
      <section
        aria-label="Schedule statistics"
        className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 border-y border-[var(--rule)]"
      >
        <Stat label="Matches loaded" value={displayFixtures.length} />
        <Stat label="Football-data" value={footballDataCount} note="rows imported" />
        <Stat label="Sportradar" value={sportradarEnrichedCount} note="event IDs" />
        <Stat label="Group stage" value={groupFixtureCount} />
        <Stat label="Knockouts" value={knockoutFixtureCount} />
        <Stat label="Standings" value={standings.length} note={standingsSource} />
      </section>

      {/* ===== Group standings ===== */}
      <section className="flex flex-col gap-5">
        <div className="flex items-baseline justify-between flex-wrap gap-2">
          <div>
            <p className="eyebrow pitch mb-1">Group Stage Standings</p>
            <h2 className="text-ink">Tables, by group</h2>
          </div>
          <span className="caption text-[var(--ink-quiet)]">
            {standings.length ? "Official · live" : "Generated · pre-tournament"}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-10 gap-y-10 border-t border-[var(--rule)] pt-6">
          {tableGroups.length === 0 && (
            <p className="text-[var(--ink-muted)] col-span-full">
              No groups loaded yet. Run a Football-data or Dual-source sync from the masthead to
              populate the schedule.
            </p>
          )}
          {tableGroups.map(({ group, rows }) => (
            <article key={group} className="flex flex-col gap-3">
              <div className="flex items-baseline justify-between pb-2 border-b border-[var(--rule-strong)]">
                <h3 className="text-ink font-display text-[1.15rem] font-medium tracking-[-0.015em] [font-variation-settings:'opsz'_60]">
                  {group}
                </h3>
                <span className="caption text-[var(--ink-quiet)]">{rows.length} teams</span>
              </div>
              <table className="w-full text-left">
                <thead>
                  <tr>
                    <th className="!py-2 !pl-0 !pr-2 w-7">#</th>
                    <th className="!py-2 !px-2">Team</th>
                    <th className="!py-2 !px-2 text-right">P</th>
                    <th className="!py-2 !px-2 text-right">W</th>
                    <th className="!py-2 !px-2 text-right">D</th>
                    <th className="!py-2 !px-2 text-right">L</th>
                    <th className="!py-2 !px-2 text-right">GD</th>
                    <th className="!py-2 !pl-2 !pr-0 text-right">Pts</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.team} className="hover:!bg-[var(--paper-raised)]">
                      <td className="!pl-0 !pr-2 text-[var(--ink-quiet)] tabular">{row.rank}</td>
                      <td className="!px-2 text-ink font-medium">{row.team}</td>
                      <td className="!px-2 text-right tabular text-[var(--ink-muted)]">{row.played}</td>
                      <td className="!px-2 text-right tabular text-[var(--ink-muted)]">{row.wins}</td>
                      <td className="!px-2 text-right tabular text-[var(--ink-muted)]">{row.draws}</td>
                      <td className="!px-2 text-right tabular text-[var(--ink-muted)]">{row.losses}</td>
                      <td className="!px-2 text-right tabular text-[var(--ink-muted)]">
                        {row.goalDifference > 0 ? `+${row.goalDifference}` : row.goalDifference}
                      </td>
                      <td className="!pl-2 !pr-0 text-right tabular text-ink font-semibold">{row.points}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </article>
          ))}
        </div>
      </section>

      {/* ===== Schedule table + matchday rail ===== */}
      <section className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.6fr)_minmax(280px,0.5fr)] gap-12">
        <article className="flex flex-col gap-4 min-w-0">
          <div className="flex items-baseline justify-between flex-wrap gap-2">
            <div>
              <p className="eyebrow pitch mb-1">All matches</p>
              <h2 className="text-ink">Schedule, ordered by kickoff</h2>
            </div>
            <span className="caption text-[var(--ink-quiet)]">
              {displayFixtures.length} fixtures · click to set active
            </span>
          </div>

          <div className="overflow-auto max-h-[640px] border-t border-[var(--rule-strong)]">
            <table className="w-full text-left">
              <thead>
                <tr>
                  <th className="w-[88px]">Date</th>
                  <th className="w-[66px]">Kickoff</th>
                  <th>Match</th>
                  <th>Stage</th>
                  <th className="w-[100px]">Source</th>
                  <th className="w-[78px]">Status</th>
                  <th className="w-[88px]">Content</th>
                </tr>
              </thead>
              <tbody>
                {displayFixtures.map((fixture) => {
                  const isSelected = fixture.id === selectedId;
                  const live = fixture.status === "Live";
                  const final = fixture.status === "Final";
                  const contentReady =
                    fixture.contentStatus === "Approved" || fixture.contentStatus === "Posted";
                  return (
                    <tr
                      key={fixture.id}
                      onClick={() => onSelect(fixture.id)}
                      className={
                        isSelected
                          ? "!bg-[var(--paper-raised)] [&_td]:!border-b-[var(--rule-strong)]"
                          : ""
                      }
                      style={
                        isSelected ? { boxShadow: "inset 2px 0 0 0 var(--gold)" } : undefined
                      }
                    >
                      <td className="text-[var(--ink-muted)] tabular whitespace-nowrap">{fixture.date}</td>
                      <td className="text-[var(--ink-muted)] tabular whitespace-nowrap">{fixture.time}</td>
                      <td className="text-ink whitespace-nowrap">
                        <span className="font-medium">{fixture.teamA}</span>
                        <span className="text-[var(--ink-quiet)] mx-2 italic font-display [font-variation-settings:'opsz'_60]">vs</span>
                        <span className="font-medium">{fixture.teamB}</span>
                      </td>
                      <td className="text-[var(--ink-muted)] whitespace-nowrap">{prettyStage(fixture.stage)}</td>
                      <td className="text-[var(--ink-quiet)] text-[0.8rem]">{sourceLabel(fixture)}</td>
                      <td className="whitespace-nowrap">
                        <span
                          className={
                            "inline-flex items-center gap-1.5 text-[0.7rem] uppercase tracking-[0.1em] font-semibold " +
                            (live
                              ? "text-red"
                              : final
                              ? "text-[var(--ink-muted)]"
                              : "text-[var(--ink-quiet)]")
                          }
                        >
                          {live && (
                            <span
                              aria-hidden
                              className="inline-block w-1.5 h-1.5 rounded-full"
                              style={{ background: "var(--red)" }}
                            />
                          )}
                          {fixture.status}
                        </span>
                      </td>
                      <td className="whitespace-nowrap">
                        <span
                          className={
                            "text-[0.7rem] uppercase tracking-[0.1em] font-semibold " +
                            (contentReady ? "text-pitch" : "text-gold")
                          }
                        >
                          {fixture.contentStatus}
                        </span>
                      </td>
                    </tr>
                  );
                })}
                {displayFixtures.length === 0 && (
                  <tr>
                    <td colSpan={7} className="text-[var(--ink-muted)] py-8 text-center">
                      No fixtures loaded — run a sync from the masthead.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </article>

        <aside className="flex flex-col gap-4 min-w-0">
          <div>
            <p className="eyebrow pitch mb-1">Matchday rail</p>
            <h2 className="text-ink">Groups &amp; stages</h2>
          </div>
          <nav className="stage-list overflow-y-auto max-h-[640px] -mr-2 pr-2">
            {Object.entries(byMatchday).map(([label, matches]) => (
              <details key={label} open={label === "Group A"}>
                <summary>
                  <span className="text-ink font-display [font-variation-settings:'opsz'_60]">
                    {label}
                  </span>
                  <span>{matches.length}</span>
                </summary>
                <div className="flex flex-col gap-0.5 pb-3">
                  {matches.map((fixture) => {
                    const isSelected = fixture.id === selectedId;
                    return (
                      <button
                        key={fixture.id}
                        onClick={() => onSelect(fixture.id)}
                        className={`stage-match ${isSelected ? "!border-l-gold !bg-[var(--paper-raised)]" : ""}`}
                      >
                        <span className="text-ink text-[0.85rem] font-medium">
                          {fixture.teamA}
                          <span className="text-[var(--ink-quiet)] mx-1.5 italic font-display [font-variation-settings:'opsz'_60]">
                            vs
                          </span>
                          {fixture.teamB}
                        </span>
                        <small className="text-[var(--ink-quiet)] text-[0.72rem] tabular tracking-[0.02em]">
                          {fixture.date} · {fixture.time}
                        </small>
                      </button>
                    );
                  })}
                </div>
              </details>
            ))}
            {Object.keys(byMatchday).length === 0 && (
              <p className="text-[var(--ink-muted)] py-6">No matches yet.</p>
            )}
          </nav>
        </aside>
      </section>

      {/* ===== Group fixture blocks ===== */}
      <section className="flex flex-col gap-4">
        <div className="flex items-baseline justify-between flex-wrap gap-2">
          <div>
            <p className="eyebrow pitch mb-1">Group fixtures</p>
            <h2 className="text-ink">Round-by-round, per group</h2>
          </div>
          <span className="caption text-[var(--ink-quiet)]">
            {Object.keys(byGroup).filter((g) => g.startsWith("GROUP_")).length} groups
          </span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-8 gap-y-6 border-t border-[var(--rule)] pt-6">
          {Object.entries(byGroup).map(([group, matches]) => (
            <article key={group} className="flex flex-col gap-3 min-w-0">
              <h3 className="text-ink font-display [font-variation-settings:'opsz'_60] font-medium text-[1.05rem] tracking-[-0.015em] pb-2 border-b border-[var(--rule)]">
                {prettyStage(group.replace("GROUP_", "Group "))}
              </h3>
              <div className="flex flex-col gap-0">
                {matches.map((fixture) => {
                  const isSelected = fixture.id === selectedId;
                  return (
                    <button
                      key={fixture.id}
                      onClick={() => onSelect(fixture.id)}
                      className={`stage-match ${isSelected ? "!border-l-gold !bg-[var(--paper-raised)]" : ""}`}
                    >
                      <span className="text-ink text-[0.85rem] font-medium truncate w-full">
                        {fixture.teamA}
                        <span className="text-[var(--ink-quiet)] mx-1.5 italic font-display [font-variation-settings:'opsz'_60]">
                          vs
                        </span>
                        {fixture.teamB}
                      </span>
                      <small className="text-[var(--ink-quiet)] text-[0.72rem] tabular tracking-[0.02em]">
                        {fixture.date} · {fixture.time}
                      </small>
                    </button>
                  );
                })}
              </div>
            </article>
          ))}
        </div>
      </section>
    </section>
  );
}

export default WorldCupDataView;
