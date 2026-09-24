import test from "node:test";
import assert from "node:assert/strict";
import { settleHistory, withPredecessors, type RawAggBar } from "../lib/api/normalize/daily-bars.ts";
import { PREDECESSORS, predecessorsSince } from "../lib/api/normalize/polygon-ticker.ts";

/* A renamed company's daily bars, spliced from its earlier ticker.
 *
 * Measured 24 Sep 2026 through the gateway's Polygon proxy: "META" before
 * 9 Jun 2022 is the Roundhill ETF (14.91 on 24 Sep 2021), Facebook's bars are
 * under "FB" through 8 Jun 2022 (352.96 on 24 Sep 2021, 196.64 on 8 Jun 2022),
 * and META's own start on 9 Jun 2022 at 184. Fiserv was FI from 7 Jun 2023 to
 * 10 Nov 2025 and FISV either side; FI before that was another company.
 */

const ok = <T>(data: T) => ({ ok: true as const, data, status: 200, ms: 5 });
const failed = { ok: false as const, error: "upstream 502", status: 502, ms: 7 };
/* Polygon's daily stamp: Eastern midnight, 04:00Z in summer, 05:00Z in winter. */
const bar = (day: string, c: number, winter = false): RawAggBar => ({
  t: Date.parse(`${day}T0${winter ? 5 : 4}:00:00Z`),
  o: c,
  h: c,
  l: c,
  c,
  v: 1,
});
const closes = (r: ReturnType<typeof withPredecessors>) =>
  r.ok ? (r.data as { results: RawAggBar[] }).results.map((b) => b.c) : null;

const META_OWN = [bar("2021-09-24", 14.91), bar("2022-01-28", 12.31), bar("2022-06-09", 184), bar("2022-06-10", 175.57)];
const FB = [bar("2021-09-24", 352.96), bar("2022-06-08", 196.64)];

test("the earlier ticker answers for its days and the current ticker's bars there are dropped", () => {
  const r = withPredecessors(ok({ results: META_OWN }), [{ until: "2022-06-08", answer: ok({ results: FB }) }], false);
  assert.deepEqual(closes(r), [352.96, 196.64, 184, 175.57], "no ETF price survives");
});

test("a predecessor with `from` answers only inside its span", () => {
  const own = [bar("2023-06-06", 114.2), bar("2025-11-11", 64.26, true)];
  const fi = [bar("2021-09-24", 2.89), bar("2023-06-07", 115.78), bar("2025-11-10", 63.8, true)];
  const r = withPredecessors(
    ok({ results: own }),
    [{ from: "2023-06-07", until: "2025-11-10", answer: ok({ results: fi }) }],
    true,
  );
  assert.deepEqual(closes(r), [114.2, 115.78, 63.8, 64.26], "the 2021 FI bar is another company and stays out");
});

test("a failed predecessor: the worker gets the failure, a page gets the current ticker's bars as before", () => {
  const own = ok({ results: META_OWN });
  const earlier = [{ until: "2022-06-08", answer: failed }];
  assert.deepEqual(withPredecessors(own, earlier, true), failed);
  assert.equal(withPredecessors(own, earlier, false), own);
});

test("a malformed predecessor answer is a failure for the worker and ignored by a page", () => {
  const own = ok({ results: META_OWN });
  const earlier = [{ until: "2022-06-08", answer: ok({ results: "throttled" }) }];
  const worker = withPredecessors(own, earlier, true);
  assert.equal(worker.ok, false);
  assert.equal(withPredecessors(own, earlier, false), own);
});

test("no predecessors, or a failed own answer, passes through untouched", () => {
  const own = ok({ results: META_OWN });
  assert.equal(withPredecessors(own, [], true), own);
  assert.equal(withPredecessors(failed, [{ until: "2022-06-08", answer: ok({ results: FB }) }], true), failed);
});

test("a range that starts after the rename does not ask for the earlier ticker", () => {
  assert.deepEqual(
    predecessorsSince("META", "2021-09-14").map((p) => p.symbol),
    ["FB"],
  );
  assert.deepEqual(predecessorsSince("META", "2025-09-23"), [], "the one-year range is all META");
  assert.deepEqual(
    predecessorsSince("FISV", "2025-09-23").map((p) => p.symbol),
    ["FI"],
    "the one-year range still reaches Fiserv's FI weeks",
  );
  assert.deepEqual(predecessorsSince("AAPL", "2021-09-14"), []);
  for (const [symbol, list] of Object.entries(PREDECESSORS)) {
    for (const p of list) {
      assert.match(p.until, /^\d{4}-\d{2}-\d{2}$/, symbol);
      if (p.from !== undefined) assert.ok(p.from <= p.until, symbol);
    }
  }
});

test("end to end: META's five years lead in from Facebook's official closes, not the gateway's", () => {
  /* The gateway files Facebook under META from its first row, 24 Sep 2021,
     a session after the five-year anchor. Its closes are not the official
     ones; 196.45 against FB's 196.64 on 8 Jun 2022. */
  const gateway = [
    { date: "09/24/2021 00:00:00 EDT", price: 352.96, opening: 353.4, high: 355, low: 351, volume: 1 },
    { date: "06/08/2022 00:00:00 EDT", price: 196.45, opening: 194.67, high: 202, low: 194, volume: 1 },
    { date: "06/09/2022 00:00:00 EDT", price: 184, opening: 194.28, high: 194.9, low: 183, volume: 1 },
  ];
  const fb = [bar("2021-09-22", 343.21), bar("2021-09-23", 345.96), ...FB];
  const now = Date.parse("2026-09-24T10:00:00Z");
  const spliced = withPredecessors(ok({ results: META_OWN }), [{ until: "2022-06-08", answer: ok({ results: fb }) }], true);
  const r = settleHistory(ok(gateway), spliced, now, true);
  assert.equal(r.ok, true);
  const rows = r.ok ? r.data : [];
  assert.deepEqual(
    rows.map((b) => [b.date.slice(0, 10), b.price]),
    [
      ["09/22/2021", 343.21],
      ["09/23/2021", 345.96],
      ["09/24/2021", 352.96],
      ["06/08/2022", 196.64],
      ["06/09/2022", 184],
      ["06/10/2022", 175.57], // Polygon's newer session; the gateway runs a day behind
    ],
  );
});
