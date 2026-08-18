import { Link } from 'react-router-dom'
import type { Instrument } from '../../data/terminalUniverse'
import { RATES, pct } from '../../data/pricingRates'
import { formatInr } from '../../lib/pricing'
import { ArrowRight } from './Icons'

interface RulesPanelProps {
  instrument: Instrument
}

/**
 * The rules that apply to an Indian resident buying this.
 *
 * Every figure is read from pricingRates.ts rather than typed here — the same
 * discipline the schedule tables and both calculators follow. Every rule links
 * to the guide that explains it, because a two-line summary of Schedule FA is
 * a summary, not advice, and the page should say so by pointing at the longer
 * answer rather than pretending to be it.
 */
export default function RulesPanel({ instrument }: RulesPanelProps) {
  const isEtf = instrument.kind === 'etf'

  const rules: { k: string; v: string; body: string; to: string; guide: string }[] = [
    {
      k: 'Route',
      v: 'LRS',
      body: `Buying ${instrument.symbol} means remitting rupees abroad under the RBI's Liberalised Remittance Scheme. The scheme has an annual per-person limit, and it covers every foreign purpose together — travel, education and investment share one allowance.`,
      to: '/articles/lrs-explained',
      guide: 'How LRS works',
    },
    {
      k: 'Tax collected at source',
      v: pct(RATES.tcsPct),
      body: `TCS applies to LRS remittances above ₹${formatInr(RATES.tcsThresholdInr)} cumulative in a financial year, across all purposes. It is not a cost — it is credited against your tax liability when you file.`,
      to: '/articles/tcs-on-lrs-explained',
      guide: 'TCS on LRS, explained',
    },
    {
      k: 'Before your first trade',
      v: 'W-8BEN',
      body: 'The W-8BEN declares you a non-US person and claims the India–US treaty rate on dividends. Without it, US withholding on dividends is charged at the higher non-treaty rate.',
      to: '/articles/w8ben-form-explained',
      guide: 'The W-8BEN form',
    },
    {
      k: 'Capital gains in India',
      v: `${pct(RATES.ltcgPct)} after ${RATES.ltcgThresholdMonths} months`,
      body: `${isEtf ? 'A US-listed ETF' : 'A US-listed share'} is a foreign asset, so it is taxed as unlisted-equivalent: your slab rate before ${RATES.ltcgThresholdMonths} months, ${pct(RATES.ltcgPct)} after. The ₹1.25 lakh exemption that applies to Indian listed equity does not apply here.`,
      to: '/articles/tax-on-us-stocks-in-india',
      guide: 'Tax on US stocks in India',
    },
    {
      k: 'Dividends',
      v: `${pct(RATES.dividendWithholdingPct)} withheld in the US`,
      body: 'US dividends are withheld at source at the treaty rate. India taxes the same dividend at your slab, and the tax already withheld is claimable as a foreign tax credit under the DTAA — so it is not paid twice.',
      to: '/articles/dtaa-india-us-foreign-tax-credit',
      guide: 'DTAA and the foreign tax credit',
    },
    {
      k: 'Annual disclosure',
      v: 'Schedule FA',
      body: 'Foreign holdings are reported in Schedule FA of your ITR for every year you hold them — whether or not you sold, and whether or not there was a gain.',
      to: '/articles/schedule-fa-foreign-assets-reporting',
      guide: 'Reporting foreign assets',
    },
  ]

  return (
    <div className="m-rules">
      {rules.map((rule) => (
        <div className="m-rule-item" key={rule.k}>
          <div className="m-rule-head">
            <span className="m-label">{rule.k}</span>
            <span className="m-rule-v">{rule.v}</span>
          </div>
          <p className="m-rule-b">{rule.body}</p>
          <Link className="m-guide" to={rule.to}>
            <span className="m-guide-label">{rule.guide}</span>
            <span aria-hidden="true"><ArrowRight /></span>
          </Link>
        </div>
      ))}
      <p className="m-kv-note m-note--span">
        A summary, not advice. Rates as of {RATES.ratesAsOf}. Your own position depends on
        your residency, your slab and your holding period — the guides above set out the
        detail, and a qualified adviser is the right place for a decision.
      </p>
    </div>
  )
}
