"use client";

import { TRADING_PLATFORM_URL, SCREENER_URL } from "@/src/constants";
import Globe from "@/src/components/Globe";
import { COPY } from "@/lib/home/copy";

/*
 * The products page's hero, carried onto the home page: the tracked label
 * with its pulsing gold mark, the headline with one gold clause, the two
 * actions, and the two standing facts. Same classes, same sheet.
 *
 * The permission paragraph that used to sit between the headline and the
 * actions is gone at Aayush's request. The gold rule it carried moved to the
 * facts, which is where the hero's supporting evidence now lives — and the
 * facts now sit on a card, like every other block on the page, with that gold
 * rule as the card's top edge.
 *
 * The subject on the right is the globe rather than the terminal capture —
 * the products page already owns that screenshot, and the home page's subject
 * is the distance the money travels, not the instrument. It is the original
 * component: cobe's WebGL sphere, turning on its own, pausing under the
 * pointer, draggable. It renders on the client only, so the headline is this
 * page's largest paint.
 */
export function Hero() {
  const h = COPY.hero;
  return (
    <section className="ft-hero" aria-labelledby="hero-heading">
      <div className="container ft-hero-inner">
        <div className="ft-hero-copy">
          <p className="ft-mark">
            <span className="ft-mark-dot" aria-hidden="true" />
            <span className="ft-label">{h.mark}</span>
          </p>

          <h1 className="ft-h1" id="hero-heading">
            {h.h1.lead}
            <em> {h.h1.clause}</em>
          </h1>

          <div className="ft-actions">
            <a className="ft-cta" href={TRADING_PLATFORM_URL} target="_blank" rel="noopener noreferrer">
              {COPY.cta.primary}
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
            {/* The same anchor the products page uses, deliberately — not a
                Next <Link>.

                Both pages carry a button named for the same destination, and
                two buttons that read alike must behave alike; this one did
                not. It was a client transition, which on a marketing page
                means the reader waits on the whole terminal payload with
                nothing moving, and `prefetch` pulled that payload for every
                visitor who never clicked. The products page has always used a
                plain document load into a new tab
                (Platizio_Global_Revamp/pages/Products.tsx:233), the marketing
                site stays open behind it, and the terminal arrives
                server-rendered. That is the behaviour, so this is the form. */}
            <a className="ft-ghost" href={SCREENER_URL} target="_blank" rel="noopener noreferrer">
              {COPY.cta.ghost}
            </a>
          </div>

          <dl className="hm-hero-facts">
            {h.facts.map((f) => (
              <div className="hm-hero-fact" key={f.term}>
                <dt>{f.term}</dt>
                <dd>{f.desc}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="hm-globe">
          <Globe />
        </div>
      </div>
    </section>
  );
}
