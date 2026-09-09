import test from "node:test";
import assert from "node:assert/strict";

import type { Snapshot, SweepRow } from "../lib/api/sweep.ts";
import { hotList, MIN_HOT } from "../lib/market/hot-list.ts";

/* The sweep quotes every tradable symbol — 21,600 of them — to end up with
   about 4,400 that clear the floor, and throws the rest away. Every consumer
   (boards, sectors, search corpus, breadth) reads only the ones that cleared.
   So the frequent sweep can quote just those, and a slower full sweep can
   refresh which ones they are.

   These tests pin the selection and, more importantly, the fallback: if the
   hot list is ever short or empty, the caller MUST go back to sweeping
   everything rather than render a terminal with four names on it. */

function row(over: Partial<SweepRow> & { s: string }): SweepRow {
  return {
    name: over.s,
    /* Comfortably over the floor: $50 × 1,000,000 average shares is $50m of
       typical turnover against a $5m minimum. */
    px: 50,
    chg: 1.5,
    chgKnown: true,
    vol: 900_000,
    avgVol: 1_000_000,
    dollarVol: 45_000_000,
    relVol: 0.9,
    mcap: 1e10,
    pe: 20,
    ex: "NSDQ",
    asOf: 1_000,
    delayed: true,
    ...over,
  };
}

function snapshot(rows: SweepRow[]): Snapshot {
  return { rows, sweptAt: 1_000, requested: rows.length, calls: 1, failedChunks: 0, missing: 0, ms: 1 };
}

/** MIN_HOT eligible rows plus whatever else the case is about. */
function padded(extra: SweepRow[] = []): Snapshot {
  const filler = Array.from({ length: MIN_HOT }, (_, i) => row({ s: `PAD${i}` }));
  return snapshot([...filler, ...extra]);
}

test("keeps the names that clear the floor and drops the ones that do not", () => {
  const hot = hotList(
    padded([
      row({ s: "GOOD" }),
      row({ s: "OTC", ex: "OTCM" }),
      row({ s: "PENNY", px: 0.4 }),
      row({ s: "ILLIQUID", px: 2, avgVol: 100 }),
    ]),
  );

  assert.ok(hot, "a padded snapshot must produce a list");
  assert.ok(hot.includes("GOOD"));
  assert.ok(!hot.includes("OTC"), "off-exchange names are not quotable for the boards");
  assert.ok(!hot.includes("PENNY"), "sub-dollar names are below the floor");
  assert.ok(!hot.includes("ILLIQUID"), "thin names cannot reach a movers board");
});

test("a short list is refused, so the caller falls back to sweeping everything", () => {
  /* The danger this guards: one bad full sweep returns a handful of rows, that
     becomes the hot list, and every sweep for the next hour quotes four
     symbols. A terminal with four names is worse than a slow one. */
  assert.equal(hotList(snapshot([row({ s: "AAPL" }), row({ s: "MSFT" })])), null);
  assert.equal(hotList(snapshot([])), null);
});

test("exactly MIN_HOT is enough; one short is not", () => {
  const atFloor = Array.from({ length: MIN_HOT }, (_, i) => row({ s: `S${i}` }));
  assert.equal(hotList(snapshot(atFloor))?.length, MIN_HOT);
  assert.equal(hotList(snapshot(atFloor.slice(1))), null);
});

test("a name whose quote is days stale is left out, because no board can show it", () => {
  /* The boards filter on `eligible AND current` — a quote more than four days
     behind the sweep cannot describe today's session, so those rows are
     dropped before anything renders. Measured against the live gateway, that
     is roughly 8,000 of 13,368 rows: liquid enough on paper, but dead. Quoting
     them every five minutes buys nothing, which is the whole point of the hot
     list, so it must apply the same two-part filter and not just the first. */
  const FOUR_DAYS = 4 * 86_400_000;
  const hot = hotList(
    snapshot([
      ...Array.from({ length: MIN_HOT }, (_, i) => row({ s: `PAD${i}`, asOf: 1_000 })),
      row({ s: "FRESH", asOf: 1_000 }),
      row({ s: "DEAD", asOf: 1_000 - FOUR_DAYS - 1 }),
    ]),
  );

  assert.ok(hot?.includes("FRESH"));
  assert.ok(!hot?.includes("DEAD"), "a quote older than the floor cannot reach a board");
});

test("symbols come back verbatim and unique, because they are re-quoted by name", () => {
  const hot = hotList(padded([row({ s: "BRK.B" })]));
  assert.ok(hot?.includes("BRK.B"), "a dotted ticker must survive unchanged");
  assert.equal(new Set(hot).size, hot?.length, "a duplicate would waste a slot in every sweep");
});
