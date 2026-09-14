import { isFresh, type Tick } from "../api/stream/tick.ts";
import { pricesMove, type SessionPhase } from "./session.ts";

/**
 * What to tell the reader about the number in front of them.
 *
 * WHY THIS EXISTS
 *
 * upstream.ts records the failure this prevents: the gateway was refusing every
 * subscription, the socket stayed dutifully "connected", and the terminal
 * served REST snapshots "looking exactly like a live page on a quiet day". The
 * server-side half of that was fixed — streamStatus() reports lastError and
 * lastTickAt, and /api/stream/status exposes them. The reader's half was not.
 *
 * The instrument header had a dot that pulsed gold whenever `pricesMove(phase)`
 * was true. That asks the calendar, not the feed: during market hours it
 * pulsed whether or not a single tick had ever arrived. A reader watching a
 * pulsing dot over a five-minute-old snapshot has been told something untrue.
 *
 * THE SECOND FAILURE, WHICH IS WORSE
 *
 * The client tick buffer in live-provider.tsx never expires what it holds —
 * `buffer.set` and nothing else. The server refuses to emit a stale tick, but
 * once the browser has one it keeps it. So a feed that dies mid-session leaves
 * the last tick sitting in the map, and the header goes on rendering it as the
 * price for as long as the tab is open. Freshness therefore has to be decided
 * against the clock on every evaluation, not at arrival.
 *
 * ONE PREDICATE, DELIBERATELY
 *
 * This decides the badge AND whether the tick is good enough to be the price.
 * Two predicates would eventually disagree, and the disagreement would be a
 * page that says "Delayed" over a live number or "Live" over a frozen one.
 */

export type LiveState =
  /** A tick arrived recently enough to be the price being shown. */
  | "live"
  /** Prices are moving somewhere, but not here — the page is showing older data. */
  | "delayed"
  /** Nothing is moving, so nothing is behind. A shut market is not a delay. */
  | "idle";

export type Liveness = {
  state: LiveState;
  /** How old the tick is, or null when there is none. For telling the reader. */
  ageMs: number | null;
};

/**
 * What the badge says.
 *
 * `label` is session.label, which is "Market" for the regular session — so
 * "Live · Market" would spend a word saying what "Live" already said. The phase
 * is appended only where it qualifies the claim: in pre-market and post-market
 * a reader is entitled to know which book is printing, and when nothing is
 * moving the phase IS the whole message.
 */
export function livenessText(state: LiveState, phase: SessionPhase, label: string): string {
  if (state === "idle") return label;
  const word = state === "live" ? "Live" : "Delayed";
  return phase === "open" ? word : `${word} · ${label}`;
}

export function liveness(tick: Tick | null, phase: SessionPhase, now: number): Liveness {
  const ageMs = tick ? now - tick.at : null;

  /* Data beats the calendar. If the tape is genuinely printing then it is
     trading, whatever the committed holiday list believes — a session the list
     missed should read live rather than be argued with. */
  if (tick && isFresh(tick, now)) return { state: "live", ageMs };

  /* "Delayed" over a shut market is a lie in the other direction: it implies
     there are numbers out there we are behind on. There are not. */
  return { state: pricesMove(phase) ? "delayed" : "idle", ageMs };
}
