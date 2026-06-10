import { describe, it, expect } from "vitest";
import { publicSafetyCheck } from "./safetyFilter.mjs";

describe("publicSafetyCheck — clean editorial copy passes", () => {
  it("allows a tactical match brief with no betting language", () => {
    const text = "Mexico control the first phase; watch the press after the opening goal. South Africa look to counter through the left.";
    const result = publicSafetyCheck(text);
    expect(result.ok).toBe(true);
    expect(result.violations).toHaveLength(0);
  });
  it("treats non-string input as safe (no crash)", () => {
    expect(publicSafetyCheck(null).ok).toBe(true);
    expect(publicSafetyCheck(undefined).ok).toBe(true);
    expect(publicSafetyCheck(42).ok).toBe(true);
  });
});

describe("publicSafetyCheck — each forbidden category trips a 422-worthy violation", () => {
  const cases = [
    ["claim", "This is a guaranteed win for the favourites."],
    ["claim", "A genuine sure thing tonight."],
    ["claim", "This one is a lock."],
    ["stake", "Model shows strong +EV on the home side."],
    ["stake", "Put 2 units on it."],
    ["stake", "Manage your bankroll carefully."],
    ["stake", "Use a quarter Kelly stake."],
    ["action", "I would bet on the draw here."],
    ["action", "Back the underdog at these prices."],
    ["market", "BTTS looks likely tonight."],
    ["market", "Take the 1X2 home line."],
    ["market", "Over 2.5 is the play."],
    ["book", "Best price is on Bet365 right now."],
    ["odds", "The home side is 1.85 to win."],
    ["odds", "Americans see this at +150."],
  ];

  for (const [kind, text] of cases) {
    it(`flags ${kind}: "${text}"`, () => {
      const result = publicSafetyCheck(text);
      expect(result.ok).toBe(false);
      expect(result.violations.length).toBeGreaterThan(0);
      expect(result.violations.some((v) => v.kind === kind)).toBe(true);
    });
  }
});

describe("publicSafetyCheck — violation shape", () => {
  it("returns kind, pattern, and the matched substring", () => {
    const result = publicSafetyCheck("guaranteed banker");
    expect(result.ok).toBe(false);
    const v = result.violations[0];
    expect(v).toHaveProperty("kind");
    expect(v).toHaveProperty("pattern");
    expect(v).toHaveProperty("match");
  });
});
