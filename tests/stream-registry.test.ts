import test from "node:test";
import assert from "node:assert/strict";

import { createRegistry } from "../lib/api/stream/registry.ts";
import { MAX_SYMBOLS } from "../lib/api/stream/subscription.ts";
import type { Tick } from "../lib/api/stream/tick.ts";

/* The per-connection filter, edited in place by a second route.
 *
 * The SSE route filters the wildcard feed down to what one reader asked for.
 * That set used to be fixed at the moment the connection opened, so changing
 * it meant a new connection — and a new connection meant a blank map in the
 * browser until its snapshot arrived. Now the set lives here, keyed by a
 * connection id the snapshot frame hands the client, and POST /subscribe edits
 * it while the stream stays up.
 *
 * Injected snapshot and recording send, so the seam between "the set changed"
 * and "the new symbol's last price went out immediately" can be tested without
 * a socket.
 */

const tick = (symbol: string): Tick => ({
  symbol, price: 100, previousClose: 99, change: 1, changePercent: 1.01, volume: 1, at: 1,
});

function harness(known: readonly string[] = []) {
  const sent: { event: string; data: unknown }[] = [];
  const asked: string[][] = [];
  const registry = createRegistry({
    snapshot: (symbols) => {
      asked.push([...symbols]);
      return symbols.filter((s) => known.includes(s)).map(tick);
    },
  });
  const send = (event: string, data: unknown) => {
    sent.push({ event, data });
  };
  return { registry, send, sent, asked };
}

test("register, look up, unregister", () => {
  const { registry, send } = harness();
  const out = registry.register("c1", ["nvda", "aapl", "AAPL"], send);
  assert.deepEqual(out, { want: ["AAPL", "NVDA"], dropped: 0 });
  assert.equal(registry.has("c1"), true);
  assert.equal(registry.size(), 1);
  assert.deepEqual([...registry.wants("c1")!].sort(), ["AAPL", "NVDA"]);

  registry.unregister("c1");
  assert.equal(registry.has("c1"), false);
  assert.equal(registry.size(), 0);
  assert.equal(registry.wants("c1"), null);
});

test("update removes first, then adds, and the live set follows", () => {
  const { registry, send } = harness();
  registry.register("c1", ["AAPL", "NVDA"], send);
  const out = registry.update("c1", ["msft", "tsla"], ["aapl"]);
  assert.deepEqual(out, { ok: true, want: ["MSFT", "NVDA", "TSLA"], dropped: 0 });

  /* What the SSE route reads on every batch. */
  const live = registry.wants("c1")!;
  assert.equal(live.has("AAPL"), false);
  assert.equal(live.has("MSFT"), true);
  assert.equal(live.has("NVDA"), true);
});

test("a symbol named in both lists survives, because removals go first", () => {
  /* Not a contrived body. A navigation tears the outgoing page's surfaces down
     and mounts the incoming page's in one commit, and both pages routinely show
     the same ticker — so the same name arrives in `remove` and in `add`. Adding
     before removing would delete it, the reader would stop receiving a price it
     never stopped displaying, and the frozen cell would be exactly the flicker
     this route exists to remove.

     The provider's own diff is disjoint, but this route takes a body from
     anywhere, and this module is the one that promises the order. */
  const { registry, send, sent, asked } = harness(["AAPL"]);
  registry.register("c1", ["AAPL"], send);

  const out = registry.update("c1", ["aapl"], ["aapl"]);
  assert.deepEqual(out, { ok: true, want: ["AAPL"], dropped: 0 });
  assert.equal(registry.wants("c1")!.has("AAPL"), true);

  /* It was never unsubscribed, so it is not newly added either: no lookup and
     nothing resent to a reader already being sent it. */
  assert.deepEqual(asked, []);
  assert.equal(sent.length, 0);
});

test("a snapshot goes out only for added symbols that have a tick", () => {
  const { registry, send, sent, asked } = harness(["MSFT", "NVDA"]);
  registry.register("c1", ["NVDA"], send);
  assert.equal(sent.length, 0, "registering sends nothing; the route writes its own snapshot");

  registry.update("c1", ["MSFT", "ZZZ"], []);
  assert.deepEqual(sent, [{ event: "snapshot", data: { id: "c1", ticks: [tick("MSFT")], dropped: 0 } }]);
  assert.deepEqual(asked, [["MSFT", "ZZZ"]], "only the newly added names are looked up");

  /* Already subscribed: not looked up, nothing resent. */
  registry.update("c1", ["NVDA"], []);
  /* No last price known: nothing to send. */
  registry.update("c1", ["QQQ"], []);
  assert.equal(sent.length, 1);
  assert.deepEqual(asked, [["MSFT", "ZZZ"], ["QQQ"]]);
});

test("the cap applies to the set as a whole and is reported", () => {
  const { registry, send, sent } = harness(["ZZZZ"]);
  const many = Array.from({ length: MAX_SYMBOLS + 10 }, (_, i) => `S${String(i).padStart(4, "0")}`);
  const reg = registry.register("c1", many, send);
  assert.equal(reg.want.length, MAX_SYMBOLS);
  assert.equal(reg.dropped, 10);

  /* Sorts after every S-name, so it is the one that falls off the end. */
  const upd = registry.update("c1", ["ZZZZ"], []);
  assert.equal(upd.ok, true);
  if (upd.ok) {
    assert.equal(upd.want.length, MAX_SYMBOLS);
    assert.equal(upd.dropped, 1);
  }
  assert.equal(registry.wants("c1")!.has("ZZZZ"), false);
  assert.equal(sent.length, 0, "a symbol that did not land gets no snapshot");
});

test("an unknown connection is refused", () => {
  /* The client treats this as "reconnect": the server restarted, or the POST
     landed on a different instance from the stream. */
  const { registry, sent } = harness(["AAPL"]);
  assert.deepEqual(registry.update("nope", ["AAPL"], []), { ok: false });
  assert.equal(sent.length, 0);
});

test("removing a symbol that was never subscribed is harmless", () => {
  const { registry, send } = harness();
  registry.register("c1", ["AAPL"], send);
  assert.deepEqual(registry.update("c1", [], ["NVDA"]), { ok: true, want: ["AAPL"], dropped: 0 });
});

test("connections are independent", () => {
  const { registry, send, sent } = harness(["AAPL"]);
  registry.register("c1", ["AAPL"], send);
  registry.register("c2", ["NVDA"], send);
  registry.update("c2", ["AAPL"], []);
  assert.equal(registry.wants("c1")!.has("NVDA"), false);
  assert.equal(registry.wants("c2")!.has("AAPL"), true);
  assert.equal(sent.length, 1);
  assert.deepEqual((sent[0].data as { id: string }).id, "c2");
  registry.unregister("c1");
  assert.equal(registry.has("c2"), true);
});
