// Public-safety filter. Anything destined for a PUBLIC surface
// (TELEGRAM_PUBLIC_CHANNEL_ID, social channels, the editorial Telegram preview)
// must pass this filter. The VIP channel publisher bypasses it intentionally.
//
// We reject:
//   - Picks/edge vocabulary: guaranteed, sure thing, lock, EV, units, stake,
//     bankroll, banker, edge.
//   - Action verbs around a bet: "back the", "lay the", "bet on", "wager on",
//     "stake on".
//   - Decimal odds patterns: 1.50–9.99, plus American-style +150 / -200.
//   - Market shorthand: 1X2, BTTS, GG/NG, O/U n.5, Over n.5, Under n.5, DC,
//     HT/FT, Asian Handicap.
//
// Returns { ok, violations: [{ pattern, match, kind }] }. If ok=false the route
// returns 422 with the violations array so the operator sees exactly which
// phrase tripped the filter.

const FORBIDDEN_TERMS = [
  // confidence claims
  { kind: "claim", re: /\bguaranteed\b/i },
  { kind: "claim", re: /\bsure\s+(thing|bet|win|game)\b/i },
  { kind: "claim", re: /\block(?:s|ed|-in)?\b/i },
  { kind: "claim", re: /\bbanker\b/i },
  // staking / EV vocabulary
  { kind: "stake", re: /\b(?:\+?EV|expected\s+value)\b/i },
  { kind: "stake", re: /\b\d+(?:\.\d+)?\s*units?\b/i },
  { kind: "stake", re: /\bunit\s*size\b/i },
  { kind: "stake", re: /\bstak(?:e|ing)\b/i },
  { kind: "stake", re: /\bbankroll\b/i },
  { kind: "stake", re: /\bedge\s+of\b/i },
  { kind: "stake", re: /\bkelly\b/i },
  // action verbs
  { kind: "action", re: /\bback\s+the\b/i },
  { kind: "action", re: /\blay\s+the\b/i },
  { kind: "action", re: /\bbet\s+on\b/i },
  { kind: "action", re: /\bwager\s+on\b/i },
  // market shorthand
  { kind: "market", re: /\b1\s*X\s*2\b/i },
  { kind: "market", re: /\bBTTS\b/i },
  { kind: "market", re: /\bGG\/NG\b/i },
  { kind: "market", re: /\b(?:O|U|Over|Under)\s*\d+\.5\b/i },
  { kind: "market", re: /\bDouble\s+Chance\b/i },
  { kind: "market", re: /\bDC\b/ },
  { kind: "market", re: /\bHT\/FT\b/i },
  { kind: "market", re: /\bAsian\s+Handicap\b/i },
  // book names (only mention these in VIP)
  { kind: "book", re: /\b(?:Pinnacle|Bet365|DraftKings|FanDuel|Bet9ja|SportyBet|1xBet|Betway|William\s+Hill|Betfair)\b/i },
  // decimal odds 1.50 - 9.99 (two or three decimals). The trailing lookahead
  // only rejects another digit, NOT a period — otherwise odds at the end of a
  // sentence ("...priced at 1.85.") would slip through the filter.
  { kind: "odds", re: /(?<![\d.])(?:[1-9]\.\d{2,3})(?!\d)/ },
  // American odds (+150, -200). Same trailing-period fix as above so "+150."
  // at a sentence end is still caught.
  { kind: "odds", re: /(?<![\w-])[+\-]\d{3,4}(?!\d)/ },
];

export const publicSafetyCheck = (text) => {
  if (!text || typeof text !== "string") {
    return { ok: true, violations: [] };
  }
  const violations = [];
  for (const term of FORBIDDEN_TERMS) {
    const match = text.match(term.re);
    if (match) {
      violations.push({
        kind: term.kind,
        pattern: String(term.re),
        match: match[0],
      });
    }
  }
  return { ok: violations.length === 0, violations };
};

// Express middleware. Use on every PUBLIC publish route. Looks for `text` and
// `caption` in the body, runs both through the filter, returns 422 with the
// exact violations if anything trips.
export const publicSafetyMiddleware = (req, res, next) => {
  const candidates = [req.body?.text, req.body?.caption, req.body?.message]
    .filter((v) => typeof v === "string" && v.length > 0);
  for (const candidate of candidates) {
    const result = publicSafetyCheck(candidate);
    if (!result.ok) {
      res.status(422).json({
        ok: false,
        error: "Public-safety filter rejected this message.",
        violations: result.violations,
        hint: "Public Telegram, public social, and editorial previews must not contain picks, odds, market shorthand, or staking vocabulary. Send picks via /api/telegram/vip instead.",
      });
      return;
    }
  }
  next();
};
