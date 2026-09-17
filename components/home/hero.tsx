"use client";

import Link from "next/link";
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
            {/* The terminal is inside this application, so this one is a route
                change rather than a page load — and a plain <a> threw away
                every part of that: a full document request, the shell rebuilt,
                and nothing fetched until the click.

                `prefetch` is stated rather than left to the default. The
                default ("auto") prefetches a static route in full but a
                dynamic one only down to its nearest loading boundary, and
                /terminal now has one; `true` is the value that means the whole
                route either way. It fires when the link enters the viewport,
                which for a hero action is immediately — the terminal is the
                heaviest thing this page links to and the likeliest thing a
                reader here clicks. (node_modules/next/dist/docs/01-app/
                03-api-reference/02-components/link.md, "prefetch".) */}
            <Link className="ft-ghost" href={SCREENER_URL} prefetch={true}>
              {COPY.cta.ghost}
            </Link>
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
