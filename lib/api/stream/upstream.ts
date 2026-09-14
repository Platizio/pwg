import "server-only";

import { env } from "../env.ts";
import { getToken } from "../token.ts";
import { scrub } from "../errors.ts";
import { basisOf, carryBasis, isFresh, toTick, type Basis, type Tick } from "./tick.ts";
import { reconnectDelay } from "./backoff.ts";

/* The single upstream connection to the market-data stream.
 *
 * Why this lives on the server and can never move to the browser: the socket
 * authenticates with `Authorization: Bearer <partner_token>` — the same partner
 * credential the REST calls use. A browser-side connection would hand that
 * credential to every visitor. So exactly one process holds the socket and fans
 * the ticks out over SSE, and the token never leaves this module.
 *
 * The connection is opened by the first subscriber and dropped a minute after
 * the last one leaves. Nothing connects at import time: a serverless instance
 * that renders one static page should not be holding a market feed open.
 */

const WS_PATH = "/aes-ws/wsevent";

/* The documented protocol, and the whole of it. ViewTrade's developer portal
   lists exactly one client-to-server message for this socket, and this frame is
   its body. There is no separate subscribe message and no named-symbol form:
   sending this IS the subscription, and `symbol: "*"` is the only shape given.
 *
 * `querypolygonfmv` is also the only query type the gateway recognises.
 * querypolygonquote, querypolygontrade, querypolygonagg, querypolygonnbbo,
 * queryquote, querytrade, querylevel1, querymarketdata, subscribe, quote and
 * level1 each answer {"error":"Query type '<x>' is not recognized"}, so there
 * is no trade, quote or aggregate channel to fall back to.
 *
 * SENT ONCE, on open — and this is exactly where the documentation is wrong.
 * It describes this frame as a heartbeat to "send periodically (every 30 s)".
 * Doing that asks the gateway to create a wildcard subscription that already
 * exists, and it replies {"error":"Failed to create wildcard subscription"},
 * tearing down the subscription the resend was meant to keep alive. Measured
 * over 75s on parallel sockets: resending every 30s produces that error;
 * sending once produces no error and the same data. Following the published
 * documentation literally is what breaks this feed. */
const SUBSCRIBE_FRAME = JSON.stringify({ type: "querypolygonfmv", symbol: "*" });

/* The gateway pings; this is the reply. Undocumented — the portal names its one
   message "pong" but gives the subscribe frame as the body — yet it is the only
   answer that satisfies the heartbeat without re-subscribing, and it draws no
   error for the life of the connection. A socket that answered nothing at all
   also survived 75s and three pings, so this is the conservative choice rather
   than a strictly required one. */
const PONG_FRAME = JSON.stringify({ type: "pong" });

const IDLE_CLOSE_MS = 60_000;

export type TickListener = (ticks: Tick[]) => void;

let socket: WebSocket | null = null;
let connecting: Promise<void> | null = null;
let attempt = 0;
let idleTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let closedForGood = false;

const listeners = new Set<TickListener>();

/* The gateway reports subscription problems in bare {"error":...} frames that
   carry no `updates`. This module used to drop anything without `updates` on
   the floor, which is precisely why a failing subscription went unnoticed while
   the terminal quietly served REST snapshots and looked like a live page on a
   quiet day. Kept so streamStatus() — and therefore a human — can see it. */
let lastError: string | null = null;
let lastStatus: string | null = null;
let lastTickAt: number | null = null;

/* Last usable tick per symbol. A new subscriber gets this immediately rather
   than waiting for the symbol it cares about to trade again — which, for a
   quiet name outside market hours, may be never. */
const latest = new Map<string, Tick>();

/* Previous closes, each stamped with the trading day it belongs to.

   Separate from `latest` on purpose. A basis outlives the tick that carried it,
   and it has to survive a gate that tick does not: the row carrying a previous
   close is a symbol's FULL record, and for a quiet name it is stamped with that
   name's last print — often hours old, which isFresh drops. Stored in `latest`
   it would be thrown away, and that symbol could never show a change at all.

   Unbounded, but bounded in practice by the tradable universe (~14k entries of
   a number and a date string), and stale entries are refused by carryBasis on
   the day check rather than needing eviction. */
const basis = new Map<string, Basis>();

/** Diagnostics only. Never includes the token. */
export function streamStatus() {
  return {
    connected: socket?.readyState === 1,
    readyState: socket?.readyState ?? null,
    subscribers: listeners.size,
    symbolsKnown: latest.size,
    reconnectAttempt: attempt,
    /* A socket that is connected but has never produced a usable tick is the
       exact state this feed has been in; "connected" alone hides it. */
    lastTickAt,
    lastStatus,
    lastError,
  };
}

/** The freshest known tick for each requested symbol. */
export function snapshotFor(symbols: readonly string[], now = Date.now()): Tick[] {
  const out: Tick[] = [];
  for (const s of symbols) {
    const t = latest.get(s.toUpperCase());
    if (t && isFresh(t, now)) out.push(t);
  }
  return out;
}

function emit(ticks: Tick[]) {
  if (ticks.length === 0) return;
  for (const fn of listeners) {
    /* One bad subscriber must not take down the fan-out for the others. */
    try {
      fn(ticks);
    } catch {
      /* A listener that throws is a dead connection being written to. */
    }
  }
}

