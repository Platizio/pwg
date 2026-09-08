import { presentation } from "../../market/universe.ts";
import type { RawEquityQuote } from "../clients/quotes.ts";
import type { RawFundamentals } from "../clients/fundamentals.ts";

/* Company identity and key statistics, from two feeds that disagree about units.

   The instrument header and the overview panel read one object, and every
   figure in it comes from one of two endpoints that measure the same
   quantities differently. The quotes feed reports a day move as a fraction and
   a market cap in millions; the fundamentals record reports a dividend yield as
   a fraction and a market cap in dollars. Each of those errors is silent — the
   page still renders, the number is merely wrong by a hundred or a million —
   so the conversions live here and are made exactly once.

   Where a figure has two sources the live one wins, because a header that mixes
   this afternoon's price with last week's ratio invites a reader to compare
   them. Where neither source answers, the field is null. It is never nought: a
   company with no earnings has no price/earnings ratio, and a nought in that
   column reads as a share priced at nothing. */

/** Finite, or null. Zero survives — a flat session and an unsold morning are
    both real readings. */
const num = (v: number | null | undefined): number | null =>
  v == null || !Number.isFinite(v) ? null : v;

/* The two guards below exist because both feeds write nought where they mean
   "no answer", and the reader cannot tell that nought from a measured one.
   `pos` covers quantities that cannot be nought and be real — a price, a share
   count, a valuation multiple. `nonZero` covers the ones that can properly be
   negative but never exactly nought: a loss-making company's earnings, a
   defensive stock's beta, a leverage ratio. Debt-free reads as a dash rather
   than as a nought, which understates a good balance sheet and overstates
   nothing. */
const pos = (v: number | null | undefined): number | null => {
  const n = num(v);
  return n === null || n <= 0 ? null : n;
};

const nonZero = (v: number | null | undefined): number | null => {
  const n = num(v);
  return n === null || n === 0 ? null : n;
};

/** Trimmed, or null. The quotes feed writes "_" where it holds no name. */
const text = (v: string | null | undefined): string | null => {
  const t = v?.trim();
  return !t || t === "_" ? null : t;
};

export type CompanyProfile = {
  id: string;
  /** The full legal name, for the heading. */
  name: string;
  /** The compact name, for the sidebar and the tab strip. */
  short: string;
  /** Single-letter monogram, from the presentation seed. */
  mark: string;
  color: string;
  exchange: string | null;
  sector: string | null;
  about: string | null;
  site: string | null;
  employees: number | null;
  listedOn: string | null;
  price: number | null;
  /** Day change as a PERCENT — the quotes feed's fraction, already ×100. */
  chg: number | null;
  dayHigh: number | null;
  dayLow: number | null;
  open: number | null;
  previousClose: number | null;
  high52: number | null;
  low52: number | null;
  volume: number | null;
  avgVolume: number | null;
  /** Dollars, whichever feed answered. */
  marketCap: number | null;
  pe: number | null;
  eps: number | null;
  beta: number | null;
  priceToBook: number | null;
  priceToSales: number | null;
  /** A PERCENT — the fundamentals ratio's fraction, already ×100. */
  dividendYield: number | null;
  /** Carried in the unit the feed states it in; see the note at the call. */
  returnOnEquity: number | null;
  /** The same: carried in the feed's own unit, unconverted. */
  returnOnAssets: number | null;
  debtToEquity: number | null;
  /** Trailing free cash flow, in the unit the record states; see the note at
      the call. Negative where the company burned cash, which is a reading. */
  freeCashFlow: number | null;
  /** Enterprise value, in the unit the record states; see the note at the
      call. Negative where a company holds more cash than it is worth. */
  enterpriseValue: number | null;
  /** A MULTIPLE (x). */
  evToEbitda: number | null;
  sharesOutstanding: number | null;
  delayed: boolean;
  asOf: number | null;
  /** Peer tickers, in the order the record gives them. */
  peers: string[];
};

