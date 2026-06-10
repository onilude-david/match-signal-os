// Multi-book odds ingestion + line shopping.
//
// The Odds API returns the same market priced by many bookmakers. Taking the
// BEST (highest) decimal price for each outcome across all books is "line
// shopping" — the single biggest legal edge a bettor has, because a better
// price is strictly more expected value on the same bet. This module fetches
// h2h (1X2) and totals (Over/Under), normalizes them, and reduces each market
// to its best available price with the book that offers it.
//
// The fetch and the math are kept separate so the line-shop logic is unit
// testable without a network call.

const ODDS_API_BASE = "https://api.the-odds-api.com/v4";
const SPORT_KEY = "soccer_fifa_world_cup";

// ---------------------------------------------------------------------------
// Pure: pick the best price per outcome from a normalized event.

// Normalize one Odds API event into { home, away, commenceTime, books: [...] }
export const normalizeEvent = (event) => {
  const books = (event.bookmakers ?? []).map((bk) => {
    const h2h = bk.markets?.find((m) => m.key === "h2h");
    const totals = bk.markets?.find((m) => m.key === "totals");
    const out = { key: bk.key, title: bk.title, lastUpdate: bk.last_update };
    if (h2h) {
      const find = (name) => h2h.outcomes?.find((o) => o.name === name)?.price ?? null;
      out.h2h = {
        home: find(event.home_team),
        away: find(event.away_team),
        draw: find("Draw"),
      };
    }
    if (totals) {
      out.totals = (totals.outcomes ?? []).reduce((acc, o) => {
        const point = Number(o.point);
        if (!Number.isFinite(point)) return acc;
        acc[point] = acc[point] ?? { point };
        if (o.name === "Over") acc[point].over = o.price;
        if (o.name === "Under") acc[point].under = o.price;
        return acc;
      }, {});
    }
    return out;
  });
  return {
    home: event.home_team,
    away: event.away_team,
    commenceTime: event.commence_time,
    books,
  };
};

const bestOf = (entries) => {
  // entries: [{ book, price }] -> the max price + its book
  let best = null;
  for (const e of entries) {
    if (e.price != null && Number.isFinite(e.price) && (!best || e.price > best.price)) {
      best = e;
    }
  }
  return best;
};

// Reduce a normalized event to the best price per outcome across books.
export const lineShop = (normalized) => {
  const h2hHome = bestOf(normalized.books.map((b) => ({ book: b.title ?? b.key, price: b.h2h?.home })));
  const h2hDraw = bestOf(normalized.books.map((b) => ({ book: b.title ?? b.key, price: b.h2h?.draw })));
  const h2hAway = bestOf(normalized.books.map((b) => ({ book: b.title ?? b.key, price: b.h2h?.away })));

  // Totals: collect every line offered, best over/under per line.
  const lines = new Set();
  for (const b of normalized.books) {
    for (const key of Object.keys(b.totals ?? {})) lines.add(Number(key));
  }
  const totals = [...lines].sort((a, b) => a - b).map((line) => ({
    line,
    over: bestOf(normalized.books.map((b) => ({ book: b.title ?? b.key, price: b.totals?.[line]?.over }))),
    under: bestOf(normalized.books.map((b) => ({ book: b.title ?? b.key, price: b.totals?.[line]?.under }))),
  }));

  return {
    home: normalized.home,
    away: normalized.away,
    commenceTime: normalized.commenceTime,
    bookCount: normalized.books.length,
    best: {
      h2h: { home: h2hHome, draw: h2hDraw, away: h2hAway },
      totals,
    },
  };
};

// ---------------------------------------------------------------------------
// Team-name matching (Odds API names vs our fixture names).

const canon = (name = "") =>
  String(name)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\b(usa|united states)\b/g, "usa")
    .replace(/\b(korea republic|south korea)\b/g, "korea")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

// Find the event whose two teams match the fixture (order-independent).
export const matchEventToFixture = (events, fixture) => {
  const a = canon(fixture.teamA);
  const b = canon(fixture.teamB);
  return (
    events.find((e) => {
      const h = canon(e.home_team);
      const w = canon(e.away_team);
      return (h === a && w === b) || (h === b && w === a);
    }) ?? null
  );
};

// ---------------------------------------------------------------------------
// Network: fetch + line-shop a single fixture's best prices.

export const fetchBestOddsForFixture = async (fixture, { apiKey = process.env.ODDS_API_KEY, regions = "us,uk,eu", markets = "h2h,totals" } = {}) => {
  if (!apiKey) {
    const err = new Error("ODDS_API_KEY is not configured.");
    err.code = "ODDS_NOT_CONFIGURED";
    throw err;
  }
  const url = `${ODDS_API_BASE}/sports/${SPORT_KEY}/odds?apiKey=${apiKey.trim()}&regions=${regions}&markets=${markets}&oddsFormat=decimal`;
  const response = await fetch(url);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const err = new Error(body?.message ?? `Odds API HTTP ${response.status}`);
    err.status = response.status;
    err.details = body;
    throw err;
  }
  const event = matchEventToFixture(Array.isArray(body) ? body : [], fixture);
  if (!event) {
    return { matched: false, shopped: null, eventCount: Array.isArray(body) ? body.length : 0 };
  }
  return { matched: true, shopped: lineShop(normalizeEvent(event)) };
};
