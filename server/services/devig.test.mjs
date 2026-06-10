import { describe, it, expect } from "vitest";
import {
  impliedFromDecimal,
  overround,
  devigMultiplicative,
  devigShin,
  fairProbabilities,
} from "./devig.mjs";

describe("impliedFromDecimal", () => {
  it("inverts valid prices and rejects invalid", () => {
    expect(impliedFromDecimal(2.0)).toBeCloseTo(0.5, 10);
    expect(impliedFromDecimal(1.0)).toBeNull();
    expect(impliedFromDecimal("x")).toBeNull();
  });
});

describe("overround", () => {
  it("measures the book margin", () => {
    // 1/1.90 = 0.5263; two-way sums to 1.0526 -> ~5.26% overround
    expect(overround([1.9, 1.9])).toBeCloseTo(0.0526, 3);
  });
  it("is ~0 for a fair 2.0/2.0 book", () => {
    expect(overround([2.0, 2.0])).toBeCloseTo(0, 6);
  });
});

describe("devigMultiplicative", () => {
  it("returns fair probabilities summing to 1", () => {
    const probs = devigMultiplicative([1.9, 1.9]);
    expect(probs[0] + probs[1]).toBeCloseTo(1, 10);
    expect(probs[0]).toBeCloseTo(0.5, 10);
  });
  it("works for a 3-way 1X2 market", () => {
    const probs = devigMultiplicative([2.1, 3.4, 3.8]);
    expect(probs.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10);
    expect(probs[0]).toBeGreaterThan(probs[2]); // shorter price -> higher prob
  });
});

describe("devigShin", () => {
  it("returns probabilities summing to 1 with z >= 0", () => {
    const { probs, z } = devigShin([2.1, 3.4, 3.8]);
    expect(probs.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 6);
    expect(z).toBeGreaterThanOrEqual(0);
    expect(z).toBeLessThan(0.5);
  });
  it("is symmetric for a symmetric market", () => {
    const { probs } = devigShin([1.9, 1.9]);
    expect(probs[0]).toBeCloseTo(0.5, 6);
    expect(probs[1]).toBeCloseTo(0.5, 6);
  });
  it("corrects favorite-longshot bias: favorite prob differs from multiplicative", () => {
    const odds = [1.3, 6.0, 11.0]; // heavy favorite + two longshots
    const shin = devigShin(odds).probs;
    const mult = devigMultiplicative(odds);
    // Shin assigns the favorite MORE probability than naive normalization.
    expect(shin[0]).toBeGreaterThan(mult[0]);
    // and the longshots correspondingly less.
    expect(shin[2]).toBeLessThan(mult[2]);
  });
  it("handles a no-vig book without blowing up", () => {
    const { probs } = devigShin([2.0, 2.0]);
    expect(probs[0] + probs[1]).toBeCloseTo(1, 6);
  });
});

describe("fairProbabilities", () => {
  it("defaults to shin and labels the method", () => {
    const out = fairProbabilities([2.1, 3.4, 3.8]);
    expect(out.method).toBe("shin");
    expect(out.probs.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 6);
    expect(typeof out.z).toBe("number");
  });
  it("honors an explicit multiplicative request", () => {
    const out = fairProbabilities([2.1, 3.4, 3.8], "multiplicative");
    expect(out.method).toBe("multiplicative");
    expect(out.z).toBeNull();
  });
});
