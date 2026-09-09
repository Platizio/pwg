import type { Metadata } from "next";
import { connection } from "next/server";
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
export default async function WirePage() {
  await connection();
  const { items } = await getWireFeed(40);
  return <WireView stories={items} />;
}
