// Footage-source discovery for the Clip Factory.
//
// ScoreBat provides official football highlights as embed codes from original
// publishers. That is useful for discovery/reference, but not automatically
// editable raw footage. We label those results "embed_only" so the UI stays
// honest about rights and workflow.

const SCOREBAT_FREE_FEED = "https://www.scorebat.com/video-api/v3/";
const SCOREBAT_API_BASE = "https://www.scorebat.com/video-api/v3";
const HIGHLIGHTLY_BASE = "https://soccer.highlightly.net";
const HIGHLIGHTLY_RAPIDAPI_HOST = "football-highlights-api.p.rapidapi.com";
const YOUTUBE_API_BASE = "https://www.googleapis.com/youtube/v3";

export const VIDEO_PROVIDER_CATALOG = [
  {
    key: "scorebat",
    label: "ScoreBat",
    category: "official_embeds",
    status: "integrated",
    editable: false,
    docs: "https://www.scorebat.com/video-api/",
    note: "Official football highlights/live streams from verified sources as embed codes. Useful for discovery and embedding, not raw clipping.",
  },
  {
    key: "highlightly",
    label: "Highlightly",
    category: "highlight_links",
    status: "integrated_requires_key",
    editable: false,
    docs: "https://highlightly.net/football-api/documentation/",
    note: "Football highlights API with URL/embedUrl/source/channel metadata and geo-restriction checks. Treat as embed/reference unless your plan/license grants editing.",
  },
  {
    key: "highlightapi",
    label: "Highlight API",
    category: "official_social_clip_matching",
    status: "planned_requires_key",
    editable: false,
    docs: "https://www.highlightapi.com/docs.html",
    note: "Matches official social clips to play-by-play events. Useful for event-to-clip discovery; not automatically editable raw footage.",
  },
  {
    key: "youtube",
    label: "YouTube",
    category: "official_embeds_and_license_checks",
    status: "integrated_requires_key",
    editable: "license_dependent",
    docs: "https://developers.google.com/youtube/v3/docs/search/list",
    note: "Discovers official, owned, or Creative Commons videos via YouTube Data API. Downloading/reposting is only safe for owned, licensed, or verified reusable footage.",
  },
  {
    key: "wsc",
    label: "WSC Sports",
    category: "licensed_highlight_automation",
    status: "enterprise_contract",
    editable: true,
    docs: "https://wsc-sports.com/",
    note: "True rights-holder highlight automation. Best fit if you have a league/club/broadcaster contract or budget.",
  },
  {
    key: "magnifi",
    label: "Magnifi",
    category: "licensed_highlight_automation",
    status: "enterprise_contract",
    editable: true,
    docs: "https://www.magnifi.ai/",
    note: "AI sports highlights/workflows for organizations with owned or licensed footage.",
  },
  {
    key: "sportfeeds",
    label: "SportFeeds",
    category: "highlight_feed",
    status: "planned_requires_key",
    editable: "license_dependent",
    docs: "https://www.sportfeeds.com/",
    note: "Real-time highlight feeds tagged by teams/players/plays. Editing rights depend on the commercial agreement.",
  },
  {
    key: "sportsvision",
    label: "SportsVision",
    category: "archive_monetization",
    status: "enterprise_contract",
    editable: true,
    docs: "https://www.sportsvision.io/",
    note: "Sports archive/video management and highlight products for organizations with rights to their footage.",
  },
];

const normalise = (value) => String(value ?? "").trim();

const lower = (value) => normalise(value).toLowerCase();

const includesQuery = (haystack, query) => !query || lower(haystack).includes(lower(query));

const parseScorebatVideos = (match) => {
  const videos = Array.isArray(match.videos) ? match.videos : [];
  return videos.map((video, index) => ({
    id: `scorebat-${slug(match.title)}-${index}`,
    provider: "ScoreBat",
    title: normalise(video.title || match.title || "Official highlight"),
    matchTitle: normalise(match.title),
    competition: normalise(match.competition),
    date: normalise(match.date),
    thumbnail: normalise(match.thumbnail),
    embed: normalise(video.embed),
    url: normalise(video.url || video.embed_url || match.url),
    sourceUrl: normalise(match.url),
    rightsStatus: "embed_only",
    rightsLabel: "Embed only",
    editable: false,
    importable: false,
    reason: "ScoreBat returns official publisher embeds, not raw downloadable footage.",
    notes: "Use as a reference/official embed. To cut and repost, use licensed editable footage from the rights holder.",
  }));
};

