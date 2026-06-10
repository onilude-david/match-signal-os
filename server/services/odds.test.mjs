import { describe, it, expect } from "vitest";
import { normalizeEvent, lineShop, matchEventToFixture } from "./odds.mjs";

// A realistic two-book Odds API event payload.
const event = {
  home_team: "Brazil",
  away_team: "Morocco",
  commence_time: "2026-06-13T22:00:00Z",
  bookmakers: [
    {
      key: "betmgm",
      title: "BetMGM",
      last_update: "2026-06-10T10:00:00Z",
      markets: [
        { key: "h2h", outcomes: [
          { name: "Brazil", price: 1.62 },
          { name: "Morocco", price: 5.5 },
          { name: "Draw", price: 3.9 },
        ] },
        { key: "totals", outcomes: [
          { name: "Over", point: 2.5, price: 1.95 },
          { name: "Under", point: 2.5, price: 1.88 },
        ] },
      ],
    },
    {
      key: "pinnacle",
      title: "Pinnacle",
      last_update: "2026-06-10T10:01:00Z",
      markets: [
        { key: "h2h", outcomes: [
          { name: "Brazil", price: 1.66 },   // better home price
          { name: "Morocco", price: 5.3 },
          { name: "Draw", price: 4.1 },      // better draw price
        ] },
        { key: "totals", outcomes: [
          { name: "Over", point: 2.5, price: 1.99 },  // better over
          { name: "Under", point: 2.5, price: 1.85 },
        ] },
      ],
    },
  ],
};

describe("normalizeEvent", () => {
  it("maps bookmaker markets into a tidy per-book shape", () => {
    const n = normalizeEvent(event);
    expect(n.home).toBe("Brazil");
    expect(n.books).toHaveLength(2);
    expect(n.books[0].h2h.home).toBe(1.62);
    expect(n.books[0].totals[2.5].over).toBe(1.95);
  });
});

describe("lineShop", () => {
  it("takes the best price per outcome across books and names the book", () => {
    const shopped = lineShop(normalizeEvent(event));
    expect(shopped.best.h2h.home.price).toBe(1.66);
    expect(shopped.best.h2h.home.book).toBe("Pinnacle");
    expect(shopped.best.h2h.draw.price).toBe(4.1);
    expect(shopped.best.h2h.away.price).toBe(5.5);
    expect(shopped.best.h2h.away.book).toBe("BetMGM");
  });
  it("shops totals lines too", () => {
    const shopped = lineShop(normalizeEvent(event));
    const t = shopped.best.totals.find((x) => x.line === 2.5);
    expect(t.over.price).toBe(1.99);
    expect(t.over.book).toBe("Pinnacle");
    expect(t.under.price).toBe(1.88);
    expect(t.under.book).toBe("BetMGM");
  });
  it("reports how many books were compared", () => {
    expect(lineShop(normalizeEvent(event)).bookCount).toBe(2);
  });
});

describe("matchEventToFixture", () => {
  it("matches regardless of home/away order", () => {
    expect(matchEventToFixture([event], { teamA: "Brazil", teamB: "Morocco" })).toBe(event);
    expect(matchEventToFixture([event], { teamA: "Morocco", teamB: "Brazil" })).toBe(event);
  });
  it("normalizes name variants (USA, South Korea)", () => {
    const e2 = { ...event, home_team: "United States", away_team: "South Korea" };
    expect(matchEventToFixture([e2], { teamA: "USA", teamB: "Korea Republic" })).toBe(e2);
  });
  it("returns null when no event matches", () => {
    expect(matchEventToFixture([event], { teamA: "Spain", teamB: "Japan" })).toBeNull();
  });
});
