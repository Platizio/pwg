import type { AnalystAvailability } from "../api/normalize/analyst.ts";

/* Analyst coverage → the one view-model the Analyst panel renders.

   Pure, synchronous and free of I/O, so the same function runs in a route
   handler, in the refresh worker and in the browser. It has no runtime
   imports; the one import above is a type and is erased.

   ── WHAT HAS ACTUALLY BEEN SEEN ────────────────────────────────────────────

   ViewTrade documents exactly one analyst endpoint, and it is not the one the
   app has been calling:

     POST https://middleware-staging.viewtrade.in
            /api/v1/insight/v1/tipranks/analyst-consensus
     body { "include_analysts": true, "tickers": ["MSFT", ...] }
     auth Bearer <middleware apiToken>

   It answered 200 on 2026-08-17 (Global_API/ViewTrade_API_Endpoints_UAT.xlsx,
   sheet "Test Results") with this body, which tests/analyst-model.test.ts
   carries verbatim:

     [{"low_price_target":450,"high_price_target":700,"price_target":564.49,
       "buy":32,"sell":0,"hold":1,"consensus":"StrongBuy",
       "price_target_upside":13.95,"ticker":"MSFT","company_name":"Microsoft",
       "price_target_currency_code":"USD","total_analysts":33}]

   Four things follow from it and are built in below:

     1. The body is an ARRAY, one row per requested ticker. The older
        normalizer in lib/api/normalize/analyst.ts rejects arrays, so pointed at
        this endpoint it would have reported "no coverage" for every ticker.
     2. TipRanks reports three buckets — buy, hold, sell. There is no strong-buy
        or strong-sell split, and none is invented here: the distribution has
        exactly the buckets the source reports.
     3. `consensus` arrives camel-cased ("StrongBuy"). It is spaced for display,
        never translated into a different word.
     4. `price_target_upside` is a PERCENT: 564.49 / 1.1395 = 495.38, a real
        MSFT price that month. It is still not what the panel prints; the
        upside is struck against this terminal's own last price.

   `include_analysts: true` returned no per-analyst rows, so this source has no
   rating changes. `parseRatingChanges` reads Polygon's documented Benzinga
   shape (the /mdp polygon proxy answers those paths 403/4031 today) and a few
   obvious aliases, strictly: a row without a firm and a real date is dropped,
   never repaired.

   ── THE RULES ───────────────────────────────────────────────────────────────

   - Absence is null, never nought. "0 analysts" and a "$0.00 target" are what
     a missing count and a missing target look like when absence is treated as
     a number, and a $0 target reads as the most bearish call on the street.
   - Nothing throws. This is parsed JSON wearing a type.
   - Four states, never merged: `not-entitled` is about this account,
     `no-coverage` about this company, `unavailable` about this request, and
     `ready` prints figures. A body nobody can read is `unavailable`, never
     `no-coverage`: "we could not read it" is not "the street has nothing". */

/* ── the vocabulary ───────────────────────────────────────────────────── */

export type RatingTier = "strong-buy" | "buy" | "hold" | "sell" | "strong-sell";

/** Most bullish first — the order the bar is drawn in, left to right. */
export const TIER_ORDER: readonly RatingTier[] = [
  "strong-buy",
  "buy",
  "hold",
  "sell",
  "strong-sell",
];

export const TIER_LABEL: Record<RatingTier, string> = {
  "strong-buy": "Strong buy",
  buy: "Buy",
  hold: "Hold",
  sell: "Sell",
  "strong-sell": "Strong sell",
};

export type RatingBucket = {
  tier: RatingTier;
  label: string;
  count: number;
  /** Percent of the analysts in the buckets, 0–100. */
  share: number;
};

