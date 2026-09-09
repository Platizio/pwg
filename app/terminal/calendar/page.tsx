import type { Metadata } from "next";
import { connection } from "next/server";
import { CalendarView } from "@/components/dashboard/calendar-view";
import { nowSeconds } from "@/lib/market/clock";
import { getEventsFeed } from "@/lib/market/feeds";

export const metadata: Metadata = {
  title: "Key events · Platizio Global",
  description:
    "The dates that tend to move prices, with what each one is and the figure worth watching.",
};

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
export default async function CalendarPage() {
  await connection();
  const { items } = await getEventsFeed(40);
  /* The real clock, resolved once on the server and handed down as a number.
     calendarDate falls back to the fixed ANCHOR the mock was built around, so
     without this the page dates every event from August 2026 while labelling
     it "tomorrow". */
  return <CalendarView events={items} at={nowSeconds()} />;
}
