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

/** Whether a tick is recent enough to override what the page already shows. */
export function isFresh(tick: Tick, now: number, maxAgeMs: number = TICK_MAX_AGE_MS): boolean {
  const age = now - tick.at;
  if (age < -FUTURE_TOLERANCE_MS) return false;
  return age <= maxAgeMs;
}
