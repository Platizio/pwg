import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { InstrumentView } from "@/components/terminal/instrument-view";
import { getInstrumentSnapshot } from "@/lib/market/instrument";
import { COVERED } from "@/lib/market/universe";

type Params = { params: Promise<{ ticker: string }> };

/* Only the handful of names the terminal leads with are built ahead of time.
   Every other ticker in the universe renders on demand — there are fourteen
   thousand of them, and prerendering a market is not a build step. */
export function generateStaticParams() {
  return COVERED.map((ticker) => ({ ticker }));
}

/* Matching the rest of the terminal. It must not be 0 and must not be
   force-dynamic: Next reads revalidate:0 as an instruction to skip the fetch
   cache for any request carrying an Authorization header, which would turn
   every page view back into a full round of upstream calls. */
export const revalidate = 300;

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { ticker } = await params;
  const snapshot = await getInstrumentSnapshot(ticker);
  if (!snapshot) return { title: "Platizio Global · Instrument not found" };

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
export default async function InstrumentPage({ params }: Params) {
  const { ticker } = await params;
  const snapshot = await getInstrumentSnapshot(ticker);
  if (!snapshot) notFound();

  return <InstrumentView snapshot={snapshot} />;
}
