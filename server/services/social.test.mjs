import { afterEach, describe, expect, it, vi } from "vitest";
import { planBufferPublish } from "./social.mjs";

const mockBufferFetch = () => {
  const fetchMock = vi.fn(async (_url, init) => {
    const body = JSON.parse(init.body);
    if (body.query.includes("currentOrganization")) {
      return Response.json({
        data: { account: { currentOrganization: { id: "org_123" } } },
      });
    }
    if (body.query.includes("channels")) {
      return Response.json({
        data: {
          channels: [
            { id: "ig_1", name: "thematchsignal", service: "instagram" },
            { id: "tw_1", name: "thematchsignal", service: "twitter" },
            { id: "tt_1", name: "thematchsignal", service: "tiktok" },
          ],
        },
      });
    }
    return Response.json({ data: {} });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("planBufferPublish", () => {
  it("maps UI platform aliases to connected Buffer channels", async () => {
    mockBufferFetch();

    const plan = await planBufferPublish({
      apiKey: "buffer_test",
      baseUrl: "https://api.buffer.com",
      force: true,
      payload: {
        platforms: ["instagram", "x", "tiktok"],
        text: "Brazil vs Japan: watch the midfield pressure swing.",
        mediaUrls: [],
      },
    });

    expect(plan.ok).toBe(true);
    expect(plan.services).toEqual(["instagram", "twitter", "tiktok"]);
    expect(plan.targets.map((target) => target.service)).toEqual(["instagram", "twitter", "tiktok"]);
    expect(plan.unknown).toEqual([]);
    expect(plan.missing).toEqual([]);
  });

  it("reports missing or unknown targets before a live publish", async () => {
    mockBufferFetch();

    const plan = await planBufferPublish({
      apiKey: "buffer_test",
      baseUrl: "https://api.buffer.com",
      force: true,
      payload: {
        platforms: ["youtube", "bluesky", "mastodon"],
        text: "Brazil vs Japan: tactical preview.",
        mediaUrls: [],
      },
    });

    expect(plan.ok).toBe(false);
    expect(plan.missing).toEqual(["youtube"]);
    expect(plan.unknown).toEqual(["bluesky", "mastodon"]);
    expect(plan.connectedServices).toEqual(["instagram", "twitter", "tiktok"]);
  });
});
