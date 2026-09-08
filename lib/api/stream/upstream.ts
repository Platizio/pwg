import "server-only";

import { env } from "../env.ts";
import { getToken } from "../token.ts";
import { scrub } from "../errors.ts";
import { isFresh, toTick, type Tick } from "./tick.ts";

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
const RECONNECT_BASE_MS = 1_000;
const RECONNECT_MAX_MS = 30_000;

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
    return;
  }
  if (typeof parsed?.status === "string") {
    lastStatus = parsed.status;
    lastError = null;
    return;
  }

  if (!Array.isArray(parsed?.updates)) return;

  const now = Date.now();
  const fresh: Tick[] = [];
  for (const raw of parsed.updates) {
    const tick = toTick(raw as Parameters<typeof toTick>[0]);
    /* toTick drops rows with no usable price; isFresh drops the replays. Both
       gates matter — the stream sends plenty of each. */
    if (!tick || !isFresh(tick, now)) continue;
    const prev = latest.get(tick.symbol);
    if (prev && prev.at > tick.at) continue; // never move a symbol backwards
    latest.set(tick.symbol, tick);
    lastTickAt = now;
    fresh.push(tick);
  }
  emit(fresh);
}

function scheduleReconnect() {
  if (closedForGood || listeners.size === 0 || reconnectTimer) return;
  attempt += 1;
  /* Exponential with jitter: a gateway blip must not turn every instance into
     a synchronised retry storm against the same host. */
  const backoff = Math.min(RECONNECT_BASE_MS * 2 ** (attempt - 1), RECONNECT_MAX_MS);
  const delay = backoff / 2 + Math.random() * (backoff / 2);
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
      attempt = 0;
      /* Once. A reconnect is a new socket and so a new subscription; within one
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
