import type { NextRequest } from "next/server";
import { refusePublic } from "@/lib/api/public-guard";
import { snapshotFor, subscribe } from "@/lib/api/stream/upstream";
import type { Tick } from "@/lib/api/stream/tick";
import { streamLifecycle } from "@/lib/api/stream/lifecycle";
import { registry } from "@/lib/api/stream/registry";
import { MAX_SYMBOLS, capped, normalise } from "@/lib/api/stream/subscription";

/* Live quotes, server-sent.
 *
 * SSE rather than a WebSocket relay because quotes only ever travel one way.
 * EventSource reconnects on its own, survives proxies that mangle upgrades, and
 * needs no handshake — a bidirectional relay would be machinery for a problem
 * this does not have.
 *
 * The upstream socket and its partner token stay in lib/api/stream/upstream.ts.
 * What crosses this boundary is prices, for the symbols the caller named.
 *
 * The symbols the caller named are the OPENING set, not the final one. This
 * connection's filter lives in lib/api/stream/registry.ts under the id the
 * snapshot frame carries, and POST /api/stream/subscribe edits it while the
 * stream stays up — because closing and reopening a stream to add one symbol
 * blanked every price on the page until the new snapshot arrived.
 */

/* Long-lived by definition; nothing here may be cached or statically rendered. */
export const dynamic = "force-dynamic";
export const revalidate = 0;

/* Comment frames keep intermediaries from closing an idle connection. They are
   ignored by EventSource, so they cost the client nothing. */
const HEARTBEAT_MS = 20_000;

export async function GET(request: NextRequest) {
  /* Live, non-delayed licensed prices, held open. A reader opens one of these
     per tab. Twenty a minute leaves room for EventSource's own reconnects and
     for a reader with several tabs, while still refusing a fan-out. */
  const refused = refusePublic(request.headers, {
    route: "stream",
    limit: 20,
    windowMs: 60000,
  });
  if (refused) return refused;

  const raw = request.nextUrl.searchParams.get("symbols") ?? "";
  const requested = normalise(raw.split(","));

  if (requested.length === 0) {
    return Response.json({ error: "Name at least one symbol." }, { status: 400 });
  }

  /* Truncation is reported rather than absorbed: a surface silently missing its
     ticks looks exactly like a quiet market. See subscription.ts for why the
     cap is where it is. */
  const { kept: wanted, dropped } = capped(requested);
  if (dropped > 0) {
    console.warn(
      `[stream] ${requested.length} symbols requested, ${MAX_SYMBOLS} is the cap — ${dropped} dropped`,
    );
  }

  const encoder = new TextEncoder();

  /* Names this connection to the subscribe route. Handed to the client in the
     snapshot frame below, because the client cannot otherwise know which of
     this instance's streams is its own. */
  const id = crypto.randomUUID();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      /* Slots rather than consts: the snapshot frame below is written before
         either of these exists, so teardown has to cope with them being unset.
         See lib/api/stream/lifecycle.ts. */
      let heartbeat: ReturnType<typeof setInterval> | null = null;
      let unsubscribe: (() => void) | null = null;

      const life = streamLifecycle({
        stopHeartbeat: () => {
          if (heartbeat !== null) {
            clearInterval(heartbeat);
            heartbeat = null;
          }
        },
        /* The step that matters. A listener left in upstream's Set keeps
           listeners.size above zero, so armIdleClose never runs and the one
           connection this account is allowed stays pinned for the life of the
           process. This used to be skipped entirely whenever a write had
           already thrown. */
        detach: () => {
          if (unsubscribe !== null) {
            unsubscribe();
            unsubscribe = null;
          }
          /* Unconditional, and on the one path every teardown goes through: an
             entry left here holds a `send` that writes to a closed controller,
             and the id stays valid for a subscribe request nobody is reading.
             Deleting a key that was never added is free, so this is safe on the
             paths that tear down before registration. */
          registry.unregister(id);
        },
        closeStream: () => {
          try {
            controller.close();
          } catch {
            /* Already closed by the runtime. */
          }
        },
      });

      const send = (event: string, data: unknown) =>
        life.write(() =>
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)),
        );

      /* The client going away is the normal end of this stream, not an error.
         Registered before anything is acquired, so a reader that has already
         gone never ends up subscribed to a feed nobody is reading. */
      request.signal.addEventListener("abort", life.cleanup);
      if (request.signal.aborted) {
        life.cleanup();
        return;
      }

      /* From here the filter is the registry's, not this closure's. */
      registry.register(id, wanted, send);

      /* What is already known, before waiting for the next trade. A quiet name
         outside market hours may not tick again for hours; the reader should
         still see the last real price rather than an empty cell. */
      send("snapshot", { id, ticks: snapshotFor(wanted), dropped });
      if (life.cleaned) return;

      unsubscribe = subscribe((ticks: Tick[]) => {
        /* Read per batch rather than captured once: a subscribe request
           replaces this set, and a stale capture would go on delivering the
           symbols the page has navigated away from and none of the new ones. */
        const want = registry.wants(id);
        if (want === null) return;
        const mine = ticks.filter((t) => want.has(t.symbol));
        if (mine.length > 0) send("ticks", { ticks: mine });
      });

      /* A tick can arrive synchronously inside subscribe(), and its write can
         fail — so teardown may already have run at a moment when `unsubscribe`
         was still unassigned and detach() had nothing to release. Release it
         here rather than leak exactly the listener this is all about. */
      if (life.cleaned) {
        unsubscribe();
        unsubscribe = null;
        return;
      }

      heartbeat = setInterval(
        () => life.write(() => controller.enqueue(encoder.encode(": keep-alive\n\n"))),
        HEARTBEAT_MS,
      );
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      /* Nginx and friends buffer by default, which turns a live stream into a
         batch that arrives when it is no longer live. */
      "X-Accel-Buffering": "no",
    },
  });
}
