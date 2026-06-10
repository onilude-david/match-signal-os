import { describe, it, expect, beforeEach } from "vitest";
import {
  decimalToImpliedProb,
  expectedValue,
  kellyStake,
  oneXTwoProbabilities,
  computePicks,
  buildVipMessage,
  responsibleGamblingFooter,
} from "./picks.mjs";

// picks.mjs reads tuning from process.env at call time. Pin the defaults so
// these assertions are deterministic regardless of any ambient .env.
beforeEach(() => {
  delete process.env.KELLY_FRACTION;
  delete process.env.MAX_STAKE_UNITS;
  delete process.env.MIN_STAKE_UNITS;
  delete process.env.MIN_EV;
  delete process.env.PICKS_TEMP_SCALE;
  delete process.env.PICKS_DRAW_WEIGHT;
});

describe("decimalToImpliedProb", () => {
  it("inverts a valid decimal price", () => {
    expect(decimalToImpliedProb(2.0)).toBeCloseTo(0.5, 10);
    expect(decimalToImpliedProb(4.0)).toBeCloseTo(0.25, 10);
  });
  it("rejects prices <= 1 and non-numbers", () => {
    expect(decimalToImpliedProb(1.0)).toBeNull();
    expect(decimalToImpliedProb(0)).toBeNull();
    expect(decimalToImpliedProb("nope")).toBeNull();
  });
});

describe("expectedValue", () => {
  it("computes p*price - 1", () => {
    expect(expectedValue(0.6, 2.0)).toBeCloseTo(0.2, 10);
  });
  it("is zero at a fair price", () => {
    expect(expectedValue(0.5, 2.0)).toBeCloseTo(0, 10);
  });
  it("guards invalid probability and price", () => {
    expect(expectedValue(0.5, 1.0)).toBeNull();
    expect(expectedValue(0, 2.0)).toBeNull();
    expect(expectedValue(1, 2.0)).toBeNull();
    expect(expectedValue(1.2, 2.0)).toBeNull();
  });
});

describe("kellyStake", () => {
  it("returns 0 when there is no edge", () => {
    // p below implied -> negative full Kelly -> 0
    expect(kellyStake(0.4, 2.0)).toBe(0);
  });
  it("drops stakes below the floor to 0 (disciplined channel)", () => {
    // quarter-Kelly of a small edge lands under the 0.25u default floor
    expect(kellyStake(0.55, 2.0)).toBe(0);
  });
  it("returns a positive stake for a clear edge when the floor allows it", () => {
    const stake = kellyStake(0.7, 2.0, { minUnits: 0.01 });
    expect(stake).toBeGreaterThan(0);
    expect(stake).toBeCloseTo(0.1, 6); // fullKelly 0.4 * 0.25 fraction
  });
  it("respects the max-units cap", () => {
    const stake = kellyStake(0.7, 2.0, { kellyFraction: 1, maxUnits: 0.1, minUnits: 0.01 });
    expect(stake).toBe(0.1);
  });
});

describe("oneXTwoProbabilities", () => {
  const ratings = [
    { team: "Strong", form: 10, attack: 10, defense: 10, midfield: 10, depth: 10, coach: 10, motivation: 10, injuryImpact: 0 },
    { team: "Weak", form: 3, attack: 3, defense: 3, midfield: 3, depth: 3, coach: 3, motivation: 3, injuryImpact: 5 },
  ];
  it("returns three probabilities that sum to 1", () => {
    const p = oneXTwoProbabilities(ratings, { teamA: "Strong", teamB: "Weak" });
    expect(p.homeProb + p.drawProb + p.awayProb).toBeCloseTo(1, 6);
  });
  it("favors the stronger side", () => {
    const p = oneXTwoProbabilities(ratings, { teamA: "Strong", teamB: "Weak" });
    expect(p.homeProb).toBeGreaterThan(p.awayProb);
  });
  it("is symmetric when sides swap", () => {
    const p = oneXTwoProbabilities(ratings, { teamA: "Weak", teamB: "Strong" });
    expect(p.awayProb).toBeGreaterThan(p.homeProb);
  });
});

describe("computePicks", () => {
  const ratings = [
    { team: "Strong", form: 10, attack: 10, defense: 10, midfield: 10, depth: 10, coach: 10, motivation: 10, injuryImpact: 0 },
    { team: "Weak", form: 3, attack: 3, defense: 3, midfield: 3, depth: 3, coach: 3, motivation: 3, injuryImpact: 5 },
  ];
  it("returns [] when the fixture has no odds", () => {
    expect(computePicks({ id: "m1", teamA: "Strong", teamB: "Weak" }, ratings)).toEqual([]);
  });
  it("emits a value pick when the model strongly disagrees with the price", () => {
    // NOTE: with the documented defaults (KELLY_FRACTION=0.25,
    // MIN_STAKE_UNITS=0.25) quarter-Kelly of any realistic edge lands just
    // under the 0.25u floor, so the channel publishes almost nothing. We set
    // a lower floor here to exercise the emission path. This is a real tuning
    // finding flagged in the audit, not a test workaround.
    process.env.MIN_STAKE_UNITS = "0.01";
    const fixture = { id: "m1", teamA: "Strong", teamB: "Weak", homeOdds: 2.0, drawOdds: 4.0, awayOdds: 8.0, stage: "Group", date: "2026-06-11", time: "19:00" };
    const picks = computePicks(fixture, ratings);
    expect(picks.length).toBeGreaterThanOrEqual(1);
    const home = picks.find((p) => p.side === "Home");
    expect(home).toBeTruthy();
    expect(home.ev).toBeGreaterThan(0);
    expect(home.stakeUnits).toBeGreaterThan(0);
  });

  it("publishes nothing at default tuning even with a huge edge (floor >= quarter-Kelly ceiling)", () => {
    // Documents the current behavior: default floor 0.25 with fraction 0.25
    // means stakeUnits rounds to 0 for sub-certain edges, dropping the pick.
    const fixture = { id: "m3", teamA: "Strong", teamB: "Weak", homeOdds: 2.0, drawOdds: 4.0, awayOdds: 8.0 };
    const picks = computePicks(fixture, ratings); // defaults restored by beforeEach
    expect(picks).toEqual([]);
  });
  it("drops picks below the EV threshold", () => {
    // Price exactly fair-ish for the model -> EV under MIN_EV default 0.04
    const fixture = { id: "m2", teamA: "Strong", teamB: "Weak", homeOdds: 1.01, awayOdds: 1.01 };
    const picks = computePicks(fixture, ratings);
    expect(picks.every((p) => p.ev >= 0.04)).toBe(true);
  });
});

describe("buildVipMessage", () => {
  it("returns null when there are no picks", () => {
    expect(buildVipMessage({ teamA: "A", teamB: "B" }, [])).toBeNull();
  });
  it("includes the responsible-gambling footer on every message", () => {
    const fixture = { teamA: "Strong", teamB: "Weak", stage: "Group", date: "2026-06-11", time: "19:00" };
    const picks = [{ market: "1X2", side: "Home", label: "Strong", modelProb: 0.8, bookPrice: 2.0, bookName: "Pinnacle", impliedProb: 0.5, ev: 0.6, stakeUnits: 0.25, confidence: "High" }];
    const msg = buildVipMessage(fixture, picks);
    expect(msg).toContain("Strong vs Weak");
    expect(msg).toContain(responsibleGamblingFooter());
  });
});
