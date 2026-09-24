import type { Metadata } from "next";
import { WatchlistPage, type CorpusQuote } from "@/components/terminal/watchlist/watchlist-page";
import { getHomeSnapshot } from "@/lib/market/home";

export const metadata: Metadata = {
  title: "Watchlists · Platizio Global",
  description:
    "Your own lists of US stocks — create, rename and reorder them, and follow each name's price and day change.",
};

/* The sweep's own lifetime, like every other page drawn from the snapshot.
   Not 0 and not force-dynamic, for the reason app/terminal/page.tsx gives. */
export const revalidate = 300;

/**
 * The watchlist page.
 *
 * The lists themselves live in the reader's browser, so nothing here knows
 * what they hold. What the server can give is the search corpus the header
 * search already reads — the same request-cached snapshot the layout has just
 * built, so this costs no second read — which does two jobs on the page: it is
 * what the add box searches, and it prices every listed name it covers without
 * a request of its own.
 *
 * Only the fields the page draws cross the wire.
 */
export default async function WatchlistRoute() {
  const { universe } = await getHomeSnapshot(false);
  const corpus: CorpusQuote[] = universe.map((q) => ({
    id: q.id,
    name: q.name,
    mark: q.mark,
    color: q.color,
    price: q.price,
    chg: q.chg,
  }));
  return <WatchlistPage corpus={corpus} />;
}
