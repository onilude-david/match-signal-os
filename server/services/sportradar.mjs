export const sportradarBaseUrl = () => {
  const product = process.env.SPORTRADAR_SOCCER_PRODUCT ?? "soccer";
  const accessLevel = process.env.SPORTRADAR_ACCESS_LEVEL ?? "trial";
  const language = process.env.SPORTRADAR_LANGUAGE ?? "en";
  return `https://api.sportradar.com/${product}/${accessLevel}/v4/${language}`;
};

export const sportradarFetch = async (pathName, searchParams = {}) => {
  const params = new URLSearchParams({ ...searchParams, api_key: process.env.SPORTRADAR_API_KEY });
  const response = await fetch(`${sportradarBaseUrl()}${pathName}?${params}`);
  const text = await response.text();
  let body = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = {};
  }
  if (!response.ok) {
    const error = new Error(body.message ?? `Sportradar request failed with ${response.status}`);
    error.details = Object.keys(body).length ? body : { status: response.status, responsePreview: text.slice(0, 500) };
    error.status = response.status;
    throw error;
  }
  return body;
};

export const encodeSportradarUrn = (value = "") => encodeURIComponent(String(value));

export const getSportradarMatchIntel = async (eventId) => {
  if (!process.env.SPORTRADAR_API_KEY || !eventId) return null;
  const intel = {};
  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  try {
    const s = await sportradarFetch(`/sport_events/${encodeSportradarUrn(eventId)}/summary.json`);
    if (s) {
      intel.summary = {
        sport_event_status: s.sport_event_status,
        venue: s.sport_event?.venue,
        referees: s.sport_event?.referees,
        coverage: s.sport_event?.coverage,
      };
    }
  } catch (err) {
    console.warn(`[Sportradar Auto-Fetch] Failed to fetch summary for ${eventId}:`, err.message);
  }

  await delay(1000);

  try {
    const l = await sportradarFetch(`/sport_events/${encodeSportradarUrn(eventId)}/lineups.json`);
    if (l) {
      intel.lineups = l.lineups ?? l.sport_event_lineups ?? l.competitors ?? [];
    }
  } catch (err) {
    console.warn(`[Sportradar Auto-Fetch] Failed to fetch lineups for ${eventId}:`, err.message);
  }

  await delay(1000);

  try {
    const t = await sportradarFetch(`/sport_events/${encodeSportradarUrn(eventId)}/timeline.json`);
    if (t) {
      intel.timeline = (t.timeline ?? t.events ?? []).slice(-20);
    }
  } catch (err) {
    // Fail silently
  }

  await delay(1000);

  try {
    const m = await sportradarFetch(`/sport_events/${encodeSportradarUrn(eventId)}/momentum.json`);
    if (m) {
      intel.momentum = (m.momentum ?? m.graph ?? []).slice(-20);
    }
  } catch (err) {
    // Fail silently
  }

  return Object.keys(intel).length ? intel : null;
};

export const sportradarEventToFixture = (event) => {
  const competitors = event.competitors ?? event.sport_event?.competitors ?? [];
  const home = competitors.find((competitor) => competitor.qualifier === "home") ?? competitors[0];
  const away = competitors.find((competitor) => competitor.qualifier === "away") ?? competitors[1];
  const scheduled = event.scheduled ?? event.start_time ?? event.sport_event?.scheduled ?? event.sport_event?.start_time ?? "";
  const context = event.sport_event_context ?? event.sport_event?.sport_event_context;
  const tournament = event.tournament ?? event.sport_event?.tournament ?? context?.competition;
  const season = event.season ?? event.sport_event?.season ?? context?.season;
  const stage = event.stage ?? event.sport_event?.stage ?? context?.stage;
  const group = context?.groups?.[0];
  const venue = event.venue ?? event.sport_event?.venue;
  const status = event.status ?? event.sport_event_status?.status ?? event.sport_event?.status;
  const stageLabel = group?.group_name
    ? `${stage?.phase ?? "Group stage"} / GROUP_${group.group_name}`
    : [stage?.phase, stage?.type, tournament?.name, season?.name].filter(Boolean).join(" / ") || "Sportradar match";
  return {
    id: event.id ?? event.sport_event?.id ?? `sr-${scheduled}-${home?.name ?? "home"}-${away?.name ?? "away"}`,
    date: scheduled.slice(0, 10),
    time: scheduled.slice(11, 16),
    teamA: home?.name ?? "TBD",
    teamB: away?.name ?? "TBD",
    stage: stageLabel,
    venue: venue?.name ?? "",
    status: status === "closed" ? "Final" : status === "live" ? "Live" : "Scheduled",
    contentStatus: "Draft",
    sourceId: event.id ?? event.sport_event?.id,
    homeOdds: event.markets?.find((m) => m.name === "3-way" || m.name === "1x2")?.outcomes?.find((o) => o.type === "home" || o.type === "1")?.odds ?? null,
    drawOdds: event.markets?.find((m) => m.name === "3-way" || m.name === "1x2")?.outcomes?.find((o) => o.type === "draw" || o.type === "X")?.odds ?? null,
    awayOdds: event.markets?.find((m) => m.name === "3-way" || m.name === "1x2")?.outcomes?.find((o) => o.type === "away" || o.type === "2")?.odds ?? null,
  };
};

export const canonicalTeamName = (name = "") =>
  String(name)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, "and")
    .replace(/\b(united states|usa)\b/g, "usa")
    .replace(/\b(korea republic|south korea)\b/g, "korea republic")
    .replace(/\b(bosnia and herzegovina|bosnia herzegovina)\b/g, "bosnia herzegovina")
    .replace(/\b(cape verde islands|cape verde|cabo verde)\b/g, "cape verde")
    .replace(/\b(ir iran|iran)\b/g, "iran")
    .replace(/\b(cote d’ivoire|cote d'ivoire|ivory coast)\b/g, "ivory coast")
    .replace(/\b(turkiye|turkey)\b/g, "turkiye")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

export const fixtureMergeKey = (fixture) => {
  const teams = [canonicalTeamName(fixture.teamA), canonicalTeamName(fixture.teamB)].sort().join("|");
  return `${fixture.date}T${fixture.time}|${teams}`;
};

export const mergeFixtureSources = (footballDataFixtures = [], sportradarFixtures = []) => {
  const byKey = new Map();
  const byDateTime = new Map();
  for (const fixture of footballDataFixtures) {
    const row = { ...fixture };
    byKey.set(fixtureMergeKey(fixture), row);
    byDateTime.set(`${fixture.date}T${fixture.time}`, row);
  }

  for (const srFixture of sportradarFixtures) {
    const key = fixtureMergeKey(srFixture);
    const existing = byKey.get(key) ?? byDateTime.get(`${srFixture.date}T${srFixture.time}`);
    if (existing) {
      const merged = {
        ...existing,
        time: existing.time || srFixture.time,
        stage: srFixture.stage || existing.stage,
        venue: srFixture.venue || existing.venue,
        status: existing.status === "Scheduled" ? srFixture.status : existing.status,
        sourceId: srFixture.sourceId ?? srFixture.id,
      };
      byKey.set(fixtureMergeKey(existing), merged);
      byDateTime.set(`${merged.date}T${merged.time}`, merged);
      continue;
    }
    byKey.set(key, srFixture);
    byDateTime.set(`${srFixture.date}T${srFixture.time}`, srFixture);
  }

  return [...byKey.values()].sort((a, b) => `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`));
};