function handleMessage(data: unknown) {
  let parsed: { type?: unknown; updates?: unknown; error?: unknown; status?: unknown };
  try {
    parsed = JSON.parse(String(data));
  } catch {
    return;
  }

  if (parsed?.type === "ping") {
    try {
      socket?.send(PONG_FRAME);
    } catch {
      /* Send on a closing socket; the close handler will reconnect. */
    }
    return;
  }

  /* Subscription bookkeeping, not data — recorded rather than ignored. */
  if (typeof parsed?.error === "string") {
    lastError = parsed.error;
    console.error(`[stream] gateway refused: ${parsed.error}`);
    /* Close it. A refused socket stays readyState 1 and receives nothing for
       ever, which is the worst of both: it looks connected to streamStatus and
       it may still be occupying the single connection this account is allowed,
       locking out the instance that could have used it. The close handler
       schedules a reconnect, and the backoff above paces it. */
    try {
      socket?.close();
    } catch {
      /* Already closing; the close handler will still fire. */
    }
    return;
  }
  if (typeof parsed?.status === "string") {
    lastStatus = parsed.status;
    lastError = null;
    /* THIS is success for this feed, not the socket opening. See the note in
       the open handler: a refused socket opens too. */
    attempt = 0;
    return;
  }

  if (!Array.isArray(parsed?.updates)) return;

  const now = Date.now();
  const fresh: Tick[] = [];
  for (const raw of parsed.updates) {
    const tick = toTick(raw as Parameters<typeof toTick>[0]);
    /* toTick drops rows with no usable price. */
    if (!tick) continue;

    /* Harvest the basis BEFORE the freshness gate, for the reason recorded on
       the map above. Doing it in this order is safe only because basisOf stamps
       by the ROW's own trading day: an ancient row yields an ancient basis, and
       carryBasis refuses it. Stamping by wall-clock would launder a week-old
       close into today's. */
    const contributed = basisOf(tick);
    if (contributed) basis.set(tick.symbol, contributed);

    /* isFresh drops the replays; the stream sends plenty. */
    if (!isFresh(tick, now)) continue;
    const prev = latest.get(tick.symbol);
    if (prev && prev.at > tick.at) continue; // never move a symbol backwards

    /* The gateway sends a symbol's full record once and price-only deltas
       afterwards, so the NEWEST tick — the one every surface reads — almost
       never carries its own change basis. Measured against production: 3 of 14
       ticks had one, and all three were a symbol's first. Filling it in here,
       once, is what lets the whole page call these live; doing it per consumer
       would be five copies of one rule. */
    const merged = carryBasis(tick, basis.get(tick.symbol));
    latest.set(merged.symbol, merged);
    lastTickAt = now;
    fresh.push(merged);
  }
  emit(fresh);
}

function scheduleReconnect() {
  if (closedForGood || listeners.size === 0 || reconnectTimer) return;
  attempt += 1;
  /* Exponential with jitter, in backoff.ts so the growth is tested rather than
     trusted: a gateway blip must not turn every instance into a synchronised
     retry storm against the one connection this account is allowed. */
  const delay = reconnectDelay(attempt);
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    void ensureConnected();
  }, delay);
}

async function open(): Promise<void> {
  const { gateway } = env();
  const { accessToken } = await getToken();
  const url = gateway.replace(/^http/, "ws") + WS_PATH;

  await new Promise<void>((resolve, reject) => {
    let settled = false;
    /* Node's WebSocket accepts headers; the browser's does not — which is the
       other reason this cannot be a client-side connection. */
    const ws = new WebSocket(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    } as unknown as string[]);
    socket = ws;

    ws.addEventListener("open", () => {
      /* `attempt` is deliberately NOT reset here. A socket that the gateway is
         about to refuse with connection_limit still opens first, so resetting
         on open meant a refused client reconnected roughly every second for as
         long as the refusal lasted. Only a subscription counts as success, and
         handleMessage clears the counter when one arrives.

         Once. A reconnect is a new socket and so a new subscription; within one
         socket this frame is never sent again. */
      ws.send(SUBSCRIBE_FRAME);
      if (!settled) {
        settled = true;
        resolve();
      }
    });
    ws.addEventListener("message", (e: MessageEvent) => handleMessage(e.data));
    ws.addEventListener("error", () => {
      if (!settled) {
        settled = true;
        reject(new Error("market stream failed to open"));
      }
    });
    ws.addEventListener("close", () => {
      if (socket === ws) socket = null;
      if (!settled) {
        settled = true;
        reject(new Error("market stream closed before opening"));
      }
      scheduleReconnect();
    });
  });
}

async function ensureConnected(): Promise<void> {
  if (socket?.readyState === 1) return;
  if (connecting) return connecting;
  connecting = open()
    .catch((e) => {
      /* scrub() keeps the credential out of anything that reaches a log. */
      console.error(`[stream] ${scrub(String(e))}`);
      scheduleReconnect();
    })
    .finally(() => {
      connecting = null;
    });
  return connecting;
}

function armIdleClose() {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    if (listeners.size > 0) return;
    closedForGood = true;
    try {
      socket?.close();
    } catch {
      /* Already gone. */
    }
    socket = null;
    closedForGood = false;
  }, IDLE_CLOSE_MS);
}

/**
 * Attach a listener, opening the upstream connection if it is the first.
 *
 * No symbols: the subscription is a wildcard, so every reader receives every
 * tick and filters for its own. See the note on SUBSCRIBE_FRAME.
 */
export function subscribe(fn: TickListener): () => void {
  listeners.add(fn);
  if (idleTimer) {
    clearTimeout(idleTimer);
    idleTimer = null;
  }
  void ensureConnected();

  let done = false;
  return () => {
    /* A cleanup that runs twice must not drop another reader's listener. */
    if (done) return;
    done = true;
    listeners.delete(fn);
    if (listeners.size === 0) armIdleClose();
  };
}
