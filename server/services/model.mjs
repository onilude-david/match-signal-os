// Dixon-Coles bivariate-Poisson match model.
//
// This is the quant core of the VIP layer. It turns the operator's team
// ratings into expected goals (lambda) for each side, builds a full scoreline
// probability grid with the Dixon-Coles low-score correction, and derives
// internally-consistent probabilities for EVERY market from that one grid:
// 1X2, Double Chance, Over/Under, BTTS, Draw-No-Bet, and correct score.
//
// Why this matters: the previous engine produced a 1X2 number from a hand-
// tuned sigmoid, which can't price totals or BTTS and isn't internally
// consistent. A scoreline grid is the standard professional approach — every
// market falls out of the same distribution, so the prices never contradict
// each other.
//
// References: Dixon & Coles (1997), "Modelling Association Football Scores and
// Inefficiencies in the Football Betting Market."

// ---------------------------------------------------------------------------
// Tunables (all overridable via env so the operator can recalibrate against a
// closing-line log later without code changes).

const cfg = () => ({
  // Tournament baseline goals per team in a neutral, evenly-matched game.
  // World Cup group stage historically ~1.35.
  baseGoals: Number(process.env.MODEL_BASE_GOALS ?? 1.35),
  // Home/first-named-team advantage in log-goals. Modest for a tournament at
  // semi-neutral venues. exp(0.20) ~= 1.22x goals.
  homeAdv: Number(process.env.MODEL_HOME_ADV ?? 0.2),
  // How strongly a rating point moves attack/defense in log space. A team two
  // points above the 6.0 baseline gets exp(attackCoef * 2/4) more goals.
  attackCoef: Number(process.env.MODEL_ATTACK_COEF ?? 0.42),
  defenseCoef: Number(process.env.MODEL_DEFENSE_COEF ?? 0.42),
  // Dixon-Coles low-score dependence. Negative inflates 0-0/1-1 and deflates
  // 1-0/0-1 vs independent Poisson, matching observed football.
  rho: Number(process.env.MODEL_RHO ?? -0.06),
  // Grid size. 0..maxGoals per side; 10 captures >99.99% of realistic mass.
  maxGoals: Math.max(6, Math.min(15, Number(process.env.MODEL_MAX_GOALS ?? 10))),
});

const RATING_BASELINE = 6; // a 6/10 rating is league-average -> strength 1.0

// ---------------------------------------------------------------------------
// Rating -> strength indices.

const num = (v, fallback) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

// Offensive index leans on attack/form/midfield/motivation; defensive index on
// defense/midfield/depth/coach. injuryImpact (higher = worse) drags both down.
export const attackIndex = (r = {}) => {
  const attack = num(r.attack, RATING_BASELINE);
  const form = num(r.form, RATING_BASELINE);
  const midfield = num(r.midfield, RATING_BASELINE);
  const motivation = num(r.motivation, 7);
  const injury = num(r.injuryImpact, 2);
  const raw = attack * 0.45 + form * 0.2 + midfield * 0.2 + motivation * 0.15;
  return raw - injury * 0.15;
};

export const defenseIndex = (r = {}) => {
  const defense = num(r.defense, RATING_BASELINE);
  const midfield = num(r.midfield, RATING_BASELINE);
  const depth = num(r.depth, RATING_BASELINE);
  const coach = num(r.coach, RATING_BASELINE);
  const injury = num(r.injuryImpact, 2);
  const raw = defense * 0.5 + midfield * 0.2 + depth * 0.15 + coach * 0.15;
  return raw - injury * 0.15;
};

const findRating = (teamRatings, name) => {
  if (!Array.isArray(teamRatings) || !name) return null;
  const target = String(name).toLowerCase().trim();
  return teamRatings.find((t) => String(t.team ?? "").toLowerCase().trim() === target) ?? null;
};

// Expected goals for each side. Returns { lambdaHome, lambdaAway } plus the
// strength breakdown for transparency in the UI.
export const expectedGoals = (teamRatings, fixture, options = {}) => {
  const c = { ...cfg(), ...options };
  const home = findRating(teamRatings, fixture.teamA);
  const away = findRating(teamRatings, fixture.teamB);

  // log-strengths centered on the baseline rating.
  const atkH = (c.attackCoef * (attackIndex(home) - RATING_BASELINE)) / 4;
  const defH = (c.defenseCoef * (defenseIndex(home) - RATING_BASELINE)) / 4;
  const atkA = (c.attackCoef * (attackIndex(away) - RATING_BASELINE)) / 4;
  const defA = (c.defenseCoef * (defenseIndex(away) - RATING_BASELINE)) / 4;

  const mu = Math.log(Math.max(0.2, c.baseGoals));
  // home goals rise with home attack, fall with away defense; vice-versa.
  const lambdaHome = Math.exp(mu + c.homeAdv + atkH - defA);
  const lambdaAway = Math.exp(mu + atkA - defH);

  return {
    lambdaHome: clampLambda(lambdaHome),
    lambdaAway: clampLambda(lambdaAway),
    strengths: {
      home: { attack: atkH, defense: defH, hasRating: Boolean(home) },
      away: { attack: atkA, defense: defA, hasRating: Boolean(away) },
    },
  };
};

