import { describe, it, expect, beforeEach } from "vitest";
import {
  decimalToImpliedProb,
  expectedValue,
  kellyStake,
  oneXTwoProbabilities,
  computePicks,
  analyzeFixture,
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

describe("kellyStake (units: 1u = 1% bankroll by default)", () => {
  it("returns 0 when there is no edge", () => {
    expect(kellyStake(0.4, 2.0)).toBe(0);
  });
  it("drops a tiny edge below the 0.25u floor to 0", () => {
    // p=0.502 @ 2.0: fullKelly 0.004 -> quarter 0.001 bankroll -> 0.1u < 0.25u
    expect(kellyStake(0.502, 2.0)).toBe(0);
  });
  it("returns a sensible unit stake for a clear edge", () => {
    // p=0.55 @ 2.0: fullKelly 0.1 -> quarter 0.025 of bankroll -> 2.5u
    expect(kellyStake(0.55, 2.0)).toBeCloseTo(2.5, 6);
  });
  it("caps at the max-units ceiling for huge edges", () => {
    // p=0.8 @ 2.0: quarter Kelly is 15% of bankroll -> 15u, capped to 3u
    expect(kellyStake(0.8, 2.0)).toBe(3);
  });
  it("scales with the unit definition", () => {
    // Same edge, but 1u = 2% of bankroll -> half the unit count.
    expect(kellyStake(0.55, 2.0, { unitPct: 2 })).toBeCloseTo(1.25, 6);
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
    const fixture = { id: "m1", teamA: "Strong", teamB: "Weak", homeOdds: 2.0, drawOdds: 4.0, awayOdds: 8.0, stage: "Group", date: "2026-06-11", time: "19:00" };
    const picks = computePicks(fixture, ratings);
    expect(picks.length).toBeGreaterThanOrEqual(1);
    const home = picks.find((p) => p.side === "Home");
    expect(home).toBeTruthy();
    expect(home.ev).toBeGreaterThan(0);
    expect(home.stakeUnits).toBeGreaterThan(0);
    expect(home.market).toBe("1X2");
  });

  it("publishes at the recalibrated default floor (0.10u) for a clear edge", () => {
    // Regression for the audit finding: the old 0.25u floor with quarter-Kelly
    // swallowed every realistic edge. At the recalibrated 0.10u floor a strong
    // mispriced favorite now produces at least one pick with default tuning.
    const fixture = { id: "m3", teamA: "Strong", teamB: "Weak", homeOdds: 2.0, drawOdds: 4.0, awayOdds: 8.0 };
    const picks = computePicks(fixture, ratings); // defaults restored by beforeEach
    expect(picks.length).toBeGreaterThanOrEqual(1);
    expect(picks[0].stakeUnits).toBeGreaterThanOrEqual(0.1);
  });

  it("computes a de-vigged fair probability and edge for each pick", () => {
    const fixture = { id: "m4", teamA: "Strong", teamB: "Weak", homeOdds: 2.0, drawOdds: 4.0, awayOdds: 8.0 };
    const picks = computePicks(fixture, ratings);
    for (const p of picks) {
      expect(typeof p.fairProb).toBe("number");
      expect(p.edge).toBeGreaterThanOrEqual(0.02); // passed the discipline gate
      expect(p.devigMethod).toBe("shin");
    }
  });

  it("analyzeFixture returns model snapshot, picks, exposure, and message", () => {
    const fixture = { id: "m5", teamA: "Strong", teamB: "Weak", homeOdds: 2.0, drawOdds: 4.0, awayOdds: 8.0, stage: "Group", date: "2026-06-11", time: "19:00" };
    const out = analyzeFixture(fixture, ratings);
    expect(out.model.lambdaHome).toBeGreaterThan(0);
    expect(out.model.topScorelines.length).toBeGreaterThan(0);
    expect(out.model.markets.oneXtwo.home).toBeGreaterThan(0);
    expect(Array.isArray(out.picks)).toBe(true);
    expect(out.totalStake).toBeGreaterThanOrEqual(0);
    if (out.picks.length) {
      expect(out.message).toContain("Strong vs Weak");
      expect(out.message).toContain("Model xG");
    }
  });

  it("prices Over/Under from line-shopped odds and uses the best book", () => {
    const fixture = { id: "m6", teamA: "Strong", teamB: "Weak" };
    const odds = {
      best: {
        h2h: { home: { price: 2.0, book: "Pinnacle" }, draw: { price: 4.0, book: "BetMGM" }, away: { price: 8.0, book: "Bet365" } },
        totals: [{ line: 2.5, over: { price: 2.2, book: "FanDuel" }, under: { price: 1.75, book: "DraftKings" } }],
      },
    };
    const picks = computePicks(fixture, ratings, { odds });
    // A strong favorite vs a weak side skews toward Over; if it clears the
    // gates it should carry the best over book.
    const ou = picks.find((p) => p.market === "Over/Under");
    if (ou) {
      expect(ou.line).toBe(2.5);
      expect(["FanDuel", "DraftKings"]).toContain(ou.bookName);
    }
    // 1X2 home pick should use the shopped book name, not a placeholder.
    const home = picks.find((p) => p.market === "1X2" && p.side === "Home");
    expect(home?.bookName).toBe("Pinnacle");
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
