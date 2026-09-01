import Link from 'next/link'
import { TRADING_PLATFORM_URL } from '../../src/constants'

const ArrowIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 12h14M13 5l7 7-7 7" />
  </svg>
)

/**
 * Four questions a first-time overseas investor actually asks, in the order
 * they ask them: who watches this, where does it sit, is my money allowed to
 * leave the country, and who is holding my shares.
 */
const BADGES = [
  {
    title: 'IFSCA regulated',
    body: 'Platizio Global operates under the International Financial Services Centres Authority, India’s unified regulator for IFSC entities.',
    icon: (<><path d="M12 3 4 6.5v5c0 4.5 3.4 8.2 8 9.5 4.6-1.3 8-5 8-9.5v-5z" /><path d="m9 12 2 2 4-4" /></>),
  },
  {
    title: 'Based in GIFT City',
    body: 'Your account is opened in India’s International Financial Services Centre, not offshore.',
    icon: (<><path d="M3 21h18" /><path d="M5 21V8l7-5 7 5v13" /><path d="M10 21v-6h4v6" /></>),
  },
  {
    title: 'Invests through the LRS',
    body: 'Funds move under the RBI’s Liberalised Remittance Scheme — the legal route for Indian residents investing abroad.',
    icon: (<><circle cx="12" cy="12" r="9" /><path d="M3 12h18" /><path d="M12 3a15 15 0 0 1 0 18 15 15 0 0 1 0-18z" /></>),
  },
  {
    title: 'Shares held in US custody',
    body: 'Your holdings sit with a US custodian in your name, separate from Platizio’s own assets.',
    icon: (<><rect x="3" y="8" width="18" height="13" rx="2" /><path d="M8 8V6a4 4 0 0 1 8 0v2" /></>),
  },
]

export default function Regulations() {
  return (
    <section className="section regs-section" aria-labelledby="regs-heading">
      <div className="container">
        <div className="section-header reveal">
          <span className="eyebrow">Where your money sits</span>
          <h2 id="regs-heading">Regulated in India, invested in the US</h2>
          <p>
            Investing abroad raises fair questions about oversight and custody. Here is
            how your account is structured.
          </p>
        </div>

        <div className="regs-grid">
          {BADGES.map(({ title, body, icon }) => (
            <article className="regs-card reveal" key={title}>
              <div className="feature-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  {icon}
                </svg>
              </div>
              <h3>{title}</h3>
              <p>{body}</p>
            </article>
          ))}
        </div>

        <p className="regs-disclaimer">
          Investing in securities carries risk, including possible loss of capital.
          Overseas investments also carry currency risk. Past performance does not
          indicate future results. Nothing on this page is investment advice.{' '}
          <Link href="/disclaimer">Read the full risk disclosure</Link>
        </p>

        <div className="regs-cta reveal">
          <h3>Open your account</h3>
          <p>Complete KYC online, fund through your bank, and place your first US order.</p>
          <a
            className="btn btn-gold btn-lg"
            href={TRADING_PLATFORM_URL}
            target="_blank"
            rel="noopener noreferrer"
          >
            Start investing <ArrowIcon />
          </a>
        </div>
      </div>
    </section>
  )
}
