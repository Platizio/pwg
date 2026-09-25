import test from "node:test";
import assert from "node:assert/strict";

import { returnsOver } from "../lib/api/normalize/returns.ts";
import { toPricePoints, type PricePoint } from "../lib/api/normalize/series.ts";
import type { RawHistoryPoint } from "../lib/api/clients/quotes.ts";
import { rollingPeriods } from "../lib/market/derive-performance.ts";
import { insightCandidates, type InsightInput } from "../lib/market/insights.ts";
import { returns as overviewReturns } from "../lib/market/instrument-derive.ts";
import type { InstrumentSnapshot } from "../lib/market/instrument.ts";
import { throughCardSession } from "../lib/market/prior-close.ts";
import { DIVIDENDS, PEERS, PROFILE, SHORT, daily } from "./insights-fixtures.ts";

/* The daily bars run a session behind the "Previous close" card.
 *
 * Before the bell on 25 Sep 2026 AAPL's bars ended on the 23rd (337.02) while
 * the card held the 24th's official 335.92. The chart and the Performance tab
 * reached the 24th; the Overview's returns and insights did not, so one page
 * printed "1 month +8.6%" and "+8.4%" under the same label, and an insight
 * quoted the 23rd's close beside a card showing the 24th's. */

/* 04:45 in New York on the 25th: pre-market, after the quote's 04:00 roll, so
   its previous close is the 24th's. */
const PRE_25 = Date.UTC(2026, 8, 25, 8, 45);
const MIDNIGHT_24 = Date.parse("2026-09-24T04:00:00Z");

function bar(day: string, price: number): RawHistoryPoint {
  const [y, m, d] = day.split("-");
  const zone = Number(m) >= 3 && Number(m) <= 11 ? "EDT" : "EST";
  return { date: `${m}/${d}/${y} 00:00:00 ${zone}`, price, opening: price, high: price, low: price, volume: 1 };
}

function weekdays(from: string, to: string): RawHistoryPoint[] {
  const out: RawHistoryPoint[] = [];
  let i = 0;
  for (let t = Date.parse(`${from}T12:00:00Z`); t <= Date.parse(`${to}T12:00:00Z`); t += 86_400_000) {
    const wd = new Date(t).getUTCDay();
    if (wd === 0 || wd === 6) continue;
    out.push(bar(new Date(t).toISOString().slice(0, 10), 100 + 20 * Math.sin(i / 7) + i * 0.05));
    i += 1;
  }
  return out;
}

/* ── the bar itself ───────────────────────────────────────────────────── */

test("the card's close is appended as its session's bar", () => {
  const bars = toPricePoints(weekdays("2026-09-01", "2026-09-23"));
  const out = throughCardSession(bars, { asOf: PRE_25, previousClose: 335.92 });
  assert.equal(out.length, bars.length + 1);
  assert.deepEqual(out.at(-1), {
    at: MIDNIGHT_24,
    price: 335.92,
    open: 335.92,
    high: 335.92,
    low: 335.92,
    volume: null,
  });
});

test("a series that already has the session takes the card's figure for its close", () => {
  const bars = toPricePoints([...weekdays("2026-09-01", "2026-09-23"), bar("2026-09-24", 335.5)]);
  const out = throughCardSession(bars, { asOf: PRE_25, previousClose: 335.92 });
  assert.equal(out.length, bars.length);
  assert.equal(out.at(-1)!.price, 335.92);
});

test("no card, or no time on it, leaves the bars alone", () => {
  const bars = toPricePoints(weekdays("2026-09-01", "2026-09-23"));
  assert.equal(throughCardSession(bars, { asOf: null, previousClose: 335.92 }), bars);
  const none: PricePoint[] = [];
  assert.equal(throughCardSession(none, { asOf: PRE_25, previousClose: 335.92 }), none);
});

/* ── the Overview against the Performance tab ─────────────────────────── */

test("the Overview's four returns are the Performance tab's, to the card's session", () => {
  const rows = weekdays("2021-09-24", "2026-09-23");
  const card = 150.25;

  /* What the Performance tab measures: five years through the 24th. */
  const fetched = toPricePoints([...rows, bar("2026-09-24", card)]);
  const perf = new Map(
    rollingPeriods({
      history: { daily: fetched, intraday: [], intradayNote: null },
      market: null,
    } as unknown as InstrumentSnapshot).map((r) => [r.key, r]),
  );

  /* What the page carries: bars to the 23rd, the card, and the year figures
     the server measured through the card's session (instrument.ts). */
  const page = toPricePoints(rows);
  const s = {
    profile: { id: "AAPL", price: card, previousClose: card, asOf: PRE_25 },
    history: { daily: page.slice(-252), intraday: [], intradayNote: null },
    returns: returnsOver(throughCardSession(page, { asOf: PRE_25, previousClose: card })),
    splitsKnown: true,
  } as unknown as InstrumentSnapshot;
  const over = new Map(overviewReturns(s).map((r) => [r.label, r.value]));

  const fmt = (v: number | null) => (v === null ? "—" : `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(1)}%`);
  assert.equal(over.get("1 month"), fmt(perf.get("1m")!.stock));
  assert.equal(over.get("6 months"), fmt(perf.get("6m")!.stock));
  assert.equal(over.get(perf.get("1y")!.label), fmt(perf.get("1y")!.stock));
  assert.equal(over.get(perf.get("5y")!.label), fmt(perf.get("5y")!.stock));
});

/* ── the insights ─────────────────────────────────────────────────────── */

function input(symbol: "AAPL" | "NFLX", withCard: boolean): InsightInput {
  const p = PROFILE[symbol];
  const bars = daily(symbol);
  const card = Number((bars.at(-1)!.price * 0.997).toFixed(2));
  return {
    ticker: symbol,
    daily: withCard ? throughCardSession(bars, { asOf: PRE_25, previousClose: card }) : bars,
    splitsKnown: true,
    market: { symbol: "SPY", daily: daily("SPY") },
    sector: null,
    pe: p.pe,
    evToEbitda: p.evToEbitda,
    peers: PEERS[symbol].map((q) => ({ id: q.id, name: q.name, pe: q.pe })),
    sharesOutstanding: p.sharesOutstanding,
    shortInterest: SHORT[symbol],
    analyst: { state: "not-entitled", status: 403 },
    earnings: null,
    dividends: DIVIDENDS[symbol],
    quoteAsOf: p.asOf,
    now: PRE_25,
  };
}

test("the range insight quotes the card's session and close", () => {
  const got = insightCandidates(input("AAPL", true)).find((i) => i.id === "range");
  assert.ok(got);
  assert.equal(got.asOf, "2026-09-24");
  assert.match(got.body, /on 24 Sep 2026/);
});

test("against SPY, the stock is measured to the last session SPY has", () => {
  /* SPY's bars end on the 23rd; a stock to the 24th beside a fund to the 23rd
     is two windows under one heading. */
  const got = insightCandidates(input("AAPL", true)).find((i) => i.id === "relative");
  const before = insightCandidates(input("AAPL", false)).find((i) => i.id === "relative");
  assert.ok(got && before);
  assert.equal(got.asOf, "2026-09-23");
  assert.equal(got.body, before.body);
});

test("a close-only bar does not cost the volume insight", () => {
  for (const symbol of ["AAPL", "NFLX"] as const) {
    const before = insightCandidates(input(symbol, false)).find((i) => i.id === "volume");
    const after = insightCandidates(input(symbol, true)).find((i) => i.id === "volume");
    assert.ok(before, `${symbol} fixture has a volume insight`);
    assert.deepEqual(after, before, symbol);
  }
});