export type ConsensusView = {
  /** The vendor's label, spaced for reading ("Strong Buy"), never re-worded. */
  label: string | null;
  /** Where that label sits on the five-step scale, or null for an unknown word. */
  tier: RatingTier | null;
  /* The coverage figure the view stands behind: the sum of the buckets when
     every reported bucket is known (that is what the bar adds up to), else the
     vendor's own total, else null. */
  analysts: number | null;
  /** The vendor's total, untouched. */
  reportedTotal: number | null;
  /** Both a full breakdown and a total were reported, and they disagree. */
  countsDisputed: boolean;
  /* Only the buckets the source reports, most bullish first. Null when any of
     them is unknown: scaled from two of three, the two would fill the bar and
     the third would vanish. */
  buckets: RatingBucket[] | null;
  /** Each reported bucket as told: null is "not told", 0 is "none". */
  counts: Partial<Record<RatingTier, number | null>>;
};

export type TargetRail = {
  /* Positions 0–100 on one axis. The axis runs from the lowest published
     target to the highest, widened to take in the last price when it sits
     outside them — pinned to an end instead, a price 30% above every target
     would look like it sat on the high one. */
  low: number;
  high: number;
  /** Null when the mean falls outside its own published range. */
  mean: number | null;
  price: number | null;
  priceOutside: boolean;
};

export type TargetView = {
  low: number | null;
  mean: number | null;
  high: number | null;
  /** ISO 4217, or null where the source did not say. Never assumed. */
  currency: string | null;
  /** This terminal's last price, the basis of every percentage below. */
  price: number | null;
  /** (mean / price − 1) × 100. Null when either is missing or not comparable. */
  upsidePct: number | null;
  lowPct: number | null;
  highPct: number | null;
  rail: TargetRail | null;
};

export type RatingAction =
  | "upgrade"
  | "downgrade"
  | "initiate"
  | "maintain"
  | "reiterate"
  | "target-raised"
  | "target-lowered"
  | "resume"
  | "suspend"
  | "other";

export type RatingChange = {
  /** Calendar date, YYYY-MM-DD. */
  date: string;
  firm: string;
  analyst: string | null;
  action: RatingAction;
  actionLabel: string;
  from: string | null;
  to: string | null;
  targetFrom: number | null;
  targetTo: number | null;
  /** ISO 4217 as the row states it, or null. Never assumed to be dollars. */
  currency: string | null;
};

export type AnalystSource = "tipranks" | "benzinga";

/** What a ready view lacks, so the panel can say so rather than leave a hole. */
export type AnalystGap = "rating" | "breakdown" | "target" | "changes";

export type AnalystModel =
  | {
      state: "ready";
      ticker: string;
      source: AnalystSource | null;
      consensus: ConsensusView | null;
      target: TargetView | null;
      changes: RatingChange[];
      /** When the store fetched it, epoch ms. The consensus itself carries no date. */
      asOf: number | null;
      /** A rating, its breakdown or the target is missing. Changes do not count. */
      partial: boolean;
      missing: AnalystGap[];
    }
  | { state: "not-entitled"; status: number }
  | { state: "no-coverage" }
  | { state: "unavailable"; status: number }
  | { state: "loading" };

/** An `ApiResult` or anything shaped like one. */
export type ResultLike =
  | { ok: true; data: unknown; status?: number }
  | { ok: false; status: number; error?: string };

export type AnalystInput = {
  ticker: string;
  price: number | null | undefined;
  consensus: ResultLike | "loading" | null | undefined;
  /** A ratings-history body, when some source carries one. */
  changes?: unknown;
  asOf?: number | null;
};

/* ── guards ───────────────────────────────────────────────────────────── */

type Rec = Record<string, unknown>;

const isRecord = (v: unknown): v is Rec =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const num = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

/** A money figure. Nought or negative is a hole, never a valuation. */
const pos = (v: unknown): number | null => {
  const n = num(v);
  return n === null || n <= 0 ? null : n;
};

/** A headcount: a non-negative integer. 8.5 analysts is a parse error upstream. */
const count = (v: unknown): number | null => {
  const n = num(v);
  return n === null || n < 0 || !Number.isInteger(n) ? null : n;
};