const highlightlyHeaders = () => {
  const apiKey = normalise(process.env.HIGHLIGHTLY_API_KEY || process.env.RAPIDAPI_KEY);
  if (!apiKey) return null;
  const useRapidApi = lower(process.env.HIGHLIGHTLY_USE_RAPIDAPI) === "true";
  return {
    headers: {
      "x-rapidapi-key": apiKey,
      ...(useRapidApi ? { "x-rapidapi-host": HIGHLIGHTLY_RAPIDAPI_HOST } : {}),
    },
    baseUrl: useRapidApi ? `https://${HIGHLIGHTLY_RAPIDAPI_HOST}` : HIGHLIGHTLY_BASE,
    mode: useRapidApi ? "rapidapi" : "direct",
  };
};

export const searchScorebatSources = async ({ query = "", team = "", competition = "", limit = 24 } = {}) => {
  const apiKey = normalise(process.env.SCOREBAT_API_KEY);
  const sourceUrl = apiKey
    ? `${SCOREBAT_API_BASE}/featured-feed/?token=${encodeURIComponent(apiKey)}`
    : SCOREBAT_FREE_FEED;

  const response = await fetch(sourceUrl);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const err = new Error("ScoreBat source request failed.");
    err.status = response.status;
    err.details = body;
    throw err;
  }

  const rows = Array.isArray(body.response) ? body.response : [];
  const q = normalise(query);
  const teamQuery = normalise(team);
  const compQuery = normalise(competition);

  return rows
    .filter((match) => {
      const title = normalise(match.title);
      const comp = normalise(match.competition);
      return (
        (!q || includesQuery(title, q) || includesQuery(comp, q)) &&
        (!teamQuery || includesQuery(title, teamQuery)) &&
        (!compQuery || includesQuery(comp, compQuery))
      );
    })
    .flatMap(parseScorebatVideos)
    .slice(0, Math.max(1, Math.min(Number(limit) || 24, 50)));
};

export const searchHighlightlySources = async ({
  query = "",
  team = "",
  competition = "",
  date = "",
  limit = 24,
} = {}) => {
  const auth = highlightlyHeaders();
  if (!auth) {
    const err = new Error("HIGHLIGHTLY_API_KEY is not configured.");
    err.status = 501;
    throw err;
  }

  const params = new URLSearchParams();
  params.set("limit", String(Math.max(1, Math.min(Number(limit) || 24, 40))));
  const teamQuery = normalise(team || query);
  if (teamQuery) {
    params.set("homeTeamName", teamQuery);
  }
  if (competition) params.set("leagueName", normalise(competition));
  if (date) params.set("date", normalise(date));

  let response = await fetch(`${auth.baseUrl}/highlights?${params.toString()}`, { headers: auth.headers });
  let body = await response.json().catch(() => ({}));

  // If a team search returns nothing, retry by away team name before giving up.
  if (response.ok && Array.isArray(body.data) && body.data.length === 0 && teamQuery) {
    params.delete("homeTeamName");
    params.set("awayTeamName", teamQuery);
    response = await fetch(`${auth.baseUrl}/highlights?${params.toString()}`, { headers: auth.headers });
    body = await response.json().catch(() => ({}));
  }

  if (!response.ok) {
    const err = new Error("Highlightly source request failed.");
    err.status = response.status;
    err.details = body;
    throw err;
  }

  const rows = Array.isArray(body.data) ? body.data : Array.isArray(body) ? body : [];
  const q = lower(query);
  return rows
    .filter((row) => {
      if (!q) return true;
      const match = row.match ?? {};
      const title = [
        row.title,
        row.description,
        match.homeTeam?.name,
        match.awayTeam?.name,
        match.league?.name,
        match.country?.name,
      ].join(" ");
      return lower(title).includes(q);
    })
    .map((row) => {
      const match = row.match ?? {};
      const home = normalise(match.homeTeam?.name);
      const away = normalise(match.awayTeam?.name);
      const matchTitle = home && away ? `${home} - ${away}` : normalise(row.title);
      const embeddable = Boolean(row.embedUrl);
      return {
        id: `highlightly-${row.id ?? slug(row.title)}`,
        provider: "Highlightly",
        title: normalise(row.title || row.description || "Highlight"),
        matchTitle,
        competition: normalise(match.league?.name || match.country?.name),
        date: normalise(match.date || row.date),
        thumbnail: normalise(row.imgUrl || row.thumbnail),
        embed: normalise(row.embedUrl),
        url: normalise(row.url),
        sourceUrl: normalise(row.url),
        source: normalise(row.source || row.channel?.name),
        rightsStatus: embeddable ? "embed_only" : "needs_rights_check",
        rightsLabel: embeddable ? "Embed only" : "Needs rights check",
        editable: false,
        importable: false,
        reason: embeddable
          ? "Highlightly exposes an embed URL/link for this clip; editing rights are not implied."
          : "Highlightly found a highlight link, but embeddability/usage needs verification.",
        notes: "Use for discovery/reference unless your Highlightly/rightsholder plan explicitly grants downloadable editing rights.",
      };
    })
    .slice(0, Math.max(1, Math.min(Number(limit) || 24, 40)));
};

