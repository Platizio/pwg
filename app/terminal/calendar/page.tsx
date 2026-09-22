import type { Metadata } from "next";
import { CalendarView } from "@/components/dashboard/calendar-view";
import { getEventsFeed } from "@/lib/market/feeds";

export const metadata: Metadata = {
  title: "Key events · Platizio Global",
  description:
    "The dates that tend to move prices, with what each one is and the figure worth watching.",
};

export const revalidate = 300;

export default async function CalendarPage() {
  const { items } = await getEventsFeed(40);
  /* No clock handed down any more. Each event carries its own date, and the
     "Today"/"Tomorrow" gloss is measured against the reader's day when the
     event is normalised — so there is nothing here for a second clock to
     disagree with. */
  return <CalendarView events={items} />;
}
