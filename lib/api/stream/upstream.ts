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

/* The gateway documents this same frame as both the subscribe message and the
   keep-alive "pong". It sends {"type":"ping"} and expects one back inside its
   own timeout; observed once per ~25s against UAT. */
const SUBSCRIBE_FRAME = JSON.stringify({ type: "querypolygonfmv", symbol: "*" });

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
  let parsed: { type?: unknown; updates?: unknown };
  try {
    parsed = JSON.parse(String(data));
  } catch {
    return;
  }

  /* The gateway drives the heartbeat: it pings, we answer with the same frame
     that opened the subscription. Missing this drops the connection silently. */
  if (parsed?.type === "ping") {
    try {
      socket?.send(SUBSCRIBE_FRAME);
    } catch {
      /* Send on a closing socket; the close handler will reconnect. */
    }
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

/** Attach a listener, opening the upstream connection if it is the first. */
export function subscribe(fn: TickListener): () => void {
  listeners.add(fn);
  if (idleTimer) {
    clearTimeout(idleTimer);
    idleTimer = null;
  }
  void ensureConnected();

  return () => {
    listeners.delete(fn);
    if (listeners.size === 0) armIdleClose();
  };
}
