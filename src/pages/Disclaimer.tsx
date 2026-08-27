import { Link } from 'react-router-dom'
import SEO, { breadcrumbSchema } from '../components/SEO'

const points = [
  {
    title: 'Not Investment Advice',
    body: 'All information, content, articles, tools, screeners and educational materials on this platform are for general informational and educational purposes only. Nothing on this platform constitutes investment advice, a personalised recommendation, a solicitation, or an offer to buy or sell any security or financial product. All investment decisions are made solely by you, at your own discretion and risk.',
  },
  {
    title: 'Risk of Capital Loss',
    body: 'Investments in US Stocks and ETFs involve significant market risk. The value of investments can go up as well as down. You may lose part or all of your invested capital. Past performance of any security, index, or financial product is not indicative of future results. No returns are guaranteed by Platizio Global, ViewTrade, or any associated service provider.',
  },
  {
    title: 'Currency Risk',
    body: 'All investments through this platform are denominated in US Dollars (USD). Fluctuations in the INR/USD exchange rate can materially affect the value of your investment when converted back to Indian Rupees. A gain in USD terms may translate to a smaller gain or even a loss in INR terms, and vice versa.',
  },
  {
    title: 'Regulatory and Compliance Risk',
    body: 'International investing is subject to the laws and regulations of multiple jurisdictions, including India (FEMA, LRS, SEBI, Income Tax), IFSC/GIFT City, and the United States. Regulatory changes, policy updates, or restrictions imposed by any competent authority may affect your ability to invest, remit funds, or repatriate proceeds.',
  },
  {
    title: 'Role of Platizio Global',
    body: 'Platizio Services LLP operates Platizio Global as a white-labelled partner platform in association with ViewTrade. Platizio acts solely as a facilitator of access to international investing services. Platizio is not a broker, broker-dealer, custodian, investment adviser, portfolio manager, research analyst, or authorised dealer. All brokerage, execution, custody, clearing, settlement and related regulated activities are performed by ViewTrade or its appointed service providers.',
  },
  {
    title: 'Regulatory Status',
    body: 'Platizio Services LLP is registered with the Association of Mutual Funds in India (AMFI) as a mutual fund distributor and operates in compliance with applicable SEBI regulations for its domestic offerings. The Platizio Global international investing offering is facilitated through ViewTrade, a regulated entity. Platizio does not hold a broker-dealer, investment adviser, or portfolio manager registration in India or any foreign jurisdiction in connection with this offering.',
  },
  {
    title: 'LRS and Tax Responsibility',
    body: 'Investing in US securities through this platform involves remittance under the Liberalised Remittance Scheme (LRS) of the Reserve Bank of India. You are solely responsible for ensuring your remittances comply with the prescribed LRS annual limit, applicable Tax Collected at Source (TCS) rules, and all FEMA requirements. You are also responsible for reporting foreign assets and income in your Indian income tax returns (Schedule FA), claiming applicable foreign tax credits, and meeting all tax obligations in India and any other jurisdiction of your tax residency.',
  },
  {
    title: 'Third-Party Content and Links',
    body: 'This platform may reference or link to third-party websites, market data providers, research, or services. Platizio is not responsible for the accuracy, completeness, or reliability of any third-party content. Any reference to a specific company, security, ETF, or index is for informational purposes only and does not constitute a recommendation or endorsement.',
  },
  {
    title: 'No Guarantee of Availability',
    body: 'The platform depends on third-party systems, internet infrastructure, exchanges, and service providers. Platizio does not guarantee uninterrupted access, real-time data accuracy, or error-free operation. Market data displayed on the platform may be delayed and should not be relied upon for time-sensitive trading decisions.',
  },
  {
    title: 'Seek Independent Advice',
    body: 'Before investing, you should carefully read all relevant product documents, risk disclosures, ViewTrade customer agreements, and applicable fee schedules. You should consult your own independent financial, legal, and tax advisers to assess the suitability of any investment in light of your personal financial situation, investment objectives, risk appetite, and tax profile.',
  },
]

export default function Disclaimer() {
  return (
    <>
      <SEO
        title="Risk Disclosure & Disclaimer"
        description="Risk disclosure and disclaimer for Platizio Global. Investing in US Stocks and ETFs involves market risk; this is not investment advice. Read before investing."
        canonical="/disclaimer"
        jsonLd={breadcrumbSchema([['Home', '/'], ['Risk Disclosure & Disclaimer', '/disclaimer']])}
      />
      {/* ===== PAGE HERO ===== */}
      <section className="page-hero">
        <div className="container">
          <div className="breadcrumb">
            <Link to="/">Home</Link><span className="crumb-sep" aria-hidden="true">/</span><span>Risk Disclosure &amp; Disclaimer</span>
          </div>
          <h1>Risk Disclosure &amp; Disclaimer</h1>
          <p>Important information about the nature of this platform and the risks of international investing</p>
          <div className="page-hero-meta">
            Effective Date: 11 May 2026
          </div>
        </div>
      </section>

      {/* ===== CONTENT ===== */}
      <section className="section">
        <div className="container legal-doc">

          {/* Intro note */}
          <div className="legal-note reveal">
            Please read this Disclaimer carefully before using the Platizio Global platform. By accessing or using this platform, you acknowledge that you have read, understood, and agreed to this Disclaimer in full.
          </div>

          <nav className="legal-toc reveal" aria-labelledby="disclaimer-toc">
            <h2 id="disclaimer-toc">Contents</h2>
            <ol>
              {points.map(({ title }, i) => (
                <li key={title}><a href={`#d-${i + 1}`}>{title}</a></li>
              ))}
            </ol>
          </nav>

          {/* Points */}
          {points.map(({ title, body }, i) => (
            <div className="legal-section reveal" key={title} id={`d-${i + 1}`}>
              <h2><span className="legal-num">{i + 1}</span>{title}</h2>
              <p>{body}</p>
            </div>
          ))}

          {/* Contact card */}
          <div className="legal-contact reveal">
            <h3>Questions?</h3>
            <p>
              For queries regarding this Disclaimer or the platform, contact us at{' '}
              <a href="mailto:supportglobal@platizio.com">supportglobal@platizio.com</a>.<br />
              For grievances: <a href="mailto:grievances@platizio.com">grievances@platizio.com</a> · +91 9289837100<br />
              Business Hours: Monday to Friday, 9:00 AM to 5:00 PM IST
            </p>
          </div>

          <div className="legal-related">
            <span>Also on this site:</span>
            <Link to="/terms">Terms &amp; Conditions</Link>
            <Link to="/privacy">Privacy Policy</Link>
          </div>

        </div>
      </section>
    </>
  )
}
