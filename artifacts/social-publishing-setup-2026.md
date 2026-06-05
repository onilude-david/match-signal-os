# Social Publishing Setup 2026

The Match Signal OS is now scaffolded for unified social publishing through Postproxy, Ayrshare, Upload-Post, and official API credentials.

## Recommended Order

1. Create accounts on all social platforms.
2. Choose one primary unified provider: Buffer, Postproxy, Ayrshare, or Upload-Post.
3. Connect Instagram, X, YouTube, TikTok, Threads, Bluesky, Facebook, LinkedIn, and Telegram inside that provider.
4. Add the provider API key to `.env`.
5. Keep `SOCIAL_DRY_RUN=true` until test payloads look correct.
6. Switch to `SOCIAL_DRY_RUN=false` only after the provider confirms account connections and posting permissions.

## Primary Provider Options

### Buffer

Use first for The Match Signal because it gives you a calendar UI, channel connections, approvals, analytics, and an API.

Required `.env`:

```env
SOCIAL_PRIMARY_PROVIDER=buffer
BUFFER_API_KEY=
BUFFER_BASE_URL=https://api.buffer.com
BUFFER_PUBLISH_PATH=/graphql
```

Docs: https://developers.buffer.com/guides/posts-and-scheduling.html

### Postproxy

Use when you want queues, scheduling, retries, and multi-platform post management from one API.

Required `.env`:

```env
SOCIAL_PRIMARY_PROVIDER=postproxy
POSTPROXY_API_KEY=
POSTPROXY_BASE_URL=
POSTPROXY_PUBLISH_PATH=/posts
```

Docs: https://postproxy.dev/reference/overview/

### Ayrshare

Use when you want a mature social API with analytics, comments, and many supported networks.

Required `.env`:

```env
SOCIAL_PRIMARY_PROVIDER=ayrshare
AYRSHARE_API_KEY=
AYRSHARE_BASE_URL=https://api.ayrshare.com/api
AYRSHARE_PUBLISH_PATH=/post
```

Docs: https://www.ayrshare.com/docs/apis

### Upload-Post

Use when the focus is media upload and publishing to video-first platforms.

Required `.env`:

```env
SOCIAL_PRIMARY_PROVIDER=uploadpost
UPLOAD_POST_API_KEY=
UPLOAD_POST_BASE_URL=
UPLOAD_POST_PUBLISH_PATH=/posts
```

Docs: https://docs.upload-post.com/

## Official API Slots

These are prepared but not fully wired for direct posting yet. Use them after app review or when you want to bypass unified vendors.

```env
META_APP_ID=
META_APP_SECRET=
META_ACCESS_TOKEN=

TIKTOK_CLIENT_KEY=
TIKTOK_CLIENT_SECRET=

YOUTUBE_CLIENT_ID=
YOUTUBE_CLIENT_SECRET=

X_CLIENT_ID=
X_CLIENT_SECRET=

BLUESKY_HANDLE=
BLUESKY_APP_PASSWORD=
```

## Backend Endpoints

Check provider status:

```http
GET /api/social/status
```

Dry-run a social post:

```http
POST /api/social/publish
Content-Type: application/json

{
  "provider": "postproxy",
  "dryRun": true,
  "platforms": ["instagram", "x", "youtube", "tiktok", "threads", "bluesky"],
  "text": "The Match Signal is live.",
  "title": "The Match Signal",
  "mediaUrls": [],
  "matchId": "launch"
}
```

Live publish:

```json
{
  "dryRun": false
}
```

Only use live publish after API keys, account connections, and provider endpoint paths are confirmed.

## Important Platform Notes

- Instagram API publishing requires a professional account and Meta permissions.
- TikTok direct posting requires Content Posting API approval and user authorization.
- YouTube uploads from unverified API projects can be restricted to private uploads until audit.
- X posting requires OAuth user tokens and paid API access in many cases.
- Bluesky is the easiest direct API path because AT Protocol posting is open with app passwords.
