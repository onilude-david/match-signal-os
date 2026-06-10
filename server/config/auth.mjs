// API-key gate for every /api route.
//
// Single-operator deployment model: one shared secret in MATCH_SIGNAL_API_KEY.
// When the env var is unset the gate is OPEN (local dev stays zero-config) and
// index.mjs prints a loud boot warning. When set, every /api request must
// present the key — except the allowlist below.
//
// The key is accepted three ways, because not every client can send headers:
//   1. x-api-key: <key>                  (the app's fetch wrapper)
//   2. Authorization: Bearer <key>       (curl / external tools)
//   3. ?apiKey=<key>                     (EventSource + <video src> can't set
//                                         headers; query param is the only way)
//
// This is deliberately NOT user auth. When the multi-tenant version lands,
// this module is where per-user sessions/tokens replace the shared key —
// the call sites (middleware mount, frontend wrapper) stay the same.

import { createHash, timingSafeEqual } from "node:crypto";

// Paths that stay open even when a key is configured:
//   /api/health            — uptime checks / hosting platform probes carry no headers
//   /api/telegram/webhook  — Telegram cannot send custom auth headers; that
//                            route is gated separately via Telegram's native
//                            secret-token header (see routes/telegram.mjs)
const OPEN_API_PATHS = new Set(["/api/health", "/api/telegram/webhook"]);

export const apiKeyConfigured = () => Boolean((process.env.MATCH_SIGNAL_API_KEY ?? "").trim());

export const extractApiKey = (req) => {
  const header = req.header?.("x-api-key");
  if (header) return String(header).trim();
  const authz = req.header?.("authorization") ?? "";
  const bearer = authz.match(/^Bearer\s+(.+)$/i);
  if (bearer) return bearer[1].trim();
  if (req.query?.apiKey) return String(req.query.apiKey).trim();
  return "";
};

// Constant-time comparison. Hashing both sides first makes timingSafeEqual
// usable on inputs of unequal length without leaking the length difference.
export const verifyApiKey = (candidate, expected = process.env.MATCH_SIGNAL_API_KEY) => {
  const want = String(expected ?? "").trim();
  const got = String(candidate ?? "").trim();
  if (!want || !got) return false;
  const a = createHash("sha256").update(got).digest();
  const b = createHash("sha256").update(want).digest();
  return timingSafeEqual(a, b);
};

export const requireApiKey = (req, res, next) => {
  if (!req.path.startsWith("/api")) return next(); // static frontend + SPA fallback
  if (OPEN_API_PATHS.has(req.path)) return next();
  if (!apiKeyConfigured()) return next(); // local zero-config mode (boot warning printed)

  if (verifyApiKey(extractApiKey(req))) return next();

  res.status(401).json({
    ok: false,
    error: "Unauthorized. Provide the API key via the x-api-key header, an Authorization: Bearer token, or an apiKey query parameter.",
  });
};
