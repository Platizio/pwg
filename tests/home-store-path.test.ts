import test from "node:test";
import assert from "node:assert/strict";

import { homeInputsFrom } from "../lib/market/home-inputs.ts";
import type { RawEquityQuote } from "../lib/api/clients/quotes.ts";

/* The seam between the store and the dashboard.
 *
 * getHomeSnapshot used to open with a five-way fan-out at the gateway and it
 * now opens with one `market_home` call, but everything below that point — the
 * boards, the breadth sample, the sector coverage floor, the search corpus, the
 * fault list — is unchanged and expects exactly the five values that fan-out
 * produced. This file is where the translation between the two is checked,
 * because the translation is the only new thing and it is the one place a
 * mistake would be silent: a mislaid `chgKnown` renders a dash, a week map keyed
 * a column out of step renders a plausible wrong percentage, and neither throws.
 *
 * Everything the store hands back has been through Postgres and PostgREST since
 * this process last saw it, so the payload is `unknown` by the time it gets here
 * and every case below feeds it something a healthy store would never produce.
 * The rule these assert is the rule fromStored already keeps next door: a
 * malformed record degrades to nothing and the caller falls back, because a
 * throw takes down a render the gateway path would have survived.
 */

const DAY = 86_400_000;
/** 21 August 2026, 16:00 in New York: the close. */
const NOW = Date.UTC(2026, 7, 21, 20, 0, 0);

