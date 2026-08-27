"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { Card, Delta } from "@/components/ui/surface";
import { money, signed } from "@/lib/market/format";
import type { IndexView } from "@/lib/market/home";
import type { MarketIndex, Quote } from "@/lib/market/session";
import { C } from "@/lib/tokens";
import { cn } from "@/lib/ui";

/**
 * The market, one index at a time.
 *
 * This replaced a grid of thirty-six anonymous squares, and the reason it had
 * to is worth keeping written down: that grid was redundant with its own
 * caption. "20 of 36 names finished higher" said everything the squares said,
 * so the squares were decoration — and decoration is what makes an expensive
 * interface read as cheap.
 *
 * Tabs fix it by giving the card something a caption cannot do. Choose a
 * market and the panel below is about that market: its level, how broadly its
 * own names moved, and which of them led and lagged. One market at a time is
 * also the answer to not overwhelming anybody.
 */
export function MarketCard({ views }: { views: IndexView[] }) {
  const [active, setActive] = useState(views[0]?.index.id ?? "");
  const tabsRef = useRef<HTMLDivElement>(null);

  /* The tracking funds were not quoting when this snapshot was taken. The card
     keeps its frame and says so; a level invented to fill it would be worse
     than the gap. */
  if (views.length === 0) {
    return (
      <Card lit className="px-7 py-7">
        <p className="text-[13.5px] leading-[1.7] text-ink-3">
          No index is quoting. The tabs return when the tracking funds do.
        </p>
      </Card>
    );
  }

  /* Unlike the fixed list this replaced, views can change between renders, so
     the id in state may name a tab that is no longer there. Whichever view
     renders is the one that counts as selected. */
  const view = views.find((v) => v.index.id === active) ?? views[0];
  const { index, breadth, leaders, laggards, sample, proxyTicker } = view;

  /* The feed sends a percentage, not a currency move, so the figure under the
     delta is back-solved from the two numbers that did arrive. */
  const prev = index.level / (1 + index.chg / 100);

  /* WAI-ARIA tabs: only the selected tab is in the tab order, arrows move
     between them, Home and End jump, and selection follows focus. */
  function onKeyDown(e: React.KeyboardEvent) {
    const keys = ["ArrowRight", "ArrowLeft", "Home", "End"];
    if (!keys.includes(e.key)) return;
    e.preventDefault();

    const at = views.findIndex((v) => v.index.id === index.id);
    const next =
      e.key === "Home"
        ? 0
        : e.key === "End"
          ? views.length - 1
          : e.key === "ArrowRight"
            ? (at + 1) % views.length
            : (at - 1 + views.length) % views.length;

    setActive(views[next].index.id);
    tabsRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
  }

  return (
    <Card lit className="px-7 py-7">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-4">
        <div
          ref={tabsRef}
          role="tablist"
          aria-label="Market"
          onKeyDown={onKeyDown}
          className="flex flex-wrap items-center gap-2"
        >
          {views.map(({ index: i }) => {
            const selected = i.id === index.id;
            return (
              <button
                key={i.id}
                role="tab"
                id={`market-tab-${i.id}`}
                aria-selected={selected}
                aria-controls="market-panel"
                tabIndex={selected ? 0 : -1}
                onClick={() => setActive(i.id)}
                className={cn(
                  "min-h-11 rounded-full px-5 text-[13.5px] font-medium transition-all duration-300",
                  selected
                    ? "bg-[linear-gradient(140deg,#f6e6c6,#dcbb8a)] text-on-gold shadow-[0_10px_26px_-12px_rgba(217,189,139,0.6)]"
                    : "border border-rule-control text-ink-3 hover:border-[rgba(217,189,139,0.3)] hover:text-ink",
                )}
              >
                {i.short}
              </button>
            );
          })}
        </div>

      </div>

      <div
        id="market-panel"
        role="tabpanel"
        aria-labelledby={`market-tab-${index.id}`}
        tabIndex={0}
        className="mt-7 focus-visible:outline-offset-8"
      >
      <div className="grid gap-x-10 gap-y-8 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1fr)]">
        <div className="min-w-0">
          <div className="flex flex-wrap items-end gap-x-8 gap-y-4">
            <div className="min-w-0">
              <p className="font-mono text-[clamp(2.5rem,5vw,3.75rem)] leading-none font-light tracking-[-0.03em] text-ink">
                {money(index.level)}
              </p>
              {/* The figure is a fund's share price, and at a glance a large
                  number under an index heading reads as the index. Naming the
                  fund here means the paragraph below confirms rather than
                  corrects. */}
              <p className="font-mono mt-2 text-[11.5px] tracking-[0.08em] text-ink-3">
                {proxyTicker}
              </p>
            </div>
            <div className="mb-1.5 flex flex-col gap-1.5">
              <Delta value={index.chg} size="text-[17px]" />
              <span className="font-mono text-[12.5px] tracking-[0.04em] text-ink-3">
                {signed(index.level - prev, 2)} today
              </span>
            </div>
          </div>

          <p className="mt-5 max-w-[38ch] text-[13.5px] leading-[1.7] text-ink-3">
            {index.note}
          </p>
        </div>

        <Breadth index={index} breadth={breadth} basis={sample.basis} />
      </div>

        <div className="mt-7 grid gap-x-8 gap-y-7 border-t border-rule-section pt-6 sm:grid-cols-2">
          <MoverStrip
            title="Biggest gains today"
            caption={`The ${index.short} names that rose most`}
            rows={leaders}
          />
          <MoverStrip
            title="Biggest falls today"
            caption={`The ${index.short} names that fell most`}
            rows={laggards}
          />
        </div>
      </div>
    </Card>
  );
}

