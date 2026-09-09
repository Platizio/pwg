import type { Metadata } from "next";

/* The terminal's own identity, moved off the root layout when the marketing
   site joined it there. The old copy advertised "a simulated execution desk";
   there is no such desk and there deliberately never was — a regulated
   intermediary must not put a fake trade button on a public page. */
export const metadata: Metadata = {
  title: "Platizio Global · The session",
  description:
    "A market terminal — quotes, fundamentals, technicals, peers and holdings across US listings.",
};

import type { ReactNode } from "react";
import { connection } from "next/server";
import { Shell } from "@/components/terminal/shell";
import { getHomeSnapshot } from "@/lib/market/home";
import { PortfolioProvider } from "@/lib/portfolio";
import { LiveProvider } from "@/components/terminal/live-provider";

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
/* The terminal is not prerendered, and this is the file that decides it.
 *
 * This layout wraps every terminal route and reads the snapshot itself, so
 * making the individual pages dynamic changed nothing — the fetch above them
 * still ran for each one at build. Three pages burned two sixty-second
 * attempts apiece on a clean build here; a host with a build-time limit fails
 * there, and a failed deploy leaves the previous build serving.
 *
 * Prerendering it was never right anyway. This is a live market surface whose
 * data is fifteen minutes delayed and revalidates every five, so a build-time
 * snapshot is stale before the deploy finishes, and the build takes a hard
 * dependency on a third-party market API answering quickly.
 *
 * `connection()` rather than `dynamic = "force-dynamic"`: force-dynamic implies
 * `revalidate: 0`, which the pages' own notes forbid — Next reads it as an
 * instruction to skip the fetch cache on any request carrying an Authorization
 * header, turning one page view into a hundred-odd upstream calls. This only
 * says "do not prerender me"; the fetch cache underneath is untouched, and
 * getHomeSnapshot stays cache()d per request so the page below still reads it
 * for free. */
export default async function TerminalLayout({ children }: { children: ReactNode }) {
  await connection();

  const { session, indices, tape, universe, mostActive, gainers, losers } =
    await getHomeSnapshot();
  const lead = indices.data[0]?.index;

  /* The rail lists the covered names with their day change, and the tape is
     already carrying exactly those. Anything missing simply has no figure. */
  const quotes = Object.fromEntries(tape.data.map((row) => [row.id, row.chg]));

  return (
    <PortfolioProvider>
      <LiveProvider>
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
      </LiveProvider>
    </PortfolioProvider>
  );
}
