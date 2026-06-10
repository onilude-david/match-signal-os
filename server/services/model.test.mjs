import { describe, it, expect } from "vitest";
import {
  expectedGoals,
  scoreGrid,
  marketProbabilities,
  modelMatch,
  attackIndex,
  defenseIndex,
} from "./model.mjs";

const strong = { team: "Strong", form: 9, attack: 9, defense: 9, midfield: 9, depth: 8, coach: 8, motivation: 9, injuryImpact: 1 };
const weak = { team: "Weak", form: 4, attack: 4, defense: 4, midfield: 4, depth: 4, coach: 4, motivation: 5, injuryImpact: 4 };
const avgA = { team: "Alpha", form: 6, attack: 6, defense: 6, midfield: 6, depth: 6, coach: 6, motivation: 7, injuryImpact: 2 };
const avgB = { team: "Beta", form: 6, attack: 6, defense: 6, midfield: 6, depth: 6, coach: 6, motivation: 7, injuryImpact: 2 };
const ratings = [strong, weak, avgA, avgB];

describe("rating indices", () => {
  it("rank stronger teams above weaker on both ends", () => {
    expect(attackIndex(strong)).toBeGreaterThan(attackIndex(weak));
    expect(defenseIndex(strong)).toBeGreaterThan(defenseIndex(weak));
  });
});

describe("expectedGoals", () => {
  it("gives the stronger side more expected goals", () => {
    const { lambdaHome, lambdaAway } = expectedGoals(ratings, { teamA: "Strong", teamB: "Weak" });
    expect(lambdaHome).toBeGreaterThan(lambdaAway);
    expect(lambdaHome).toBeGreaterThan(0);
    expect(lambdaAway).toBeGreaterThan(0);
  });
  it("applies home advantage between two identical teams", () => {
    const { lambdaHome, lambdaAway } = expectedGoals(ratings, { teamA: "Alpha", teamB: "Beta" });
    expect(lambdaHome).toBeGreaterThan(lambdaAway);
  });
  it("keeps lambdas in a sane football range", () => {
    const { lambdaHome, lambdaAway } = expectedGoals(ratings, { teamA: "Strong", teamB: "Weak" });
    expect(lambdaHome).toBeLessThan(7);
    expect(lambdaAway).toBeGreaterThan(0.05);
  });
});

describe("scoreGrid", () => {
  it("is a normalized probability distribution", () => {
    const grid = scoreGrid(1.6, 1.1);
    let sum = 0;
    for (const row of grid) for (const p of row) {
      expect(p).toBeGreaterThanOrEqual(0);
      sum += p;
    }
    expect(sum).toBeCloseTo(1, 6);
  });
});

describe("marketProbabilities", () => {
  const grid = scoreGrid(1.7, 1.0);
  const m = marketProbabilities(grid);

  it("1X2 sums to 1", () => {
    expect(m.oneXtwo.home + m.oneXtwo.draw + m.oneXtwo.away).toBeCloseTo(1, 4);
  });
  it("over/under each sum to 1 and overs are monotonic by line", () => {
    for (const t of m.totals) expect(t.over + t.under).toBeCloseTo(1, 4);
    const o15 = m.totals.find((t) => t.line === 1.5).over;
    const o25 = m.totals.find((t) => t.line === 2.5).over;
    const o35 = m.totals.find((t) => t.line === 3.5).over;
    expect(o15).toBeGreaterThan(o25);
    expect(o25).toBeGreaterThan(o35);
  });
  it("BTTS yes+no sum to 1", () => {
    expect(m.btts.yes + m.btts.no).toBeCloseTo(1, 4);
  });
  it("double chance equals the sum of its 1X2 legs", () => {
    expect(m.doubleChance.homeOrDraw).toBeCloseTo(m.oneXtwo.home + m.oneXtwo.draw, 4);
    expect(m.doubleChance.drawOrAway).toBeCloseTo(m.oneXtwo.draw + m.oneXtwo.away, 4);
  });
  it("draw-no-bet renormalizes over non-draw outcomes", () => {
    expect(m.drawNoBet.home + m.drawNoBet.away).toBeCloseTo(1, 4);
    expect(m.drawNoBet.home).toBeGreaterThan(m.drawNoBet.away); // home favored
  });
});

describe("modelMatch", () => {
  it("returns lambdas, all markets, and top scorelines", () => {
    const out = modelMatch(ratings, { teamA: "Strong", teamB: "Weak" });
    expect(out.lambdaHome).toBeGreaterThan(0);
    expect(out.markets.oneXtwo.home).toBeGreaterThan(out.markets.oneXtwo.away);
    expect(out.topScorelines.length).toBe(5);
    // top scoreline probabilities are sorted descending
    for (let i = 1; i < out.topScorelines.length; i += 1) {
      expect(out.topScorelines[i - 1].prob).toBeGreaterThanOrEqual(out.topScorelines[i].prob);
    }
  });
  it("a stronger favorite has a higher home win probability", () => {
    const big = modelMatch(ratings, { teamA: "Strong", teamB: "Weak" });
    const even = modelMatch(ratings, { teamA: "Alpha", teamB: "Beta" });
    expect(big.markets.oneXtwo.home).toBeGreaterThan(even.markets.oneXtwo.home);
  });
});
