import { streamStatus } from "@/lib/api/stream/upstream";

/* Whether the live feed is actually alive.
 *
 * streamStatus() existed before this route and nothing read it, which is how a
 * hard server-side failure stayed invisible: the gateway was answering
 * {"error":"Failed to create wildcard subscription"} on every heartbeat, the
 * socket stayed dutifully "connected", and the terminal quietly served REST
 * snapshots while looking exactly like a live page on a quiet day.
 *
 * `connected` alone is the misleading bit, so this reports the two fields that
 * actually distinguish a working feed from a broken one: how many symbols the
 * socket believes it is subscribed to, and when a usable tick last arrived.
 *
 * A pure read — it never opens the socket. With no reader attached the
 * connection is closed by design, so `connected: false` here is only meaningful
 * while something is streaming.
 */
export const dynamic = "force-dynamic";
export const revalidate = 0;

export function GET() {
  const status = streamStatus();
  return Response.json(status, {
    status: status.lastError ? 503 : 200,
    headers: { "Cache-Control": "no-store" },
  });
}
