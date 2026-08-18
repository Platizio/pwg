/**
 * Reference profile data for the thirteen terminal instruments.
 *
 * READ THIS BEFORE USING ANY NUMBER IN HERE.
 *
 * This is reference profile data carried over from the design-system source
 * (the Stock Terminal Lux screener, lib/market/instruments.ts). It is NOT a
 * live feed. Nothing in this file is fetched, refreshed, timestamped or
 * reconciled against a market data vendor. The five instruments that existed
 * in the design source — AAPL, MSFT, NVDA, AMZN, TSLA — carry its figures
 * across verbatim; the remaining eight were authored to the same shape and the
 * same level of detail so the layout has something to render.
 *
 * Consequence, and it is not optional: every figure sourced from this file
 * must be labelled as reference data wherever it appears on a page. Ratios,
 * peers, holders, fund weights, insight bodies — all of it. A visitor must
 * never be able to mistake one of these numbers for a quote. Live prices and
 * changes come from /api/quotes and only from there; this file exists to fill
 * the structural furniture around them.
 */

export interface Ratio {
  label: string
  value: string
}

export interface Peer {
  id: string
  name: string
  price: number
  mcap: string
  pe: number
  ret: number
}

export interface Holder {
  name: string
  shares: string
  pct: string
}

export interface ShareSlice {
  label: string
  pct: number
}

/** Lux grades insights three ways and colours them gold / sage / terracotta. */
export type InsightKind = 'up' | 'note' | 'warn'

export interface Insight {
  kind: InsightKind
  title: string
  body: string
}

export interface EquityProfile {
  kind: 'equity'
  mcap: string
  pe: number
  eps: number
  div: string
  beta: number
  ps: number
  pb: number
  roe: string
  margin: string
  debt: number
  /** Revenue by fiscal year, billions USD, oldest first (FY2021…FY2025). */
  rev: number[]
  analysts: number
  target: number
  share: ShareSlice[]
  comps: Peer[]
  holders: Holder[]
  insights: Insight[]
}

export interface FundProfile {
  kind: 'fund'
  expenseRatio: string
  aum: string
  holdingsCount: number
  indexTracked: string
  inception: string
  yield: string
  beta: number
  topHoldings: { name: string; pct: number }[]
  sectorMix: ShareSlice[]
  peerFunds: { id: string; name: string; expenseRatio: string; aum: string; ret: number }[]
  holders: Holder[]
  insights: Insight[]
}

export type Profile = EquityProfile | FundProfile

