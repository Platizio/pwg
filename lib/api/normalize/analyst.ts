import type { RawAnalystConsensus } from "../clients/analysts.ts";
import type { ApiResult } from "../errors.ts";

/* Analyst consensus → the view the panel renders, written before the door opened.

   Every analyst path on this account answers 403 with code 4031 — ratings,
   forecasts, estimates, targets, earnings, ownership. `fetchAnalystConsensus`
   was written against the vendor catalogue rather than a live body for exactly
   that reason, and this module is written against the same catalogue. Nothing
   below has ever seen a real response. Read the header of
   `lib/api/clients/analysts.ts` before changing anything here; the rest of this
   comment assumes it.

   That single fact sets every rule in the file. A normalizer that has never met
   its input cannot afford a default, because a default is a guess and a guess
   on this page is a published investment figure. So:

     - every field is optional in, and null-or-absent out. Never nought. A
       missing count is not "0 analysts" and a missing target is not a "$0.00
       price target" — the second reads as the most bearish call on the street,
       and it would be one this terminal invented. `toAnalystConsensus` returns
       null rather than an empty husk when there is nothing to say, and the
       panel renders the availability state instead.
     - nothing throws. A partial body, an error envelope, an array, a string,
       a number where an object was promised: all of it resolves to null. This
       is parsed JSON wearing a TypeScript type, and the type was transcribed
       from prose. It has validated nothing.
     - the units this module prints are units this repo computed. See the note
       on upside below.

   The two-sided distinction the panel needs is in `AnalystAvailability`:
   "not entitled" and "no coverage" are different sentences. The first is about
   this account, the second is about this company, and telling a reader that no
   analyst covers Apple because our subscription is short would be a fabricated
   claim about the company. They are separate variants and they stay separate.

   ── WHEN THE 403 LIFTS, RE-CHECK ALL OF THIS AGAINST A REAL BODY ───────────
   The probe's `blocked.analysts` tripwire fails the day the entitlement lands.
   That is the signal to open a real response for a well-covered name (AAPL) and
   a thinly covered one (a small-cap, or an ETF, which likely has no consensus
   at all) and confirm, in this order:

     1. THE ENVELOPE. Does the record sit at the top level, or inside a
        `results` / `data` / `[0]` wrapper the way the polygon and indicator
        endpoints do? Every field read below is read from the top level. If the
        real body nests, EVERY assertion in tests/analyst.test.ts still passes
        and the panel silently reports "no coverage" for every ticker in the
        universe. This is the most likely way this module is wrong.
     2. `price_target_upside`. Fetch one ticker, compute (target/price - 1)*100
        by hand, and compare it with the vendor's number. That settles the unit
        question this module refuses to guess at, and `vendorUpsideUnverified`
        is carried through untouched precisely so the comparison is one log line
        away. Once it is settled, either delete the field or rename it.
     3. THE LABEL SET. `label` is passed through verbatim. Find out whether the
        vendor says "Strong Buy", "STRONG_BUY", "Outperform" or a number, and
        only then decide whether the panel maps it to house vocabulary. Mapping
        a label set we have not seen is how a "Hold" becomes a "Buy".
     4. THE COUNTS. Do buy/hold/sell actually sum to total_analysts in practice?
        Is there a fourth bucket — "strong buy" and "strong sell" split out, or
        an "underperform" — that this three-way split is silently dropping? If
        there is, `total` computed from the sum is short and `totalDisputed`
        will be firing on every ticker; that flag is the canary for it.
     5. THE CURRENCY. See the note on `AnalystTarget.currency`.
     6. NO-COVERAGE VS 404. A ticker nobody covers may come back as a 200 with
        an empty record, or as a 404. Today a 404 is reported as `unavailable`,
        because from here it is indistinguishable from a mistyped path. Once the
        live behaviour is known, a 404 that genuinely means "uncovered" belongs
        in the `no-coverage` branch of `toAnalystAvailability`.
     7. STALENESS. Nothing in the catalogue says when the consensus was struck.
        A price target from fourteen months ago is not a current view, and if
        the live body carries a date it should be surfaced here so the panel can
        say how old the number is. */

/* The guards. All four take `unknown` on purpose: the declared type promises
   `number | null`, and the declared type is a transcription. `"24"` and `{}`
   have to fall out here rather than reach arithmetic, where `"290" / 250`
   would quietly produce a plausible upside. */

/** Finite number, or null. Nought survives — some fields may legitimately be it. */
const num = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

/** A money figure. Nought or negative is a data hole, never a valuation. */
const pos = (v: unknown): number | null => {
  const n = num(v);
  return n === null || n <= 0 ? null : n;
};

/* A headcount. Nought is kept, because "no sell ratings" is a real and useful
   finding and must not be flattened into "we were not told". A negative or
   fractional headcount is not a headcount at all — 8.5 analysts is a parse
   error somewhere upstream, and rounding it would launder the error. */
