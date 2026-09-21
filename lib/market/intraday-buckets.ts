import type { RawHistoryPoint } from "../api/clients/quotes.ts";

/* Minute bars, reduced to the grid a chart can actually draw.
 *
 * WHY THIS EXISTS AT ALL. The gateway answers one-minute bars for the CURRENT
 * session and keeps nothing afterwards — there is no endpoint that will answer
 * for a past day. (The vendor catalog advertises `range=1d` and `range=5d`;
 * the API rejects both with "Invalid range format. Use [num][y/m]".) So a week
 * of intraday detail can exist only if this system keeps it, and what it keeps
 * has to fit: `market.sections` already holds 217MB of a 500MB ceiling.
 *
 * Measured against a real session, one symbol-day is ~49KB at one minute and
 * ~5KB at ten. Across the hot set for five sessions that is ~1GB against
 * ~110MB. Ten-minute buckets are what makes full coverage affordable, and
 * across a week on a chart a few hundred pixels wide the difference is not
 * visible — 1-minute detail is kept where it IS visible, which is the day, and
 * the day is served live from the gateway rather than from here.
 *
 * Columnar, matching `storedHistory` in ./store/sections.ts: six parallel
 * arrays name their fields once instead of once per bar.
 */
export type IntradayColumns = {
  /** ISO-8601 UTC, stamped at the bucket's own boundary. */
  date: string[];
  price: number[];
  opening: number[];
  high: number[];
  low: number[];
  volume: number[];
};

/* Ten minutes, and the number is a storage decision measured rather than
   preferred: a real full session is ~49KB per symbol at one minute and ~5KB at
   ten, against a database already at 288MB of a 500MB ceiling. Across the hot
   set for five sessions that is ~1GB versus ~110MB. */
export const BUCKET_MINUTES = 10;

/* A trading week. Enough for the 1W range with nothing spare: every extra
   session is ~5KB x the hot set, or another 22MB. */
export const SESSIONS_KEPT = 5;

const empty = (): IntradayColumns => ({
  date: [],
  price: [],
  opening: [],
  high: [],
  low: [],
  volume: [],
});

const num = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

/**
 * Aggregate one-minute bars into buckets of `minutes`.
 *
 * Each field aggregates differently, and getting one wrong draws a candle that
 * never traded: the open is the FIRST open in the bucket, the close the LAST
 * price, the high the maximum, the low the minimum, the volume the sum.
 *
 * A bucket with no trades is ABSENT rather than flat. A thin name goes minutes
 * at a time without a print — ASND printed 239.1, 241, 239.29 on about a
 * thousand shares a minute the morning this was written — and carrying the
 * last price forward across those minutes would draw exactly the straight
 * lines this change was asked to remove. A gap is the honest shape of no
 * trading, and the chart already knows how to leave one.
 */
export function bucketIntraday(
  rows: readonly RawHistoryPoint[],
  minutes: number,
): IntradayColumns {
  if (!Array.isArray(rows) || rows.length === 0 || !(minutes > 0)) return empty();

  const span = minutes * 60_000;

  /* Keyed by bucket start rather than accumulated in sequence, so a row that
     arrives out of order lands in its own bucket instead of extending whatever
     came before it. The gateway has answered in order every time it has been
     observed, which is precisely the kind of thing that holds until it does
     not, and the failure would be silent. */
  const buckets = new Map<number, { o: number; c: number; h: number; l: number; v: number }>();

  for (const row of rows) {
    const at = Date.parse(String(row?.date ?? ""));
    const price = num(row?.price);
    /* A bar with no usable price is not a bar. Letting it through would put a
       NaN on the axis, which scales the whole chart to nothing. */
    if (!Number.isFinite(at) || price === null) continue;

    const key = Math.floor(at / span) * span;
    const open = num(row?.opening) ?? price;
    const high = num(row?.high) ?? price;
    const low = num(row?.low) ?? price;
    const volume = num(row?.volume) ?? 0;

    const found = buckets.get(key);
    if (!found) {
      buckets.set(key, { o: open, c: price, h: high, l: low, v: volume });
      continue;
    }

    /* `o` is deliberately not reassigned: the first row to land in a bucket
       owns its open, whatever order the rest arrive in. */
    found.c = price;
    if (high > found.h) found.h = high;
    if (low < found.l) found.l = low;
    found.v += volume;
  }

  const out = empty();
  for (const key of [...buckets.keys()].sort((a, b) => a - b)) {
    const b = buckets.get(key);
    if (!b) continue;
    out.date.push(new Date(key).toISOString());
    out.opening.push(b.o);
    out.price.push(b.c);
    out.high.push(b.h);
    out.low.push(b.l);
    out.volume.push(b.v);
  }
  return out;
}
