import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { SectorView } from "@/components/dashboard/sector-view";
import { getSectorSnapshot } from "@/lib/market/sector";
import { sectorSlug } from "@/lib/market/session";
import { SECTOR_NAMES } from "@/lib/market/universe";

type Params = { params: Promise<{ slug: string }> };

/* Matching the dashboard's own window: the sector table is drawn from the same
   sweep, so a shorter one would re-fetch quotes that cannot have changed. */
export const revalidate = 300;

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const name = SECTOR_NAMES.find((n) => sectorSlug(n) === slug);
  if (!name) return { title: "Platizio Global · Sector not found" };

  return {
    title: `${name} · Platizio Global`,
    description: `Every ${name.toLowerCase()} company Platizio Global quotes, with price, market capitalisation, earnings multiple and trailing returns.`,
  };
}

/* Request-time, like the layout above it.
 *
 * Without this the route still announced itself as ISR-cacheable while its
 * layout had already opted into request-time data, and Next refused the
 * combination at runtime with DYNAMIC_SERVER_USAGE — a 500 on every instrument
 * page. The whole terminal subtree renders per request now; `revalidate` below
 * keeps governing the fetches underneath, so the upstream is still hit once per
 * five minutes rather than once per visitor. */
export default async function SectorPage({ params }: Params) {
  await connection();
  const { slug } = await params;
  const sector = await getSectorSnapshot(slug);
  if (!sector) notFound();

  return <SectorView sector={sector} />;
}
