import type { Metadata } from "next";
import { WireView } from "@/components/dashboard/wire-view";
import { getWireFeed } from "@/lib/market/feeds";

export const metadata: Metadata = {
  title: "The wire · Platizio Global",
  description:
    "Every story across the names Platizio Global covers, newest first, with what each one means for the company.",
};

/* The same window as every other surface: the feed behind it is fifteen
   minutes delayed, so a shorter one re-fetches what cannot have changed. */
export const revalidate = 300;

export default async function WirePage() {
  const { items } = await getWireFeed(40);
  return <WireView stories={items} />;
}
