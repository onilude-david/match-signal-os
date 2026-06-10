export const socialVendors = {
  buffer: {
    label: "Buffer",
    apiKeyEnv: "BUFFER_API_KEY",
    baseUrlEnv: "BUFFER_BASE_URL",
    pathEnv: "BUFFER_PUBLISH_PATH",
    defaultBaseUrl: "https://api.buffer.com",
    defaultPath: "/graphql",
    docs: "https://developers.buffer.com/guides/posts-and-scheduling.html",
  },
  postproxy: {
    label: "Postproxy",
    apiKeyEnv: "POSTPROXY_API_KEY",
    baseUrlEnv: "POSTPROXY_BASE_URL",
    pathEnv: "POSTPROXY_PUBLISH_PATH",
    defaultBaseUrl: "",
    defaultPath: "/posts",
    docs: "https://postproxy.dev/reference/overview/",
  },
  ayrshare: {
    label: "Ayrshare",
    apiKeyEnv: "AYRSHARE_API_KEY",
    baseUrlEnv: "AYRSHARE_BASE_URL",
    pathEnv: "AYRSHARE_PUBLISH_PATH",
    defaultBaseUrl: "https://api.ayrshare.com/api",
    defaultPath: "/post",
    docs: "https://www.ayrshare.com/docs/apis",
  },
  uploadpost: {
    label: "Upload-Post",
    apiKeyEnv: "UPLOAD_POST_API_KEY",
    baseUrlEnv: "UPLOAD_POST_BASE_URL",
    pathEnv: "UPLOAD_POST_PUBLISH_PATH",
    defaultBaseUrl: "",
    defaultPath: "/posts",
    docs: "https://docs.upload-post.com/",
  },
};

export const officialSocialApis = [
  { key: "meta", label: "Meta Graph API", configured: () => Boolean(process.env.META_ACCESS_TOKEN), docs: "https://developers.facebook.com/docs/instagram-platform/content-publishing/" },
  { key: "tiktok", label: "TikTok Content Posting API", configured: () => Boolean(process.env.TIKTOK_CLIENT_KEY && process.env.TIKTOK_CLIENT_SECRET), docs: "https://developers.tiktok.com/doc/content-posting-api-get-started" },
  { key: "youtube", label: "YouTube Data API", configured: () => Boolean(process.env.YOUTUBE_CLIENT_ID && process.env.YOUTUBE_CLIENT_SECRET), docs: "https://developers.google.com/youtube/v3/docs/videos/insert" },
  { key: "x", label: "X API", configured: () => Boolean(process.env.X_CLIENT_ID && process.env.X_CLIENT_SECRET), docs: "https://docs.x.com/x-api/posts/create-post" },
  { key: "bluesky", label: "Bluesky AT Protocol", configured: () => Boolean(process.env.BLUESKY_HANDLE && process.env.BLUESKY_APP_PASSWORD), docs: "https://docs.bsky.app/docs/tutorials/creating-a-post" },
];

export const configuredSocialVendors = () =>
  Object.fromEntries(
    Object.entries(socialVendors).map(([key, vendor]) => {
      const baseUrl = process.env[vendor.baseUrlEnv] || vendor.defaultBaseUrl;
      const publishPath = process.env[vendor.pathEnv] || vendor.defaultPath;
      return [
        key,
        {
          key,
          label: vendor.label,
          configured: Boolean(process.env[vendor.apiKeyEnv]),
          hasBaseUrl: Boolean(baseUrl),
          baseUrlConfigured: Boolean(process.env[vendor.baseUrlEnv]),
          publishPath,
          docs: vendor.docs,
        },
      ];
    }),
  );

export const normalizeSocialPayload = ({ platforms = [], text = "", title = "", mediaUrls = [], scheduleAt = "", matchId = "", metadata = {} }) => ({
  platforms,
  text,
  title,
  mediaUrls,
  scheduleAt: scheduleAt || null,
  matchId: matchId || null,
  metadata: {
    brand: "The Match Signal",
    source: "match-signal-os",
    ...metadata,
  },
});

// ---------------------------------------------------------------------------
// Buffer GraphQL adapter
// ---------------------------------------------------------------------------
// Buffer's public API is GraphQL, not REST. The generic JSON wrapper used for
// Ayrshare / Upload-Post / Postproxy cannot speak it. This adapter:
//   1. Resolves the operator's organizationId from `account`.
//   2. Lists `channels` and maps service → channelId (cached for 10 minutes).
//   3. For each requested platform, fires a `createPost` mutation.
// Aliases for `platforms` ("x" → twitter, "instagram-reels" → instagram, etc.)
// keep the public API tolerant of whatever string the caller sends.