export const searchYouTubeSources = async ({
  query = "",
  team = "",
  competition = "",
  date = "",
  limit = 12,
  creativeCommonsOnly = false,
} = {}) => {
  const apiKey = normalise(process.env.YOUTUBE_API_KEY);
  if (!apiKey) {
    const err = new Error("YOUTUBE_API_KEY is not configured.");
    err.status = 501;
    throw err;
  }

  const searchQuery = normalise(query || [team, competition].filter(Boolean).join(" "));
  if (!searchQuery) {
    const err = new Error("query or team is required for YouTube source search.");
    err.status = 400;
    throw err;
  }

  const params = new URLSearchParams({
    key: apiKey,
    part: "snippet",
    type: "video",
    maxResults: String(Math.max(1, Math.min(Number(limit) || 12, 25))),
    q: searchQuery,
    safeSearch: "moderate",
    videoEmbeddable: "true",
    order: "relevance",
  });
  if (creativeCommonsOnly || lower(process.env.YOUTUBE_CREATIVE_COMMONS_ONLY) === "true") {
    params.set("videoLicense", "creativeCommon");
  }
  if (date) {
    const parsed = new Date(date);
    if (!Number.isNaN(parsed.getTime())) {
      const after = new Date(parsed);
      after.setDate(after.getDate() - 3);
      const before = new Date(parsed);
      before.setDate(before.getDate() + 3);
      params.set("publishedAfter", after.toISOString());
      params.set("publishedBefore", before.toISOString());
    }
  }

  const searchResponse = await fetch(`${YOUTUBE_API_BASE}/search?${params.toString()}`);
  const searchBody = await searchResponse.json().catch(() => ({}));
  if (!searchResponse.ok) {
    const err = new Error("YouTube source request failed.");
    err.status = searchResponse.status;
    err.details = searchBody;
    throw err;
  }

  const ids = (searchBody.items ?? [])
    .map((item) => item.id?.videoId)
    .filter(Boolean);
  if (!ids.length) return [];

  const detailParams = new URLSearchParams({
    key: apiKey,
    part: "snippet,status,contentDetails",
    id: ids.join(","),
  });
  const detailResponse = await fetch(`${YOUTUBE_API_BASE}/videos?${detailParams.toString()}`);
  const detailBody = await detailResponse.json().catch(() => ({}));
  if (!detailResponse.ok) {
    const err = new Error("YouTube video detail request failed.");
    err.status = detailResponse.status;
    err.details = detailBody;
    throw err;
  }

  const ownedChannelIds = new Set(
    normalise(process.env.YOUTUBE_OWNED_CHANNEL_IDS)
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean),
  );

  return (detailBody.items ?? []).map((video) => {
    const snippet = video.snippet ?? {};
    const status = video.status ?? {};
    const videoId = video.id;
    const isOwned = ownedChannelIds.has(snippet.channelId);
    const isCreativeCommon = status.license === "creativeCommon";
    const rightsStatus = isOwned ? "owned" : isCreativeCommon ? "creative_commons_review" : "needs_rights_check";
    const rightsLabel = isOwned ? "Owned channel" : isCreativeCommon ? "Creative Commons review" : "Needs rights check";
    return {
      id: `youtube-${videoId}`,
      provider: "YouTube",
      title: normalise(snippet.title),
      matchTitle: normalise(snippet.title),
      competition: normalise(competition),
      date: normalise(snippet.publishedAt),
      thumbnail: normalise(snippet.thumbnails?.high?.url || snippet.thumbnails?.medium?.url || snippet.thumbnails?.default?.url),
      embed: `<iframe width="560" height="315" src="https://www.youtube.com/embed/${videoId}" title="${escapeHtml(snippet.title)}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe>`,
      url: `https://www.youtube.com/watch?v=${videoId}`,
      sourceUrl: `https://www.youtube.com/watch?v=${videoId}`,
      source: normalise(snippet.channelTitle),
      channelId: normalise(snippet.channelId),
      license: status.license ?? "youtube",
      rightsStatus,
      rightsLabel,
      editable: isOwned,
      importable: false,
      reason: isOwned
        ? "This channel is listed in YOUTUBE_OWNED_CHANNEL_IDS. Use your own source/export workflow for editable files."
        : isCreativeCommon
          ? "YouTube reports Creative Commons, but verify attribution and that the uploader owns the footage before editing."
          : "Public YouTube video. Embed/reference only unless you have permission or a license from the rights holder.",
      notes: "The YouTube Data API supports discovery and embeds. It does not grant permission to download, recut, or repost third-party match footage.",
    };
  });
};

