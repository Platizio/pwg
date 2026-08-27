import type { Metadata } from "next";
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

export default async function DashboardPage() {
  const snapshot = await getHomeSnapshot();
  return <Dashboard data={snapshot} />;
}