export function toCompanyProfile(args: {
  ticker: string;
  quote?: RawEquityQuote;
  fundamentals?: RawFundamentals;
  sector?: string | null;
}): CompanyProfile {
  const id = args.ticker.trim().toUpperCase();

  /* A quote for a symbol the account is not entitled to, or one the gateway
     does not know, carries the shape of a quote and none of the figures.
     Treating it as absent keeps `delayed` from reading as a live price that
     merely happens to be blank. */
  const quote =
    args.quote && !args.quote.notFound && !args.quote.notPermissioned ? args.quote : undefined;

  const company = args.fundamentals?.ticker ?? null;
  const ratios = args.fundamentals?.ratios ?? null;

  const look = presentation(id, text(quote?.companyName) ?? text(company?.name));

  /* closingPrice is today's close once the session has ended, so it stands in
     for a missing last price and never for the previous one. Reporting today's
     close as yesterday's would show a day move of nothing on a day that moved. */
  const price = pos(quote?.lastPrice) ?? pos(quote?.closingPrice);
  const previousClose = pos(quote?.yesterdayClose);

  // The gateway reports the day move as a fraction: -0.0149 means -1.49%.
  const fraction = num(quote?.changePercent);
  const absolute = num(quote?.change);
  const chg =
    fraction !== null
      ? fraction * 100
      : absolute !== null && previousClose !== null
        ? (absolute / previousClose) * 100
        : null;

  // The quotes endpoint counts market cap in millions; the record counts dollars.
  const capMillions = pos(quote?.marketCap);
  const marketCap =
    pos(company?.market_cap) ?? (capMillions === null ? null : capMillions * 1e6);

  /* The quote's yield is already a percent (0.34); the record's is a fraction
     (0.0034). The same company, twice, an order of magnitude apart. */
  const yieldFraction = pos(ratios?.dividend_yield);
  const dividendYield =
    pos(quote?.dividendYield) ?? (yieldFraction === null ? null : yieldFraction * 100);

  const updated = quote?.updateTime ? Date.parse(quote.updateTime) : Number.NaN;

  return {
    id,
    /* The record's name is the registered one and properly cased; the quotes
       feed shouts. Where neither answers, the presentation name — which has
       already had the legal-entity noise trimmed off it — is the heading. */
    name: text(company?.name) ?? look.name,
    short: look.name,
    mark: look.mark,
    color: look.color,
    exchange: text(quote?.exchange) ?? text(company?.primary_exchange),
    // An unclassified name is a fact the panel states, not a gap it fills.
    sector: text(args.sector),
    about: text(company?.description),
    site: text(company?.homepage_url),
    employees: pos(company?.total_employees),
    listedOn: text(company?.list_date),
    price,
    chg,
    dayHigh: pos(quote?.dayHigh),
    dayLow: pos(quote?.dayLow),
    open: pos(quote?.openingPrice),
    previousClose,
    high52: pos(quote?.high52week),
    low52: pos(quote?.low52week),
    volume: num(quote?.volume),
    avgVolume: pos(quote?.averageVolume30) ?? pos(ratios?.average_volume),
    marketCap,
    pe: pos(quote?.priceEarningRatio) ?? pos(ratios?.price_to_earnings),
    eps: nonZero(quote?.trailing12MonthsEps) ?? nonZero(ratios?.earnings_per_share),
    beta: nonZero(quote?.beta),
    priceToBook: pos(ratios?.price_to_book),
    priceToSales: pos(ratios?.price_to_sales),
    dividendYield,
    /* Unconverted, deliberately. The endpoint documents no unit for these two
       and the live values are equally readable as a fraction or a percent.
       Guessing a ×100 here would be the same class of error the conversions
       above exist to remove, so the figure is passed on as it arrived and the
       panel labels it as the feed states it. */
    returnOnEquity: nonZero(ratios?.return_on_equity),
    returnOnAssets: nonZero(ratios?.return_on_assets),
    debtToEquity: nonZero(ratios?.debt_to_equity),
    /* Also unconverted, and for a second reason on top of the one above. The
       record counts its market cap in dollars where the quotes feed counts
       millions, and nothing in the payload or the documentation says which of
       the two these currency figures follow. No live response in this repo
       carries them, so there is nothing to calibrate against either. A guessed
       ×1e6 would be off by a million on the figure a valuation is built from,
       so both are handed on exactly as they arrived and the panel labels them
       as the feed states them.

       Both keep their sign. A company that burned cash has a real, negative
       free cash flow, and one holding more cash than it is worth has a real,
       negative enterprise value; nulling either would hide the reading that
       most deserves to be seen. An exact nought is the feed declining to
       answer, which is why these go through nonZero and not num. */
    freeCashFlow: nonZero(ratios?.free_cash_flow),
    enterpriseValue: nonZero(ratios?.enterprise_value),
    /* A valuation multiple, so `pos` on the same grounds as the price ratios
       above: EV/EBITDA turns negative only because EBITDA did, and a -8x
       landing in a column of 20x and 34x reads as the cheapest company on the
       page when it is the one losing money. */
    evToEbitda: pos(ratios?.ev_to_ebitda),
    sharesOutstanding: pos(company?.share_class_shares_outstanding),
    /* Absent a quote there is nothing live on the page, and the flag that
       claims nothing is the safer default. */
    delayed: quote ? Boolean(quote.delayed) : true,
    asOf: num(updated),
    peers: peersOf(args.fundamentals, id),
  };
}

/** Plain tickers, self excluded, first mention kept. */
function peersOf(fundamentals: RawFundamentals | undefined, id: string): string[] {
  const peers: string[] = [];
  for (const related of fundamentals?.related_companies ?? []) {
    const peer = text(related?.ticker)?.toUpperCase();
    if (!peer || peer === id || peers.includes(peer)) continue;
    peers.push(peer);
  }
  return peers;
}