const count = (v: unknown): number | null => {
  const n = num(v);
  return n === null || n < 0 || !Number.isInteger(n) ? null : n;
};

/** Trimmed, or null. The gateway writes "_" where it holds no value. */
const text = (v: unknown): string | null => {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t === "" || t === "_" ? null : t;
};

/* An ISO 4217 alpha code or nothing. "US Dollar", "$" and "" are not codes the
   panel can format with, and passing one through would put an unrenderable
   token next to a number. */
const currencyCode = (v: unknown): string | null => {
  const t = text(v);
  return t !== null && /^[A-Za-z]{3}$/.test(t) ? t.toUpperCase() : null;
};

export type AnalystRatings = {
  /* The three buckets, as reported. Null means "not told", nought means
     "told: none". The panel must render those differently — a dash and a zero
     bar are different claims about the street. */
  buy: number | null;
  hold: number | null;
  sell: number | null;
  /* The coverage figure this view stands behind. It is the sum of the three
     buckets when all three are present, because that is the number the bars
     the panel draws actually add up to; otherwise it is the vendor's
     total_analysts; otherwise null. */
  total: number | null;
  /** The vendor's `total_analysts`, untouched, for the diff. */
  reportedTotal: number | null;
  /* True when both a full breakdown and a reported total were present and they
     disagreed. See item 4 of the re-check list: if this fires constantly on
     live data, the vendor is bucketing more finely than three ways and this
     view is dropping a bucket. */
  totalDisputed: boolean;
};

export type AnalystTarget = {
  /** The consensus target. Null, never nought. */
  consensus: number | null;
  low: number | null;
  high: number | null;
  /* The currency the three figures above are quoted in, or null when the
     gateway did not say — never defaulted.

     This terminal sells US equities to readers who hold rupees, and a target
     rendered as "$290" when the feed meant ₹290 (or the reverse) is not a
     formatting slip, it is a different investment case by a factor of eighty.
     A null here should make the panel print the bare figure, or withhold it,
     rather than pick a symbol.

     It also bounds `upsidePct` below: that ratio is only meaningful if this
     currency is the same one `currentPrice` was quoted in. Today every price
     in this repo is USD from the same gateway, so they match by construction.
     If a live body ever returns a non-USD code — an ADR, a foreign listing —
     the upside computed here is nonsense and this function needs the price's
     currency passed in alongside the price. */
  currency: string | null;
};

export type AnalystConsensus = {
  /* The vendor's own label — "Strong Buy", "Hold" — verbatim and untranslated.
     See item 3 of the re-check list. */
  label: string | null;
  ratings: AnalystRatings;
  target: AnalystTarget;
  /* Implied upside from `currentPrice` to the consensus target, in percent.

     DERIVED HERE, NOT TAKEN FROM THE FEED. `price_target_upside` is documented
     as this same quantity, but whether it arrives as 12.4 or as 0.124 is
     unknown until the endpoint opens, and the client's own comment says the
     gateway is inconsistent about exactly this: the quotes feed reports a day
     move as a fraction, the fundamentals record reports a dividend yield as
     one, and market cap arrives in millions from one and dollars from the
     other. A hundredfold error in an upside column is invisible on the page —
     "12.4%" and "1,240%" are both just text, and only one of them looks absurd.

     So the figure the panel prints is computed from two numbers whose units
     this repo controls: the target, in whatever currency the gateway quoted,
     and `currentPrice`, which the caller took from the same gateway's quote.
     The arithmetic is a ratio, so the currency cancels as long as the two agree
     — see the note on `AnalystTarget.currency`.

     Null when there is no target, or when the current price is missing or
     non-positive. A price of nought does not make the upside infinite, it makes
     it unknown. */
  upsidePct: number | null;
  /* The vendor's `price_target_upside`, passed through completely untouched and
     UNVERIFIED — no ×100, no ÷100, no clamping. It is carried so that the day
     the 403 lifts one log line settles the unit (item 2 of the re-check list).
     It is deliberately not the field the panel binds to, and the name is meant
     to make binding to it feel wrong. */
  vendorUpsideUnverified: number | null;
};

/* What the panel renders, as one closed union rather than a bag of booleans.

   `not-entitled` and `no-coverage` are the two that must never merge. The first
   is a fact about this account: the endpoint exists, the subscription does not
   reach it, and the honest copy is "not available on this account". The second
   is a fact about this company: we asked with a valid entitlement and the
   street has nothing, and the honest copy is "no analyst coverage". Collapsing
   them prints a claim about a company that nobody made.

   `unavailable` is the third honest answer — a 502, a timeout, a 404 on a path
   that may have moved. "We could not find out" is not "there is nothing to
   find", and it is the state that should invite a retry rather than a shrug.

   No prose lives in these variants on purpose. Wording belongs to the panel,
   which knows its own tone and column width; a normalizer that ships English
   is one the panel has to fight. */
