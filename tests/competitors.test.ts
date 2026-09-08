import assert from "node:assert/strict";
import test from "node:test";

import { competitors } from "../lib/market/instrument-derive.ts";
import type { InstrumentSnapshot, PeerQuote } from "../lib/market/instrument.ts";

/* The peer comparison table.

   Its whole purpose is one column: how this company has done against the
   others, over the same window. That column was measuring two different
   things at once — the subject's row carried a trailing-year return while
   every peer row carried that peer's move since yesterday's close, both
   formatted identically under a header reading "1Y return". Apple at +36.6%
   beside Microsoft at −1.3% is not a comparison, it is two units in one
   column, and the table gives no hint which is which.

   These tests pin the column to a single measure. */

function peer(over: Partial<PeerQuote> = {}): PeerQuote {
  return {
    id: "MSFT",
    name: "Microsoft",
    price: 500,
    chg: -1.3,
    ret1y: 21.4,
    marketCap: 3.7e12,
    pe: 35,
    ...over,
  };
}

function snapshot(over: {
  ret1y?: number | null;
  peers?: PeerQuote[];
}): InstrumentSnapshot {
  return {
    profile: {
      id: "AAPL",
      mark: "A",
      short: "Apple",
      color: "#E5DDD1",
      price: 316,
      marketCap: 4.6e12,
      pe: 36.3,
    },
    returns: { ret1y: over.ret1y ?? 36.6, ret5y: null, cagr5y: null },
    peers: over.peers ?? [peer()],
  } as unknown as InstrumentSnapshot;
}

test("a peer row reports the peer's trailing year, not its move since yesterday", () => {
  const rows = competitors(snapshot({ peers: [peer({ chg: -1.3, ret1y: 21.4 })] }));

  assert.equal(rows[1].ret, "+21.4%");
  assert.notEqual(rows[1].ret, "−1.3%");
});

test("the subject and its peers are measured over the same window", () => {
  const rows = competitors(
    snapshot({ ret1y: 36.6, peers: [peer({ id: "NVDA", chg: -1.25, ret1y: 58.2 })] }),
  );

  assert.equal(rows[0].ret, "+36.6%");
  assert.equal(rows[1].ret, "+58.2%");
});

/* A peer listed since before its history reaches back a year has no trailing
   year to report. returnsFrom refuses to extrapolate one, and the table must
   not quietly substitute the day move to fill the cell. */
test("a peer with no year of history shows a dash rather than its day move", () => {
  const rows = competitors(snapshot({ peers: [peer({ chg: 2.7, ret1y: null })] }));

  assert.equal(rows[1].ret, "—");
});

test("the direction of a peer's year drives its colour, not the direction of its day", () => {
  const rows = competitors(snapshot({ peers: [peer({ chg: 4.0, ret1y: -12.5 })] }));

  assert.equal(rows[1].ret, "−12.5%");
  assert.equal(rows[1].retColor, rows[1].retColor);
  assert.notEqual(
    rows[1].retColor,
    competitors(snapshot({ peers: [peer({ chg: 4.0, ret1y: 12.5 })] }))[1].retColor,
  );
});
