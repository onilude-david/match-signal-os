# The Match Signal OS

Local operator console for football intelligence, content generation, Telegram previews, report exports, and matchday analytics.

## Run

```bash
npm install
npm run dev
```

Frontend: `http://127.0.0.1:5173`
Backend: `http://127.0.0.1:8787/api/health`

For hosted Node deployments:

```bash
npm run build
npm start
```

The Express server serves both the API and the built frontend from the same port.

## API Authentication

Every `/api` route (except `/api/health` and the Telegram webhook) is gated by a
shared secret when `MATCH_SIGNAL_API_KEY` is set in `.env`. Unset = open, which
is only acceptable on localhost; the server prints a security warning at boot.

```bash
# generate a key
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Put it in `.env` as `MATCH_SIGNAL_API_KEY=...`, then tell the frontend once in
the browser console: `localStorage.setItem("msos.apiKey", "<the key>")`.
External callers send it as `x-api-key: <key>`, `Authorization: Bearer <key>`,
or `?apiKey=<key>` (the query form exists for EventSource and `<video>` tags,
which cannot send headers). The Telegram webhook is instead protected with
Telegram's native secret token: set `TELEGRAM_WEBHOOK_SECRET` and register the
webhook with the matching `secret_token` parameter.

## API Setup

Copy `.env.example` to `.env`, fill the keys, then restart `npm run dev`.

- `GEMINI_API_KEY`: enables AI content generation through Gemini.
- `FOOTBALL_DATA_TOKEN`: enables fixture import from football-data.org.
- `SPORTRADAR_API_KEY`: enables Sportradar Soccer schedules, standings, lineups, missing players, live feeds, summaries, timelines, and momentum. Defaults are `SPORTRADAR_SOCCER_PRODUCT=soccer`, `SPORTRADAR_ACCESS_LEVEL=trial`, and `SPORTRADAR_LANGUAGE=en`.
- `TELEGRAM_BOT_TOKEN`: enables Telegram Bot API sending.
- `TELEGRAM_ADMIN_CHAT_ID`: target chat/channel for private operator previews.
- `TELEGRAM_POLLING_ENABLED`: optional. Defaults to enabled. Set to `false` if you only want to receive inbound Telegram updates through a deployed webhook.
- `SUPABASE_URL` and either `SUPABASE_SERVICE_ROLE_KEY` or `SUPABASE_PUBLISHABLE_KEY`: enable Supabase persistence. Run `supabase/schema.sql` in the Supabase SQL editor first. Server writes are most reliable with the service-role key; publishable-key writes depend on your table policies.
- `GOOGLE_SHEETS_SPREADSHEET_ID`, `GOOGLE_SERVICE_ACCOUNT_EMAIL`, and `GOOGLE_PRIVATE_KEY`: enable Google Sheets export. Create tabs named `Fixtures`, `Team Ratings`, `Accuracy`, and `Content Outputs`, then share the sheet with the service account email.
- `N8N_WEBHOOK_URL`: enables manual workflow triggers. Optional workflow-specific URLs are `N8N_DAILY_BRIEF_WEBHOOK`, `N8N_PRE_MATCH_WEBHOOK`, `N8N_POST_MATCH_WEBHOOK`, and `N8N_REPORT_WEBHOOK`.
- `N8N_MCP_URL` and `N8N_MCP_TOKEN`: enable n8n MCP status checks and future tool-based n8n orchestration.
- `SOCIAL_PRIMARY_PROVIDER`, `SOCIAL_DRY_RUN`, `BUFFER_API_KEY`, `POSTPROXY_API_KEY`, `AYRSHARE_API_KEY`, and `UPLOAD_POST_API_KEY`: enable the 2026 social publishing layer. See `artifacts/social-publishing-setup-2026.md`.

## Locked-In Connectors

- `POST /api/supabase/push`: upserts fixtures, ratings, content outputs, and accuracy records.
- `POST /api/sheets/export`: clears and rewrites the configured Google Sheet tabs.
- `POST /api/spreadsheet/workbook`: downloads a local XLSX workbook with fixtures, ratings, content outputs, group tables, dashboard, and accuracy records.
- `POST /api/n8n/trigger`: sends a workflow payload to n8n with optional `X-Match-Signal-Secret`.
- `GET /api/n8n/mcp/status`: verifies the configured n8n MCP server and bearer token.
- `POST /api/telegram/preview`: sends the current Telegram brief to the admin chat.
- `GET /api/telegram/status`: verifies the Telegram bot, configured commands, admin chat, and optional public channel.
- `GET /api/telegram/polling/status`: verifies the local inbound Telegram polling worker.
- `POST /api/telegram/webhook`: receives Telegram update payloads from n8n, a deployed webhook, or local tests.
- `POST /api/telegram/setup`: registers bot commands `/today`, `/generate`, `/preview`, `/approve`, `/stats`, and `/help`.
- `POST /api/telegram/public`: posts to `TELEGRAM_PUBLIC_CHANNEL_ID` when configured.
- `POST /api/content/ai`: asks Gemini to regenerate football-intelligence content.
- `GET /api/social/status`: checks unified social publishing providers and official API credential slots.
- `POST /api/social/publish`: creates a dry-run or live vendor publish request for multi-platform social posts.
- `GET /api/fixtures`: imports fixtures from football-data.org.
- `GET /api/sportradar/status`: confirms the configured Sportradar product/access/language.
- `GET /api/sportradar/competitions`: lists competitions.
- `GET /api/sportradar/competitions/:competitionId/seasons`: lists seasons for a competition.
- `GET /api/sportradar/seasons/:seasonId/schedules`: imports a full season schedule.
- `GET /api/sportradar/seasons/:seasonId/standings`: retrieves group/season standings.
- `GET /api/sportradar/seasons/:seasonId/lineups`: retrieves season lineups.
- `GET /api/sportradar/seasons/:seasonId/missing-players`: retrieves unavailable player context.
- `GET /api/sportradar/live/:feed`: retrieves live `schedules`, `summaries`, `timelines`, or `timelines_delta`.
- `GET /api/sportradar/schedules/:date`: imports Sportradar Soccer daily schedules.
- `GET /api/sportradar/schedules/:date/summaries`: retrieves daily summaries.
- `GET /api/sportradar/sport-events/:eventId/summary`: retrieves a Sportradar sport-event summary.
- `GET /api/sportradar/sport-events/:eventId/lineups`: retrieves sport-event lineups.
- `GET /api/sportradar/sport-events/:eventId/timeline`: retrieves a Sportradar sport-event timeline for live match intelligence.
- `GET /api/sportradar/sport-events/:eventId/momentum`: retrieves sport-event momentum.

## n8n Workflows

- `Match Signal OS Inbound Webhook` (`TNTM9yZiHPSARQwz`): production webhook at `https://davidonilude.app.n8n.cloud/webhook/match-signal-os`, used by `/api/n8n/trigger`.
- `Match Signal OS Automation Router` (`9YyGhaggomtr3OGC`): production webhook at `https://davidonilude.app.n8n.cloud/webhook/match-signal-os-router`, currently used by `/api/n8n/trigger`. Routes `manual`, `dailyBrief`, `preMatch`, `postMatch`, `report`, `telegramPreview`, and `telegramPublic` payloads into Telegram messages.
- `Match Signal OS Daily Brief` (`9yxFpIdiTbFR0DBA`): scheduled daily 08:00 operator brief. Pulls live World Cup fixtures from football-data.org and sends the next-match queue to Telegram.