export const searchVideoSources = async (params = {}) => {
  const providers = new Set(
    (Array.isArray(params.providers) && params.providers.length ? params.providers : ["scorebat", "highlightly", "youtube"])
      .map((provider) => lower(provider)),
  );

  const results = [];
  const errors = [];

  if (providers.has("scorebat")) {
    try {
      results.push(...await searchScorebatSources(params));
    } catch (error) {
      errors.push({
        provider: "ScoreBat",
        message: error.message,
        details: error.details,
        status: error.status,
      });
    }
  }

  if (providers.has("highlightly")) {
    try {
      results.push(...await searchHighlightlySources(params));
    } catch (error) {
      errors.push({
        provider: "Highlightly",
        message: error.message,
        details: error.details,
        status: error.status,
      });
    }
  }

  if (providers.has("youtube")) {
    try {
      results.push(...await searchYouTubeSources(params));
    } catch (error) {
      errors.push({
        provider: "YouTube",
        message: error.message,
        details: error.details,
        status: error.status,
      });
    }
  }

  return {
    sources: results,
    errors,
    providers: [
      {
        key: "scorebat",
        label: "ScoreBat",
        configured: Boolean(normalise(process.env.SCOREBAT_API_KEY)),
        mode: normalise(process.env.SCOREBAT_API_KEY) ? "api_key" : "free_feed",
        rightsMode: "official_embeds",
      },
      {
        key: "highlightly",
        label: "Highlightly",
        configured: Boolean(normalise(process.env.HIGHLIGHTLY_API_KEY || process.env.RAPIDAPI_KEY)),
        mode: highlightlyHeaders()?.mode ?? "missing_key",
        rightsMode: "highlight_links",
      },
      {
        key: "youtube",
        label: "YouTube",
        configured: Boolean(normalise(process.env.YOUTUBE_API_KEY)),
        mode: normalise(process.env.YOUTUBE_API_KEY) ? "data_api" : "missing_key",
        rightsMode: "embeds_license_checks",
      },
    ],
    catalog: VIDEO_PROVIDER_CATALOG,
  };
};

const slug = (value) =>
  String(value ?? "source")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "source";

const escapeHtml = (value) =>
  normalise(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
