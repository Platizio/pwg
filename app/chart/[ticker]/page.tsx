import type { Metadata } from "next";
import Link from "next/link";
import { TradingViewChart } from "@/components/terminal/tradingview-chart";
import { TERMINAL_PATH, instrumentPath } from "@/lib/market/paths";
import { tradingViewSymbol } from "@/lib/market/tradingview";
import {
  EXCHANGE_BY_SYMBOL,
  MIC_BY_SYMBOL,
  NAME_BY_SYMBOL,
  presentation,
} from "@/lib/market/universe";

/**
 * One stock, full screen, drawn by TradingView.
 *
 * This route is top-level rather than a child of /terminal because the
 * terminal's layout awaits the home snapshot and wraps everything in the Shell
 * — rails, drawer, tape, ticket — and none of that belongs behind a chart the
 * reader opened precisely to get a clear view. lib/market/paths.ts records the
 * same reasoning at `chartPath`.
 *
 * WHY THE VENUE IS RESOLVED HERE AND NOT IN THE WIDGET
 *
 * `MIC_BY_SYMBOL` and `EXCHANGE_BY_SYMBOL` are built at module load from a
 * 2.5 MB JSON master. That cost is nothing on a server that pays it once per
 * process, and unpayable in a browser: importing either map into the client
 * component would drag the whole market into the bundle to answer one lookup.
 * So the page resolves the symbol and hands the finished string down as a
 * prop, and the client component never learns that a universe exists.
 *
 * WHY THIS MUST NOT THROW FOR ANY TICKER
 *
 * The route accepts whatever the URL says. `npm run build` walks the app and
 * renders, and a reader — or a crawler — can type anything into the segment.
 * Nothing below indexes into a maybe-missing object, nothing asserts, and the
 * one operation that can genuinely fail on hostile input (percent-decoding)
 * is caught. An unknown ticker is not an error here the way it is on an
 * instrument page: we have no data of our own to be missing, and TradingView
 * carries thousands of listings our master does not.
 */

type Params = { params: Promise<{ ticker: string }> };

/**
 * The URL's ticker, in the form the symbol master is keyed by.
 *
 * The master writes share classes with a dot — BRK.B — while the gateway and
 * some inbound links use a slash, so the slash is folded before the lookup or
 * BRK/B would miss the map, lose its venue, and fall back to a bare symbol for
 * no reason. `tradingViewSymbol` performs the same fold on its own; doing it
 * here as well is what makes the map lookup agree with the answer.
 *
 * decodeURIComponent throws a URIError on a malformed escape — `/chart/%E0%A4`
 * is a URL anyone can type — and an uncaught throw in a server component is a
 * 500 page for what is really just a nonsense ticker. The raw segment is the
 * honest fallback: it will not name a stock, and the page says so.
 */
function readTicker(raw: string): string {
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    /* Left as it arrived. */
  }
  return decoded.trim().toUpperCase().replace(/\//g, ".");
}

/** The tidied company name, but only where we actually have one. */
function nameOf(ticker: string): string | null {
  return NAME_BY_SYMBOL.has(ticker) ? presentation(ticker).name : null;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { ticker } = await params;
  const symbol = readTicker(ticker);
  if (!symbol) return { title: "Chart · Platizio Global" };

  const name = nameOf(symbol);
  return {
    title: name
      ? `${name} · ${symbol} chart · Platizio Global`
      : `${symbol} chart · Platizio Global`,
    description: `Interactive TradingView chart for ${symbol}, in Indian time. Charted from TradingView's market data, not from Platizio Global's quote feed.`,
  };
}

export default async function ChartPage({ params }: Params) {
  const { ticker } = await params;
  const symbol = readTicker(ticker);
  const name = nameOf(symbol);

  /* Null only when there is no ticker at all — `/chart/%20` reaches here. A
     bare, unprefixed return is not a failure and must not be treated as one:
     TradingView resolves an unprefixed US ticker to its own primary listing,
     which is the right answer wherever our master cannot name the venue with
     confidence. See lib/market/tradingview.ts. */
  const tvSymbol = tradingViewSymbol(
    symbol,
    MIC_BY_SYMBOL.get(symbol),
    EXCHANGE_BY_SYMBOL.get(symbol),
  );

  return (
    <main className="flex h-dvh flex-col overflow-hidden">
      <header className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-rule-section px-4 py-2.5 sm:px-5">
        <div className="flex min-w-0 items-baseline gap-3">
          <span className="font-mono text-[13px] tracking-[0.06em] text-ink">
            {symbol || "—"}
          </span>
          {name && <span className="truncate text-[12.5px] text-ink-3">{name}</span>}
        </div>
        <Link
          href={symbol ? instrumentPath(symbol) : TERMINAL_PATH}
          className="eyebrow eyebrow-gold transition-colors hover:text-gold"
        >
          {symbol ? `Back to ${symbol}` : "Back to the terminal"}
        </Link>
      </header>

      {/* The one line that has to be read. This is a regulated surface: the
          terminal's own quotes are delayed and come from our gateway, the
          chart's do not, and a reader comparing the two numbers deserves to
          know why they disagree before they wonder whether something is
          broken. Stated once, in the page's own voice, and not repeated. */}
      <p className="border-b border-rule-section px-4 py-2 text-[11.5px] leading-[1.6] text-ink-2 sm:px-5">
        <span className="eyebrow eyebrow-gold mr-2">Third-party data</span>
        This chart is drawn by TradingView from TradingView&rsquo;s own market
        data, not from Platizio Global&rsquo;s feed. Its prices will not match the
        delayed quotes shown elsewhere in the terminal.
      </p>

      {tvSymbol ? (
        <TradingViewChart symbol={tvSymbol} />
      ) : (
        /* Honest rather than empty. Mounting the widget with no symbol renders
           a chart of nothing, which reads as a broken page instead of a wrong
           address. */
        <div className="flex min-h-0 flex-1 items-center justify-center px-4">
          <div className="max-w-[46ch]">
            <p className="eyebrow eyebrow-wide">No symbol</p>
            <h1 className="font-serif mt-3 text-[clamp(1.5rem,2.6vw,2rem)] leading-none">
              Nothing to chart
            </h1>
            <p className="mt-4 text-[13px] leading-[1.75] text-pretty text-ink-3">
              This address does not name a stock, so there is no symbol to hand
              TradingView. Nothing has gone wrong with the chart — pick a stock
              from the terminal and open it again.
            </p>
            <Link
              href={TERMINAL_PATH}
              className="eyebrow eyebrow-gold mt-6 inline-flex min-h-11 items-center transition-colors hover:text-gold"
            >
              Back to the terminal
            </Link>
          </div>
        </div>
      )}
    </main>
  );
}