## Safe Scope (two-tier)

The Match Signal OS ships as two distinct surfaces. The boundary is enforced in server code, not just copy.

### Public surface — editorial only

- **Channels**: `TELEGRAM_PUBLIC_CHANNEL_ID`, all social vendors (Buffer/Postproxy/Ayrshare/Upload-Post/official APIs), the operator Telegram preview inbox.
- **Content**: tactical context, match narrative, confidence ranges, uncertainty, attention/volatility/pressure as *editorial* signals, content priority. No picks, no odds numbers, no book names, no stake language.
- **Guardrail**: every public publish runs through `server/services/safetyFilter.mjs`. Any of the following trips a hard 422 reject (visible to the operator): `guaranteed`, `sure thing`, `lock`, `EV`, `units`, `stake`, `bankroll`, `Kelly`, decimal-odds patterns (`1.50–9.99`), American-odds patterns (`+150`, `-200`), market shorthand (`1X2`, `BTTS`, `GG/NG`, `O/U 2.5`, `DC`, `HT/FT`), and any major sportsbook brand name.

### VIP surface — gated picks

- **Channel**: `TELEGRAM_BETTING_CHANNEL_ID` only. Never broadcast publicly.
- **Content**: value picks computed *server-side* from team-rating model probability + current book decimal odds:
  - EV per side: `modelProb × decimalOdds − 1`
  - Fractional Kelly stake: `0.25 × full Kelly`, capped at `MAX_STAKE_UNITS=2.0`, floor `MIN_STAKE_UNITS=0.25`. Stakes below the floor publish as zero (the channel stays small and disciplined).
  - Minimum threshold: `MIN_EV=0.04`. Picks below the threshold are dropped before publish.
  - The LLM never supplies the EV/stake numbers — `server/services/picks.mjs` is the only source of truth. Gemini is asked only for an optional 3-sentence narrative framing.
