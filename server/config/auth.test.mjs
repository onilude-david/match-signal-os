import { describe, it, expect, beforeEach } from "vitest";
import { apiKeyConfigured, extractApiKey, verifyApiKey, requireApiKey } from "./auth.mjs";

const KEY = "test-key-123";

// Minimal Express-shaped fakes — enough for the middleware contract.
const makeReq = ({ path = "/api/state", headers = {}, query = {} } = {}) => ({
  path,
  query,
  header: (name) => headers[name.toLowerCase()],
});
const makeRes = () => {
  const res = { statusCode: null, body: null };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (payload) => { res.body = payload; return res; };
  return res;
};

beforeEach(() => {
  delete process.env.MATCH_SIGNAL_API_KEY;
});

describe("apiKeyConfigured", () => {
  it("is false when unset or blank", () => {
    expect(apiKeyConfigured()).toBe(false);
    process.env.MATCH_SIGNAL_API_KEY = "   ";
    expect(apiKeyConfigured()).toBe(false);
  });
  it("is true when set", () => {
    process.env.MATCH_SIGNAL_API_KEY = KEY;
    expect(apiKeyConfigured()).toBe(true);
  });
});

describe("extractApiKey", () => {
  it("reads x-api-key header first", () => {
    expect(extractApiKey(makeReq({ headers: { "x-api-key": " abc " } }))).toBe("abc");
  });
  it("reads Authorization: Bearer", () => {
    expect(extractApiKey(makeReq({ headers: { authorization: "Bearer abc" } }))).toBe("abc");
  });
  it("reads apiKey query param (EventSource / video src path)", () => {
    expect(extractApiKey(makeReq({ query: { apiKey: "abc" } }))).toBe("abc");
  });
  it("returns empty string when nothing present", () => {
    expect(extractApiKey(makeReq())).toBe("");
  });
});

describe("verifyApiKey", () => {
  it("accepts the exact key and rejects everything else", () => {
    expect(verifyApiKey(KEY, KEY)).toBe(true);
    expect(verifyApiKey("wrong", KEY)).toBe(false);
    expect(verifyApiKey(KEY + "x", KEY)).toBe(false); // unequal length must not throw
    expect(verifyApiKey("", KEY)).toBe(false);
    expect(verifyApiKey(KEY, "")).toBe(false);
  });
});

describe("requireApiKey middleware", () => {
  it("passes everything through when no key is configured (local mode)", () => {
    let called = false;
    requireApiKey(makeReq(), makeRes(), () => { called = true; });
    expect(called).toBe(true);
  });

  it("rejects /api requests without the key when configured", () => {
    process.env.MATCH_SIGNAL_API_KEY = KEY;
    const res = makeRes();
    let called = false;
    requireApiKey(makeReq(), res, () => { called = true; });
    expect(called).toBe(false);
    expect(res.statusCode).toBe(401);
    expect(res.body.ok).toBe(false);
  });

  it("accepts the key via header, bearer, and query", () => {
    process.env.MATCH_SIGNAL_API_KEY = KEY;
    for (const req of [
      makeReq({ headers: { "x-api-key": KEY } }),
      makeReq({ headers: { authorization: `Bearer ${KEY}` } }),
      makeReq({ query: { apiKey: KEY } }),
    ]) {
      let called = false;
      requireApiKey(req, makeRes(), () => { called = true; });
      expect(called).toBe(true);
    }
  });

  it("leaves /api/health and the Telegram webhook open", () => {
    process.env.MATCH_SIGNAL_API_KEY = KEY;
    for (const path of ["/api/health", "/api/telegram/webhook"]) {
      let called = false;
      requireApiKey(makeReq({ path }), makeRes(), () => { called = true; });
      expect(called).toBe(true);
    }
  });

  it("ignores non-API paths (static frontend, SPA fallback)", () => {
    process.env.MATCH_SIGNAL_API_KEY = KEY;
    for (const path of ["/", "/index.html", "/artifacts/clips/x.mp4"]) {
      let called = false;
      requireApiKey(makeReq({ path }), makeRes(), () => { called = true; });
      expect(called).toBe(true);
    }
  });
});
