import { RATES, FREE_ITEMS, pct } from "../../Platizio_Global_Revamp/data/pricingRates.ts";

/**
 * A published zero, read from the rate file by the label it is published
 * under. Throws rather than rendering blank: if the schedule ever renames a
 * line, the home page must fail loudly at build time, not quietly drop the
 * figure a reader is deciding on.
 */
function freeValue(label: string): string {
  const item = FREE_ITEMS.find((f) => f.label === label);
  if (!item) {
    throw new Error(`FREE_ITEMS has no "${label}": the home page's cost figures read from the rate file`);
  }
  return item.value;
}

/**
 * Every word on the home page, in one place, written plain.
 *
 * Numbers are never typed here: the rate file supplies them, so the copy can
 * never say a figure the pricing page does not. The facts about who regulates
 * the account and who holds the shares are the ones the About page already
 * states; nothing is claimed that the product cannot support.
 */

const brokerage = pct(RATES.brokeragePct);
const minimum = `$${RATES.brokerageMinUsd}`;

export const COPY = {
  seo: {
    title: "Invest in US stocks and ETFs from India",
    description:
      "Own US stocks and ETFs from India in your own name, through the RBI's LRS, with every rate published before you trade. IFSCA regulated, in GIFT City. Open an account online.",
  },

  cta: {
    primary: "Start investing",
    ghost: "See the terminal",
  },

  hero: {
    mark: "US stocks & ETFs · for residents of India",
    h1: { lead: "Own the companies you already use,", clause: "from India." },
    /* Two, not three. "Guided end to end" is a promise about service, and the
       hero's job here is to state what the account is and who oversees it —
       the two things a reader checks before they read any further. */
    facts: [
      { term: "US stocks & ETFs", desc: "Companies, indices, sectors and themes" },
      { term: "IFSCA regulated", desc: "Your account opened in GIFT City" },
    ],
  },

  ticker: {
    label: "Today's movers",
    basis: "Nasdaq-100",
    wait: "Loading the day's movers.",
    unavailable: "Live prices are unavailable at the moment.",
  },

  why: {
    h2: "Own more than one economy.",
    body:
      "Most Indian portfolios hold one country, one currency and one set of companies. Adding the US adds the market where the products you use every day are listed.",
    kicker: "Reasons Indian investors are looking abroad",
    /* Five reasons and one panel, laid out as the v4 draft lays them: three
       columns of stacked cards with the instrument panel sitting among them
       rather than as a section of its own. */
    reasons: [
      {
        title: "Spread the risk",
        body: "One country, one currency, one economy is a single bet. US exposure adds a market that rarely moves in step with India's.",
      },
      {
        title: "Own the world's largest companies",
        body: "Technology, healthcare, energy, consumer brands: the companies setting the pace globally are listed in New York, and most have no Indian listing.",
      },
      {
        title: "Buy a whole market in one order",
        body: "An S&P 500 or Nasdaq-100 ETF holds hundreds of companies at once, for one order and one brokerage charge.",
      },
      {
        title: "Hold some dollars",
        body: "Education, travel and medical bills abroad are priced in dollars. A dollar asset balances an income earned at home.",
      },
      {
        title: "Back the themes that compound",
        body: "Artificial intelligence, semiconductors, cloud and the global consumer brands, reachable from one account rather than five.",
      },
    ],
    /* The panel that sits among the reasons. It carries the allowance rather
       than a quote list: prices belong on the tape above and in the terminal,
       and repeating them here made the section read as a stock ticker with
       prose around it.

       $250,000 is the Reserve Bank's limit, not one of our rates, so it does
       not come from the rate file. The home page states it here and in the
       first answer below, and a test holds the two to the same number. */
    panel: {
      label: "Your annual allowance",
      value: "$250,000",
      unit: "per person, per financial year",
      note: "Under the Reserve Bank's Liberalised Remittance Scheme. Investing in listed shares and ETFs is one of the permitted purposes.",
    },
  },

  how: {
    h2: "Three steps, one legal route.",
    body:
      "Your money never goes off the map. It moves from your bank under the RBI's Liberalised Remittance Scheme into an account opened in your name in GIFT City, and your shares sit with a US custodian.",
    steps: [
      {
        title: "Open your account",
        body: "Complete KYC online. No branch visit, no paper.",
      },
      {
        title: "Fund it under the LRS",
        body: "Transfer from your Indian bank under the RBI's Liberalised Remittance Scheme, the route every resident is allowed to use.",
      },
      {
        title: "Place your first US order",
        body: "Pick a stock or an ETF, place the order, and track it in your portfolio.",
      },
    ],
    reads: {
      label: "Read first",
      links: [
        { label: "How to invest in US stocks from India", href: "/articles/how-to-invest-in-us-stocks-from-india" },
        { label: "LRS explained", href: "/articles/lrs-explained" },
        { label: "Tax on US stocks", href: "/articles/tax-on-us-stocks-in-india" },
      ],
      all: { label: "All articles", href: "/articles" },
    },
  },

  regulated: {
    h2: "Regulated in India. Held in the US.",
    body: "Investing abroad raises fair questions about oversight and custody. Here is how the account is structured, in plain words.",
    cells: [
      {
        title: "IFSCA regulated",
        gloss: "Platizio Global operates under the International Financial Services Centres Authority, India's regulator for GIFT City.",
      },
      {
        title: "Opened in GIFT City",
        gloss: "Your account is opened in your name with ViewTrade IFSC, in India, not offshore.",
      },
      {
        title: "Funded under the LRS",
        gloss: "Money moves through the RBI's Liberalised Remittance Scheme, the legal route for investing abroad.",
      },
      {
        title: "Held in US custody",
        gloss: "Shares sit with a US custodian, DTCC as the ultimate custodian, separate from Platizio's own assets.",
      },
      {
        title: "SIPC cover",
        gloss: "US brokerage accounts are covered by SIPC up to USD 500,000 against the failure of a brokerage firm.",
      },
    ],
    disclosure:
      "Investing in securities carries risk, including possible loss of capital. Overseas investments also carry currency risk. Nothing on this page is investment advice.",
    disclosureLink: { label: "Read the full risk disclosure", href: "/disclaimer" },
  },

  fees: {
    h2: "You pay to trade, not to hold an account.",
    body:
      "Three figures decide whether this is worth opening. Here they are, and the rest of the schedule is one click away.",
    /* Three, because three is what a first-time buyer is weighing: what a
       trade costs, what the account costs, and what the data costs. Every
       statutory charge is real and published, but it is published in full on
       /pricing rather than enumerated here, where five per-dollar fees read
       as five obstacles. */
    figures: [
      {
        value: pct(RATES.brokeragePct),
        label: "Brokerage, per transaction",
        note: `Minimum $${RATES.brokerageMinUsd} per order`,
      },
      {
        value: freeValue("Account opening"),
        label: "To open your account",
        note: "KYC and profile verification included",
      },
      {
        value: freeValue("Live price tracking"),
        label: "Live prices and terminal access",
        note: "TradingView charting included",
      },
    ],
    passthrough:
      "Exchange and regulatory fees are passed through at cost, and every one of them is published in full before you trade. Nothing is added afterwards.",
    link: "See the full schedule",
  },

  faq: {
    h2: "The questions everyone asks first.",
    body: "Six things a first-time buyer wants settled before opening anything. Short answers here; the guides go deeper.",
    items: [
      {
        q: "Is it legal for an Indian resident to buy US stocks?",
        a: "Yes. The RBI's Liberalised Remittance Scheme lets a resident individual send up to $250,000 abroad each financial year, and investing in listed securities is one of the permitted purposes. Your account is opened in your name in GIFT City, under IFSCA.",
      },
      {
        q: "What is TCS, and is it a cost?",
        a: `Tax collected at source applies at ${pct(RATES.tcsPct, 0)} on the part of your LRS remittances above Rs 10 lakh in a financial year, counted across all purposes. It is credited against your income tax, so it is an advance, not a fee.`,
      },
      {
        q: "How are US stocks taxed in India?",
        a: `US holdings are foreign assets for Indian tax. Gains are taxed at your slab rate if you sell within ${RATES.ltcgThresholdMonths} months and at ${pct(RATES.ltcgPct, 1)} after that. US dividends are withheld at ${pct(RATES.dividendWithholdingPct, 0)} at source and can be claimed as a foreign tax credit. Holdings are disclosed each year in Schedule FA.`,
      },
      {
        q: "Who actually holds my shares?",
        a: "A US custodian, with DTCC as the ultimate custodian, separate from Platizio's own assets. Platizio provides access, onboarding and guidance; brokerage, execution and custody are performed by ViewTrade IFSC and its appointed providers.",
      },
      {
        q: "Is there a minimum?",
        a: `There is no minimum balance to open or keep the account. Brokerage has a ${minimum} minimum per trade, so a very small order pays proportionally more than a larger one.`,
      },
      {
        q: "When can I trade?",
        a: "US markets are open 9:30 am to 4:00 pm New York time: 7:00 pm to 1:30 am IST while the US is on daylight time, an hour later in winter. The session pill beside today's movers shows where the day is right now.",
      },
    ],
  },

  closing: {
    h2: "Your first US share is one account away.",
    body: "Open it online, fund it from your bank, and buy a piece of a company you already know.",
    primary: "Start investing",
    secondary: "Talk to us",
  },
} as const;

export { brokerage as BROKERAGE_TEXT, minimum as MINIMUM_TEXT };