/**
 * How broadly the index moved.
 *
 * This is the fix for a line that used to read "19 of the 34 we cover here
 * rose today" — a sentence that left two questions open: 34 out of what, and
 * what does 34 have to do with an index of five hundred. It is spelled out
 * now, in the order a reader actually asks it.
 *
 * The closing clause once called the level above the real one. No index
 * instrument is entitled on this account, so it is not: the number is a
 * tracking fund. The line now admits the same thing the index note does.
 */
function Breadth({
  index,
  breadth,
  basis,
}: {
  index: MarketIndex;
  breadth: { total: number; up: number; down: number };
  /* How the sample was drawn, supplied by the data. The count moves with the
     sweep, and the wording must never harden into a claim of membership. */
  basis: string;
}) {
  const upShare = breadth.total ? (breadth.up / breadth.total) * 100 : 0;

  return (
    <div className="min-w-0 rounded-[var(--radius-tile)] border border-rule-section bg-[linear-gradient(140deg,var(--c-tile-from),var(--c-tile-to))] p-5">
      <p className="card-label">How the {index.short} moved today</p>

      {/* One combed bar, hard-split at the advancing share. */}
      <div
        aria-hidden="true"
        className="tick-split mt-4 h-[22px] w-full"
        style={{
          background: `linear-gradient(90deg, ${C.up} 0 ${upShare}%, ${C.down} ${upShare}% 100%)`,
        }}
      />

      <div className="mt-3 flex items-baseline justify-between gap-4">
        <span className="font-mono text-[17px]" style={{ color: C.up }}>
          {breadth.up} rose
        </span>
        <span className="font-mono text-[17px]" style={{ color: C.down }}>
          {breadth.down} fell
        </span>
      </div>

      <p className="mt-4 border-t border-rule-section pt-3.5 text-[13px] leading-[1.65] text-ink-3">
        Counted across{" "}
        <span className="text-ink-2">{breadth.total} companies</span> — {basis}.
        No constituent list is available on this account, so this is a stand-in
        for the index rather than its own membership, and the level above is the
        price of the tracking fund.
      </p>
    </div>
  );
}

/** Three names, each one a door into its instrument page. */
function MoverStrip({
  title,
  caption,
  rows,
}: {
  title: string;
  caption: string;
  rows: Quote[];
}) {
  return (
    <div className="min-w-0">
      <p className="card-label">{title}</p>
      <p className="mt-1 text-[12.5px] text-ink-3">{caption}</p>
      <ul className="m-0 mt-4 flex list-none flex-col gap-1 p-0">
        {rows.map((q) => {
          const body = (
            <>
              <span
                aria-hidden="true"
                /* Sized from its tile, per the monogram rule. */
                className="font-serif grid h-9 w-9 flex-none place-items-center rounded-[10px] border border-[rgba(217,189,139,0.14)]"
                style={{ color: q.color, fontSize: 17 }}
              >
                {q.mark}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13.5px] font-medium text-ink">
                  {q.name}
                </span>
                <span className="font-mono mt-0.5 block text-[12px] tracking-[0.05em] text-ink-3">
                  {q.id}
                </span>
              </span>
              <span className="flex-none text-right">
                <span className="font-mono block text-[13.5px] text-ink-2">
                  {money(q.price)}
                </span>
                <span className="mt-1 flex justify-end">
                  <Delta value={q.chg} size="text-[12px]" />
                </span>
              </span>
            </>
          );
          const inner =
            "flex min-h-[56px] items-center gap-3 rounded-[var(--radius-tile)] px-2.5 transition-colors";

          return (
            <li key={q.id}>
              <Link
                href={`/instrument/${q.id}`}
                className={cn(inner, "hover:bg-[rgba(217,189,139,0.06)]")}
              >
                {body}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