export type AnalystAvailability =
  | { state: "available"; consensus: AnalystConsensus }
  | { state: "not-entitled"; status: number }
  | { state: "no-coverage" }
  | { state: "unavailable"; status: number };

export function toAnalystConsensus(
  raw: RawAnalystConsensus | null | undefined,
  currentPrice: number | null | undefined,
): AnalystConsensus | null {
  /* An array passes `typeof === "object"`, and a body that is an error envelope
     or a bare string reaches here as readily as a record. This one line is what
     makes "does not throw on an unrecognised shape" true rather than hoped for. */
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;

  const label = text(raw.consensus);

  const buy = count(raw.buy);
  const hold = count(raw.hold);
  const sell = count(raw.sell);
  const reportedTotal = count(raw.total_analysts);

  /* Only a complete breakdown can be summed. Adding buy and sell while hold is
     absent produces a smaller, entirely plausible total that silently loses
     every analyst in the missing bucket — a "26 analysts" header over a street
     of 34. An incomplete breakdown therefore checks nothing and reconciles
     nothing; it defers to whatever the vendor reported. */
  const summed = buy !== null && hold !== null && sell !== null ? buy + hold + sell : null;

  /* Where the two disagree, the breakdown wins. It is the defensible choice
     because it is the one the reader can audit: the counts are on the page as
     bars, and a total that does not match the bars beside it is a number with
     no visible provenance. The vendor's figure is kept in `reportedTotal` so
     nothing is lost, and the disagreement is flagged rather than smoothed over. */
  const totalDisputed = summed !== null && reportedTotal !== null && summed !== reportedTotal;
  const total = summed ?? reportedTotal;

  const consensusTarget = pos(raw.price_target);

  /* A range that reads backwards is not repaired by swapping it. Which of the
     two fields is mislabelled cannot be known from here — it could equally be a
     field-order bug upstream or a genuinely bad record — and "$350 – $210" is
     unreadable while a silently reordered range is a fabricated one. Both go,
     and the consensus target stands on its own. */
  let low = pos(raw.low_price_target);
  let high = pos(raw.high_price_target);
  if (low !== null && high !== null && low > high) {
    low = null;
    high = null;
  }

  const price = pos(currentPrice);
  const upsidePct =
    consensusTarget !== null && price !== null ? (consensusTarget / price - 1) * 100 : null;

  /* Coverage, in the only sense that lets a panel open: is there a rating, a
     target, or at least one analyst? A record carrying nothing but a ticker —
     or nothing but `total_analysts: 0`, which says the same thing as silence —
     is not a consensus, and returning a husk of nulls for it would put an empty
     chart and a dash where the availability state belongs. */
  const anyAnalyst = (total ?? 0) > 0 || (buy ?? 0) > 0 || (hold ?? 0) > 0 || (sell ?? 0) > 0;
  if (label === null && consensusTarget === null && low === null && high === null && !anyAnalyst) {
    return null;
  }

  return {
    label,
    ratings: { buy, hold, sell, total, reportedTotal, totalDisputed },
    target: {
      consensus: consensusTarget,
      low,
      high,
      currency: currencyCode(raw.price_target_currency_code),
    },
    upsidePct,
    vendorUpsideUnverified: num(raw.price_target_upside),
  };
}

/** The 403 the whole account currently answers analyst paths with, code 4031. */
const FORBIDDEN = 403;

export function toAnalystAvailability(
  result: ApiResult<RawAnalystConsensus> | null | undefined,
  currentPrice: number | null | undefined,
): AnalystAvailability {
  /* A missing result is a call that never completed — a rejected leg of the
     instrument fan-out, or a branch that was skipped. It is not evidence about
     coverage, so it degrades to the same "we could not find out" as a 502. */
  if (!result || typeof result !== "object" || typeof result.ok !== "boolean") {
    return { state: "unavailable", status: 0 };
  }

  if (!result.ok) {
    /* 403 only. A 401 is a token problem and a 404 is a path problem, and
       neither is an entitlement — reporting either as "not available on this
       account" would send somebody to the provider to buy something they
       already have. Today this is the branch every ticker takes. */
    return result.status === FORBIDDEN
      ? { state: "not-entitled", status: FORBIDDEN }
      : { state: "unavailable", status: num(result.status) ?? 0 };
  }

  /* Entitled and answered. An empty or unreadable record here is the one place
     "no coverage" can honestly be claimed — and note that it also catches a
     body whose envelope we misread, which is item 1 of the re-check list at the
     top of this file. If every ticker reports no coverage on the day the
     entitlement lands, the shape is wrong, not the street. */
  const consensus = toAnalystConsensus(result.data, currentPrice);
  return consensus === null ? { state: "no-coverage" } : { state: "available", consensus };
}
