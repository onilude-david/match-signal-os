import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { providerStatus } from "./config/env.mjs";
import { pollTelegramUpdates } from "./services/telegram.mjs";

// Import routers
import fixturesRouter from "./routes/fixtures.mjs";
import contentRouter from "./routes/content.mjs";
import telegramRouter from "./routes/telegram.mjs";
import videoRouter from "./routes/video.mjs";
import socialRouter from "./routes/social.mjs";
import supabaseRouter from "./routes/supabase.mjs";
import sportradarRouter from "./routes/sportradar.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const artifactsDir = path.join(rootDir, "artifacts");

const app = express();
const port = Number(process.env.PORT ?? process.env.API_PORT ?? 8787);

app.use(express.json({ limit: "1mb" }));
app.use("/artifacts", express.static(artifactsDir));

// Base health route
app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    api: "match-signal-os",
    providers: providerStatus(),
  });
});

// Mount routers
app.use("/api", fixturesRouter);
app.use("/api", contentRouter);
app.use("/api", videoRouter);
app.use("/api", socialRouter);
app.use("/api/telegram", telegramRouter);
app.use("/api/supabase", supabaseRouter);
app.use("/api/sportradar", sportradarRouter);

// Serve frontend build in production
const distPath = path.join(rootDir, "dist");
app.use(express.static(distPath));
app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api")) return next();
  res.sendFile(path.join(distPath, "index.html"));
});

// Start server
app.listen(port, "0.0.0.0", () => {
  console.log(`Match Signal API running on port ${port}`);
  if (process.env.TELEGRAM_POLLING_ENABLED !== "false" && process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_ADMIN_CHAT_ID) {
    pollTelegramUpdates();
  }
});
