import test from "node:test";
import assert from "node:assert/strict";

import {
  calendarReturn,
  calendarWindow,
  easternDay,
  returnsFrom,
  shiftYears,
} from "../lib/api/normalize/returns.ts";
import { toPricePoints, type PricePoint } from "../lib/api/normalize/series.ts";
import { rollingPeriods } from "../lib/market/derive-performance.ts";
import { returns as overviewReturns } from "../lib/market/instrument-derive.ts";
import type { RawHistoryPoint } from "../lib/api/clients/quotes.ts";
import type { InstrumentSnapshot } from "../lib/market/instrument.ts";

/* 1Y and 5Y, one definition, two tabs.

   The Overview printed `returnsFrom`'s trailing year (the close NEAREST a year
   of milliseconds back) and the Performance tab printed `periodReturn(pts,
   252)` (whatever sat 252 bars back). Two numbers under one label on one page.
   Both now read `calendarReturn`: the latest close against the last close on
   or before the same calendar date one year (five years) earlier. */

const DAY = 86_400_000;

/* Daily bars exactly as the feed stamps them: Eastern midnight. */
function bar(day: string, price: number): RawHistoryPoint {
  const [y, m, d] = day.split("-");
  const zone = Number(m) >= 3 && Number(m) <= 11 ? "EDT" : "EST";
  return { date: `${m}/${d}/${y} 00:00:00 ${zone}`, price, opening: price, high: price, low: price, volume: 1 };
}

/* Weekdays from `from` to `to` inclusive, price rising a cent a session so
   every date has a distinct close and an off-by-one shows up as a number. */
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

test("the exchange's day of a bar is its Eastern date, whatever the host's zone", () => {
  const [p] = toPricePoints([bar("2026-09-23", 337.02)]);
  assert.equal(easternDay(p.at), "2026-09-23");
  // A winter bar, stamped EST.
  const [w] = toPricePoints([bar("2026-01-20", 243.42)]);
  assert.equal(easternDay(w.at), "2026-01-20");
});

test("a calendar year back lands on the same date, and 29 February on the 28th", () => {
  assert.equal(shiftYears("2026-09-23", -1), "2025-09-23");
  assert.equal(shiftYears("2026-09-23", -5), "2021-09-23");
  assert.equal(shiftYears("2028-02-29", -1), "2027-02-28");
  assert.equal(shiftYears("2028-02-29", -4), "2024-02-29");
});

test("1Y is the latest close against the last close on or before the same date a year earlier", () => {
  /* The shape measured on 24 Sep 2026: the last completed session is Wed 23
     Sep, so the anchor is Tue 23 Sep 2025 and that session's close is the base. */
  const rows = weekdays("2021-09-24", "2026-09-23");
  const pts = toPricePoints(rows);
  const w = calendarWindow(pts, 1);
  assert.ok(w);
  assert.equal(easternDay(w.to.at), "2026-09-23");
  assert.equal(easternDay(w.from.at), "2025-09-23");
  const expected = pct(priceOn(rows, "2025-09-23"), priceOn(rows, "2026-09-23"));
  assert.equal(calendarReturn(pts, 1), expected);
});

test("an anchor on a weekend takes the Friday before it, never the Monday after", () => {
  // Last close Mon 21 Sep 2026; a year earlier is Sun 21 Sep 2025.
  const rows = weekdays("2021-09-01", "2026-09-21");
  const pts = toPricePoints(rows);
  const w = calendarWindow(pts, 1);
  assert.ok(w);
  assert.equal(easternDay(w.from.at), "2025-09-19", "Friday's close, the last on or before Sunday");
});

test("a holiday anchor takes the session before it", () => {
  // 4 Jul 2025 was a Friday and a holiday: the feed has no bar that day.
  const rows = weekdays("2021-06-01", "2026-07-06").filter((r) => !r.date.startsWith("07/04/2025"));
  const pts = toPricePoints(rows);
  const end = Date.parse("2026-07-04T16:00:00Z");
  const w = calendarWindow(pts, 1, end);
  assert.ok(w);
  assert.equal(easternDay(w.to.at), "2026-07-03");
  assert.equal(easternDay(w.from.at), "2025-07-03");
});

test("5Y reaches back five calendar years — and the feed's window opening a day late is not a dash", () => {
  /* Measured 24 Sep 2026: every five-year series (AAPL, MSFT, NVDA, SPY, META,
     JPM) starts on 24 Sep 2021, one day after the 5Y anchor for a last close
     of 23 Sep 2026. The feed opens its window on the FETCH date and the last
     close is always at least a session older, so a strict anchor would print
     a dash for every company on every day. The first close is taken while it
     sits within a week of the anchor. */
  const rows = weekdays("2021-09-24", "2026-09-23");
  const pts = toPricePoints(rows);
  const w = calendarWindow(pts, 5);
  assert.ok(w, "the record reaches the anchor within the week's grace");
  assert.equal(easternDay(w.from.at), "2021-09-24");
  assert.equal(w.anchored, false, "and says its base is a stand-in, so the label can too");
  assert.equal(calendarReturn(pts, 5), pct(rows[0].price, rows.at(-1)!.price));
});

