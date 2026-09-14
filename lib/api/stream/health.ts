/**
 * Noticing a market feed that is open and dead.
 *
 * WHY THIS EXISTS
 *
 * Every recovery path in upstream.ts hangs off the socket's `close` event, and
 * `ensureConnected` short-circuits on `readyState === 1`. So a connection the
 * gateway accepts and then stops feeding is invisible to all of it — and there
 * are at least three ordinary ways to reach that state: a middlebox dropping
 * the flow without sending a FIN, a gateway restart, and the roughly two-hour
 * token ageing out while the TCP connection stays up.
 *
 * Worse than invisible: the ping handler answers pong, so this process actively
 * keeps a dead connection alive, and because the gateway allows exactly one
 * connection per account, that dead socket is also the thing locking out the
 * healthy one we would otherwise open.
 *
 * WHY NOT `lastTickAt`
 *
 * upstream.ts already records lastTickAt, and nothing reads it. It is also the
 * wrong signal: it advances only on a USABLE tick, so a genuinely quiet market
 * and a dead socket look identical through it. The right signal is ANY frame —
 * a ping proves the connection is alive even when nothing is trading.
 *
 * WHY THE MARKET GATE IS NOT OPTIONAL
 *
 * Silence overnight is correct. Recycling a healthy socket every ninety seconds
 * all weekend would be an outage of our own making, and against a one-connection
 * account it would be a self-inflicted lockout on Monday morning.
 */

/* The gateway pings roughly every thirty seconds — measured, 4 pings in a 120s
   sample. Three missed pings is a confident diagnosis without being trigger
   happy about ordinary jitter. */
export const SILENCE_LIMIT_MS = 90_000;

export type Health = {
  /** When ANY frame last arrived, ping included. Null if none ever has. */
  lastFrameAt: number | null;
  /** When the current socket opened. Null when there is no socket. */
  openedAt: number | null;
  now: number;
  /** Readers attached. With none, the idle close owns the socket's lifetime. */
  listeners: number;
  /** Whether prices are expected to be moving at all right now. */
  pricesMove: boolean;
  silenceMs?: number;
};

/** Whether the current connection should be force-closed and rebuilt. */
export function shouldRecycle(h: Health): boolean {
  const limit = h.silenceMs ?? SILENCE_LIMIT_MS;

  /* Nobody is reading: armIdleClose already owns this, and racing it would
     drop a connection we cannot be certain of getting back. */
  if (h.listeners <= 0) return false;

  /* Nothing is trading, so silence is the expected state, not a fault. */
  if (!h.pricesMove) return false;

  /* No socket to recycle. */
  if (h.openedAt === null) return false;

  /* Opened and never said a word — the shape a subscription refused without a
     close leaves behind. Measure from the open instead. */
  if (h.lastFrameAt === null) return h.now - h.openedAt > limit;

  return h.now - h.lastFrameAt > limit;
}
