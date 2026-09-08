"use client";

import Link from "next/link";
import { formatPrice } from "@/Platizio_Global_Revamp/lib/format";
import QuoteChange from "@/Platizio_Global_Revamp/components/QuoteChange";
import MarketNote from "@/Platizio_Global_Revamp/components/MarketNote";
import type { MarketData } from "@/Platizio_Global_Revamp/hooks/useMarketData";
import { instrumentPath } from "@/lib/market/paths";
import type { Session } from "@/lib/market/session";
import { COPY } from "@/lib/home/copy";
import { Marquee } from "@/components/marketing/motion/marquee";
import { SessionPill } from "./session-pill";

/*
 * The tall ticker: today's movers as tall tiles travelling across the page,
 * with the session pill at the head so the reader knows whether these
 * figures are moving. The products page's tape, at twice the height: the
 * name gets a line of its own and the price a size that can be read from
 * across the room. Each tile is a link into the terminal, so the tape can be
 * stopped by keyboard as well as by pointer.
 */
export function Ticker({ data, session }: { data: MarketData; session: Session | null }) {
  const movers = data.trending;
  return (
    <section className="hm-ticker" aria-label={COPY.ticker.label}>
      <div className="container">
        <div className="hm-ticker-head">
          <p className="ft-movers-head">
            <span className="ft-label">{COPY.ticker.label}</span>
            <span className="ft-movers-basis">{COPY.ticker.basis}</span>
          </p>
          <SessionPill session={session} />
        </div>

        {movers === null ? (
          <div className="hm-ticker-wait" aria-hidden="true">
            {Array.from({ length: 6 }, (_, i) => (
              <span className="hm-tile hm-tile--wait" key={i} />
            ))}
          </div>
        ) : movers.length === 0 ? (
          <p className="ft-movers-wait">{COPY.ticker.unavailable}</p>
        ) : (
          <Marquee label={`${COPY.ticker.label}, scrolling`} spacing="12px" duration={58} className="hm-tape">
            {movers.map((q) => (
              <Link className="hm-tile" href={instrumentPath(q.symbol)} key={q.symbol}>
                <span className="hm-tile-top">
                  <span className="hm-tile-sym">{q.symbol}</span>
                  <QuoteChange changePercent={q.changePercent} variant="chip" />
                </span>
                <span className="hm-tile-name">{q.name}</span>
                <span className="hm-tile-px">${formatPrice(q.price)}</span>
              </Link>
            ))}
          </Marquee>
        )}

        <MarketNote asOf={data.asOf} delayed={data.delayed} />
      </div>
    </section>
  );
}
