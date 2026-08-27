import type { ReactNode } from "react";
import { Shell } from "@/components/terminal/shell";
import { getHomeSnapshot } from "@/lib/market/home";
import { PortfolioProvider } from "@/lib/portfolio";

/**
 * Every routed surface sits inside one terminal frame and reads one book.
 * The group has no URL segment of its own — `/` is the dashboard and
 * `/instrument/AAPL` is the screener; both are children of this layout, so
 * moving between them never re-mounts the rail, the tape or the order ticket.
 *
 * The snapshot is read here as well as in the page because the compact bar and
 * the search both live in the frame, above every route, and data cannot travel
 * upwards. getHomeSnapshot is cache()d per request, so the second read is free
 * — it returns the work the page already paid for.
 */
export default async function TerminalLayout({ children }: { children: ReactNode }) {
  const { session, indices, tape, universe, mostActive, gainers, losers } =
    await getHomeSnapshot();
  const lead = indices.data[0]?.index;

  /* The rail lists the covered names with their day change, and the tape is
     already carrying exactly those. Anything missing simply has no figure. */
  const quotes = Object.fromEntries(tape.data.map((row) => [row.id, row.chg]));

  return (
    <PortfolioProvider>
      <Shell
        session={session}
        lead={lead ? { short: lead.short, level: lead.level, chg: lead.chg } : undefined}
        quotes={quotes}
        /* The boards go down as their rows alone: the panel shows what is
           quoting and nothing when nothing is, so it has no use for a panel's
           status or its note — those are stated on the dashboard, once. */
        search={{
          universe,
          mostActive: mostActive.data,
          gainers: gainers.data,
          losers: losers.data,
        }}
      >
        {children}
      </Shell>
    </PortfolioProvider>
  );
}
