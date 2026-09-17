import { fetchQuotesBatched, type RawEquityQuote } from "./clients/quotes.ts";
import { TAGS, TTL } from "./ttl.ts";
import { isTestName, NAME_BY_SYMBOL, TRADABLE_SYMBOLS } from "../market/universe.ts";

/* The market sweep.

   This gateway has no screener: there is no gainers endpoint, no most-active
   endpoint, no trending endpoint. Asking "what moved today" is not possible.
   So we quote the entire tradable universe on a schedule and rank it here.

   The committed master lists 13,797 tradable symbols, which at the gateway's
   fifty-per-call ceiling is 276 requests. That is far too slow to sit in a
   page render and completely unremarkable as a background job, which is why
   the result is a snapshot the page reads rather than work the page does.
   (This comment said 21,600 symbols and 432 chunks until the master was
   rebuilt and the test securities and OTC lines were filtered out of it; the
   two figures above come from lib/market/universe.ts's own TRADABLE filter.)

   The cadence is five minutes because the feed is fifteen minutes delayed.
   Sweeping faster re-fetches bytes that cannot have changed. */

export type SweepRow = {
  s: string;
  name: string;
  /** Last traded price, dollars. */
  px: number;
  /** Day change as a PERCENT — the fraction from the gateway, already ×100. */
  chg: number;
  /* Whether that change is a reading or a stand-in. The gateway prices plenty
     of names it sends no change for, and `chg` falls back to 0 for those —
     indistinguishable from a name that closed exactly flat. Anything that
     counts or ranks by direction must consult this first. */
  chgKnown: boolean;
  vol: number;
  avgVol: number;
  /** Dollars traded today. The real basis for "most active". */
  dollarVol: number;
  /** Today's volume against the 30-day average. The trending proxy. */
  relVol: number;
  /** Dollars — converted out of the gateway's millions. */
  mcap: number | null;
  pe: number | null;
  ex: string;
  /** Epoch ms of the quote's own updateTime, for staleness. */
  asOf: number | null;
  delayed: boolean;
  /* The quote this row was reduced from, attached only when `runSweep` was
     asked to keep it. The durable store needs both halves — the boards rank on
     the row, while the index and sector strips and toCompanyProfile read
     fields the row drops (52-week range, beta, dividend yield, ISIN) — and a
     store that kept only the row could serve a board but not a page.

     Optional so nothing else changes shape: every existing caller sweeps
     without it and gets the same twelve fields it always did, and the typed
     agreement with SweepRowJson in lib/market/store/types.ts still holds in
     both directions because an optional key is assignable from its absence. */
  raw?: RawEquityQuote;
};

export type Snapshot = {
  rows: SweepRow[];
  sweptAt: number;
  requested: number;
  calls: number;
  failedChunks: number;
  missing: number;
  ms: number;
};

const num = (v: number | null | undefined): number | null =>
  v == null || !Number.isFinite(v) ? null : v;

export function toSweepRow(q: RawEquityQuote): SweepRow | null {
  if (q.notFound || q.notPermissioned) return null;

  /* The gateway writes "_" where it has no company name, and names its test
     securities outright. Fall back to the crawl's name before giving up. */
  const rawName = q.companyName && q.companyName !== "_" ? q.companyName : "";
  const name = rawName || NAME_BY_SYMBOL.get(q.symbol) || "";
  if (isTestName(name)) return null;

  const px = num(q.lastPrice) ?? num(q.closingPrice);
  if (px === null || px <= 0) return null;

  // changePercent arrives as a fraction (-0.0149 = -1.49%). Where it is absent
  // fall back to the absolute change over the previous close.
  const frac = num(q.changePercent);
  const prev = num(q.yesterdayClose) ?? num(q.closingPrice);
  const measured =
    frac !== null
      ? frac * 100
      : prev && num(q.change) !== null
        ? ((num(q.change) as number) / prev) * 100
        : null;
  /* 0 keeps every existing arithmetic consumer working; chgKnown is what tells
     a caller the 0 was a fallback rather than a flat close. */
  const chg = measured ?? 0;
  const chgKnown = measured !== null;

  const vol = num(q.volume) ?? 0;
  const avgVol = num(q.averageVolume30) ?? 0;
  const mcapMillions = num(q.marketCap);
  const asOf = q.updateTime ? Date.parse(q.updateTime) : Number.NaN;

  return {
    s: q.symbol,
    name,
    px,
    chg,
    chgKnown,
    vol,
    avgVol,
    dollarVol: px * vol,
    relVol: avgVol > 0 ? vol / avgVol : 0,
    // The quotes endpoint reports market cap in millions.
    mcap: mcapMillions === null ? null : mcapMillions * 1e6,
    pe: num(q.priceEarningRatio),
    ex: q.exchange ?? "",
    asOf: Number.isFinite(asOf) ? asOf : null,
    delayed: Boolean(q.delayed),
  };
}

export async function runSweep(
  opts: {
    symbols?: readonly string[];
    concurrency?: number;
    noStore?: boolean;
    /* Keep the quote each row was reduced from. Off by default: the boards and
       the baseline builder want twelve fields per name, and carrying the whole
       quote for 13,797 of them through a page render would be tens of
       megabytes nothing reads. The refresh worker asks for it because
       market_upsert_quotes stores both. */
    keepRaw?: boolean;
  } = {},
): Promise<Snapshot> {
  const symbols = opts.symbols ?? TRADABLE_SYMBOLS;
  const started = Date.now();

  /* No concurrency here. It used to hard-code 8, which overrode the client's
     own default and meant the sweep could not be tuned without editing this
     file. The ceiling now lives in one place, next to the batching that
     enforces it, and reads SWEEP_CONCURRENCY from the environment. */
  const batch = await fetchQuotesBatched(symbols, TTL.sweep, [TAGS.sweep], {
    concurrency: opts.concurrency,
    noStore: opts.noStore,
  });

  const rows: SweepRow[] = [];
  for (const q of batch.quotes) {
    const row = toSweepRow(q);
    if (!row) continue;
    /* Attached rather than spread into a new object: at 13,797 rows a copy per
       row is work for nothing, and `toSweepRow` has just built this one. */
    if (opts.keepRaw) row.raw = q;
    rows.push(row);
  }

  return {
    rows,
    sweptAt: Date.now(),
    requested: symbols.length,
    calls: batch.chunks,
    failedChunks: batch.failedChunks,
    missing: batch.missing.length,
    ms: Date.now() - started,
  };
}