/** The gateway's daily-history date format, for a bar that many days back. */
function feedDate(daysAgo: number): string {
  const d = new Date(NOW - daysAgo * DAY);
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${mm}/${dd}/${d.getUTCFullYear()} 16:00:00 EDT`;
}

/** A bar, in the shape market_home slices out of the stored columns. */
const bar = (daysAgo: number, price: number) => ({
  date: feedDate(daysAgo),
  price,
  opening: null,
  high: null,
  low: null,
  volume: null,
});

const ROW = {
  s: "AAPL",
  name: "Apple Inc",
  px: 232.5,
  chg: -1.42,
  chgKnown: true,
  vol: 41_000_000,
  avgVol: 55_000_000,
  dollarVol: 9_532_500_000,
  relVol: 0.745,
  mcap: 3_450_000_000_000,
  pe: 34.2,
  ex: "NSDQ",
  asOf: NOW - 60_000,
  delayed: true,
};

const STRIP_QUOTE = {
  symbol: "XLK",
  companyName: "Technology Select Sector SPDR",
  changePercent: 0.0081,
  lastPrice: 261.4,
  delayed: true,
} as unknown as RawEquityQuote;

const ETFS = ["XLK", "XLF", "XLE"];

test("a sweep row survives the round trip with every field intact", () => {
  const inputs = homeInputsFrom(
    { sweptAt: NOW - 120_000, rows: [ROW], strip: [], weekBars: {}, wire: [], calendar: [] },
    ETFS,
    NOW,
  );

  assert.equal(inputs.snapshot.rows.length, 1);
  assert.deepEqual(inputs.snapshot.rows[0], ROW);
  assert.equal(inputs.snapshot.sweptAt, NOW - 120_000);
  assert.equal(inputs.undated, false);
});

test("the sweep's call counters are honest zeros rather than the gateway's", () => {
  const inputs = homeInputsFrom(
    { sweptAt: NOW, rows: [ROW], strip: [], weekBars: {}, wire: [], calendar: [] },
    ETFS,
    NOW,
  );

  /* Nothing was chunked and nothing failed, so `failedChunks` of `calls` is not
     a shortfall the fault list should report. The old arithmetic would have
     made one up. */
  assert.equal(inputs.snapshot.calls, 0);
  assert.equal(inputs.snapshot.failedChunks, 0);
  assert.equal(inputs.snapshot.missing, 0);
  assert.equal(inputs.snapshot.requested, 1);
});

test("a row missing a price, or no row at all, is dropped rather than thrown on", () => {
  const inputs = homeInputsFrom(
    {
      sweptAt: NOW,
      rows: [ROW, null, { ...ROW, s: "NOPX", px: null }, { ...ROW, s: "" }, "MSFT"],
      strip: [],
      weekBars: {},
      wire: [],
      calendar: [],
    },
    ETFS,
    NOW,
  );

  assert.deepEqual(
    inputs.snapshot.rows.map((r) => r.s),
    ["AAPL"],
  );
});

test("an undated sweep says so and dates itself now, so the boards still rank", () => {
  const inputs = homeInputsFrom(
    { sweptAt: null, rows: [ROW], strip: [], weekBars: {}, wire: [], calendar: [] },
    ETFS,
    NOW,
  );

  assert.equal(inputs.undated, true);
  assert.equal(inputs.snapshot.sweptAt, NOW);
});

test("the week map is built from the columnar bars, five sessions back", () => {
  const inputs = homeInputsFrom(
    {
      sweptAt: NOW,
      rows: [],
      strip: [],
      weekBars: {
        /* Eleven bars is what market_home slices; the figure is the last
           against the one five sessions earlier, not against the first. */
        XLK: [
          bar(10, 100),
          bar(9, 101),
          bar(8, 102),
          bar(7, 103),
          bar(6, 104),
          bar(5, 200),
          bar(4, 205),
          bar(3, 210),
          bar(2, 215),
          bar(1, 218),
          bar(0, 220),
        ],
      },
      wire: [],
      calendar: [],
    },
    ETFS,
    NOW,
  );

  /* 220 against the close five sessions back, 200 — not against the first bar
     in the slice, which would read +120%. */
  assert.ok(Math.abs((inputs.weekByEtf.get("XLK") ?? 0) - 10) < 1e-9);
  /* Two funds have nothing stored, which is the same shortfall the gateway
     path reported when two history calls came back not-ok. */
  assert.equal(inputs.weekByEtf.get("XLF"), null);
  assert.equal(inputs.weekFailed, 2);
});

test("a fund with too few bars to measure five sessions reports no week, not a wrong one", () => {
  const inputs = homeInputsFrom(
    {
      sweptAt: NOW,
      rows: [],
      strip: [],
      weekBars: { XLK: [bar(2, 100), bar(1, 105), bar(0, 110)], XLF: "not an array" },
      wire: [],
      calendar: [],
    },
    ETFS,
    NOW,
  );

  assert.equal(inputs.weekByEtf.get("XLK"), null);
  /* The bars arrived, so this is not a shortfall — the series is simply too
     short to answer. XLF and XLE are. */
  assert.equal(inputs.weekFailed, 2);
});

test("the strip keeps the quotes it was given and drops what is not one", () => {
  const inputs = homeInputsFrom(
    {
      sweptAt: NOW,
      rows: [],
      /* `raw` is `jsonb not null`, which a JSON null satisfies — the worker
         writes one for a symbol it could not quote. */
      strip: [STRIP_QUOTE, null, { companyName: "no symbol" }],
      weekBars: {},
      wire: [],
      calendar: [],
    },
    ETFS,
    NOW,
  );

  assert.equal(inputs.strip.length, 1);
  assert.equal(inputs.strip[0].symbol, "XLK");
  assert.equal(inputs.strip[0].changePercent, 0.0081);
});

test("wire entries keep their tickers, and a null news list answers without items", () => {
  const news = [{ id: "n1", published_utc: "2026-08-21T12:00:00Z", title: "Apple" }];
  const inputs = homeInputsFrom(
    {
      sweptAt: NOW,
      rows: [],
      strip: [],
      weekBars: {},
      /* A fundamentals document carrying `ticker_news: null` is a real answer
         about a company with no news, and market_home passes the null through.
         It counts as answered and contributes nothing. */
      wire: [
        { ticker: "AAPL", news },
        { ticker: "MSFT", news: null },
        { ticker: "", news },
        null,
      ],
      calendar: [],
    },
    ETFS,
    NOW,
  );

  assert.deepEqual(
    inputs.wire.map((w) => w.ticker),
    ["AAPL"],
  );
  assert.deepEqual(inputs.wire[0].news, news);
  assert.equal(inputs.wireAnswered, 2);
});

test("calendar entries keep their tickers and their actions document", () => {
  const actions = { status: "OK", dividends: [], splits: [] };
  const inputs = homeInputsFrom(
    {
      sweptAt: NOW,
      rows: [],
      strip: [],
      weekBars: {},
      wire: [],
      calendar: [
        { ticker: "AAPL", actions },
        { ticker: "MSFT", actions: null },
        { ticker: "NVDA", actions: "not a document" },
      ],
    },
    ETFS,
    NOW,
  );

  assert.deepEqual(
    inputs.calendar.map((c) => c.ticker),
    ["AAPL"],
  );
  assert.deepEqual(inputs.calendar[0].actions, actions);
  /* Answered counts the tickers the store had a row for; the two that came
     back unreadable are not answers. */
  assert.equal(inputs.calendarAnswered, 1);
});

test("an absent, empty or half-built payload degrades to nothing", () => {
  for (const payload of [null, undefined, {}, [], "market_home", { rows: "nope" }]) {
    const inputs = homeInputsFrom(payload, ETFS, NOW);
    assert.deepEqual(inputs.snapshot.rows, []);
    assert.deepEqual(inputs.strip, []);
    assert.deepEqual(inputs.wire, []);
    assert.deepEqual(inputs.calendar, []);
    assert.equal(inputs.weekFailed, ETFS.length);
    assert.equal(inputs.wireAnswered, 0);
    assert.equal(inputs.calendarAnswered, 0);
    assert.equal(inputs.undated, true);
    assert.equal(inputs.snapshot.sweptAt, NOW);
  }
});
