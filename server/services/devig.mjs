// Overround removal (de-vigging).
//
// A bookmaker's prices imply probabilities that sum to MORE than 1 — the
// excess is the overround (vig), the book's margin. To measure a real edge we
// compare our model probability against the book's FAIR probability, which is
// what's left after stripping the vig. Comparing against the raw implied price
// would systematically overstate edge and bleed the bankroll.
//
// Two methods:
//   - multiplicative: divide each implied prob by the total. Simple, unbiased
//     only if the vig is spread proportionally.
//   - Shin: models a fraction z of "insider" money and removes the
//     favorite-longshot bias (longshots carry more vig than favorites). This
//     is the method sharp bettors use. Falls back to multiplicative if it
//     fails to converge.

export const impliedFromDecimal = (odds) => {
  const p = Number(odds);
  if (!Number.isFinite(p) || p <= 1) return null;
  return 1 / p;
};

// Total book margin as a fraction. 0.05 = a 5% overround.
export const overround = (decimalOdds) => {
  const implied = decimalOdds.map(impliedFromDecimal);
  if (implied.some((p) => p === null)) return null;
  return implied.reduce((a, b) => a + b, 0) - 1;
};

// Proportional de-vig.
export const devigMultiplicative = (decimalOdds) => {
  const implied = decimalOdds.map(impliedFromDecimal);
  if (implied.some((p) => p === null)) return null;
  const total = implied.reduce((a, b) => a + b, 0);
  if (total <= 0) return null;
  return implied.map((p) => p / total);
};

// Shin (1992/1993) de-vig. Solves for the insider proportion z in [0, ~0.3]
// such that the recovered fair probabilities sum to 1.
//
//   p_i = ( sqrt( z^2 + 4(1-z) * pi_i^2 / Pi ) - z ) / ( 2(1-z) )
//
// where pi_i = 1/odds_i and Pi = sum(pi_i). We bisect on z.
export const devigShin = (decimalOdds) => {
  const implied = decimalOdds.map(impliedFromDecimal);
  if (implied.some((p) => p === null)) return null;
  const Pi = implied.reduce((a, b) => a + b, 0);
  if (Pi <= 1) {
    // No overround (or a freak underround) — nothing to strip beyond
    // normalizing. Multiplicative is exact here.
    return { probs: implied.map((p) => p / Pi), z: 0 };
  }

  const sumProbs = (z) => {
    let s = 0;
    for (const pi of implied) {
      s += (Math.sqrt(z * z + (4 * (1 - z) * pi * pi) / Pi) - z) / (2 * (1 - z));
    }
    return s;
  };

  // sumProbs is monotonic decreasing in z over [0, ~0.5]; bisect to hit 1.
  let lo = 0;
  let hi = 0.5;
  if (sumProbs(lo) < 1) return devigShinFallback(implied, Pi);
  for (let iter = 0; iter < 60; iter += 1) {
    const mid = (lo + hi) / 2;
    const s = sumProbs(mid);
    if (Math.abs(s - 1) < 1e-10) { lo = hi = mid; break; }
    if (s > 1) lo = mid; else hi = mid;
  }
  const z = (lo + hi) / 2;
  const probs = implied.map(
    (pi) => (Math.sqrt(z * z + (4 * (1 - z) * pi * pi) / Pi) - z) / (2 * (1 - z)),
  );
  // Guard against numerical drift.
  const total = probs.reduce((a, b) => a + b, 0);
  if (!Number.isFinite(total) || total <= 0) return devigShinFallback(implied, Pi);
  return { probs: probs.map((p) => p / total), z };
};

function devigShinFallback(implied, Pi) {
  return { probs: implied.map((p) => p / Pi), z: 0 };
}

// Single entry point: returns fair probabilities for an ordered set of decimal
// odds using the chosen method (default Shin). Method label is returned for
// the audit trail.
export const fairProbabilities = (decimalOdds, method = process.env.DEVIG_METHOD ?? "shin") => {
  if (method === "multiplicative") {
    const probs = devigMultiplicative(decimalOdds);
    return probs ? { probs, method: "multiplicative", z: null } : null;
  }
  const shin = devigShin(decimalOdds);
  return shin ? { probs: shin.probs, method: "shin", z: round4(shin.z) } : null;
};

function round4(v) {
  return v == null ? null : Math.round(v * 10000) / 10000;
}
