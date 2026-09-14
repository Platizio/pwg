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

/**
 * Fill a price-only delta's change basis from what the symbol already gave us.
 *
 * The gateway sends a symbol's FULL record once and then price-only updates.
 * Measured against production during pre-market: of 14 ticks, 3 carried `pv`
 * and 11 did not — and the three that did were the FIRST for each symbol. So
 * the NEWEST tick for a symbol almost never carries a basis, which is exactly
 * the one every surface reads.
 *
 * Without this, `toTick` returns changePercent: null for 79% of updates, the
 * instrument header refuses to call them live, and the page reads "Delayed"
 * over a price 3.7 seconds old while the feed is working perfectly.
 *
 * Carrying it forward is not the thing price-header guards against. That guard
 * exists so a live price is never shown beside a SNAPSHOT's change, pairing
 * this second's number with an older reading. `previousClose` is yesterday's
 * close: it does not move during a session, so reusing the one the gateway
 * already sent is the same basis rather than an older one — and the change is
 * recomputed against the new price, never copied.
 */
export function carryBasis(fresh: Tick, prev: Tick | null | undefined): Tick {
  /* A tick that brought its own basis keeps it. A new session's close must win
     over yesterday's, or the page stays pinned to the day before. */
  if (fresh.previousClose !== null) return fresh;

  const basis = prev?.previousClose ?? null;
  /* The same guard toTick applies: a zero close cannot carry a change, and
     dividing by it yields an Infinity that formats as a plausible number. */
  if (basis === null || basis <= 0) return fresh;

  const change = fresh.price - basis;
  return { ...fresh, previousClose: basis, change, changePercent: (change / basis) * 100 };
}

/** Whether a tick is recent enough to override what the page already shows. */
export function isFresh(tick: Tick, now: number, maxAgeMs: number = TICK_MAX_AGE_MS): boolean {
  const age = now - tick.at;
  if (age < -FUTURE_TOLERANCE_MS) return false;
  return age <= maxAgeMs;
}
