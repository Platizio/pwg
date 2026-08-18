import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { Quote } from '../../types/market'
import {
  TERMINAL_UNIVERSE, terminalPath, findInstrument, type Instrument,
} from '../../data/terminalUniverse'
import { formatPrice, formatChange } from '../../lib/format'
import { calculateTradeCost, formatUsd } from '../../lib/pricing'
import MarketNote from '../MarketNote'
import { useTerminalData } from '../../hooks/useTerminalData'
import Mark from './Mark'
import Change from './Change'
import MovePlot from './MovePlot'
import { ArrowRight } from './Icons'

/**
 * The live terminal, embedded in the Products page.
 *
 * This is the page's argument made rather than claimed: a visitor who has
 * never signed up can see the real tape and click straight into a real
 * instrument page. It reuses the terminal's own components at a smaller scale
 * — Mark, Change, MovePlot, the same hook, the same URL — so there is one
 * implementation, not a marketing mock of one.
 *
 * Hovering or focusing a row previews that instrument in the panel; clicking
 * or pressing Enter opens its page. The hover is an enhancement layered on a
 * real link, never the only way through: every row is an anchor, the panel
 * always shows something, and keyboard focus drives the preview exactly as
 * the pointer does.
 */
export default function TerminalBand() {
  const { quotes, indexMoves, asOf, delayed, ready } = useTerminalData()
  const [preview, setPreview] = useState<string | null>(null)

  // Before data lands, and for anyone who never hovers, the panel leads with
  // the day's largest mover among the instruments we cover — a real editorial
  // choice that changes daily, rather than a hardcoded favourite.
  const topMover = [...TERMINAL_UNIVERSE]
    .map((i) => ({ i, q: quotes.get(i.symbol) }))
    .filter((row): row is { i: Instrument; q: Quote } => !!row.q)
    .sort((a, b) => Math.abs(b.q.changePercent) - Math.abs(a.q.changePercent))[0]?.i

  const featured =
    (preview ? findInstrument(preview) : undefined) ??
    topMover ??
    TERMINAL_UNIVERSE[0]
  const quote = quotes.get(featured.symbol)

  return (
    <div className="meridian band">
      <div className="container">
        <div className="band-head">
          <h2 id="terminal-heading" className="band-title">
            Thirteen instruments, priced now.
          </h2>
          <p className="band-sub">
            The same terminal every Platizio account opens into. Pick one to see today's
            move against the whole Nasdaq&#8209;100, the all&#8209;in cost of buying it
            from India, and the tax that applies.
          </p>
        </div>

        <div className="band-grid">
          <div className="band-panel">
            <div className="band-panel-head">
              <Mark symbol={featured.symbol} size="md" />
              <span className="band-id">
                <span className="band-name">{featured.name}</span>
                <span className="band-ex">{featured.exchange}: {featured.symbol}</span>
              </span>
              <span className="band-figure">
                {quote ? (
                  <>
                    <span className="band-price">
                      <span className="cur" aria-hidden="true">$</span>{formatPrice(quote.price)}
                    </span>
                    <Change changePercent={quote.changePercent} />
                  </>
                ) : ready ? (
                  <span className="m-absent">Unavailable</span>
                ) : (
                  <>
                    <span className="band-price is-loading-text is-load-price">000.00</span>
                    <span className="m-chg is-loading-text is-load-chg">+0.00%</span>
                  </>
                )}
              </span>
            </div>

            {quote && indexMoves.length > 0 ? (
              <MovePlot
                symbol={featured.symbol}
                self={quote.changePercent}
                moves={indexMoves}
                external={featured.kind === 'etf'}
              />
            ) : (
              <p className="band-empty">
                {ready
                  ? 'Live prices are unavailable right now. Every instrument still has its own page, with the cost and tax detail that does not depend on the tape.'
                  : 'Loading the tape…'}
              </p>
            )}

            {quote && (
              <div className="band-stats">
                <div className="band-stat">
                  <span className="band-stat-v">${formatPrice(quote.price)}</span>
                  <span className="m-label">Last traded</span>
                </div>
                <div className="band-stat">
                  <span className="band-stat-v">{formatChange(quote.change)}</span>
                  <span className="m-label">Change today</span>
                </div>
                <div className="band-stat">
                  <span className="band-stat-v">${formatPrice(quote.price - quote.change)}</span>
                  <span className="m-label">Previous close</span>
                </div>
                {/* The page's whole argument, previewed: not the price, but
                    what it costs you to own one. Same calculateTradeCost the
                    Pricing calculator runs, against the same published rates. */}
                <div className="band-stat is-lead">
                  <span className="band-stat-v">
                    ${formatUsd(calculateTradeCost(quote.price, 'buy')?.total ?? 0)}
                  </span>
                  <span className="m-label">Cost to buy one</span>
                </div>
              </div>
            )}

            <Link className="m-cta band-cta" to={terminalPath(featured.symbol)}>
              Open the {featured.symbol} terminal <ArrowRight />
            </Link>
          </div>

          {/* Two groups rather than one list of thirteen: it names the split
              the page is about, and it keeps the column the same height as
              the panel beside it instead of running 200px past it. */}
          <div className="band-list">
            {([
              { label: 'Shares', items: TERMINAL_UNIVERSE.filter((i) => i.kind === 'stock') },
              { label: 'Funds', items: TERMINAL_UNIVERSE.filter((i) => i.kind === 'etf') },
            ]).map((group) => (
              <div className="band-group" key={group.label}>
                <div className="band-list-head">
                  <span className="m-label m-label--accent">{group.label}</span>
                  <span className="m-label">Today</span>
                </div>
                {group.items.map((instrument) => {
                  const row = quotes.get(instrument.symbol)
                  return (
                    <Link
                      key={instrument.symbol}
                      to={terminalPath(instrument.symbol)}
                      className="m-srow band-row"
                      aria-current={instrument.symbol === featured.symbol ? 'true' : undefined}
                      onMouseEnter={() => setPreview(instrument.symbol)}
                      onFocus={() => setPreview(instrument.symbol)}
                      onMouseLeave={() => setPreview(null)}
                      onBlur={() => setPreview(null)}
                    >
                      <span>
                        <span className="m-srow-id">{instrument.symbol}</span>
                        <span className="m-srow-name">{instrument.name}</span>
                      </span>
                      {row ? (
                        <span className="band-row-figure">
                          <span className="band-row-price">${formatPrice(row.price)}</span>
                          <Change changePercent={row.changePercent} />
                        </span>
                      ) : ready ? (
                        <span className="m-absent" aria-label="price unavailable">—</span>
                      ) : (
                        <span className="band-row-figure">
                          <span className="band-row-price is-loading-text is-load-price">000.00</span>
                          <span className="m-chg is-loading-text is-load-chg">+0.00%</span>
                        </span>
                      )}
                    </Link>
                  )
                })}
              </div>
            ))}
          </div>
        </div>

        <MarketNote asOf={asOf} delayed={delayed} tone="dark" />
      </div>
    </div>
  )
}
