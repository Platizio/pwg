import test from "node:test";
import assert from "node:assert/strict";

import { liveness, livenessText } from "../lib/market/liveness.ts";
import { TICK_MAX_AGE_MS, type Tick } from "../lib/api/stream/tick.ts";

/* What the reader is told about the number in front of them.

   The failure this exists to prevent is on record in upstream.ts: the gateway
   was refusing every subscription, the socket stayed dutifully "connected", and
   the terminal served REST snapshots "looking exactly like a live page on a
   quiet day". The server-side half of that was fixed. This is the reader's
   half — and it must never claim live for a number that is not.

   The same predicate decides the badge AND whether the tick is used as the
   price, so the two cannot disagree. A test that pins them apart would be
   pinning a bug. */

function tick(at: number): Tick {
  return {
    symbol: "AAPL",
    price: 187.4,
    previousClose: 185,
    change: 2.4,
    changePercent: 1.3,
    volume: 1_000,
    at,
  };
}

const NOW = 1_760_000_000_000;

test("a fresh tick while the market moves is live", () => {
  assert.equal(liveness(tick(NOW - 1_000), "open", NOW).state, "live");
  assert.equal(liveness(tick(NOW - 1_000), "pre-market", NOW).state, "live");
  assert.equal(liveness(tick(NOW - 1_000), "post-market", NOW).state, "live");
});

test("no tick at all, while prices are moving, is delayed — not live", () => {
  /* The exact shape of the outage: market open, feed dead, page showing the
     REST snapshot. Saying anything but "delayed" here is the bug. */
  assert.equal(liveness(null, "open", NOW).state, "delayed");
  assert.equal(liveness(null, "pre-market", NOW).state, "delayed");
});

test("a tick that has gone stale stops being live, without any new data", () => {
  /* The client buffer never expires what it holds, so a dead feed leaves the
     last tick sitting there. Time alone has to be enough to demote it —
     otherwise the badge says live forever over a frozen price. */
  const old = tick(NOW - TICK_MAX_AGE_MS - 1);
  assert.equal(liveness(old, "open", NOW).state, "delayed");
});

test("a tick exactly at the age limit is still live; one millisecond past is not", () => {
  assert.equal(liveness(tick(NOW - TICK_MAX_AGE_MS), "open", NOW).state, "live");
  assert.equal(liveness(tick(NOW - TICK_MAX_AGE_MS - 1), "open", NOW).state, "delayed");
});

test("outside trading hours nothing is delayed, because nothing is moving", () => {
  /* "Delayed" over a shut market is a lie in the other direction: it implies
     numbers exist that we are behind on. They do not. */
  assert.equal(liveness(null, "closed", NOW).state, "idle");
  assert.equal(liveness(tick(NOW - TICK_MAX_AGE_MS - 1), "closed", NOW).state, "idle");
  assert.equal(liveness(null, "halted", NOW).state, "idle");
});

test("a fresh tick still reads live even when the session says closed", () => {
  /* If the feed is genuinely printing, the tape is the better witness than the
     calendar — a holiday the committed list missed, or an extended session.
     Trust the data over the clock. */
  assert.equal(liveness(tick(NOW - 1_000), "closed", NOW).state, "live");
});

test("a tick stamped in the future is not trusted", () => {
  /* Clock skew between the gateway and this box. A tick from ten minutes in the
     future would otherwise stay "live" for ten minutes after the feed died. */
  assert.equal(liveness(tick(NOW + 10 * 60_000), "open", NOW).state, "delayed");
});

test("reports the age so the reader can be told how old the number is", () => {
  assert.equal(liveness(tick(NOW - 4_000), "open", NOW).ageMs, 4_000);
  assert.equal(liveness(null, "open", NOW).ageMs, null);
});

/* The words themselves. Pinned here rather than eyeballed in a browser: two of
   the three states only appear while a market is trading, so a visual check
   outside those hours can only ever confirm the one that is least interesting. */

test("the badge names the feed's state, and the phase only when it adds something", () => {
  /* Regular session: "Live · Market" spends a word to say what "Live" said. */
  assert.equal(livenessText("live", "open", "Market"), "Live");
  assert.equal(livenessText("delayed", "open", "Market"), "Delayed");

  /* Extended hours: which book is printing is real information. */
  assert.equal(livenessText("live", "pre-market", "Pre-market"), "Live · Pre-market");
  assert.equal(livenessText("delayed", "post-market", "Post-market"), "Delayed · Post-market");
});

test("when nothing is moving the phase is the whole message", () => {
  /* Never "Delayed · Market closed" — nothing is being delayed. */
  assert.equal(livenessText("idle", "closed", "Market closed"), "Market closed");
  assert.equal(livenessText("idle", "halted", "Trading halted"), "Trading halted");
});

test("the badge never says Live unless liveness said so", () => {
  /* The pairing that matters: one predicate feeds both, so walking every state
     through both functions must never produce "Live" over a non-live tick. */
  const NOW2 = 1_760_000_000_000;
  const stale = tick(NOW2 - TICK_MAX_AGE_MS - 1);
  for (const phase of ["open", "pre-market", "post-market", "closed", "halted"] as const) {
    const state = liveness(stale, phase, NOW2).state;
    assert.notEqual(state, "live", `stale tick read live in ${phase}`);
    assert.ok(!livenessText(state, phase, "x").startsWith("Live"), `badge said Live in ${phase}`);
  }
});
