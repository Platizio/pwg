import type { Metadata } from "next";
import { connection } from "next/server";
import { Dashboard } from "@/components/dashboard/dashboard";
import { getHomeSnapshot } from "@/lib/market/home";

export const metadata: Metadata = {
  title: "Platizio Global · The session",
  description:
    "Indices, breadth, volatility, sector performance and the wire — the market session at a glance, with your own book beneath it.",
};

/* Five minutes, matching the sweep's own lifetime — the feed is fifteen
   minutes delayed, so a shorter window re-fetches bytes that cannot have
   changed.

   It must not be 0, and the route must not be force-dynamic. Next reads
   revalidate: 0 as an instruction to skip the fetch cache for any request
   carrying an Authorization header, which would quietly turn every page view
   into a hundred and twenty-nine upstream calls. */
export const revalidate = 300;

/* Rendered on demand, not at build.
 *
 * All three of these fetched their data during the build, and all three timed
 * out on the first attempt of a clean local build — sixty seconds each, three
 * attempts, then the build fails. A host with a build-time limit fails there,
 * and a failed deploy leaves the previous build serving, which reads as "the
 * code never shipped".
 *
 * `connection()` rather than `dynamic = "force-dynamic"`, and this is the whole
 * point: force-dynamic implies `revalidate: 0`, which is what the note above
 * forbids — Next treats it as an instruction to skip the fetch cache on any
 * request carrying an Authorization header, and every page view becomes a full
 * round of upstream calls. `connection()` only says "do not prerender me";
 * `revalidate` above still governs the fetches, so the upstream is hit once per
 * five minutes no matter how many people load the page. */
export default async function DashboardPage() {
  await connection();
  const snapshot = await getHomeSnapshot();
  return <Dashboard data={snapshot} />;
}