const BUFFER_CACHE_TTL_MS = 10 * 60 * 1000;
let bufferChannelCache = { fetchedAt: 0, organizationId: null, channelsByService: {} };

const PLATFORM_ALIASES = {
  x: "twitter",
  "x.com": "twitter",
  twitter: "twitter",
  instagram: "instagram",
  "instagram-reels": "instagram",
  "instagram-post": "instagram",
  ig: "instagram",
  tiktok: "tiktok",
  "tiktok-video": "tiktok",
  facebook: "facebook",
  fb: "facebook",
  linkedin: "linkedin",
  threads: "threads",
  youtube: "youtube",
  "youtube-shorts": "youtube",
};

const canonicalPlatform = (raw) => PLATFORM_ALIASES[String(raw ?? "").trim().toLowerCase()] ?? null;

export const planBufferPublish = async ({ apiKey, baseUrl, payload, force = false }) => {
  const cache = await getBufferChannels({ apiKey, baseUrl, force });
  const requested = payload.platforms ?? [];
  const resolved = requested.map((platform) => ({
    requested: platform,
    service: canonicalPlatform(platform),
  }));
  const unknown = resolved.filter((item) => !item.service).map((item) => item.requested);
  const services = [...new Set(resolved.map((item) => item.service).filter(Boolean))];
  const missing = services.filter((service) => !cache.channelsByService[service]?.length);
  const targets = services
    .flatMap((service) => (cache.channelsByService[service] ?? []).map((channel) => ({
      service,
      channelId: channel.id,
      name: channel.name,
    })));
  const mediaBlocked = (payload.mediaUrls ?? []).length > 0;
  const ok = !unknown.length && !missing.length && !mediaBlocked && targets.length > 0;

  return {
    ok,
    organizationId: cache.organizationId,
    requested,
    services,
    targets,
    unknown,
    missing,
    mediaBlocked,
    connectedServices: Object.keys(cache.channelsByService),
  };
};

