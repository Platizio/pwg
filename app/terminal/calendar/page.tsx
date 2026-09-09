import type { Metadata } from "next";
import { CalendarView } from "@/components/dashboard/calendar-view";
import { nowSeconds } from "@/lib/market/clock";
import { getEventsFeed } from "@/lib/market/feeds";

export const metadata: Metadata = {
  title: "Key events · Platizio Global",
  description:
    "The dates that tend to move prices, with what each one is and the figure worth watching.",
};

export const revalidate = 300;

export default async function CalendarPage() {
  const { items } = await getEventsFeed(40);
  /* The real clock, resolved once on the server and handed down as a number.
     calendarDate falls back to the fixed ANCHOR the mock was built around, so
     without this the page dates every event from August 2026 while labelling
     it "tomorrow". */
  return <CalendarView events={items} at={nowSeconds()} />;
}
