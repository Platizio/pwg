import type { NextRequest } from "next/server";
import { snapshotFor, subscribe } from "@/lib/api/stream/upstream";
import type { Tick } from "@/lib/api/stream/tick";

/* Live quotes, server-sent.
 *
 * SSE rather than a WebSocket relay because quotes only ever travel one way.
 * EventSource reconnects on its own, survives proxies that mangle upgrades, and
 * needs no handshake — a bidirectional relay would be machinery for a problem
 * this does not have.
 *
 * The upstream socket and its partner token stay in lib/api/stream/upstream.ts.
 * What crosses this boundary is prices, for the symbols the caller named.
 */

/* Long-lived by definition; nothing here may be cached or statically rendered. */
export const dynamic = "force-dynamic";
export const revalidate = 0;

/* An upper bound on the per-connection filter, not on upstream cost — the
   gateway subscription is a wildcard either way, so this only bounds how much
   this response has to sift and serialise.

   It was 64, chosen when three surfaces were live. Widening the terminal to the
   boards, the ribbon, the index strip and the sector cards took one dashboard to
   77 symbols, and the excess was dropped in silence — TSLA among them, on a tape
   where it is one of six names. A cap that quietly stops delivering the thing it
   was asked for is worse than no cap, so this is now sized for a real page and
   says so when it bites. */
const MAX_SYMBOLS = 256;

/* Comment frames keep intermediaries from closing an idle connection. They are
   ignored by EventSource, so they cost the client nothing. */
const HEARTBEAT_MS = 20_000;

export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get("symbols") ?? "";
  const requested = [
    ...new Set(
      raw
        .split(",")
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean),
    ),
  ];
  const wanted = requested.slice(0, MAX_SYMBOLS);

  if (wanted.length === 0) {
    return Response.json({ error: "Name at least one symbol." }, { status: 400 });
  }

  const want = new Set(wanted);
  const encoder = new TextEncoder();

  /* Truncation is reported rather than absorbed: a surface silently missing its
     ticks looks exactly like a quiet market. */
  const dropped = requested.length - wanted.length;
  if (dropped > 0) {
    console.warn(
      `[stream] ${requested.length} symbols requested, ${MAX_SYMBOLS} is the cap — ${dropped} dropped`,
    );
  }

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let open = true;
      const send = (event: string, data: unknown) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          open = false;
        }
      };

      /* What is already known, before waiting for the next trade. A quiet name
         outside market hours may not tick again for hours; the reader should
         still see the last real price rather than an empty cell. */
      send("snapshot", { ticks: snapshotFor(wanted), dropped });

      const unsubscribe = subscribe((ticks: Tick[]) => {
        const mine = ticks.filter((t) => want.has(t.symbol));
        if (mine.length > 0) send("ticks", { ticks: mine });
      });

      const heartbeat = setInterval(() => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(": keep-alive\n\n"));
        } catch {
          open = false;
        }
      }, HEARTBEAT_MS);

      const close = () => {
        if (!open) return;
        open = false;
        clearInterval(heartbeat);
        unsubscribe();
        try {
          controller.close();
        } catch {
          /* Already closed by the runtime. */
        }
      };

      /* The client going away is the normal end of this stream, not an error.
         Without this the listener and its interval outlive every disconnect and
         the instance leaks one of each per reader. */
      request.signal.addEventListener("abort", close);
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
