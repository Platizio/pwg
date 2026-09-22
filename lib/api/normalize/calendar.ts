import { presentation } from "../../market/universe.ts";
import type { RawCorporateActions } from "../clients/fundamentals.ts";
import type { CalendarEvent } from "@/lib/market/session";

/* Corporate actions as calendar entries.

   The gateway carries no earnings calendar and no macro wire, so the rail's
   key-events card has one dated, per-company source and this is it: dividends
   and splits out of the Polygon-backed reference data.

   A dated event is worth most before it lands, which is why the ordering here
   is not chronological — anything still ahead comes first, and the past is
   only there so the card is never empty out of season.

   Every figure in the prose is read straight off the payload or is arithmetic
   over it. Nothing is estimated, and a field the feed omits produces one
   sentence fewer rather than a guess. */

const DAY_MS = 86_400_000;

const DATE_FMT = new Intl.DateTimeFormat("en-US", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

/* `usd` in lib/market/format.ts fixes two decimals, which would round a
   half-cent distribution into a figure the company never declared. */
const CASH_FMT = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
});

const RATIO_FMT = new Intl.NumberFormat("en-US", { maximumFractionDigits: 4 });

/** Payments a year, as the feed counts them. */
const CADENCE: Record<number, string> = {
  1: "once a year",
  2: "twice a year",
  4: "quarterly",
  12: "monthly",
};

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})/;

/** UTC midnight of a "YYYY-MM-DD" action date, or null when the shape differs. */
function actionDate(value: string | null | undefined): number | null {
  if (!value) return null;
  const m = ISO_DATE.exec(value.trim());
  if (!m) return null;
  const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isFinite(ms) ? ms : null;
}

/* The reader's civil day, not the host's.
 *
 * "Today" was measured against `Math.floor(nowMs / DAY_MS)` — UTC midnight,
 * which is the Render box's day and nobody else's. India is UTC+5:30, so for
 * the five and a half hours after midnight IST the reader's date and the
 * server's disagreed, and the calendar said "Today · Sun, Sep 20" to somebody
 * whose own phone read Monday the 21st. That is a falsehood they can see at a
 * glance, in an h2 and in the section's aria-label.
 *
 * A NAMED zone rather than a resolved one. These components server-render, so
 * there is no reader to resolve; Asia/Kolkata is a literal, which means the
 * build box, Render and the browser all compute the same integer and hydration
 * has nothing to repair. It is the same choice `IST_CLOCK` in
 * lib/market/session.ts already makes for the session pill, for this audience.
 *
 * ET was the other candidate and is wrong for this word. The reader is asking
 * "is this today", about their own day; whether the event falls inside the New
 * York session is a different question, and the prose beside it already
 * answers that one without any day arithmetic. */
const IST_DAY = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Kolkata",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/* Both sides become a day NUMBER before they are subtracted, so the difference
   is whole days by construction. Subtracting instants and rounding is what
   lets a DST shift or a half-hour offset turn a clean day gap into 0.98 of
   one. */
function dayNumber(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d) / DAY_MS;
}

/** Whole days from the reader's today to the action. */
function offsetDays(dateMs: number, nowMs: number): number {
  return Math.round(dateMs / DAY_MS) - dayNumber(IST_DAY.format(nowMs));
}

/* Ten characters by construction, taken from the value actionDate already
   parsed rather than from the raw feed string: ISO_DATE is deliberately
   unanchored, so "2026-09-22T00:00:00Z" is a legal input and passing it
   through would put a full timestamp where a date is promised. */
const isoDay = (ms: number): string => new Date(ms).toISOString().slice(0, 10);

const sentences = (...parts: Array<string | null>) =>
  parts.filter((part): part is string => part !== null).join(" ");

/* Non-dollar distributions are rare but real; showing "$" against a Canadian
   payment would be a lie the reader has no way to catch. */
function cash(amount: number, currency: string | null): string {
  const figure = CASH_FMT.format(amount);
  const code = currency?.trim().toUpperCase();
  return !code || code === "USD" ? `$${figure}` : `${figure} ${code}`;
}

const shares = (n: number) =>
  `${RATIO_FMT.format(n)} ${n === 1 ? "share" : "shares"}`;

