import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "../..");

dotenv.config({ path: path.join(rootDir, ".env") });

export const required = {
  gemini: "GEMINI_API_KEY",
  footballData: "FOOTBALL_DATA_TOKEN",
  telegram: "TELEGRAM_BOT_TOKEN",
  telegramAdmin: "TELEGRAM_ADMIN_CHAT_ID",
  telegramPublic: "TELEGRAM_PUBLIC_CHANNEL_ID",
  telegramBetting: "TELEGRAM_BETTING_CHANNEL_ID",
  supabase: "SUPABASE_URL",
  supabaseKey: "SUPABASE_SERVICE_ROLE_KEY or SUPABASE_PUBLISHABLE_KEY",
  googleSheets: "GOOGLE_SHEETS_SPREADSHEET_ID",
  googleServiceAccount: "GOOGLE_SERVICE_ACCOUNT_EMAIL",
  n8n: "N8N_WEBHOOK_URL",
  n8nMcpUrl: "N8N_MCP_URL",
  n8nMcpToken: "N8N_MCP_TOKEN",
  sportradar: "SPORTRADAR_API_KEY",
  oddsApi: "ODDS_API_KEY",
  buffer: "BUFFER_API_KEY",
  postproxy: "POSTPROXY_API_KEY",
  ayrshare: "AYRSHARE_API_KEY",
  uploadPost: "UPLOAD_POST_API_KEY",
  meta: "META_ACCESS_TOKEN",
  tiktok: "TIKTOK_CLIENT_KEY",
  youtube: "YOUTUBE_CLIENT_ID",
  xApi: "X_CLIENT_ID",
  bluesky: "BLUESKY_HANDLE",
};

export const providerStatus = () =>
  Object.fromEntries(
    Object.entries(required).map(([key, envName]) => {
      if (key === "gemini") {
        return [
          key,
          { configured: Boolean((process.env.GEMINI_API_KEY ?? "").trim()), envName },
        ];
      }
      if (key === "supabaseKey") {
        return [
          key,
          {
            configured: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY),
            envName,
          },
        ];
      }
      return [
        key,
        { configured: Boolean(process.env[envName]), envName },
      ];
    }),
  );

export const jsonError = (res, status, message, details) => {
  res.status(status).json({ ok: false, error: message, details });
};

export const assertEnv = (res, envName) => {
  if ((process.env[envName] ?? "").trim()) return true;
  jsonError(res, 501, `${envName} is not configured. Add it to .env and restart the API server.`);
  return false;
};

export const assertAllEnv = (res, envNames) => envNames.every((envName) => assertEnv(res, envName));