export const PROFILES: Record<string, Profile> = {
  // ——— Equities ————————————————————————————————————————————————————————————

  AAPL: {
    kind: 'equity',
    mcap: '2.41T',
    pe: 28.4,
    eps: 6.11,
    div: '0.55%',
    beta: 1.24,
    ps: 7.2,
    pb: 44.6,
    roe: '147.9%',
    margin: '25.3%',
    debt: 1.95,
    rev: [274, 365, 394, 383, 391],
    analysts: 42,
    target: 186,
    share: [
      { label: 'Apple', pct: 24 },
      { label: 'Samsung', pct: 20 },
      { label: 'Xiaomi', pct: 13 },
      { label: 'Others', pct: 43 },
    ],
    comps: [
      { id: 'MSFT', name: 'Microsoft', price: 418.2, mcap: '3.11T', pe: 36.1, ret: 29.4 },
      { id: 'GOOGL', name: 'Alphabet', price: 176.5, mcap: '2.18T', pe: 24.8, ret: 41.2 },
      { id: 'AMZN', name: 'Amazon', price: 184.7, mcap: '1.92T', pe: 52.3, ret: 33.8 },
      { id: 'META', name: 'Meta', price: 502.3, mcap: '1.28T', pe: 27.6, ret: 63.5 },
      { id: 'DELL', name: 'Dell Technologies', price: 122.4, mcap: '88B', pe: 21.4, ret: -4.2 },
    ],
    holders: [
      { name: 'Vanguard Group', shares: '1.32B', pct: '8.4%' },
      { name: 'BlackRock', shares: '1.05B', pct: '6.7%' },
      { name: 'Berkshire Hathaway', shares: '905M', pct: '5.8%' },
      { name: 'State Street', shares: '587M', pct: '3.7%' },
      { name: 'Geode Capital', shares: '333M', pct: '2.1%' },
    ],
    insights: [
      {
        kind: 'up',
        title: 'Momentum turning positive',
        body: 'Price reclaimed the 50-day moving average on above-average volume for three consecutive sessions.',
      },
      {
        kind: 'note',
        title: 'Services mix expanding',
        body: 'Services revenue now accounts for roughly a quarter of total revenue at materially higher gross margin.',
      },
      {
        kind: 'warn',
        title: 'Valuation stretched',
        body: 'Trading near the top of its five-year P/E range, leaving limited room for multiple expansion.',
      },
    ],
  },

  MSFT: {
    kind: 'equity',
    mcap: '3.11T',
    pe: 36.1,
    eps: 11.58,
    div: '0.72%',
    beta: 0.91,
    ps: 12.8,
    pb: 11.4,
    roe: '38.4%',
    margin: '36.1%',
    debt: 0.31,
    rev: [168, 198, 212, 228, 245],
    analysts: 58,
    target: 472,
    share: [
      { label: 'Microsoft', pct: 24 },
      { label: 'Amazon', pct: 31 },
      { label: 'Google', pct: 11 },
      { label: 'Others', pct: 34 },
    ],
    comps: [
      { id: 'AAPL', name: 'Apple', price: 147.0, mcap: '2.41T', pe: 28.4, ret: 18.7 },
      { id: 'GOOGL', name: 'Alphabet', price: 176.5, mcap: '2.18T', pe: 24.8, ret: 41.2 },
      { id: 'CRM', name: 'Salesforce', price: 268.4, mcap: '259B', pe: 44.8, ret: 22.3 },
      { id: 'ORCL', name: 'Oracle', price: 142.7, mcap: '394B', pe: 38.6, ret: 48.1 },
      { id: 'NOW', name: 'ServiceNow', price: 812.6, mcap: '167B', pe: 68.2, ret: 36.9 },
    ],
    holders: [
      { name: 'Vanguard Group', shares: '677M', pct: '9.1%' },
      { name: 'BlackRock', shares: '570M', pct: '7.7%' },
      { name: 'State Street', shares: '303M', pct: '4.1%' },
      { name: 'FMR LLC', shares: '215M', pct: '2.9%' },
      { name: 'Geode Capital', shares: '162M', pct: '2.2%' },
    ],
    insights: [
      {
        kind: 'up',
        title: 'Azure share gains',
        body: 'Cloud growth continues to outpace the broader infrastructure market.',
      },
      {
        kind: 'note',
        title: 'Assistant monetisation',
        body: 'Seat-based AI add-ons are converting inside the existing enterprise base.',
      },
      {
        kind: 'warn',
        title: 'Capex cycle',
        body: 'Data-centre build-out is compressing near-term free cash flow conversion.',
      },
    ],
  },

  NVDA: {
    kind: 'equity',
    mcap: '3.10T',
    pe: 64.2,
    eps: 1.96,
    div: '0.03%',
    beta: 1.68,
    ps: 34.1,
    pb: 58.7,
    roe: '119.2%',
    margin: '53.4%',
    debt: 0.17,
    rev: [16.7, 26.9, 27.0, 60.9, 96.3],
    analysts: 56,
    target: 158,
    share: [
      { label: 'NVIDIA', pct: 82 },
      { label: 'AMD', pct: 9 },
      { label: 'Intel', pct: 5 },
      { label: 'Others', pct: 4 },
    ],
    comps: [
      { id: 'AMD', name: 'AMD', price: 158.2, mcap: '256B', pe: 48.7, ret: 12.4 },
      { id: 'AVGO', name: 'Broadcom', price: 172.6, mcap: '805B', pe: 38.2, ret: 64.8 },
      { id: 'INTC', name: 'Intel', price: 22.4, mcap: '96B', pe: -12.4, ret: -38.2 },
      { id: 'TSM', name: 'TSMC', price: 176.9, mcap: '918B', pe: 28.4, ret: 72.1 },
      { id: 'MU', name: 'Micron', price: 102.3, mcap: '113B', pe: 18.9, ret: 41.6 },
    ],
    holders: [
      { name: 'Vanguard Group', shares: '203M', pct: '8.3%' },
      { name: 'BlackRock', shares: '176M', pct: '7.2%' },
      { name: 'FMR LLC', shares: '137M', pct: '5.6%' },
      { name: 'State Street', shares: '98M', pct: '4.0%' },
      { name: 'T. Rowe Price', shares: '61M', pct: '2.5%' },
    ],
    insights: [
      {
        kind: 'up',
        title: 'Demand exceeds supply',
        body: 'Data-centre backlog continues to extend beyond current manufacturing capacity.',
      },
      {
        kind: 'note',
        title: 'Software moat deepening',
        body: 'Developer ecosystem lock-in remains the least-priced part of the story.',
      },
      {
        kind: 'warn',
        title: 'Concentration risk',
        body: 'A handful of hyperscale customers account for a large share of revenue.',
      },
    ],
  },

  GOOGL: {
    kind: 'equity',
    mcap: '2.18T',
    pe: 24.8,
    eps: 7.12,
    div: '0.45%',
    beta: 1.03,
    ps: 6.4,
    pb: 6.8,
    roe: '30.1%',
    margin: '27.7%',
    debt: 0.10,
    rev: [258, 283, 307, 350, 391],
    analysts: 54,
    target: 205,
    share: [
      { label: 'Google', pct: 90 },
      { label: 'Bing', pct: 4 },
      { label: 'Yandex', pct: 2 },
      { label: 'Others', pct: 4 },
    ],
    comps: [
      { id: 'MSFT', name: 'Microsoft', price: 418.2, mcap: '3.11T', pe: 36.1, ret: 29.4 },
      { id: 'META', name: 'Meta', price: 502.3, mcap: '1.28T', pe: 27.6, ret: 63.5 },
      { id: 'AMZN', name: 'Amazon', price: 184.7, mcap: '1.92T', pe: 52.3, ret: 33.8 },
      { id: 'AAPL', name: 'Apple', price: 147.0, mcap: '2.41T', pe: 28.4, ret: 18.7 },
      { id: 'BIDU', name: 'Baidu', price: 88.6, mcap: '31B', pe: 9.8, ret: -18.4 },
    ],
    holders: [
      { name: 'Vanguard Group', shares: '448M', pct: '7.4%' },
      { name: 'BlackRock', shares: '380M', pct: '6.3%' },
      { name: 'State Street', shares: '197M', pct: '3.3%' },
      { name: 'FMR LLC', shares: '168M', pct: '2.8%' },
      { name: 'T. Rowe Price', shares: '114M', pct: '1.9%' },
    ],
    insights: [
      {
        kind: 'up',
        title: 'Cloud segment turned profitable',
        body: 'The cloud unit has reported positive operating income for several consecutive quarters after years of losses.',
      },
      {
        kind: 'note',
        title: 'Search share remains dominant',
        body: 'Search advertising supplies the majority of revenue and query share has held above eighty percent for a decade.',
      },
      {
        kind: 'warn',
        title: 'Antitrust proceedings remain open',
        body: 'Cases in the United States and Europe target the search distribution and ad-tech businesses.',
      },
    ],
  },

  AMZN: {
    kind: 'equity',
    mcap: '1.92T',
    pe: 52.3,
    eps: 3.53,
    div: '—',
    beta: 1.15,
    ps: 3.3,
    pb: 8.6,
    roe: '19.8%',
    margin: '7.4%',
    debt: 0.55,
    rev: [386, 470, 514, 575, 638],
    analysts: 51,
    target: 212,
    share: [
      { label: 'Amazon', pct: 31 },
      { label: 'Microsoft', pct: 24 },
      { label: 'Google', pct: 11 },
      { label: 'Others', pct: 34 },
    ],
    comps: [
      { id: 'MSFT', name: 'Microsoft', price: 418.2, mcap: '3.11T', pe: 36.1, ret: 29.4 },
      { id: 'GOOGL', name: 'Alphabet', price: 176.5, mcap: '2.18T', pe: 24.8, ret: 41.2 },
      { id: 'BABA', name: 'Alibaba', price: 82.4, mcap: '198B', pe: 15.7, ret: -8.3 },
      { id: 'SHOP', name: 'Shopify', price: 68.9, mcap: '88B', pe: 72.4, ret: 34.7 },
      { id: 'WMT', name: 'Walmart', price: 72.1, mcap: '581B', pe: 31.2, ret: 44.9 },
    ],
    holders: [
      { name: 'Vanguard Group', shares: '745M', pct: '7.2%' },
      { name: 'BlackRock', shares: '620M', pct: '6.0%' },
      { name: 'State Street', shares: '340M', pct: '3.3%' },
      { name: 'FMR LLC', shares: '297M', pct: '2.9%' },
      { name: 'T. Rowe Price', shares: '188M', pct: '1.8%' },
    ],
    insights: [
      {
        kind: 'up',
        title: 'Cloud reacceleration',
        body: 'AWS growth has ticked up for two consecutive quarters after a long optimisation cycle.',
      },
      {
        kind: 'note',
        title: 'Advertising compounding',
        body: 'Advertising is now the third pillar and grows faster than retail at far higher margin.',
      },
      {
        kind: 'warn',
        title: 'Capital intensity',
        body: 'Infrastructure spend keeps free cash flow volatile quarter to quarter.',
      },
    ],
  },

  META: {
    kind: 'equity',
    mcap: '1.28T',
    pe: 27.6,
    eps: 18.20,
    div: '0.40%',
    beta: 1.21,
    ps: 7.8,
    pb: 7.4,
    roe: '33.6%',
    margin: '34.5%',
    debt: 0.29,
    rev: [118, 117, 135, 165, 187],
    analysts: 47,
    target: 585,
    share: [
      { label: 'Meta', pct: 62 },
      { label: 'TikTok', pct: 15 },
      { label: 'Snap', pct: 6 },
      { label: 'Others', pct: 17 },
    ],
    comps: [
      { id: 'GOOGL', name: 'Alphabet', price: 176.5, mcap: '2.18T', pe: 24.8, ret: 41.2 },
      { id: 'NFLX', name: 'Netflix', price: 678.4, mcap: '292B', pe: 44.2, ret: 52.8 },
      { id: 'TTD', name: 'The Trade Desk', price: 108.2, mcap: '53B', pe: 74.5, ret: 28.3 },
      { id: 'PINS', name: 'Pinterest', price: 33.6, mcap: '23B', pe: 38.4, ret: -11.7 },
      { id: 'SNAP', name: 'Snap', price: 11.4, mcap: '19B', pe: -24.6, ret: -32.8 },
    ],
    holders: [
      { name: 'Vanguard Group', shares: '190M', pct: '7.5%' },
      { name: 'BlackRock', shares: '160M', pct: '6.3%' },
      { name: 'FMR LLC', shares: '132M', pct: '5.2%' },
      { name: 'State Street', shares: '92M', pct: '3.6%' },
      { name: 'T. Rowe Price', shares: '51M', pct: '2.0%' },
    ],
    insights: [
      {
        kind: 'up',
        title: 'Ad pricing has recovered',
        body: 'Average price per ad has risen year over year for several consecutive quarters alongside impression growth.',
      },
      {
        kind: 'note',
        title: 'Advertising funds every segment',
        body: 'The family of apps supplies effectively all revenue while other segments operate at a loss.',
      },
      {
        kind: 'warn',
        title: 'Reality Labs losses persist',
        body: 'The segment has recorded an annual operating loss above ten billion dollars for three straight years.',
      },
    ],
  },

  TSLA: {
    kind: 'equity',
    mcap: '758B',
    pe: 62.7,
    eps: 3.81,
    div: '—',
    beta: 2.04,
    ps: 7.9,
    pb: 11.2,
    roe: '21.4%',
    margin: '9.6%',
    debt: 0.42,
    rev: [31.5, 53.8, 81.5, 96.8, 97.7],
    analysts: 48,
    target: 214,
    share: [
      { label: 'Tesla', pct: 18 },
      { label: 'BYD', pct: 22 },
      { label: 'VW Group', pct: 9 },
      { label: 'Others', pct: 51 },
    ],
    comps: [
      { id: 'BYDDY', name: 'BYD', price: 58.4, mcap: '96B', pe: 22.1, ret: 18.4 },
      { id: 'RIVN', name: 'Rivian', price: 13.7, mcap: '13B', pe: -8.4, ret: -42.6 },
      { id: 'LCID', name: 'Lucid', price: 3.2, mcap: '7B', pe: -4.1, ret: -58.3 },
      { id: 'F', name: 'Ford Motor', price: 12.1, mcap: '48B', pe: 11.4, ret: -6.7 },
      { id: 'GM', name: 'General Motors', price: 46.8, mcap: '53B', pe: 5.6, ret: 21.9 },
    ],
    holders: [
      { name: 'Vanguard Group', shares: '227M', pct: '7.1%' },
      { name: 'BlackRock', shares: '185M', pct: '5.8%' },
      { name: 'State Street', shares: '98M', pct: '3.1%' },
      { name: 'Capital Research', shares: '74M', pct: '2.3%' },
      { name: 'Geode Capital', shares: '66M', pct: '2.1%' },
    ],
    insights: [
      {
        kind: 'warn',
        title: 'Margin compression',
        body: 'Automotive gross margin has contracted for four straight quarters as price cuts flow through.',
      },
      {
        kind: 'up',
        title: 'Energy storage inflection',
        body: 'Deployments are growing faster than the vehicle business and carry structurally higher margin.',
      },
      {
        kind: 'note',
        title: 'High beta profile',
        body: 'Moves roughly twice the market — position sizing matters more than usual here.',
      },
    ],
  },

  NFLX: {
    kind: 'equity',
    mcap: '292B',
    pe: 44.2,
    eps: 15.35,
    div: '—',
    beta: 1.34,
    ps: 8.4,
    pb: 15.6,
    roe: '34.8%',
    margin: '19.4%',
    debt: 0.71,
    rev: [29.7, 31.6, 33.7, 39.0, 44.1],
    analysts: 44,
    target: 745,
    share: [
      { label: 'Netflix', pct: 28 },
      { label: 'Prime Video', pct: 21 },
      { label: 'Disney+', pct: 12 },
      { label: 'Others', pct: 39 },
    ],
    comps: [
      { id: 'DIS', name: 'Walt Disney', price: 96.4, mcap: '175B', pe: 38.7, ret: -5.4 },
      { id: 'SPOT', name: 'Spotify', price: 312.7, mcap: '62B', pe: 74.8, ret: 61.4 },
      { id: 'CMCSA', name: 'Comcast', price: 41.8, mcap: '163B', pe: 10.6, ret: 2.7 },
      { id: 'WBD', name: 'Warner Bros. Discovery', price: 8.2, mcap: '20B', pe: -6.3, ret: -24.1 },
      { id: 'PARA', name: 'Paramount Global', price: 11.3, mcap: '8B', pe: -4.7, ret: -18.9 },
    ],
    holders: [
      { name: 'Vanguard Group', shares: '32M', pct: '7.5%' },
      { name: 'BlackRock', shares: '28M', pct: '6.6%' },
      { name: 'Capital Research', shares: '21M', pct: '4.9%' },
      { name: 'State Street', shares: '17M', pct: '4.0%' },
      { name: 'FMR LLC', shares: '12M', pct: '2.8%' },
    ],
    insights: [
      {
        kind: 'up',
        title: 'Advertising tier is scaling',
        body: 'The advertising-supported plan accounts for a growing share of new sign-ups across its launch markets.',
      },
      {
        kind: 'note',
        title: 'Free cash flow positive',
        body: 'Content spend has stabilised and the business has generated positive free cash flow since 2022.',
      },
      {
        kind: 'warn',
        title: 'Content commitments stay large',
        body: 'Multi-year content obligations remain a sizeable fixed claim on future cash regardless of subscriber trends.',
      },
    ],
  },

  // ——— Funds ———————————————————————————————————————————————————————————————

  SPY: {
    kind: 'fund',
    expenseRatio: '0.0945%',
    aum: '624B',
    holdingsCount: 503,
    indexTracked: 'S&P 500',
    inception: 'Jan 1993',
    yield: '1.24%',
    beta: 1.00,
    topHoldings: [
      { name: 'Apple', pct: 7.1 },
      { name: 'Microsoft', pct: 6.5 },
      { name: 'NVIDIA', pct: 6.2 },
      { name: 'Amazon', pct: 3.8 },
      { name: 'Meta Platforms', pct: 2.6 },
      { name: 'Alphabet Class A', pct: 2.1 },
      { name: 'Alphabet Class C', pct: 1.8 },
      { name: 'Broadcom', pct: 1.7 },
      { name: 'Berkshire Hathaway', pct: 1.6 },
      { name: 'Tesla', pct: 1.5 },
    ],
    sectorMix: [
      { label: 'Information Technology', pct: 32.4 },
      { label: 'Financials', pct: 13.1 },
      { label: 'Health Care', pct: 11.2 },
      { label: 'Consumer Discretionary', pct: 10.3 },
      { label: 'Communication Services', pct: 9.4 },
      { label: 'Industrials', pct: 8.2 },
      { label: 'Consumer Staples', pct: 5.7 },
      { label: 'Energy', pct: 3.4 },
      { label: 'Utilities', pct: 2.4 },
      { label: 'Real Estate', pct: 2.2 },
      { label: 'Materials', pct: 1.7 },
    ],
    peerFunds: [
      { id: 'VOO', name: 'Vanguard S&P 500', expenseRatio: '0.03%', aum: '1.31T', ret: 24.6 },
      { id: 'IVV', name: 'iShares Core S&P 500', expenseRatio: '0.03%', aum: '584B', ret: 24.6 },
      { id: 'VTI', name: 'Vanguard Total Market', expenseRatio: '0.03%', aum: '478B', ret: 23.8 },
      { id: 'QQQ', name: 'Invesco QQQ', expenseRatio: '0.20%', aum: '328B', ret: 28.4 },
      { id: 'DIA', name: 'SPDR Dow Jones', expenseRatio: '0.16%', aum: '37B', ret: 14.2 },
    ],
    holders: [
      { name: 'Bank of America', shares: '44.2M', pct: '3.9%' },
      { name: 'Morgan Stanley', shares: '39.8M', pct: '3.5%' },
      { name: 'Goldman Sachs', shares: '31.6M', pct: '2.8%' },
      { name: 'UBS Group', shares: '24.1M', pct: '2.1%' },
      { name: 'Wells Fargo', shares: '18.7M', pct: '1.6%' },
    ],
    insights: [
      {
        kind: 'note',
        title: 'Concentration at the top',
        body: 'The ten largest positions together account for roughly a third of the fund by weight.',
      },
      {
        kind: 'up',
        title: 'Largest listed equity fund',
        body: 'Daily traded volume and options open interest exceed those of any other US-listed equity fund.',
      },
      {
        kind: 'warn',
        title: 'Unit investment trust structure',
        body: 'Dividends received are held in cash until the quarterly distribution rather than reinvested between payments.',
      },
    ],
  },

  QQQ: {
    kind: 'fund',
    expenseRatio: '0.20%',
    aum: '328B',
    holdingsCount: 101,
    indexTracked: 'Nasdaq-100',
    inception: 'Mar 1999',
    yield: '0.56%',
    beta: 1.11,
    topHoldings: [
      { name: 'Apple', pct: 8.9 },
      { name: 'NVIDIA', pct: 8.1 },
      { name: 'Microsoft', pct: 7.8 },
      { name: 'Amazon', pct: 5.4 },
      { name: 'Broadcom', pct: 4.6 },
      { name: 'Meta Platforms', pct: 3.6 },
      { name: 'Tesla', pct: 3.1 },
      { name: 'Alphabet Class A', pct: 2.6 },
      { name: 'Alphabet Class C', pct: 2.5 },
      { name: 'Costco Wholesale', pct: 2.4 },
    ],
    sectorMix: [
      { label: 'Information Technology', pct: 51.2 },
      { label: 'Communication Services', pct: 15.8 },
      { label: 'Consumer Discretionary', pct: 13.4 },
      { label: 'Health Care', pct: 5.6 },
      { label: 'Consumer Staples', pct: 5.1 },
      { label: 'Industrials', pct: 4.4 },
      { label: 'Utilities', pct: 1.6 },
      { label: 'Financials', pct: 1.5 },
      { label: 'Energy', pct: 0.6 },
      { label: 'Materials', pct: 0.4 },
      { label: 'Real Estate', pct: 0.4 },
    ],
    peerFunds: [
      { id: 'QQQM', name: 'Invesco Nasdaq-100', expenseRatio: '0.15%', aum: '42B', ret: 28.5 },
      { id: 'XLK', name: 'Technology Select', expenseRatio: '0.09%', aum: '78B', ret: 31.2 },
      { id: 'VGT', name: 'Vanguard Info Tech', expenseRatio: '0.09%', aum: '82B', ret: 30.4 },
      { id: 'SPY', name: 'SPDR S&P 500', expenseRatio: '0.0945%', aum: '624B', ret: 24.5 },
      { id: 'ONEQ', name: 'Fidelity Nasdaq Composite', expenseRatio: '0.21%', aum: '6B', ret: 26.8 },
    ],
    holders: [
      { name: 'Morgan Stanley', shares: '31.4M', pct: '5.1%' },
      { name: 'Bank of America', shares: '22.8M', pct: '3.7%' },
      { name: 'UBS Group', shares: '17.2M', pct: '2.8%' },
      { name: 'Goldman Sachs', shares: '14.6M', pct: '2.4%' },
      { name: 'Charles Schwab', shares: '11.3M', pct: '1.8%' },
    ],
    insights: [
      {
        kind: 'note',
        title: 'Index excludes financial companies',
        body: 'The Nasdaq-100 admits no financial-sector members, so banks and insurers are absent by index rule.',
      },
      {
        kind: 'warn',
        title: 'Technology dominates the weighting',
        body: 'Information technology accounts for more than half of the fund by weight.',
      },
      {
        kind: 'up',
        title: 'Spreads stay consistently tight',
        body: 'Average bid-ask spread sits near one basis point through regular US market hours.',
      },
    ],
  },

  VOO: {
    kind: 'fund',
    expenseRatio: '0.03%',
    aum: '1.31T',
    holdingsCount: 505,
    indexTracked: 'S&P 500',
    inception: 'Sep 2010',
    yield: '1.28%',
    beta: 1.00,
    topHoldings: [
      { name: 'Apple', pct: 7.1 },
      { name: 'Microsoft', pct: 6.5 },
      { name: 'NVIDIA', pct: 6.2 },
      { name: 'Amazon', pct: 3.8 },
      { name: 'Meta Platforms', pct: 2.6 },
      { name: 'Alphabet Class A', pct: 2.1 },
      { name: 'Alphabet Class C', pct: 1.8 },
      { name: 'Broadcom', pct: 1.7 },
      { name: 'Berkshire Hathaway', pct: 1.6 },
      { name: 'Tesla', pct: 1.5 },
    ],
    sectorMix: [
      { label: 'Information Technology', pct: 32.4 },
      { label: 'Financials', pct: 13.1 },
      { label: 'Health Care', pct: 11.2 },
      { label: 'Consumer Discretionary', pct: 10.3 },
      { label: 'Communication Services', pct: 9.4 },
      { label: 'Industrials', pct: 8.2 },
      { label: 'Consumer Staples', pct: 5.7 },
      { label: 'Energy', pct: 3.4 },
      { label: 'Utilities', pct: 2.4 },
      { label: 'Real Estate', pct: 2.2 },
      { label: 'Materials', pct: 1.7 },
    ],
    peerFunds: [
      { id: 'SPY', name: 'SPDR S&P 500', expenseRatio: '0.0945%', aum: '624B', ret: 24.5 },
      { id: 'IVV', name: 'iShares Core S&P 500', expenseRatio: '0.03%', aum: '584B', ret: 24.6 },
      { id: 'VTI', name: 'Vanguard Total Market', expenseRatio: '0.03%', aum: '478B', ret: 23.8 },
      { id: 'SPLG', name: 'SPDR Portfolio S&P 500', expenseRatio: '0.02%', aum: '61B', ret: 24.7 },
      { id: 'SCHX', name: 'Schwab US Large-Cap', expenseRatio: '0.03%', aum: '52B', ret: 24.1 },
    ],
    holders: [
      { name: 'Vanguard Personal Advisors', shares: '96.4M', pct: '4.2%' },
      { name: 'Bank of America', shares: '61.8M', pct: '2.7%' },
      { name: 'Morgan Stanley', shares: '50.3M', pct: '2.2%' },
      { name: 'Charles Schwab', shares: '41.2M', pct: '1.8%' },
      { name: 'LPL Financial', shares: '29.7M', pct: '1.3%' },
    ],
    insights: [
      {
        kind: 'up',
        title: 'Three basis point fee',
        body: 'The expense ratio sits among the lowest of any US-listed large-cap index fund.',
      },
      {
        kind: 'note',
        title: 'Same index as SPY',
        body: 'It tracks the S&P 500, so its holdings overlap almost entirely with other funds on that index.',
      },
      {
        kind: 'warn',
        title: 'Spreads wider than SPY',
        body: 'Secondary-market spreads run slightly wider than the largest S&P 500 fund at comparable trade sizes.',
      },
    ],
  },

  SOXX: {
    kind: 'fund',
    expenseRatio: '0.35%',
    aum: '14.8B',
    holdingsCount: 31,
    indexTracked: 'NYSE Semiconductor',
    inception: 'Jul 2001',
    yield: '0.62%',
    beta: 1.52,
    topHoldings: [
      { name: 'NVIDIA', pct: 9.4 },
      { name: 'Broadcom', pct: 8.7 },
      { name: 'Advanced Micro Devices', pct: 7.9 },
      { name: 'Texas Instruments', pct: 6.4 },
      { name: 'Qualcomm', pct: 6.1 },
      { name: 'Applied Materials', pct: 5.2 },
      { name: 'Micron Technology', pct: 4.8 },
      { name: 'Lam Research', pct: 4.4 },
      { name: 'Analog Devices', pct: 4.2 },
      { name: 'KLA Corporation', pct: 4.0 },
    ],
    sectorMix: [
      { label: 'Semiconductors', pct: 78.4 },
      { label: 'Semiconductor Equipment', pct: 18.2 },
      { label: 'Electronic Components', pct: 2.1 },
      { label: 'Cash & Other', pct: 1.3 },
    ],
    peerFunds: [
      { id: 'SMH', name: 'VanEck Semiconductor', expenseRatio: '0.35%', aum: '24B', ret: 42.8 },
      { id: 'XSD', name: 'SPDR S&P Semiconductor', expenseRatio: '0.35%', aum: '1B', ret: 18.4 },
      { id: 'PSI', name: 'Invesco Semiconductors', expenseRatio: '0.56%', aum: '1B', ret: 26.1 },
      { id: 'FTXL', name: 'First Trust Nasdaq Semis', expenseRatio: '0.60%', aum: '1B', ret: 22.7 },
      { id: 'XLK', name: 'Technology Select', expenseRatio: '0.09%', aum: '78B', ret: 31.2 },
    ],
    holders: [
      { name: 'Morgan Stanley', shares: '4.1M', pct: '4.6%' },
      { name: 'Bank of America', shares: '2.8M', pct: '3.1%' },
      { name: 'UBS Group', shares: '2.2M', pct: '2.5%' },
      { name: 'LPL Financial', shares: '1.6M', pct: '1.8%' },
      { name: 'Charles Schwab', shares: '1.2M', pct: '1.3%' },
    ],
    insights: [
      {
        kind: 'note',
        title: 'Roughly thirty holdings only',
        body: 'The index caps membership near thirty semiconductor names, so individual position weights are large.',
      },
      {
        kind: 'warn',
        title: 'Earnings follow inventory cycles',
        body: 'Semiconductor revenue has historically swung with inventory cycles more sharply than the broad market.',
      },
      {
        kind: 'up',
        title: 'Single-issuer weights are capped',
        body: 'Position weights are capped and rebalanced quarterly, limiting how far one holding can dominate the fund.',
      },
    ],
  },

  XLK: {
    kind: 'fund',
    expenseRatio: '0.09%',
    aum: '78.4B',
    holdingsCount: 69,
    indexTracked: 'Technology Select Sector',
    inception: 'Dec 1998',
    yield: '0.61%',
    beta: 1.18,
    topHoldings: [
      { name: 'NVIDIA', pct: 15.8 },
      { name: 'Apple', pct: 14.2 },
      { name: 'Microsoft', pct: 13.1 },
      { name: 'Broadcom', pct: 5.4 },
      { name: 'Oracle', pct: 3.1 },
      { name: 'Salesforce', pct: 2.6 },
      { name: 'Advanced Micro Devices', pct: 2.5 },
      { name: 'Cisco Systems', pct: 2.4 },
      { name: 'Palantir Technologies', pct: 2.2 },
      { name: 'Accenture', pct: 1.9 },
    ],
    sectorMix: [
      { label: 'Semiconductors & Equipment', pct: 41.2 },
      { label: 'Software', pct: 34.6 },
      { label: 'Technology Hardware', pct: 15.3 },
      { label: 'IT Services', pct: 6.7 },
      { label: 'Electronic Equipment', pct: 2.2 },
    ],
    peerFunds: [
      { id: 'VGT', name: 'Vanguard Info Tech', expenseRatio: '0.09%', aum: '82B', ret: 30.4 },
      { id: 'QQQ', name: 'Invesco QQQ', expenseRatio: '0.20%', aum: '328B', ret: 28.4 },
      { id: 'FTEC', name: 'Fidelity MSCI Info Tech', expenseRatio: '0.084%', aum: '13B', ret: 30.2 },
      { id: 'IYW', name: 'iShares US Technology', expenseRatio: '0.39%', aum: '20B', ret: 32.6 },
      { id: 'IGM', name: 'iShares Expanded Tech', expenseRatio: '0.41%', aum: '6B', ret: 29.8 },
    ],
    holders: [
      { name: 'Morgan Stanley', shares: '28.6M', pct: '5.4%' },
      { name: 'Bank of America', shares: '19.4M', pct: '3.7%' },
      { name: 'UBS Group', shares: '13.1M', pct: '2.5%' },
      { name: 'Wells Fargo', shares: '9.8M', pct: '1.9%' },
      { name: 'Charles Schwab', shares: '7.2M', pct: '1.4%' },
    ],
    insights: [
      {
        kind: 'note',
        title: 'Sector limited by classification',
        body: 'The fund holds only S&P 500 technology constituents, so Alphabet, Meta and Amazon fall outside it.',
      },
      {
        kind: 'warn',
        title: 'Three names dominate weighting',
        body: 'The three largest positions together account for more than forty percent of the fund.',
      },
      {
        kind: 'up',
        title: 'Nine basis point fee',
        body: 'Its expense ratio is among the lowest in the US sector-fund category.',
      },
    ],
  },
}

/** Case-insensitive lookup. Returns undefined for anything outside the thirteen. */
export function profileOf(symbol: string): Profile | undefined {
  return PROFILES[symbol.toUpperCase()]
}
