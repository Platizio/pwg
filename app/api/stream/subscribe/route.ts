import { registry } from "@/lib/api/stream/registry";
import { refusePublic } from "@/lib/api/public-guard";

/* Edit a live stream's filter without disturbing the stream.
 *
 * The terminal holds one EventSource for the life of the page. Navigating to a
 * stock page adds one symbol to what the page is showing, and that used to mean
 * a new URL, a new connection and an empty tick map until the new connection's
 * snapshot arrived — every price on screen visibly falling back to the server's
 * figure on every navigation. This is the seam that makes the change additive:
 * the reader names its connection and says what changed, the filter is edited
 * in place, and no price on the page so much as flickers.
 *
 * Why a separate request rather than a message on the stream: SSE is one-way by
 * definition. The alternative is a WebSocket, which is a great deal of
 * machinery for a body sent a handful of times per session.
 *
 * The 404 is load-bearing. The registry is process-local — it describes sockets
 * this instance holds — so an id from a restarted or a different instance is
 * genuinely unknown here, and saying so lets the client open a fresh stream
 * instead of silently receiving nothing.
 */

export const dynamic = "force-dynamic";
export const revalidate = 0;

/** A list of symbols, or null when the caller sent something that is not one.
    Absent counts as empty: a request that only adds need not name `remove`. */
function names(value: unknown): string[] | null {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) return null;
  if (value.some((entry) => typeof entry !== "string")) return null;
  return value as string[];
}

/* A subscription change is a handful of tickers. Sixteen kilobytes is roughly
   a thousand of them — far past anything the client sends, and far short of
   what an anonymous caller could otherwise make this process hold. */
const MAX_BODY = 16 * 1024;

export async function POST(request: Request) {
  /* One POST per change to the symbol set: a reader opening tabs, not a loop.
     Generous enough that a busy terminal never notices it. */
  const refused = refusePublic(request.headers, {
    route: "stream/subscribe",
    limit: 60,
    windowMs: 60_000,
  });
  if (refused) return refused;

  /* THE BODY IS MEASURED BEFORE IT IS READ, and the order is the point. This
     parsed whatever arrived and only then asked whether the connection id was
     one we had issued — so an anonymous caller could make the process buffer
     and parse a body of any size by quoting an id that never existed. The
     cheapest check goes first. */
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > MAX_BODY) {
    return Response.json({ error: "Body too large." }, { status: 413 });
  }

  let body: unknown;
  try {
    /* Read as text against the same ceiling rather than trusting the header,
       which a caller sets and a chunked request omits entirely. */
    const raw = await request.text();
    if (raw.length > MAX_BODY) {
      return Response.json({ error: "Body too large." }, { status: 413 });
    }
    body = JSON.parse(raw);
  } catch {
    return Response.json({ error: "Expected a JSON body." }, { status: 400 });
  }

  if (typeof body !== "object" || body === null) {
    return Response.json({ error: "Expected a JSON body." }, { status: 400 });
  }

  const { id, add, remove } = body as { id?: unknown; add?: unknown; remove?: unknown };
  const adding = names(add);
  const removing = names(remove);

  if (typeof id !== "string" || !id || adding === null || removing === null) {
    return Response.json(
      { error: "Expected { id: string, add?: string[], remove?: string[] }." },
      { status: 400 },
    );
  }

  /* Symbols are cleaned inside the registry, which is where the stream reads
     them from — one place decides what a symbol list means. */
  const result = registry.update(id, adding, removing);
  if (!result.ok) {
    return Response.json({ error: "unknown connection" }, { status: 404 });
  }

  /* The set itself is not echoed: the client already knows what it asked for,
     and the only thing it cannot know is how much the cap refused. */
  return Response.json(
    { want: result.want.length, dropped: result.dropped },
    { headers: { "Cache-Control": "no-store" } },
  );
}