test("a record that starts well after the anchor has no figure, rather than a shorter one", () => {
  const pts = toPricePoints(weekdays("2025-11-01", "2026-09-23"));
  assert.equal(calendarReturn(pts, 1), null, "ten months is not a year");
  assert.equal(calendarReturn(pts, 5), null);
  assert.equal(calendarReturn([], 1), null);
});

test("returnsFrom — which builds returns.json and the snapshot — uses the same anchor", () => {
  const rows = weekdays("2021-09-24", "2026-09-23");
  const r = returnsFrom(rows);
  assert.equal(r.ret1y, pct(priceOn(rows, "2025-09-23"), priceOn(rows, "2026-09-23")));
  assert.equal(r.ret5y, pct(rows[0].price, rows.at(-1)!.price));
  // The compound rate is struck over the span the cumulative figure covers.
  const pts = toPricePoints(rows);
  const years = (pts.at(-1)!.at - pts[0].at) / (365.25 * DAY);
  assert.ok(r.cagr5y !== null);
  assert.ok(Math.abs(r.cagr5y - ((rows.at(-1)!.price / rows[0].price) ** (1 / years) - 1) * 100) < 1e-9);
});

/* The regression this file exists for: two tabs, one label, two numbers. */
function snapshotFrom(rows: RawHistoryPoint[]): InstrumentSnapshot {
  const daily: PricePoint[] = toPricePoints(rows);
  return {
    profile: { id: "AAPL", price: daily.at(-1)!.price, high52: null, beta: null },
    history: { daily, intraday: [], intradayNote: null },
    market: null,
    returns: returnsFrom(rows),
    splitsKnown: true,
  } as unknown as InstrumentSnapshot;
}

test("the Overview's Price return and the Performance tab print the same 1Y and 5Y", () => {
  /* A bumpy series, so "252 bars back" and "a calendar year back" land on
     different closes and the old pair would have disagreed. */
  const rows = weekdays("2021-09-24", "2026-09-23").map((r, i) => ({
    ...r,
    price: 100 + 20 * Math.sin(i / 7) + i * 0.05,
  }));
  const s = snapshotFrom(rows);
  const perf = new Map(rollingPeriods(s).map((r) => [r.key, r]));
  const over = new Map(overviewReturns(s).map((r) => [r.label, r.value]));

  assert.equal(perf.get("1y")!.stock, s.returns.ret1y);
  assert.equal(perf.get("5y")!.stock, s.returns.ret5y);

  const fmt = (v: number | null) => (v === null ? "—" : `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(1)}%`);
  assert.equal(over.get("1 year"), fmt(perf.get("1y")!.stock));
  /* This record opens a session after the 5Y anchor, so both tabs name the
     row by its first close rather than "5 years" (tests/five-year-base.test.ts)
     — and name it the same way. */
  assert.equal(perf.get("5y")!.label, "Since Sep 24, 2021");
  assert.equal(over.get(perf.get("5y")!.label), fmt(perf.get("5y")!.stock));

  // And the old index lookback would NOT have agreed on this series.
  const pts = s.history.daily;
  const byIndex = pct(pts[pts.length - 1 - 252].price, pts.at(-1)!.price);
  assert.notEqual(byIndex.toFixed(1), s.returns.ret1y!.toFixed(1));
});

test("the year rows are calendar boundaries, so they claim no session count", () => {
  const s = snapshotFrom(weekdays("2021-09-24", "2026-09-23"));
  for (const row of rollingPeriods(s)) {
    if (row.key === "1y" || row.key === "3y" || row.key === "5y") assert.equal(row.sessions, null);
  }
});

test("the market leg is struck to the subject's last close, not its own", () => {
  const rows = weekdays("2021-09-24", "2026-09-23");
  // The proxy has one more session than the subject.
  const market = toPricePoints(weekdays("2021-09-24", "2026-09-24", 400));
  const s = { ...snapshotFrom(rows), market: { symbol: "SPY", daily: market } } as InstrumentSnapshot;
  const row = rollingPeriods(s).find((r) => r.key === "1y")!;
  const end = s.history.daily.at(-1)!.at;
  assert.equal(row.market, calendarReturn(market, 1, end));
  assert.notEqual(row.market, calendarReturn(market, 1));
});

test("a repaired split restates the whole bar, not only its close", async () => {
  /* The 52-week range and the ATR read a bar's high and low. A repair that
     halved the close and left the wick at the old share count put the high at
     twice the close — a 52-week high the stock never traded at. */
  const { repairSplitBreaks } = await import("../lib/api/normalize/returns.ts");
  const rows: RawHistoryPoint[] = [
    { date: "03/02/2026 00:00:00 EST", price: 240, opening: 238, high: 244, low: 236, volume: 10 },
    { date: "03/03/2026 00:00:00 EST", price: 121, opening: 120, high: 122, low: 119, volume: 20 },
  ];
  const [before, after] = repairSplitBreaks(rows, [{ execution_date: "2026-03-03", split_from: 1, split_to: 2 }]);
  assert.equal(before.price, 120);
  assert.equal(before.opening, 119);
  assert.equal(before.high, 122);
  assert.equal(before.low, 118);
  assert.deepEqual(after, rows[1], "the bar after the split is untouched");
});
