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

export const publishWithSocialVendor = async ({ provider, payload }) => {
  const vendor = socialVendors[provider];
  if (!vendor) throw new Error(`Unsupported social provider: ${provider}`);

  const apiKey = process.env[vendor.apiKeyEnv];
  const baseUrl = (process.env[vendor.baseUrlEnv] || vendor.defaultBaseUrl).replace(/\/$/, "");
  const publishPath = process.env[vendor.pathEnv] || vendor.defaultPath;
  if (!apiKey) throw new Error(`${vendor.apiKeyEnv} is not configured.`);
  if (!baseUrl) throw new Error(`${vendor.baseUrlEnv} is not configured. Add the vendor API base URL.`);

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
