import test from "node:test";
import assert from "node:assert/strict";

import {
  calendarReturn,
  calendarWindow,
  easternDay,
  returnsFrom,
} from "../lib/api/normalize/returns.ts";
import { toPricePoints, type PricePoint } from "../lib/api/normalize/series.ts";
import { rollingPeriods } from "../lib/market/derive-performance.ts";
import { returns as overviewReturns } from "../lib/market/instrument-derive.ts";
import type { RawHistoryPoint } from "../lib/api/clients/quotes.ts";
import type { InstrumentSnapshot } from "../lib/market/instrument.ts";

/* A five-year figure struck from a later close than five years back.

   Measured 24 Sep 2026: META's record opens on 24 Sep 2021 (Facebook, 352.96)
   and ends on 23 Sep 2026 (744.10). The 5Y anchor is 23 Sep 2021, whose
   official close was 345.96 (Polygon, under the old ticker FB), so the true
   figure is +115.08% and the page printed +110.82% under "5 years". The
   gateway's window opens on the fetch date and Polygon's lead-in cannot reach
   back for a renamed ticker (Polygon's pre-June-2022 META is an ETF), nor for a
   name whose pre-split gateway prices do not match Polygon's adjusted ones
   (NFLX, IBKR, FAST, NOW). The same week of grace that keeps the figure from
   being a dash made it a shorter window wearing the longer one's label.

   What this pins: where the base is not the anchor's own close, the figure
   says which close it IS — "Since Sep 24, 2021" — on the Overview and the
   Performance tab alike, and the market column beside it is measured over the
   same window as the stock rather than over its own five years. */

const DAY = 86_400_000;

function bar(day: string, price: number): RawHistoryPoint {
  const [y, m, d] = day.split("-");
  const zone = Number(m) >= 3 && Number(m) <= 11 ? "EDT" : "EST";
  return { date: `${m}/${d}/${y} 00:00:00 ${zone}`, price, opening: price, high: price, low: price, volume: 1 };
}

/* Weekdays from `from` to `to` inclusive, a cent apart, so an off-by-one
   session shows up as a different number. */
function weekdays(from: string, to: string, start = 100): RawHistoryPoint[] {
  const out: RawHistoryPoint[] = [];
  let price = start;
  for (let t = Date.parse(`${from}T12:00:00Z`); t <= Date.parse(`${to}T12:00:00Z`); t += DAY) {
    const wd = new Date(t).getUTCDay();
    if (wd === 0 || wd === 6) continue;
    out.push(bar(new Date(t).toISOString().slice(0, 10), price));
    price += 0.01;
  }
  return out;
}

const priceOn = (rows: readonly RawHistoryPoint[], day: string): number => {
  const [y, m, d] = day.split("-");
  const hit = rows.find((r) => r.date.startsWith(`${m}/${d}/${y}`));
  assert.ok(hit, `no bar on ${day}`);
  return hit.price;
};

const pct = (from: number, to: number) => (to / from - 1) * 100;

/* META's shape: the record opens the session after the anchor. */
const late = () => {
  const rows = weekdays("2021-09-24", "2026-09-23");
  rows[0] = { ...rows[0], price: 352.96 };
  rows[rows.length - 1] = { ...rows[rows.length - 1], price: 744.1 };
  return rows;
};

/* AAPL's shape: Polygon's lead-in reaches past the anchor. */
const anchored = () => weekdays("2021-09-14", "2026-09-23");

function snapshotFrom(rows: RawHistoryPoint[], market: PricePoint[] | null = null): InstrumentSnapshot {
  const daily: PricePoint[] = toPricePoints(rows);
  return {
    profile: { id: "META", price: daily.at(-1)!.price, high52: null, beta: null },
    history: { daily, intraday: [], intradayNote: null },
    market: market === null ? null : { symbol: "SPY", daily: market },
    returns: returnsFrom(rows),
    splitsKnown: true,
  } as unknown as InstrumentSnapshot;
}

