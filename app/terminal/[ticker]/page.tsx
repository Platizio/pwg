import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { InstrumentView } from "@/components/terminal/instrument-view";
import { getInstrumentSnapshot } from "@/lib/market/instrument";
import { COVERED, isPlaceholderInstrument } from "@/lib/market/universe";
import { baselineSnapshot } from "@/lib/market/baseline";
import { PRERENDER_LIMIT, prerenderTickers } from "@/lib/market/prerender";

type Params = { params: Promise<{ ticker: string }> };

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
  const snapshot = await getInstrumentSnapshot(ticker);
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
  const snapshot = await getInstrumentSnapshot(ticker);
  if (!snapshot) notFound();

  return <InstrumentView snapshot={snapshot} />;
}
