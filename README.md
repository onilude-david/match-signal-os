# The Match Signal OS

Local operator console for football intelligence, content generation, Telegram previews, report exports, and matchday analytics.

## Run

```bash
npm install
npm run dev
```

Frontend: `http://127.0.0.1:5173`
Backend: `http://127.0.0.1:8787/api/health`

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

## Safe Scope

This app is football intelligence and media automation. It does not implement betting execution, stake sizing, odds comparison, bet slips, bankroll logic, gambling recommendations, or Sportradar odds/Betradar betting feeds.

The Lab includes a safe Market Context module for attention, volatility, fan pressure, media momentum, and content priority. These are editorial/intelligence signals, not betting-market signals.
