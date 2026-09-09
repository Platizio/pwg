import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { InstrumentView } from "@/components/terminal/instrument-view";
import { getInstrumentSnapshot } from "@/lib/market/instrument";

type Params = { params: Promise<{ ticker: string }> };

/* Matching the rest of the terminal. It must not be 0 and must not be
   force-dynamic: Next reads revalidate:0 as an instruction to skip the fetch
   cache for any request carrying an Authorization header, which would turn
   every page view back into a full round of upstream calls. */
export const revalidate = 300;

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { ticker } = await params;
  const snapshot = await getInstrumentSnapshot(ticker);
  if (!snapshot) return { title: "Platizio Global · Stock not found" };

  const { profile } = snapshot;
  return {
    title: `${profile.name} · ${profile.id} · Platizio Global`,
    description:
      profile.about?.slice(0, 200) ??
      `${profile.name}: price, key statistics, filings and recent coverage.`,
  };
}

/* An unknown ticker is a 404 rather than a silent fallback to a default
   instrument — a URL that quietly shows different data than it names is worse
   than one that admits it does not exist. */
/* Request-time, like the layout above it.
 *
 * Without this the route still announced itself as ISR-cacheable while its
 * layout had already opted into request-time data, and Next refused the
 * combination at runtime with DYNAMIC_SERVER_USAGE — a 500 on every instrument
 * page. The whole terminal subtree renders per request now; `revalidate` below
 * keeps governing the fetches underneath, so the upstream is still hit once per
 * five minutes rather than once per visitor. */
export default async function InstrumentPage({ params }: Params) {
  await connection();
  const { ticker } = await params;
  const snapshot = await getInstrumentSnapshot(ticker);
  if (!snapshot) notFound();

  return <InstrumentView snapshot={snapshot} />;
}