const clampLambda = (l) => Math.max(0.05, Math.min(7, Number.isFinite(l) ? l : 1.0));

// ---------------------------------------------------------------------------
// Poisson + Dixon-Coles grid.

const poissonPmf = (k, lambda) => {
  // e^-l * l^k / k!  computed in log space for stability.
  let logFactK = 0;
  for (let i = 2; i <= k; i += 1) logFactK += Math.log(i);
  const logP = -lambda + k * Math.log(lambda) - logFactK;
  return Math.exp(logP);
};

// Dixon-Coles tau: dependence correction applied only to the four lowest
// scorelines. Keeps the model honest about 0-0 and 1-1 frequency.
const tau = (i, j, lambda, mu, rho) => {
  if (i === 0 && j === 0) return 1 - lambda * mu * rho;
  if (i === 0 && j === 1) return 1 + lambda * rho;
  if (i === 1 && j === 0) return 1 + mu * rho;
  if (i === 1 && j === 1) return 1 - rho;
  return 1;
};

// Full normalized scoreline probability grid. grid[i][j] = P(home i, away j).
export const scoreGrid = (lambdaHome, lambdaAway, options = {}) => {
  const c = { ...cfg(), ...options };
  const n = c.maxGoals;
  const grid = [];
  let total = 0;
  for (let i = 0; i <= n; i += 1) {
    grid[i] = [];
    const ph = poissonPmf(i, lambdaHome);
    for (let j = 0; j <= n; j += 1) {
      const pa = poissonPmf(j, lambdaAway);
      const p = ph * pa * tau(i, j, lambdaHome, lambdaAway, c.rho);
      const safe = p > 0 ? p : 0; // tau can push a tiny cell negative; clamp
      grid[i][j] = safe;
      total += safe;
    }
  }
  // Renormalize (tau + truncation cost a little mass).
  if (total > 0) {
    for (let i = 0; i <= n; i += 1) {
      for (let j = 0; j <= n; j += 1) grid[i][j] /= total;
    }
  }
  return grid;
};

// ---------------------------------------------------------------------------
// Markets — every probability derives from the one grid, so they are mutually
// consistent by construction.

export const marketProbabilities = (grid, { totalsLines = [1.5, 2.5, 3.5] } = {}) => {
  const n = grid.length - 1;
  let home = 0, draw = 0, away = 0, bttsYes = 0;
  const overs = Object.fromEntries(totalsLines.map((l) => [l, 0]));

  for (let i = 0; i <= n; i += 1) {
    for (let j = 0; j <= n; j += 1) {
      const p = grid[i][j];
      if (i > j) home += p;
      else if (i === j) draw += p;
      else away += p;
      if (i >= 1 && j >= 1) bttsYes += p;
      for (const line of totalsLines) {
        if (i + j > line) overs[line] += p;
      }
    }
  }

  const totals = totalsLines.map((line) => ({
    line,
    over: round4(overs[line]),
    under: round4(1 - overs[line]),
  }));

  // Draw-No-Bet: stake refunded on a draw, so renormalize over the non-draw mass.
  const nonDraw = home + away || 1;
  return {
    oneXtwo: { home: round4(home), draw: round4(draw), away: round4(away) },
    doubleChance: {
      homeOrDraw: round4(home + draw),
      homeOrAway: round4(home + away),
      drawOrAway: round4(draw + away),
    },
    totals,
    btts: { yes: round4(bttsYes), no: round4(1 - bttsYes) },
    drawNoBet: { home: round4(home / nonDraw), away: round4(away / nonDraw) },
  };
};

// Top-N most likely correct scores, for the premium narrative.
export const topScorelines = (grid, n = 5) => {
  const cells = [];
  for (let i = 0; i < grid.length; i += 1) {
    for (let j = 0; j < grid[i].length; j += 1) {
      cells.push({ score: `${i}-${j}`, home: i, away: j, prob: grid[i][j] });
    }
  }
  return cells.sort((a, b) => b.prob - a.prob).slice(0, n).map((c) => ({ ...c, prob: round4(c.prob) }));
};

// One call: ratings + fixture -> everything. This is what picks.mjs consumes.
export const modelMatch = (teamRatings, fixture, options = {}) => {
  const { lambdaHome, lambdaAway, strengths } = expectedGoals(teamRatings, fixture, options);
  const grid = scoreGrid(lambdaHome, lambdaAway, options);
  const markets = marketProbabilities(grid, options);
  return {
    lambdaHome: round4(lambdaHome),
    lambdaAway: round4(lambdaAway),
    expectedTotal: round4(lambdaHome + lambdaAway),
    strengths,
    markets,
    topScorelines: topScorelines(grid, options.topN ?? 5),
  };
};

function round4(v) {
  return Math.round(v * 10000) / 10000;
}