type Dividend = NonNullable<RawCorporateActions["dividends"]>[number];
type Split = NonNullable<RawCorporateActions["splits"]>[number];

function dividendEvent(
  ticker: string,
  dividend: Dividend,
  nowMs: number,
): CalendarEvent | null {
  const at = actionDate(dividend.ex_dividend_date);
  const amount = dividend.cash_amount;
  if (at === null || !Number.isFinite(amount) || amount <= 0) return null;

  const paid = actionDate(dividend.pay_date);
  const frequency = dividend.frequency;
  const cadence = frequency ? CADENCE[frequency] : undefined;
  const perShare = cash(amount, dividend.currency);

  return {
    date: isoDay(at),
    offset: offsetDays(at, nowMs),
    time: "Ex-dividend",
    title: `${presentation(ticker).name} · ex-dividend`,
    kind: "corporate",
    ticker,
    summary: sentences(
      `Holders on record before this date receive ${perShare} a share.`,
      paid === null ? null : `Paid ${DATE_FMT.format(paid)}.`,
      cadence === undefined ? null : `The payment runs ${cadence}.`,
    ),
    watch: sentences(
      "Buy on or after this date and the payment belongs to the seller.",
      cadence === undefined || !frequency
        ? null
        : `At this rate the holding yields ${cash(amount * frequency, dividend.currency)} a share a year.`,
    ),
  };
}

function splitEvent(
  ticker: string,
  split: Split,
  nowMs: number,
): CalendarEvent | null {
  const at = actionDate(split.execution_date);
  const from = split.split_from;
  const to = split.split_to;
  if (at === null) return null;
  if (!Number.isFinite(from) || !Number.isFinite(to) || from <= 0 || to <= 0) {
    return null;
  }

  const reverse = to < from;
  const ratio = `${RATIO_FMT.format(to)}-for-${RATIO_FMT.format(from)}`;

  return {
    date: isoDay(at),
    offset: offsetDays(at, nowMs),
    time: reverse ? "Reverse split" : "Split",
    title: `${presentation(ticker).name} · ${ratio} ${reverse ? "reverse split" : "split"}`,
    kind: "corporate",
    ticker,
    /* "Adjusted" rather than "divided": the price falls on a forward split and
       rises on a reverse one, and one sentence has to serve both. */
    summary: `${shares(from)} held ${from === 1 ? "becomes" : "become"} ${RATIO_FMT.format(to)} on this date, with the price adjusted by the same factor.`,
    watch: reverse
      ? "The value of a holding does not change; the share count falls and the quoted price rises to match."
      : "The value of a holding does not change; only the share count and the quoted price do.",
  };
}

/* Ahead of today first and nearest to hand, then the recent past, most recent
   first. Titles break the ties so the order is stable across renders. */
function byRelevance(a: CalendarEvent, b: CalendarEvent): number {
  const aAhead = a.offset >= 0;
  const bAhead = b.offset >= 0;
  if (aAhead !== bAhead) return aAhead ? -1 : 1;
  if (a.offset !== b.offset) return aAhead ? a.offset - b.offset : b.offset - a.offset;
  return a.title < b.title ? -1 : a.title > b.title ? 1 : 0;
}

export function toCalendarEvents(
  perTicker: Array<{ ticker: string; actions: RawCorporateActions }>,
  nowMs: number,
  limit: number,
): CalendarEvent[] {
  const events: CalendarEvent[] = [];
  /* Title and offset are what the rail keys its list on, so a symbol arriving
     twice has to collapse here or React sees two rows with one identity. */
  const seen = new Set<string>();

  for (const { ticker, actions } of perTicker) {
    const built = [
      ...(actions.dividends ?? []).map((d) => dividendEvent(ticker, d, nowMs)),
      ...(actions.splits ?? []).map((s) => splitEvent(ticker, s, nowMs)),
    ];

    for (const event of built) {
      if (event === null) continue;
      const key = `${event.title}|${event.offset}`;
      if (seen.has(key)) continue;
      seen.add(key);
      events.push(event);
    }
  }

  return events.sort(byRelevance).slice(0, Math.max(0, limit));
}
