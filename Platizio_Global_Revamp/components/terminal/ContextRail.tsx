import { Link } from 'react-router-dom'
import type { Instrument } from '../../data/terminalUniverse'
import { TRADING_PLATFORM_URL } from '../../../src/constants'
import { ArrowRight, ArrowUpRight } from './Icons'

interface ContextRailProps {
  instrument: Instrument
}

const STEPS = [
  {
    t: 'Open and verify',
    b: 'Account opening and KYC are free. You sign the W-8BEN in the same flow.',
  },
  {
    t: 'Remit under LRS',
    b: 'Send rupees to your US brokerage account through your bank. TCS above the annual threshold is credited back at filing.',
  },
  {
    t: 'Place the order',
    b: 'Whole shares or fractional. Charges are the schedule on the pricing page, applied per transaction.',
  },
]

const GUIDES: { to: string; label: string }[] = [
  { to: '/articles/how-to-invest-in-us-stocks-from-india', label: 'How to invest in US stocks from India' },
  { to: '/articles/how-to-transfer-money-for-us-stock-investing', label: 'Transferring money for US investing' },
  { to: '/articles/currency-risk-explained', label: 'Currency risk, explained' },
]

const ETF_GUIDES: { to: string; label: string }[] = [
  { to: '/articles/best-us-etfs-for-indian-investors', label: 'How to evaluate US ETFs' },
  { to: '/articles/etf-vs-index-fund-vs-mutual-fund', label: 'ETF vs index fund vs mutual fund' },
  { to: '/articles/how-to-invest-in-sp500-from-india', label: 'Three routes to the S&P 500' },
]

/**
 * The right-hand rail: what this is, how to buy it, where to read more.
 *
 * This is the half of the page a US terminal has no reason to build, and it is
 * the reason this page belongs to Platizio rather than being a re-skin of one.
 * All of it is descriptive or a link — the "about" text says what the company
 * does and never what it is worth.
 */
export default function ContextRail({ instrument }: ContextRailProps) {
  const guides = instrument.kind === 'etf' ? ETF_GUIDES : GUIDES

  return (
    <aside className="m-rail-right" aria-label="About this instrument">
      <section>
        <span className="m-label m-label--accent">About {instrument.name}</span>
        <p className="m-prose m-after-label">{instrument.about}</p>
      </section>

      <section>
        <span className="m-label m-label--accent">Buying this from India</span>
        <div className="m-steps m-after-label">
          {STEPS.map((step, i) => (
            <div className="m-step" key={step.t}>
              <span className="m-step-n">{String(i + 1).padStart(2, '0')}</span>
              <span>
                <span className="m-step-t">{step.t}</span>
                <span className="m-step-b">{step.b}</span>
              </span>
            </div>
          ))}
        </div>
        <a
          className="m-cta m-cta--block"
          href={TRADING_PLATFORM_URL}
          target="_blank"
          rel="noopener noreferrer"
        >
          Start investing <ArrowUpRight />
        </a>
      </section>

      <section>
        <span className="m-label m-label--accent">Before you do</span>
        <div className="m-after-block">
          {guides.map((guide) => (
            <Link className="m-guide" to={guide.to} key={guide.to}>
            <span className="m-guide-label">{guide.label}</span>
            <span aria-hidden="true"><ArrowRight /></span>
            </Link>
          ))}
        </div>
      </section>
    </aside>
  )
}
