import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SectorView } from "@/components/dashboard/sector-view";
import { getSectorSnapshot } from "@/lib/market/sector";
import { sectorSlug } from "@/lib/market/session";
import { SECTOR_NAMES } from "@/lib/market/universe";

type Params = { params: Promise<{ slug: string }> };

/** The sector set is fixed and known at build time. */
export function generateStaticParams() {
  return SECTOR_NAMES.map((name) => ({ slug: sectorSlug(name) }));
}

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

export default async function SectorPage({ params }: Params) {
  const { slug } = await params;
  const sector = await getSectorSnapshot(slug);
  if (!sector) notFound();

  return <SectorView sector={sector} />;
}
