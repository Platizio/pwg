/* One update off the market-data stream, gated into something a panel may show.
 *
 * The gateway's wildcard subscription is generous about what it sends. Observed
 * against UAT, a single window carried rows like
 *
 *     {"s":"DJCIT$","o":0,"h":699.883,"l":693.637,"c":0,"v":0,"t":...}
 *
 * — a close of zero, which is not a price — and rows stamped seven days old
 * alongside rows stamped this second. Both are harmless in a log and dangerous
 * on a page: written into a quote they become a wrong number wearing a real
 * ticker, which is the one failure the rest of this codebase is built to avoid.
 *
 * So nothing reaches a panel without passing through here, and this module is
 * pure so the rules can be tested rather than trusted.
 */

/** The raw shape the gateway pushes inside `updates[]`. Every field optional:
    this is untrusted input, and the whole point of this module is to say so. */
export type RawUpdate = {
  s?: unknown;
  o?: unknown;
  h?: unknown;
  l?: unknown;
  c?: unknown;
  v?: unknown;
  t?: unknown;
  pv?: unknown;
};

export type Tick = {
  symbol: string;
  /** The last usable price. Never 0 — see the module note. */
  price: number;
  previousClose: number | null;
  change: number | null;
  changePercent: number | null;
  volume: number | null;
  /** Unix ms, straight from the feed. */
  at: number;
};

/* Fifteen minutes: the same window the REST feed's own delay defines. A tick
   older than that has no advantage over the snapshot already on the page, and
   the stream demonstrably replays much older ones. */
export const TICK_MAX_AGE_MS = 15 * 60 * 1000;

/* The gateway's clock and this process's clock are not the same clock. A tick
   a few seconds in the future is skew, not corruption. */
const FUTURE_TOLERANCE_MS = 60 * 1000;

const num = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

/** A raw update as a tick, or null when it carries no usable price. */
export function toTick(raw: RawUpdate): Tick | null {
  const symbol = typeof raw.s === "string" ? raw.s.trim() : "";
  if (!symbol) return null;

  /* The close is the price. Zero is the gateway's way of saying it has none
     for this row, not a company that trades at nothing. */
  const price = num(raw.c);
  if (price === null || price <= 0) return null;

  const at = num(raw.t);
  if (at === null || at <= 0) return null;

  /* A previous close of zero cannot carry a change, and dividing by it would
     yield Infinity — which formats as a plausible-looking dash-or-worse. */
  const pv = num(raw.pv);
  const previousClose = pv !== null && pv > 0 ? pv : null;
  const change = previousClose === null ? null : price - previousClose;
  const changePercent = previousClose === null ? null : (change! / previousClose) * 100;

  return {
    symbol,
    price,
    previousClose,
    change,
    changePercent,
    volume: num(raw.v),
    at,
  };
}

/* The exchange's calendar day for a timestamp.
 *
 * Deliberately a local copy rather than an import from session.ts, which holds
 * the same six lines privately. liveness.ts value-imports this module and is
 * used by price-header.tsx, a client component — so importing session.ts here
 * would pull its universe, calendar and month tables into the browser bundle.
 * lib/market/sectors.ts exists for exactly that reason; six lines duplicated
 * is the cheaper side of that trade. */
const EASTERN_DAY = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const easternDay = (ms: number): string => EASTERN_DAY.format(ms);

/** A previous close, and the trading day it belongs to. */
export type Basis = { value: number; day: string };

/**
 * The basis a row contributes, stamped with the ROW'S OWN trading day.
 *
 * The stamp comes from `tick.at` rather than from wall-clock now, and that is
 * the whole safety of the mechanism. The note at the top of this module records
 * that the wildcard feed sends "rows stamped seven days old alongside rows
 * stamped this second"; stamping one of those with today's date would launder
 * an ancient basis into a current one, which `carryBasis` would then happily
 * apply. Stamped by its own time, an old row yields an old basis and is
 * refused.
 *
 * That in turn is what lets a caller harvest a basis BEFORE the freshness gate.
 * The row carrying a previous close is the symbol's full record, and for a
 * quiet name it is stamped with that name's last print — often hours old. Run
 * through isFresh first, it is dropped, and the symbol can never show a change
 * at all.
 */
export function basisOf(tick: Tick): Basis | null {
  return tick.previousClose !== null && tick.previousClose > 0
    ? { value: tick.previousClose, day: easternDay(tick.at) }
    : null;
}

/**
 * Fill a price-only delta's change basis from what the symbol already gave us,
 * within the same trading day and never across one.
 *
 * WHY IT IS NEEDED. The gateway sends a symbol's full record once and price-only
 * deltas after. Measured against production during pre-market: of 14 ticks, 3
 * carried `pv` and all three were that symbol's first. So the NEWEST tick — the
 * one every surface reads — almost never carries a basis, and the header read
 * "Delayed" over a price 3.7 seconds old while the feed was working perfectly.
 *
 * WHY IT IS SAFE. This is not the thing price-header guards against. That guard
 * exists so a live price is never shown beside a SNAPSHOT's change, pairing this
 * second's number with an older reading. `previousClose` is yesterday's close: a
 * constant for the session. Reusing the one the gateway already sent is the same
 * basis, and the change is recomputed against the new price rather than copied.
 *
 * WHY THE DAY CHECK IS NOT OPTIONAL. This process stays up for days. A basis
 * kept past its session is worse than no basis at all — a missing change renders
 * a dash, a wrong change renders a number, frequently with the wrong sign, beside
 * a price from this second. That is the one failure this layer exists to prevent.
 */
export function carryBasis(fresh: Tick, basis: Basis | null | undefined): Tick {
  /* A tick that brought its own basis keeps it: a new session's close must win
     over the one before, or the page stays pinned to the day before. */
  if (fresh.previousClose !== null) return fresh;
  if (!basis || basis.value <= 0) return fresh;
  if (basis.day !== easternDay(fresh.at)) return fresh;

  const change = fresh.price - basis.value;
  return { ...fresh, previousClose: basis.value, change, changePercent: (change / basis.value) * 100 };
}

/** Whether a tick is recent enough to override what the page already shows. */
export function isFresh(tick: Tick, now: number, maxAgeMs: number = TICK_MAX_AGE_MS): boolean {
  const age = now - tick.at;
  if (age < -FUTURE_TOLERANCE_MS) return false;
  return age <= maxAgeMs;
}
