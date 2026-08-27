"use client";

import { useState } from "react";
import { Reader } from "@/components/ui/reader";
import { notableMoves } from "@/lib/market/instrument-derive";
import type { InstrumentSnapshot } from "@/lib/market/instrument";
import type { WireItem } from "@/lib/market/home";
import { CapsLink } from "./ui";

/**
 * The instrument rail: what the company is, how it has moved, what is written
 * about it.
 *
 * Every control here used to be dead. Three "See more" buttons opened nothing,
 * "Website" and "Investor relations" were `<button>`s with no handler, and each
 * headline was an `<a href="#">` that scrolled you to the top of the page. The
 * rule applied throughout: a control either goes somewhere real or it does not
 * exist. Two of the three "See more" links are gone because there was genuinely
 * nothing more to show — the About paragraph is complete and `notableMoves(snapshot)`
 * already returns its whole list — and inventing a destination for them would
 * have been the same lie in a longer form.
 */
export function RightRail({ snapshot }: { snapshot: InstrumentSnapshot }) {
  const moves = notableMoves(snapshot);
  const [story, setStory] = useState<WireItem | null>(null);

  return (
    <div className="flex flex-col gap-8 px-6 py-6 lg:gap-9">
      <section>
        <header className="mb-3.5 flex items-baseline justify-between gap-3">
          <h3 className="font-serif text-[24px]">About</h3>
        </header>
        {/*
          The drop cap is decoration. The paragraph keeps its full text so
          screen readers get an unbroken sentence; only the rendered first
          letter is styled, via ::first-letter.
        */}
        <p className="about-drop text-[13.5px] leading-[1.8] text-pretty text-ink-3">
          {snapshot.profile.about}
        </p>
        {/* The company's own address, when the record carries one. A dead
            link is worse than no link, so a company without one shows
            neither — and there is no separate investor-relations address in
            this feed, so that button is gone rather than pointed at the
            homepage twice. */}
        {snapshot.profile.site && (
          <div className="mt-4 flex border-t border-rule-section">
            <CapsLink href={snapshot.profile.site} external className="flex-1 py-3 text-left">
              Website
            </CapsLink>
          </div>
        )}
      </section>

      <section>
        <header className="mb-3.5 flex items-baseline justify-between gap-3">
          <h3 className="font-serif text-[24px]">Notable moves</h3>
        </header>
        <ul className="flex list-none flex-col p-0">
          {moves.map((b) => (
            /* Static reference data. The hover indent that used to be here
               promised a destination the row has never had. */
            <li key={b.date} className="rule-t flex items-center gap-3.5 py-4">
              <div className="flex-1">
                <p className="eyebrow mb-1">Date</p>
                <p className="text-[13.5px] font-semibold">{b.date}</p>
              </div>
              <span className="font-mono text-[13px]" style={{ color: b.color }}>
                {b.chg}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <header className="mb-4 flex items-baseline justify-between gap-3">
          <h3 className="font-serif text-[24px]">Newswire</h3>
          <CapsLink href="/wire">See more</CapsLink>
        </header>
        {/* Headlines, ruled apart.

            Each story used to sit under a 120px gradient block with a looping
            gold shimmer — a permanent skeleton standing in for a photograph
            that never arrives, identical on every item, carrying nothing. The
            hairline does the separating now, which is what the ledger does
            everywhere else. */}
        <ul className="m-0 flex list-none flex-col p-0">
          {snapshot.news.map((n: WireItem) => (
            <li key={n.id} className="border-t border-rule-list first:border-t-0">
              <button
                type="button"
                onClick={() => setStory(n)}
                className="group block w-full py-4 text-left first:pt-0"
              >
                <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                  <span className="eyebrow eyebrow-gold">{n.source}</span>
                  <span aria-hidden="true" className="h-2.5 w-px bg-rule-mono" />
                  <span className="font-mono text-[11px] text-ink-3">{n.time}</span>
                </span>
                <span className="font-serif mt-2 block text-[19px] leading-[1.4] text-pretty transition-colors group-hover:text-gold-hi">
                  {n.title}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <Reader
        open={!!story}
        onClose={() => setStory(null)}
        title={story?.title ?? ""}
        eyebrow={
          story && (
            <>
              <span className="text-[12px] font-semibold text-gold-dim">
                {story.source}
              </span>
              <span aria-hidden="true" className="h-2.5 w-px bg-rule-mono" />
              <span className="text-[12.5px] text-ink-3">{story.time}</span>
            </>
          )
        }
      >
        <p className="text-[13.5px] leading-[1.75] text-ink-3">{story?.summary}</p>
      </Reader>
    </div>
  );
}
