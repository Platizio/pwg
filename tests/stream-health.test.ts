import test from "node:test";
import assert from "node:assert/strict";

import { SILENCE_LIMIT_MS, shouldRecycle } from "../lib/api/stream/health.ts";

/* Noticing a connection that is open and dead.
 *
 * Every recovery path in upstream.ts hangs off the socket's `close` event, and
 * ensureConnected short-circuits on readyState === 1. So a connection the
 * gateway accepts and then stops feeding is invisible to all of it: a middlebox
 * dropping the flow without a FIN, a gateway restart, or the ~2h token ageing
 * out while the TCP connection stays up. Worse, the ping handler answers pong,
 * which keeps that dead connection alive indefinitely.
 *
 * `lastTickAt` exists but nothing reads it, and it is the wrong signal anyway:
 * it only advances on a USABLE tick, so a genuinely quiet market would look
 * identical to a dead socket. The right signal is any frame at all — a ping
 * proves the connection is alive even when nothing is trading.
 *
 * And the whole check must be gated on prices actually moving. Recycling a
 * healthy socket every 90 seconds all weekend would be an outage we caused.
 */

const NOW = 1_760_000_000_000;
const base = {
  lastFrameAt: NOW - 10_000,
  openedAt: NOW - 600_000,
  now: NOW,
  listeners: 1,
  pricesMove: true,
};

test("a socket that has said nothing for longer than the limit is recycled", () => {
  assert.equal(shouldRecycle({ ...base, lastFrameAt: NOW - SILENCE_LIMIT_MS - 1 }), true);
});

test("a socket that spoke recently is left alone", () => {
  /* The gateway pings roughly every thirty seconds, so ordinary silence is
     well inside the limit. */
  assert.equal(shouldRecycle({ ...base, lastFrameAt: NOW - 30_000 }), false);
  assert.equal(shouldRecycle({ ...base, lastFrameAt: NOW - SILENCE_LIMIT_MS }), false);
});

test("a socket that opened and never spoke at all is recycled", () => {
  /* The handshake completed and the subscription was never answered — the
     shape a refused-but-not-closed connection leaves behind. */
  assert.equal(
    shouldRecycle({ ...base, lastFrameAt: null, openedAt: NOW - SILENCE_LIMIT_MS - 1 }),
    true,
  );
  assert.equal(
    shouldRecycle({ ...base, lastFrameAt: null, openedAt: NOW - 5_000 }),
    false,
    "a socket that opened a moment ago has not had time to speak",
  );
});

test("nothing is recycled while the market is shut", () => {
  /* Silence is the correct state overnight. Recycling every 90 seconds all
     weekend would be an outage of our own making, and against a gateway that
     allows one connection it would be a self-inflicted lockout. */
  assert.equal(shouldRecycle({ ...base, lastFrameAt: NOW - 3_600_000, pricesMove: false }), false);
});

test("nothing is recycled when nobody is reading", () => {
  /* With no listeners the idle close already owns the socket's lifetime, and
     racing it would drop a connection we cannot be sure of getting back. */
  assert.equal(shouldRecycle({ ...base, lastFrameAt: NOW - 3_600_000, listeners: 0 }), false);
});

test("with no socket there is nothing to recycle", () => {
  assert.equal(shouldRecycle({ ...base, lastFrameAt: null, openedAt: null }), false);
});

test("the limit is comfortably longer than the gateway's ping cadence", () => {
  /* Measured: 4 pings in a 120s sample, so about every 30s. A limit close to
     that would recycle healthy connections on ordinary jitter. */
  assert.ok(SILENCE_LIMIT_MS >= 60_000, "too tight - healthy sockets would be killed");
  assert.ok(SILENCE_LIMIT_MS <= 300_000, "too loose - a dead feed would go unnoticed for minutes");
});