test("the window says whether its base is the anchor's own close", () => {
  const exact = calendarWindow(toPricePoints(anchored()), 5);
  assert.ok(exact);
  assert.equal(easternDay(exact.from.at), "2021-09-23");
  assert.equal(exact.anchored, true);

  const short = calendarWindow(toPricePoints(late()), 5);
  assert.ok(short, "a record a session short still answers");
  assert.equal(easternDay(short.from.at), "2021-09-24");
  assert.equal(short.anchored, false, "the first close stood in for the anchor's");
});

test("returnsFrom names the close a late five-year figure is struck from", () => {
  const r = returnsFrom(late());
  assert.equal(r.ret5y, pct(352.96, 744.1));
  assert.equal(r.since5y, "2021-09-24");

  const exact = returnsFrom(anchored());
  assert.ok(exact.ret5y !== null);
  assert.equal("since5y" in exact, false, "an exact figure carries no start date");

  // No figure, no date.
  const none = returnsFrom(weekdays("2025-11-03", "2026-09-23"));
  assert.equal(none.ret5y, null);
  assert.equal("since5y" in none, false);
});

test("the Overview labels a late five-year figure with its start date, not '5 years'", () => {
  const labels = overviewReturns(snapshotFrom(late())).map((r) => r.label);
  assert.deepEqual(labels, ["1 month", "6 months", "1 year", "Since Sep 24, 2021"]);

  const exact = overviewReturns(snapshotFrom(anchored())).map((r) => r.label);
  assert.deepEqual(exact, ["1 month", "6 months", "1 year", "5 years"]);
});

test("the Performance tab's row wears the same label, and its market leg covers the same window", () => {
  // The proxy's record reaches well past the anchor, as SPY's does.
  const marketRows = weekdays("2021-09-01", "2026-09-23", 400);
  const market = toPricePoints(marketRows);
  const s = snapshotFrom(late(), market);
  const row = rollingPeriods(s).find((r) => r.key === "5y")!;

  assert.equal(row.label, "Since Sep 24, 2021");
  assert.equal(row.since, "2021-09-24");
  assert.equal(row.label, overviewReturns(s).at(-1)!.label, "one label on both tabs");
  assert.equal(row.stock, s.returns.ret5y);
  assert.equal(
    row.market,
    pct(priceOn(marketRows, "2021-09-24"), priceOn(marketRows, "2026-09-23")),
    "SPY from the stock's own first close, not from its own anchor",
  );
  assert.notEqual(row.market, calendarReturn(market, 5, s.history.daily.at(-1)!.at));

  // The shorter windows are unaffected.
  const labels = rollingPeriods(s).map((r) => r.label);
  assert.deepEqual(labels.slice(0, -1), ["1 month", "3 months", "6 months", "Year to date", "1 year", "3 years"]);
});

test("an exact five-year row is unchanged: '5 years', and the market on its own anchor", () => {
  const marketRows = weekdays("2021-09-01", "2026-09-23", 400);
  const market = toPricePoints(marketRows);
  const s = snapshotFrom(anchored(), market);
  const row = rollingPeriods(s).find((r) => r.key === "5y")!;
  assert.equal(row.label, "5 years");
  assert.equal(row.since, null);
  assert.equal(row.market, calendarReturn(market, 5, s.history.daily.at(-1)!.at));
  assert.equal(row.market, pct(priceOn(marketRows, "2021-09-23"), priceOn(marketRows, "2026-09-23")));
});

test("a one-year record opened a session late is named the same way", () => {
  // Listed (or fetched) a session after the 1Y anchor of 23 Sep 2025.
  const rows = weekdays("2025-09-24", "2026-09-23");
  const s = snapshotFrom(rows);
  assert.equal(s.returns.since1y, "2025-09-24");
  assert.equal("since5y" in s.returns, false, "no five-year figure at all");
  const labels = overviewReturns(s).map((r) => r.label);
  assert.equal(labels[2], "Since Sep 24, 2025");
  const row = rollingPeriods(s).find((r) => r.key === "1y")!;
  assert.equal(row.label, labels[2]);
  assert.equal(row.stock, s.returns.ret1y);

  // And a full year carries no date.
  assert.equal("since1y" in returnsFrom(anchored()), false);
});
