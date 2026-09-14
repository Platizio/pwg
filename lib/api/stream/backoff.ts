/**
 * How long to wait before asking the market feed to let us in again.
 *
 * WHY THIS IS ITS OWN MODULE
 *
 * The gateway allows ONE connection per account. Measured against it directly:
 * with production holding the connection, three separate sockets were each
 * answered `connection_limit` — and critically, the socket still OPENS before
 * that refusal arrives. The TCP connection succeeds; the subscription is what
 * gets turned away.
 *
 * That matters because upstream.ts reset its retry counter in the socket's
 * `open` handler. A refused client would therefore reconnect, open, reset to
 * zero, be refused, and try again about a second later — forever, against a
 * gateway that had already said no. Exponential backoff that never advances is
 * not backoff.
 *
 * So the counter now advances on refusal and is cleared only by a successful
 * SUBSCRIPTION, which is what success means for this protocol. This module
 * holds the arithmetic so the growth can be tested rather than trusted.
 */

export const RECONNECT_BASE_MS = 1_000;
export const RECONNECT_MAX_MS = 30_000;

/**
 * Delay before attempt number `attempt` (1-based), with jitter.
 *
 * Half the window is fixed and half is random. The fixed half guarantees a
 * refusal can never become a hot loop; the random half stops two instances
 * refused at the same instant from returning in lockstep and taking turns
 * locking each other out of the one connection there is.
 */
export function reconnectDelay(attempt: number, rand: number = Math.random()): number {
  const n = Math.max(1, Math.floor(attempt));
  /* 2^30 overflows nothing here, but the exponent is clamped anyway: an
     instance refused for a day should not compute Infinity and then NaN. */
  const growth = Math.min(RECONNECT_BASE_MS * 2 ** Math.min(n - 1, 30), RECONNECT_MAX_MS);
  return growth / 2 + rand * (growth / 2);
}
