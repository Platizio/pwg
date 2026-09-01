import Link from 'next/link'
import type { Quote } from '../types/market'
import { POPULAR_8 } from '../data/marketUniverse'
import { formatChange, formatPrice } from '../lib/format'
import QuoteChange from './QuoteChange'
import MarketNote from './MarketNote'

interface PopularStocksProps {
  /** null while loading — renders the skeleton at identical height. */
  quotes: Quote[] | null
  asOf: string | null
  delayed: boolean
}

function StockCard({ quote }: { quote: Quote }) {
  return (
    /* These eight are the way into the terminal, not a way out of the site.
       They used to open the external trading platform in a new tab, which sent
       a reader who wanted to *learn about* Apple to a place that asks them to
       buy it. The terminal answers the question they actually had. */
    <Link className="stock-card" href={`/terminal/${quote.symbol}`}>
      <span className="stock-card-top">
        {/* Ticker leads: investors scan a grid like this by symbol, not by
            company name. */}
        <span className="stock-symbol">{quote.symbol}</span>
        <QuoteChange changePercent={quote.changePercent} />
      </span>
      <span className="stock-name">{quote.name}</span>
      <span className="stock-price">{formatPrice(quote.price)}</span>
      <span className="stock-abs">
        {formatChange(quote.change)} <span className="stock-currency">{quote.currency}</span>
      </span>
    </Link>
  )
}

/**
 * The eight names most Indian investors already recognise.
 *
 * The lineup is fixed and only the prices move, so the skeleton can render the
 * real tickers immediately: the grid never reflows when data lands, because
 * the only thing that changes is the numbers inside cells that already exist.
 */
export default function PopularStocks({ quotes, asOf, delayed }: PopularStocksProps) {
  if (quotes && quotes.length === 0) return null

  const loading = quotes === null

  return (
    <section className="section popular-section" aria-labelledby="popular-heading">
      <div className="container">
        <div className="section-header reveal">
          <span className="eyebrow">Popular with investors</span>
          <h2 id="popular-heading">Household names, fractional sizes</h2>
          <p>
            You do not need the price of a whole share. Buy a slice of the companies
            you already know, from as little as one dollar.
          </p>
        </div>

        <div className="stock-grid">
          {loading
            ? /* Ticker and company name are known before any request, so they
                 render immediately; only the numbers shimmer. Same elements as
                 the loaded card, so nothing moves when data lands. */
              POPULAR_8.map(({ symbol, name }) => (
                <span className="stock-card" key={symbol}>
                  <span className="stock-card-top">
                    <span className="stock-symbol">{symbol}</span>
                    <span className="quote-change quote-change--chip is-loading-text is-load-chg">&nbsp;</span>
                  </span>
                  <span className="stock-name">{name}</span>
                  <span className="stock-price is-loading-text is-load-price">&nbsp;</span>
                  <span className="stock-abs is-loading-text is-load-abs">&nbsp;</span>
                </span>
              ))
            : quotes.map((q) => <StockCard quote={q} key={q.symbol} />)}
        </div>

        <MarketNote asOf={asOf} delayed={delayed} />
      </div>
    </section>
  )
}
