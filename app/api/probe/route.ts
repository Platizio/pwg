import { formatReport, runProbe } from "@/lib/api/probe";
import { getHomeSnapshot } from "@/lib/market/home";

import type { NextRequest } from "next/server";
import type { HomeSnapshot, PanelStatus } from "@/lib/market/home";

/* The endpoint probe, over HTTP.

   force-dynamic belongs here and nowhere else in this application. It sets
   every fetch beneath it to `revalidate: 0`, which for an auth-bearing call is
   a no-store: the Authorization header is part of Next's cache key, so a
   cached probe would be measuring a hit against a token rather than the
   gateway. Uncached latency is the only latency worth reporting. The same
   export on the terminal route would turn a warmed sweep back into a live one
   on every render, which is the opposite of what that route is for.

   The corollary is that `?cached=1` describes the assembled shape rather than
   the health of the cache. It rebuilds the snapshot from the wire, so its
   diagnostics always read as a cold render and never as a hit. */
export const dynamic = "force-dynamic";

/* A full run sweeps the universe before it asserts anything against it. */
export const maxDuration = 60;

const PANELS = [
  "tape",
  "indices",
  "gainers",
  "losers",
  "mostActive",
  "popular",
  "sectors",
  "events",
  "wire",
] as const satisfies readonly (keyof HomeSnapshot)[];

type PanelReport = {
  status: PanelStatus;
  asOf: string | null;
  note: string | null;
  rows: number;
};

function panelReport(snapshot: HomeSnapshot): Record<string, PanelReport> {
  const out: Record<string, PanelReport> = {};
  for (const key of PANELS) {
    const panel = snapshot[key];
    out[key] = {
      status: panel.status,
      asOf: panel.asOf,
      note: panel.note,
      rows: panel.data.length,
    };
  }
  return out;
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const token = process.env.PROBE_TOKEN;

  /* Absent rather than forbidden: a 401 would confirm the route is here, and
     outside development it does not exist without the key. */
  if (process.env.NODE_ENV === "production" && (!token || params.get("key") !== token)) {
    return new Response(null, { status: 404 });
  }

  if (params.get("cached") === "1") {
    const snapshot = await getHomeSnapshot();
    return Response.json({
      diagnostics: snapshot.diagnostics,
      universe: snapshot.universe.length,
      panels: panelReport(snapshot),
    });
  }

  const only = params
    .get("only")
    ?.split(",")
    .map((id) => id.trim())
    .filter(Boolean);

  const report = await runProbe(only);

  /* A failing check is a finding, not a broken route, so the status stays 200
     and the caller reads `failed`. */
  if (params.get("format") === "text") {
    return new Response(formatReport(report), {
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }

  return Response.json(report);
}
