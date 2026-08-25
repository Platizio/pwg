import type { Quote } from '../types/market'
import { formatPrice } from '../lib/format'
import QuoteChange from './QuoteChange'
import MarketNote from './MarketNote'

interface TrendingBannerProps {
  /** Heading. Defaults to Home's wording. */
  label?: string
  /**
   * The universe the ranking was drawn from. Not a caption — the label is only
   * honest while it names the set that was actually ranked, so every caller
   * that changes the feed must change this with it.
   */
  scope?: string
  /** null while loading — renders the skeleton at identical height. */
  quotes: Quote[] | null
  asOf: string | null
  delayed: boolean
}

/** Enough placeholders to fill the band edge to edge at desktop width. */
const SKELETON_ITEMS = 10

function TickerItem({ quote }: { quote: Quote }) {
  return (
    <span className="ticker-item">
      <span className="ticker-symbol">{quote.symbol}</span>
      <span className="ticker-price">{formatPrice(quote.price)}</span>
      <QuoteChange changePercent={quote.changePercent} variant="inline" />
    </span>
  )
}

/**
 * The day's biggest movers, scrolling.
 *
 * Labelled "Nasdaq-100" and never "the market": ViewTrade has no market-wide
 * ranking endpoint, so this is our own universe sorted by absolute move. The
 * label is a factual constraint, not a caption — see docs/03-viewtrade-api.md.
 *
 * There is deliberately no pulsing "live" indicator. The data is delayed, and
 * that dot is the standard way of implying it isn't.
 */
export default function TrendingBanner({
  quotes, asOf, delayed, label = 'Top movers', scope = 'Nasdaq-100',
}: TrendingBannerProps) {
  // Loaded but empty means the proxy gave us too little to show honestly.
  if (quotes && quotes.length === 0) return null

  const loading = quotes === null
  const items = quotes ?? []

  return (
    <section className="trending-band" aria-labelledby="trending-heading">
      <div className="container trending-inner">
        <h2 className="trending-label" id="trending-heading">
          {label}
          <span className="trending-scope">{scope}</span>
        </h2>

        <div className="trending-viewport">
          {loading ? (
            /* Same elements and typography as a real row, so the band does not
               change height when data arrives. */
            <div className="ticker-track is-static" aria-hidden="true">
              {Array.from({ length: SKELETON_ITEMS }, (_, i) => (
                <span className="ticker-item" key={i}>
                  <span className="ticker-symbol is-loading-text is-load-sym">&nbsp;</span>
                  <span className="ticker-price is-loading-text is-load-price">&nbsp;</span>
                  <span className="quote-change quote-change--inline is-loading-text is-load-chg">&nbsp;</span>
                </span>
              ))}
            </div>
          ) : (
            <div className="ticker-track">
              {/* First pass carries the semantics. */}
              {items.map((q) => <TickerItem quote={q} key={q.symbol} />)}
              {/* Second pass exists only so the loop has no visible seam. */}
              {items.map((q) => <TickerItem quote={q} key={`dup-${q.symbol}`} />)}
            </div>
          )}
        </div>
      </div>

      <div className="container">
        <MarketNote asOf={asOf} delayed={delayed} tone="dark" />
      </div>
    </section>
  )
}
