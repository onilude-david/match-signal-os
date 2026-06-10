import { describe, it, expect } from "vitest";
import { closingLineValue, summarizePicks } from "./supabase.mjs";

describe("closingLineValue", () => {
  it("is positive when we beat the closing line", () => {
    // backed at 2.10, closed at 1.90 -> we got the better price
    expect(closingLineValue(2.1, 1.9)).toBeCloseTo(2.1 / 1.9 - 1, 10);
    expect(closingLineValue(2.1, 1.9)).toBeGreaterThan(0);
  });
  it("is negative when the line moved against us", () => {
    expect(closingLineValue(1.8, 2.0)).toBeLessThan(0);
  });
  it("rejects invalid prices", () => {
    expect(closingLineValue(1.0, 2.0)).toBeNull();
    expect(closingLineValue(2.0, "x")).toBeNull();
  });
});

describe("summarizePicks", () => {
  it("computes ROI, hit rate, and profit from settled picks", () => {
    const rows = [
      { result: "Win", stake_units: 2, book_price: 2.0 },   // +2.0u
      { result: "Loss", stake_units: 1, book_price: 3.0 },  // -1.0u
      { result: "Win", stake_units: 1, book_price: 1.5 },   // +0.5u
      { result: null, stake_units: 2, book_price: 2.0 },    // pending, ignored
    ];
    const s = summarizePicks(rows);
    expect(s.totalPicks).toBe(4);
    expect(s.settled).toBe(3);
    expect(s.pending).toBe(1);
    expect(s.wins).toBe(2);
    expect(s.losses).toBe(1);
    expect(s.profitUnits).toBeCloseTo(1.5, 6); // 2.0 - 1.0 + 0.5
    expect(s.stakedUnits).toBeCloseTo(4, 6);   // 2 + 1 + 1
    expect(s.roi).toBeCloseTo(1.5 / 4, 6);
    expect(s.hitRate).toBeCloseTo(2 / 3, 6);
  });

  it("treats voids as stake-returned (excluded from turnover)", () => {
    const rows = [
      { result: "Void", stake_units: 2, book_price: 2.0 },
      { result: "Win", stake_units: 1, book_price: 2.0 },
    ];
    const s = summarizePicks(rows);
    expect(s.voids).toBe(1);
    expect(s.stakedUnits).toBeCloseTo(1, 6); // void excluded
    expect(s.profitUnits).toBeCloseTo(1, 6);
  });

  it("computes CLV beat rate and average CLV", () => {
    const rows = [
      { result: "Win", stake_units: 1, book_price: 2.1, clv: 0.1 },   // beat
      { result: "Loss", stake_units: 1, book_price: 1.8, clv: -0.05 }, // missed
      { result: "Win", stake_units: 1, book_price: 2.0, clv: 0.0 },   // beat (>=0)
    ];
    const s = summarizePicks(rows);
    expect(s.clvTracked).toBe(3);
    expect(s.clvBeatRate).toBeCloseTo(2 / 3, 6);
    expect(s.avgClv).toBeCloseTo((0.1 - 0.05 + 0.0) / 3, 6);
  });

  it("handles an empty log", () => {
    const s = summarizePicks([]);
    expect(s.totalPicks).toBe(0);
    expect(s.roi).toBeNull();
    expect(s.hitRate).toBeNull();
    expect(s.clvBeatRate).toBeNull();
  });
});