const bufferGraphql = async ({ apiKey, baseUrl, query, variables }) => {
  const response = await fetch(`${baseUrl}/graphql`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ query, variables }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Buffer GraphQL HTTP ${response.status}: ${JSON.stringify(body).slice(0, 400)}`);
  }
  if (Array.isArray(body.errors) && body.errors.length) {
    throw new Error(`Buffer GraphQL errors: ${body.errors.map((e) => e.message).join("; ")}`);
  }
  return body.data;
};

const refreshBufferChannelCache = async ({ apiKey, baseUrl }) => {
  const account = await bufferGraphql({
    apiKey,
    baseUrl,
    query: "{ account { currentOrganization { id } } }",
  });
  const organizationId = account?.account?.currentOrganization?.id;
  if (!organizationId) throw new Error("Buffer account has no currentOrganization. Check the API token.");

  const channels = await bufferGraphql({
    apiKey,
    baseUrl,
    query: "query($input: ChannelsInput!) { channels(input: $input) { id name service } }",
    variables: { input: { organizationId } },
  });

  const channelsByService = {};
  for (const channel of channels?.channels ?? []) {
    const service = String(channel.service ?? "").toLowerCase();
    if (!channelsByService[service]) channelsByService[service] = [];
    channelsByService[service].push({ id: channel.id, name: channel.name, service });
  }

  bufferChannelCache = { fetchedAt: Date.now(), organizationId, channelsByService };
  return bufferChannelCache;
};

const getBufferChannels = async ({ apiKey, baseUrl, force = false }) => {
  if (!force && bufferChannelCache.organizationId && Date.now() - bufferChannelCache.fetchedAt < BUFFER_CACHE_TTL_MS) {
    return bufferChannelCache;
  }
  return refreshBufferChannelCache({ apiKey, baseUrl });
};

const publishWithBuffer = async ({ apiKey, baseUrl, payload }) => {
  const plan = await planBufferPublish({ apiKey, baseUrl, payload });
  if (plan.unknown.length) {
    throw new Error(`No recognised Buffer platform in: ${plan.unknown.join(", ")}. Connected services: ${plan.connectedServices.join(", ") || "none"}`);
  }
  if (plan.missing.length) {
    throw new Error(`Buffer has no connected channel for: ${plan.missing.join(", ")}. Connected services: ${plan.connectedServices.join(", ")}`);
  }
  if (plan.mediaBlocked) {
    throw new Error("Buffer media upload is not wired in this adapter yet — send text-only here, or attach media in Buffer UI after queueing. Set mediaUrls=[] to proceed.");
  }
  if (!plan.targets.length) {
    throw new Error(`No Buffer target channels resolved. Connected services: ${plan.connectedServices.join(", ") || "none"}`);
  }

  // Default to addToQueue (safest — goes into Buffer's normal scheduling
  // queue). Operator can override with mode=shareNow / customScheduled etc.
  const mode = String(payload.metadata?.bufferMode ?? "addToQueue");
  const schedulingType = mode === "customScheduled" ? "customScheduled" : "automatic";
  const dueAt = payload.scheduleAt || undefined;

  // Buffer's createPost returns the PostActionPayload union with members:
  // PostActionSuccess, NotFoundError, UnauthorizedError, UnexpectedError,
  // RestProxyError, LimitReachedError, InvalidInputError. All errors carry
  // a `message`; RestProxyError additionally exposes `code`.
  const mutation = `mutation Create($input: CreatePostInput!) {
    createPost(input: $input) {
      __typename
      ... on PostActionSuccess { post { id } }
      ... on UnexpectedError { message }
      ... on InvalidInputError { message }
      ... on NotFoundError { message }
      ... on UnauthorizedError { message }
      ... on LimitReachedError { message }
      ... on RestProxyError { message code }
    }
  }`;

  const results = [];
  for (const channel of plan.targets) {
    const input = {
      channelId: channel.channelId,
      text: payload.text || "",
      schedulingType,
      mode,
      assets: [],
      source: "match-signal-os",
      ...(dueAt ? { dueAt } : {}),
    };
    try {
      const data = await bufferGraphql({
        apiKey,
        baseUrl,
        query: mutation,
        variables: { input },
      });
      results.push({
        channelId: channel.channelId,
        service: channel.service,
        name: channel.name,
        ok: data?.createPost?.__typename === "PostActionSuccess",
        result: data?.createPost,
      });
    } catch (error) {
      results.push({
        channelId: channel.channelId,
        service: channel.service,
        name: channel.name,
        ok: false,
        error: error.message,
      });
    }
  }

  // Always return per-channel results — the caller (route) decides whether
  // a partial failure should be a 207-style aggregate response or a 502.
  // Surface Buffer's per-error message into the top-level `error` field so
  // downstream UIs don't have to dig into the union shape.
  const enriched = results.map((r) => ({
    ...r,
    error: r.error ?? (r.ok ? null : r.result?.message ?? `${r.result?.__typename ?? "Unknown"} from Buffer`),
  }));
  const allOk = enriched.every((r) => r.ok);
  return {
    provider: "buffer",
    organizationId: plan.organizationId,
    mode,
    schedulingType,
    ok: allOk,
    results: enriched,
  };
};

export const publishWithSocialVendor = async ({ provider, payload }) => {
  const vendor = socialVendors[provider];
  if (!vendor) throw new Error(`Unsupported social provider: ${provider}`);

  const apiKey = process.env[vendor.apiKeyEnv];
  const baseUrl = (process.env[vendor.baseUrlEnv] || vendor.defaultBaseUrl).replace(/\/$/, "");
  const publishPath = process.env[vendor.pathEnv] || vendor.defaultPath;
  if (!apiKey) throw new Error(`${vendor.apiKeyEnv} is not configured.`);
  if (!baseUrl) throw new Error(`${vendor.baseUrlEnv} is not configured. Add the vendor API base URL.`);

  if (provider === "buffer") {
    return publishWithBuffer({ apiKey, baseUrl, payload });
  }

  const response = await fetch(`${baseUrl}${publishPath}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(payload),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.ok === false) {
    throw new Error(body.error ?? body.message ?? `${vendor.label} publish failed with ${response.status}`);
  }
  return body;
};

// Exported for diagnostics. Returns connected services + channel names.
export const inspectBufferChannels = async () => {
  const apiKey = process.env.BUFFER_API_KEY;
  const baseUrl = (process.env.BUFFER_BASE_URL || socialVendors.buffer.defaultBaseUrl).replace(/\/$/, "");
  if (!apiKey) throw new Error("BUFFER_API_KEY is not configured.");
  const cache = await getBufferChannels({ apiKey, baseUrl, force: true });
  return {
    organizationId: cache.organizationId,
    services: Object.fromEntries(
      Object.entries(cache.channelsByService).map(([service, channels]) => [
        service,
        channels.map((c) => ({ id: c.id, name: c.name })),
      ]),
    ),
  };
};