/** Trimmed text, or null. The gateway writes "_" where it holds no value. */
const text = (v: unknown): string | null => {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t === "" || t === "_" ? null : t;
};

const currencyCode = (v: unknown): string | null => {
  const t = text(v);
  return t !== null && /^[A-Za-z]{3}$/.test(t) ? t.toUpperCase() : null;
};

/** BRK.B, BRK-B and brk.b are one ticker. */
const tickerKey = (v: unknown): string | null => {
  const t = text(v);
  return t === null ? null : t.toUpperCase().replace(/[^A-Z0-9]/g, "");
};

const first = (row: Rec, keys: readonly string[]): unknown => {
  for (const k of keys) if (row[k] !== undefined && row[k] !== null) return row[k];
  return undefined;
};

/* ── labels ───────────────────────────────────────────────────────────── */

/** A vendor rating spaced for reading: "StrongBuy" → "Strong Buy". Never re-worded. */
export function displayRating(v: unknown): string | null {
  const t = text(v);
  if (t === null) return null;
  const spaced = t
    .replace(/_+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();
  if (spaced === spaced.toUpperCase() || spaced === spaced.toLowerCase()) {
    return spaced
      .split(" ")
      .map((w) => (w ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w))
      .join(" ");
  }
  return spaced;
}

/* The street's many words for five positions. Only words whose meaning is not
   in doubt are here; anything else is left untiered and printed as it came. */
const TIER_WORDS: Record<RatingTier, readonly string[]> = {
  "strong-buy": ["strongbuy"],
  buy: [
    "buy",
    "moderatebuy",
    "outperform",
    "overweight",
    "accumulate",
    "marketoutperform",
    "sectoroutperform",
    "positive",
    "add",
  ],
  hold: [
    "hold",
    "neutral",
    "equalweight",
    "marketperform",
    "sectorperform",
    "peerperform",
    "inline",
    "sectorweight",
    "perform",
  ],
  sell: [
    "sell",
    "moderatesell",
    "underperform",
    "underweight",
    "reduce",
    "negative",
    "marketunderperform",
    "sectorunderperform",
  ],
  "strong-sell": ["strongsell"],
};

export function ratingTier(v: unknown): RatingTier | null {
  const t = text(v);
  if (t === null) return null;
  const key = t.toLowerCase().replace(/[^a-z]/g, "");
  for (const tier of TIER_ORDER) if (TIER_WORDS[tier].includes(key)) return tier;
  return null;
}

/* ── consensus records ────────────────────────────────────────────────── */

type ConsensusRecord = {
  source: AnalystSource;
  ticker: string | null;
  label: unknown;
  /** Only the tiers this source reports at all. */
  counts: Partial<Record<RatingTier, number | null>>;
  total: number | null;
  low: number | null;
  mean: number | null;
  high: number | null;
  currency: string | null;
};

const TIPRANKS_KEYS = ["buy", "hold", "sell", "consensus", "price_target", "total_analysts"];
const BENZINGA_KEYS = [
  "strong_buy_ratings",
  "buy_ratings",
  "hold_ratings",
  "sell_ratings",
  "strong_sell_ratings",
  "consensus_rating",
  "consensus_price_target",
];

const hasAny = (row: Rec, keys: readonly string[]) => keys.some((k) => k in row);

function toRecord(row: Rec): ConsensusRecord | null {
  if (hasAny(row, TIPRANKS_KEYS)) {
    return {
      source: "tipranks",
      ticker: tickerKey(row.ticker),
      label: row.consensus,
      counts: { buy: count(row.buy), hold: count(row.hold), sell: count(row.sell) },
      total: count(row.total_analysts),
      low: pos(row.low_price_target),
      mean: pos(row.price_target),
      high: pos(row.high_price_target),
      currency: currencyCode(row.price_target_currency_code),
    };
  }
  if (hasAny(row, BENZINGA_KEYS)) {
    return {
      source: "benzinga",
      ticker: tickerKey(row.ticker),
      label: row.consensus_rating,
      counts: {
        "strong-buy": count(row.strong_buy_ratings),
        buy: count(row.buy_ratings),
        hold: count(row.hold_ratings),
        sell: count(row.sell_ratings),
        "strong-sell": count(row.strong_sell_ratings),
      },
      total: count(row.ratings_contributors),
      low: pos(row.low_price_target),
      mean: pos(row.consensus_price_target),
      high: pos(row.high_price_target),
      currency: currencyCode(row.currency),
    };
  }
  return null;
}

/** Array, `{ results }`, `{ data }`, or a bare record — one level, no deeper. */
function rowsOf(body: unknown): unknown[] | null {
  if (Array.isArray(body)) return body;
  if (!isRecord(body)) return null;
  for (const key of ["results", "data"]) {
    const inner = body[key];
    if (Array.isArray(inner)) return inner;
    if (isRecord(inner)) return [inner];
  }
  return [body];
}

type Parsed = { kind: "record"; record: ConsensusRecord } | { kind: "empty" } | { kind: "unreadable" };

function findConsensus(body: unknown, ticker: string): Parsed {
  const rows = rowsOf(body);
  if (rows === null) return { kind: "unreadable" };
  if (rows.length === 0) return { kind: "empty" };

  const records = rows
    .filter(isRecord)
    .map(toRecord)
    .filter((r): r is ConsensusRecord => r !== null);
  if (records.length === 0) return { kind: "unreadable" };

  const want = tickerKey(ticker);
  const match =
    records.find((r) => r.ticker !== null && r.ticker === want) ??
    /* A lone record that does not name a ticker answers the one we asked for.
       Several unnamed rows could be anyone's, and are not guessed between. */
    (records.length === 1 && records[0].ticker === null ? records[0] : undefined);

  return match ? { kind: "record", record: match } : { kind: "empty" };
}

/* ── the views ────────────────────────────────────────────────────────── */

function consensusView(r: ConsensusRecord): ConsensusView | null {
  const reported = TIER_ORDER.filter((t) => t in r.counts);
  const known = reported.every((t) => r.counts[t] !== null && r.counts[t] !== undefined);
  const sum = known ? reported.reduce((s, t) => s + (r.counts[t] as number), 0) : null;

  const buckets =
    sum !== null && sum > 0
      ? reported.map((tier) => {
          const n = r.counts[tier] as number;
          return { tier, label: TIER_LABEL[tier], count: n, share: (n / sum) * 100 };
        })
      : null;

  const reportedTotal = r.total;
  const analysts =
    sum !== null && sum > 0 ? sum : reportedTotal !== null && reportedTotal > 0 ? reportedTotal : null;
  const countsDisputed =
    sum !== null && sum > 0 && reportedTotal !== null && reportedTotal !== sum;

  const label = displayRating(r.label);
  if (label === null && analysts === null) return null;

  return {
    label,
    tier: ratingTier(r.label),
    analysts,
    reportedTotal,
    countsDisputed,
    buckets,
    counts: { ...r.counts },
  };
}

function targetView(
  lowIn: number | null,
  mean: number | null,
  highIn: number | null,
  currency: string | null,
  priceIn: unknown,
): TargetView | null {
  /* A range that reads backwards is dropped rather than swapped: which field
     is mislabelled cannot be known from here. The mean stands on its own. */
  let low = lowIn;
  let high = highIn;
  if (low !== null && high !== null && low > high) {
    low = null;
    high = null;
  }
  if (low === null && mean === null && high === null) return null;

  const price = pos(priceIn);
  /* Every price in this terminal is dollars. A target quoted in anything else
     is shown, but set against nothing: the ratio would be nonsense. */
  const comparable = price !== null && (currency === null || currency === "USD");
  const move = (v: number | null) => (comparable && v !== null ? (v / (price as number) - 1) * 100 : null);

  let rail: TargetRail | null = null;
  if (low !== null && high !== null && (currency === null || currency === "USD")) {
    const lo = comparable ? Math.min(low, price as number) : low;
    const hi = comparable ? Math.max(high, price as number) : high;
    if (hi > lo) {
      const at = (v: number) => ((v - lo) / (hi - lo)) * 100;
      rail = {
        low: at(low),
        high: at(high),
        mean: mean !== null && mean >= low && mean <= high ? at(mean) : null,
        price: comparable ? at(price as number) : null,
        priceOutside: comparable && ((price as number) < low || (price as number) > high),
      };
    }
  }

  return {
    low,
    mean,
    high,
    currency,
    price,
    upsidePct: move(mean),
    lowPct: move(low),
    highPct: move(high),
    rail,
  };
}

function ready(
  ticker: string,
  source: AnalystSource | null,
  consensus: ConsensusView | null,
  target: TargetView | null,
  changes: RatingChange[],
  asOf: number | null | undefined,
): AnalystModel {
  const missing: AnalystGap[] = [];
  if (consensus === null) missing.push("rating");
  else if (consensus.buckets === null) missing.push("breakdown");
  if (target === null) missing.push("target");
  if (changes.length === 0) missing.push("changes");

  return {
    state: "ready",
    ticker,
    source,
    consensus,
    target,
    changes,
    asOf: num(asOf),
    partial: missing.some((g) => g !== "changes"),
    missing,
  };
}

const FORBIDDEN = 403;

/** The one entry point: a consensus result, an optional ratings history, a price. */
export function analystModel(input: AnalystInput): AnalystModel {
  const { ticker, price, consensus, asOf } = input;
  if (consensus === "loading") return { state: "loading" };

  const changes = parseRatingChanges(input.changes, { ticker });

  const fail = (): AnalystModel | null => {
    if (!isRecord(consensus) || typeof consensus.ok !== "boolean") {
      return { state: "unavailable", status: 0 };
    }
    if (!consensus.ok) {
      const status = num(consensus.status) ?? 0;
      /* 403 only. A 401 is a token problem, a 404 a path problem, and the
         middleware's 400 AmbiguousWatchmenInstance a missing header — none of
         them is a statement about what this account may see. */
      return status === FORBIDDEN
        ? { state: "not-entitled", status: FORBIDDEN }
        : { state: "unavailable", status };
    }
    return null;
  };

  const failed = fail();
  if (failed !== null) {
    return changes.length > 0 ? ready(ticker, null, null, null, changes, asOf) : failed;
  }

  const ok = consensus as { ok: true; data: unknown; status?: number };
  const parsed = findConsensus(ok.data, ticker);

  if (parsed.kind === "unreadable") {
    return changes.length > 0
      ? ready(ticker, null, null, null, changes, asOf)
      : { state: "unavailable", status: num(ok.status) ?? 200 };
  }

  if (parsed.kind === "empty") {
    return changes.length > 0 ? ready(ticker, null, null, null, changes, asOf) : { state: "no-coverage" };
  }

  const r = parsed.record;
  const view = consensusView(r);
  const target = targetView(r.low, r.mean, r.high, r.currency, price);

  /* A record carrying nothing — no label, no analyst, no target — is silence,
     not coverage, and must not open a panel of dashes. */
  if (view === null && target === null && changes.length === 0) return { state: "no-coverage" };

  return ready(ticker, r.source, view, target, changes, asOf);
}

/**
 * Today's pipeline, unchanged: `snapshot.analyst` is an `AnalystAvailability`
 * built by lib/api/normalize/analyst.ts. This maps it onto the same model so
 * the panel can be wired before the data path is rebuilt.
 */
export function analystModelFromAvailability(
  availability: AnalystAvailability | null | undefined,
  ctx: { ticker: string; price: number | null | undefined; asOf?: number | null },
): AnalystModel {
  if (!isRecord(availability)) return { state: "unavailable", status: 0 };

  switch (availability.state) {
    case "not-entitled":
      return { state: "not-entitled", status: availability.status };
    case "no-coverage":
      return { state: "no-coverage" };
    case "unavailable":
      return { state: "unavailable", status: availability.status };
    case "available": {
      const c = availability.consensus;
      /* Re-expressed as the TipRanks row the old normalizer was modelled on, so
         both paths go through one set of rules. The old `upsidePct` is dropped:
         it is recomputed from the price handed in here. */
      return analystModel({
        ticker: ctx.ticker,
        price: ctx.price,
        asOf: ctx.asOf,
        consensus: {
          ok: true,
          data: {
            consensus: c.label,
            buy: c.ratings.buy,
            hold: c.ratings.hold,
            sell: c.ratings.sell,
            total_analysts: c.ratings.reportedTotal ?? c.ratings.total,
            price_target: c.target.consensus,
            low_price_target: c.target.low,
            high_price_target: c.target.high,
            price_target_currency_code: c.target.currency,
          },
        },
      });
    }
    default:
      return { state: "unavailable", status: 0 };
  }
}

/* ── rating changes ───────────────────────────────────────────────────── */

const ACTION_LABEL: Record<RatingAction, string> = {
  upgrade: "Upgrade",
  downgrade: "Downgrade",
  initiate: "Initiated",
  maintain: "Maintained",
  reiterate: "Reiterated",
  "target-raised": "Target raised",
  "target-lowered": "Target lowered",
  resume: "Resumed",
  suspend: "Coverage dropped",
  other: "Rating change",
};

const ACTION_WORDS: Array<[string, RatingAction]> = [
  ["upgrade", "upgrade"],
  ["downgrade", "downgrade"],
  ["initiat", "initiate"],
  ["reiterat", "reiterate"],
  ["maintain", "maintain"],
  ["raise", "target-raised"],
  ["lower", "target-lowered"],
  ["resum", "resume"],
  ["suspend", "suspend"],
  ["terminat", "suspend"],
  ["discontinu", "suspend"],
  ["drop", "suspend"],
];

const RANK: Record<RatingTier, number> = {
  "strong-buy": 0,
  buy: 1,
  hold: 2,
  sell: 3,
  "strong-sell": 4,
};

function actionOf(raw: string | null, from: string | null, to: string | null): RatingAction {
  if (raw !== null) {
    const key = raw.toLowerCase().replace(/[^a-z]/g, "");
    for (const [word, action] of ACTION_WORDS) if (key.includes(word)) return action;
    return "other";
  }
  /* No action named. Two known tiers are the vendor's own words compared, not
     a guess; anything less is left as a plain change. */
  const a = ratingTier(from);
  const b = ratingTier(to);
  if (a === null || b === null) return "other";
  if (RANK[b] < RANK[a]) return "upgrade";
  if (RANK[b] > RANK[a]) return "downgrade";
  return "maintain";
}

/** YYYY-MM-DD from a date or an ISO instant, or null for anything else. */
function calendarDate(v: unknown): string | null {
  const t = text(v);
  if (t === null) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(t);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const back = new Date(Date.UTC(y, mo - 1, d));
  return back.getUTCFullYear() === y && back.getUTCMonth() === mo - 1 && back.getUTCDate() === d
    ? m[0].slice(0, 10)
    : null;
}

function changeRows(body: unknown, want: string | null): unknown[] {
  const fromList = (list: unknown[]): unknown[] =>
    list.flatMap((el) => {
      /* A TipRanks consensus row with `include_analysts` may carry its analysts
         inline. Only the requested ticker's are taken. */
      if (isRecord(el) && Array.isArray(el.analysts)) {
        const t = tickerKey(el.ticker);
        return want === null || t === null || t === want ? el.analysts : [];
      }
      return [el];
    });

  if (Array.isArray(body)) return fromList(body);
  if (!isRecord(body)) return [];
  for (const key of ["results", "data", "analysts"]) {
    if (Array.isArray(body[key])) return fromList(body[key] as unknown[]);
  }
  return [];
}

/**
 * Individual rating actions, newest first. Strict: a row needs a firm, a real
 * date and something that happened. Nothing is repaired.
 */
export function parseRatingChanges(
  body: unknown,
  opts: { ticker?: string; limit?: number } = {},
): RatingChange[] {
  const want = opts.ticker === undefined ? null : tickerKey(opts.ticker);
  const limit = opts.limit ?? 8;
  const out: RatingChange[] = [];
  const seen = new Set<string>();

  for (const row of changeRows(body, want)) {
    if (!isRecord(row)) continue;

    const rowTicker = tickerKey(row.ticker);
    if (want !== null && rowTicker !== null && rowTicker !== want) continue;

    const date = calendarDate(first(row, ["date", "rating_date", "recommendation_date", "action_date", "published_date"]));
    const firm = text(first(row, ["firm", "firm_name", "broker", "analyst_firm"]));
    if (date === null || firm === null) continue;

    const rawAction = text(first(row, ["rating_action", "action"]));
    const to = displayRating(first(row, ["rating", "recommendation", "current_rating"]));
    const from = displayRating(first(row, ["previous_rating", "prior_rating"]));
    if (rawAction === null && to === null) continue;

    const action = actionOf(rawAction, from, to);
    const key = `${date}|${firm}|${action}|${to ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);

    out.push({
      date,
      firm,
      analyst: text(first(row, ["analyst", "analyst_name"])),
      action,
      actionLabel:
        action === "other" && rawAction !== null
          ? (displayRating(rawAction) ?? ACTION_LABEL.other)
          : ACTION_LABEL[action],
      from,
      to,
      targetFrom: pos(first(row, ["previous_price_target", "prior_price_target"])),
      targetTo: pos(first(row, ["price_target", "adjusted_price_target", "target"])),
      currency: currencyCode(first(row, ["currency", "price_target_currency_code"])),
    });
  }

  /* Newest first; equal dates keep the order they arrived in. */
  return out
    .map((c, i) => ({ c, i }))
    .sort((a, b) => (a.c.date === b.c.date ? a.i - b.i : a.c.date < b.c.date ? 1 : -1))
    .slice(0, Math.max(0, limit))
    .map(({ c }) => c);
}

/* ── words for the panel ──────────────────────────────────────────────── */

/** The distribution bar, read aloud: "33 analysts: 32 buy, 1 hold, 0 sell". */
export function distributionSummary(c: ConsensusView | null | undefined): string | null {
  if (!c || c.analysts === null) return null;
  const head = `${c.analysts} ${c.analysts === 1 ? "analyst" : "analysts"}`;
  if (!c.buckets) return head;
  return `${head}: ${c.buckets.map((b) => `${b.count} ${b.label.toLowerCase()}`).join(", ")}`;
}

/* Fixed locale and fixed zones, like every formatter in this repo: the
   visitor's own would make server and client disagree and break hydration. */
const CAL = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  month: "short",
  day: "numeric",
  year: "numeric",
});

const IST = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Kolkata",
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** A calendar date as "Sep 18, 2026". It is a date, not an instant: UTC, so it cannot slide. */
export function formatRatingDate(date: string): string | null {
  const d = calendarDate(date);
  return d === null ? null : CAL.format(new Date(`${d}T00:00:00Z`));
}

/** When the store fetched it, in India time: "Sep 17, 2026, 14:32 IST". */
export function formatRetrieved(epochMs: number | null | undefined): string | null {
  const ms = num(epochMs);
  if (ms === null) return null;
  const parts = Object.fromEntries(IST.formatToParts(new Date(ms)).map((p) => [p.type, p.value]));
  return `${parts.month} ${parts.day}, ${parts.year}, ${parts.hour}:${parts.minute} IST`;
}