- **Gates** (all must pass before `/api/telegram/vip` will publish):
  1. `TELEGRAM_BOT_TOKEN` configured
  2. `TELEGRAM_BETTING_CHANNEL_ID` configured
  3. `VIP_JURISDICTIONS` set to a non-empty comma-separated list (operator explicitly opts in per region)
  4. `VIP_PUBLISH_ENABLED` is not `"false"`
- **Responsible gambling**: every VIP message auto-appends a canonical footer with 18+/21+ language, links to US/UK/worldwide problem-gambling resources, and a `/stop` instruction. Operators cannot disable the footer; it lives in `picks.mjs`.
- **Audit trail**: every published pick writes a row to Supabase table `pick_log` (`pick_id`, `match_id`, `market`, `side`, `model_prob`, `book_name`, `book_price`, `implied_prob`, `ev`, `stake_units`, `confidence`, `created_at`). Used later for closing-line value tracking. If Supabase is unconfigured the publish still goes through and the audit failure is reported in the response.

### What this app still does not do

- Bet execution (no slip placement, no in-app wagering API).
- Bankroll automation (no in-app balance, no auto-staking).
- Public betting recommendations on any channel other than the gated VIP one.

### Required env additions for the VIP layer

```
TELEGRAM_BETTING_CHANNEL_ID=...     # the VIP channel/group id
VIP_JURISDICTIONS=US,UK,CA,DE,NG    # operator-defined opt-in list
VIP_PUBLISH_ENABLED=true            # set to "false" to globally pause VIP

# tuning (defaults shown)
KELLY_FRACTION=0.25
MAX_STAKE_UNITS=2.0
MIN_STAKE_UNITS=0.25
MIN_EV=0.04
PICKS_TEMP_SCALE=4.0
PICKS_DRAW_WEIGHT=0.27
```

### Routes summary

- `POST /api/telegram/preview` — operator inbox (public-safety filter applied)
- `POST /api/telegram/public` — public channel (public-safety filter applied)
- `POST /api/telegram/market-context` — editorial market signal to admin/public (public-safety filter applied)
- `POST /api/telegram/betting` — **410 Gone** (deprecated; old clients fail loud)
- `POST /api/telegram/vip/preview` — compute picks + formatted message body, do not send
- `POST /api/telegram/vip` — publish picks to VIP channel (all four gates required)
- `GET  /api/telegram/vip/footer` — canonical responsible-gambling footer text
- `POST /api/social/publish` — public social publish (public-safety filter applied)
