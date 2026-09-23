import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { InstrumentView } from "@/components/terminal/instrument-view";
import { getInstrumentSnapshot } from "@/lib/market/instrument";
import { COVERED, NAME_BY_SYMBOL, isPlaceholderInstrument } from "@/lib/market/universe";
import { baselineSnapshot } from "@/lib/market/baseline";
import { PRERENDER_LIMIT, prerenderTickers } from "@/lib/market/prerender";

type Params = { params: Promise<{ ticker: string }> };

/* WHAT A URL MAY ASK FOR, decided before anything touches the network.
 *
 * Every path under /terminal/ that is not a prerendered page used to go
 * straight to getInstrumentSnapshot, which for a symbol the store does not
 * hold fans out to the gateway. For a symbol that does not EXIST that fan-out
 * never succeeds and never gives up quickly: measured on the live site,
 * /terminal/ZZZZNOTREAL and /terminal/aapl both sat for 150 seconds and
 * returned nothing. A mistyped URL, or a lowercase one pasted from anywhere,
 * was a dead tab — and each one held a slot on a 0.1-CPU box while it hung.
 *
 * Two answers, both instant:
 *   - a real ticker in the wrong case or with stray whitespace REDIRECTS to its
 *     canonical form, which is usually a prerendered page;
 *   - anything not in the tradable universe is a 404, with no fetch at all.
 *
 * The universe is the committed symbol master, 13,797 names including ETFs
 * and share classes ("BRK.B", "ABR-D"). The cost of trusting it: a listing
 * newer than the master 404s until the master is rebuilt. That is a narrow,
 * recoverable miss; the hang it replaces hit every wrong URL. */
function decoded(raw: string): string | null {
  try {
    return decodeURIComponent(raw);
  } catch {
    // A malformed %-escape is not a ticker anyone can hold.
    return null;
  }
}

function canonical(raw: string): string | null {
  return decoded(raw)?.trim().toUpperCase() ?? null;
}

/* The names worth building ahead of time.
 *
 * This was the six covered tickers, and everything else was assembled on its
 * first visit. Measured against production that costs 8-15 seconds — ADBE 7.7s,
 * CRM 15.0s, ORCL 30.7s — and 0.5s on every visit after. Exactly one reader
 * pays, and with six pages built there was almost always such a reader.
 *
 * The list is drawn from the committed baseline rather than a live sweep, which
 * matters: `next build` prerenders across nine worker processes that do not
 * share a cache, so anything derived live is derived nine times. That is how
 * nine full market sweeps and nine build timeouts happened before.
 *
 * PRERENDER_TICKERS tunes it per build, following BASELINE_LIMIT and
 * SECTOR_LIMIT elsewhere. Prerendering the whole universe is not an option at
 * any setting: ~1.8 MB of output each puts 13,900 pages at about 25 GB, and
 * they could never be kept warm anyway. */
export function generateStaticParams() {
  /* Nothing to prerender without the feed that fills a page.
   *
   * A build is the only place this matters and it is not a corner case: CI has
   * no ViewTrade credentials, so every instrument render falls through the
   * store to a gateway that is not there, and the fan-out ends in the refusal
   * below — "Quote unavailable for NOK after 3 retries" — which fails the whole
   * export. That refusal is right: a build must not bake a 404 onto a real
   * company because a credential was missing (the reasoning is at
   * getInstrumentSnapshot's quote retry). What is wrong is asking for the pages
   * at all.
   *
   * So a build without credentials prerenders none of them and serves every
   * ticker on demand — which is what an uncredentialed deployment could do
   * anyway. The deploy that does have them is unaffected, and typechecking,
   * linting and the rest of the export still run, which is the whole point of
   * building in CI.
   *
   * Read directly rather than through env(): that helper throws on the first
   * missing name, and this is a question, not a demand. */
  if (!process.env.VIEWTRADE_API_KEY || !process.env.VIEWTRADE_API_SECRET) return [];

  const baseline = baselineSnapshot();
  return prerenderTickers({
    covered: COVERED,
    rows: baseline?.rows ?? [],
    limit: Number(process.env.PRERENDER_TICKERS) || PRERENDER_LIMIT,
    /* The same predicate the render uses. An exchange placeholder answers 404
       and Next bakes that into the prerender — building hundreds of pages
       multiplies the chance of one reaching the list. */
    skip: (symbol) => isPlaceholderInstrument(symbol),
  }).map((ticker) => ({ ticker }));
}

/* Fifteen minutes, raised from five.
 *
 * It must not be 0 and must not be force-dynamic: Next reads revalidate:0 as an
 * instruction to skip the fetch cache for any request carrying an Authorization
 * header, which would turn every page view back into a full round of upstream
 * calls.
 *
 * Five was tighter than almost everything on the page. Of the thirteen calls
 * behind it, the only one under half an hour is the intraday series;
 * fundamentals and filings run six hours, corporate actions twelve, news a day,
 * history and the indicators thirty minutes. So the page was rebuilt every five
 * minutes to refresh data that had not changed — and each rebuild saturates a
 * small instance: a fully static page measured 0.36s idle and 8.98s while a
 * regeneration ran.
 *
 * What made five defensible was the price, and the price no longer comes from
 * here. It arrives over the websocket, a few seconds old, and the header reads
 * it live. What ages now is the furniture: the intraday chart, and peer figures
 * that are themselves quoted from a feed running fifteen minutes behind. Fifteen
 * matches the horizon this codebase already uses for staleness everywhere else —
 * STALE_AFTER_MS and TICK_MAX_AGE_MS are both fifteen minutes. */
export const revalidate = 900;

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { ticker } = await params;
  const symbol = canonical(ticker);
  /* Metadata runs its own fetch, so it needs the same gate — otherwise the
     page 404s instantly and the <title> still hangs for two minutes. */
  if (!symbol || !NAME_BY_SYMBOL.has(symbol)) return { title: "Platizio Global · Stock not found" };
  const snapshot = await getInstrumentSnapshot(symbol);
  if (!snapshot) return { title: "Platizio Global · Stock not found" };

  const { profile } = snapshot;
  return {
    title: `${profile.name} · ${profile.id} · Platizio Global`,
    description:
      profile.about?.slice(0, 200) ??
      `${profile.name}: price, key statistics, filings and recent coverage.`,
  };
}

/* An unknown ticker is a 404 rather than a silent fallback to a default
   instrument — a URL that quietly shows different data than it names is worse
   than one that admits it does not exist. */
export default async function InstrumentPage({ params }: Params) {
  const { ticker } = await params;
  const symbol = canonical(ticker);
  if (!symbol || !NAME_BY_SYMBOL.has(symbol)) notFound();
  /* /terminal/aapl -> /terminal/AAPL. One canonical URL per instrument, so the
     cache holds one entry and the reader lands on the prerendered page.

     Compared against the DECODED param, never the raw one. Eighty warrants
     carry a "+" ("ACHR+"), which encodes to %2B; comparing against a raw param
     Next may hand back still-encoded would redirect ACHR%2B to ACHR%2B for
     ever. Decoded, the comparison differs only in case and whitespace, and
     the target is already canonical, so the redirect can fire at most once. */
  if (symbol !== decoded(ticker)) permanentRedirect(`/terminal/${encodeURIComponent(symbol)}`);

  const snapshot = await getInstrumentSnapshot(symbol);
  if (!snapshot) notFound();

  return <InstrumentView snapshot={snapshot} />;
}
