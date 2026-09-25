"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { useLive } from "@/components/terminal/live-provider";
import { Card, Delta } from "@/components/ui/surface";
import { money, signed } from "@/lib/market/format";
import type { Tick } from "@/lib/api/stream/tick";
import type { IndexView } from "@/lib/market/home";
import type { MarketIndex, Quote } from "@/lib/market/session";
import { C } from "@/lib/tokens";
import { cn } from "@/lib/ui";
import { instrumentPath } from "@/lib/market/paths";
import { CARD_X } from "./inset";
import { withTick } from "./same-session";

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

  /* Unlike the fixed list this replaced, views can change between renders, so
     the id in state may name a tab that is no longer there. Whichever view
     renders is the one that counts as selected. It is derived above the empty
     case because the hook under it cannot sit behind a return. */
  const view = views.find((v) => v.index.id === active) ?? views[0];

  /* Every tab's symbols, not only the selected tab's. The provider subscribes
     the union of what the page has registered and reopens the stream whenever
     that union changes, so registering the visible tab alone would drop every
     live price on the page — the tape's included — for the length of a
     reconnect on each click. Holding all three costs a handful of symbols and
     makes switching tabs free.

     The headline's symbol is the proxy ticker rather than the index id: no
     exchange quotes "SPX", and subscribing it would simply never tick. */
  const symbols = useMemo(
    () =>
      views.flatMap((v) => [
        v.proxyTicker,
        ...v.leaders.map((q) => q.id),
        ...v.laggards.map((q) => q.id),
      ]),
    [views],
  );
  const ticks = useLive(symbols);

  const leaders = useMemo(() => freshen(view?.leaders, ticks), [view, ticks]);
  const laggards = useMemo(() => freshen(view?.laggards, ticks), [view, ticks]);

  /* The tracking funds were not quoting when this snapshot was taken. The card
     keeps its frame and says so; a level invented to fill it would be worse
     than the gap. */
  if (views.length === 0) {
    return (
      <Card lit className={cn("py-7 max-sm:py-4", CARD_X)}>
        <p className="text-[13.5px] leading-[1.7] text-ink-3">
          No index is quoting. The tabs return when the tracking funds do.
        </p>
      </Card>
    );
  }

  const { index, breadth, sample, proxyTicker } = view;

  /* The level and the percent move together or not at all, on the same terms
     as the rows below. A proxy the stream never mentions leaves the headline
     exactly as the server drew it. */
  const tick = ticks.get(proxyTicker.toUpperCase());
  const head =
    tick && tick.changePercent !== null
      ? { level: tick.price, chg: tick.changePercent }
      : { level: index.level, chg: index.chg };

  /* The feed sends a percentage, not a currency move, so the figure under the
     delta is back-solved from the two numbers that did arrive — from whichever
     pair is on screen, since a live percent over the snapshot's dollar move
     would price today's session off a level no longer shown. */
  const prev = head.level / (1 + head.chg / 100);

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
    /* The dashboard's one inset (CARD_X), so the tabs, the level and the
       movers share a left line with every card below. */
    <Card lit className={cn("py-7 max-sm:py-4", CARD_X)}>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-4">
        <div
          ref={tabsRef}
          role="tablist"
          aria-label="Market"
          onKeyDown={onKeyDown}
          /* Below `lg` the pills sit in one segmented track that spans the
             card, three equal thirds at 30px, so the switcher reads as a
             control rather than three buttons and costs one short line. */
          className="flex flex-wrap items-center gap-2 max-sm:grid max-sm:w-full max-sm:max-w-[26rem] max-sm:grid-cols-3 max-sm:gap-0 max-sm:rounded-full max-sm:border max-sm:border-rule-control max-sm:p-[3px]"
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
                  "min-h-11 rounded-full px-5 text-[13.5px] font-medium whitespace-nowrap transition-all duration-300",
                  /* 30px to the eye, 44px to the thumb: the pseudo-element
                     carries the hit area into the track's padding. */
                  "max-sm:relative max-sm:h-[30px] max-sm:min-h-0 max-sm:px-2 max-sm:text-[12px] max-sm:before:absolute max-sm:before:inset-x-0 max-sm:before:-inset-y-[7px]",
                  selected
                    ? "bg-[image:var(--cta-buy)] text-on-gold shadow-[0_10px_26px_-12px_rgba(217,189,139,0.6)] max-sm:shadow-[0_6px_16px_-10px_rgba(217,189,139,0.6)]"
                    : "border border-rule-control text-ink-3 hover:border-[rgba(217,189,139,0.3)] hover:text-ink max-sm:border-transparent max-sm:hover:border-transparent",
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
        className="mt-7 focus-visible:outline-offset-8 max-sm:mt-4"
      >
      <div className="grid gap-x-10 gap-y-8 max-sm:gap-y-3.5 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1fr)]">
        <div className="min-w-0">
          {/* Below `lg`: the level and the day's move on one line. */}
          <div className="flex flex-wrap items-end gap-x-8 gap-y-4 max-sm:items-baseline max-sm:gap-x-3 max-sm:gap-y-1">
            <div className="min-w-0">
              <p className="font-mono text-[clamp(2.5rem,5vw,3.75rem)] leading-none font-light tracking-[-0.03em] text-ink max-sm:text-[28px]">
                {money(head.level)}
              </p>
              {/* The figure is a fund's share price, and at a glance a large
                  number under an index heading reads as the index. Naming the
                  fund here means the paragraph below confirms rather than
                  corrects. */}
              <p className="font-mono mt-2 text-[11.5px] tracking-[0.08em] text-ink-3 max-sm:hidden">
                {proxyTicker}
              </p>
            </div>
            <div className="mb-1.5 flex flex-col gap-1.5 max-sm:mb-0 max-sm:flex-row max-sm:items-baseline max-sm:gap-2.5">
              <Delta value={head.chg} size="text-[17px] max-sm:text-[14px]" />
              <span className="font-mono text-[12.5px] tracking-[0.04em] text-ink-3 max-sm:text-[12px]">
                {signed(head.level - prev, 2)} today
              </span>
              {/* The figure is the fund's price, not the index level: said by
                  naming the fund, not by a sentence under it. */}
              <span className="font-mono text-[11px] tracking-[0.06em] text-ink-3 sm:hidden">
                via {proxyTicker}
              </span>
            </div>
          </div>

          <p className="mt-5 max-w-[38ch] text-[13.5px] leading-[1.7] text-ink-3 max-sm:hidden">
            {index.note}
          </p>
        </div>

        <Breadth index={index} breadth={breadth} basis={sample.basis} />
      </div>

        {/* The captions point back at the sample the breadth tile describes,
            not at the index. "The S&P 500 names that rose most" claimed
            membership for Manulife, Shinhan and Arm, and the sample is drawn
            by market value, not by index (see `basis`). */}
        <div className="mt-7 grid gap-x-8 gap-y-7 border-t border-rule-section pt-6 sm:grid-cols-2 max-sm:mt-3.5 max-sm:grid-cols-2 max-sm:gap-x-4 max-sm:gap-y-1.5 max-sm:pt-3">
          <MoverStrip
            title="Biggest gains today"
            caption={`Of the ${breadth.total} names above, those that rose most`}
            rows={leaders}
          />
          <MoverStrip
            title="Biggest falls today"
            caption={`Of the ${breadth.total} names above, those that fell most`}
            rows={laggards}
          />
        </div>
      </div>
    </Card>
  );
}

/**
 * The server's rows, with a live price written over each one that ticked.
 *
 * A tick is taken whole, and only when it measures from the same previous close
 * as the row (same-session.ts). The strips are ranked on one session's move.
 * Before this check, a pre-market tick put "+4.01%" under "Biggest falls
 * today". And the order is left exactly as it arrived — the
 * ranking that chose these names was drawn over a sample this component does
 * not hold, so a strip that resorted itself under "the names that rose most"
 * would be ranking three names against a field it cannot see.
 */
function freshen(rows: Quote[] | undefined, ticks: ReadonlyMap<string, Tick>): Quote[] {
  return (rows ?? []).map((q) => withTick(q, ticks.get(q.id.toUpperCase())));
}

/**
 * How broadly the index moved.
 *
 * The two headline counts and the denominator must reconcile. They did not:
 * the card printed "163 rose" and "311 fell" beneath a total of 500, and a
 * reader who added them found 474. The 26 were not flat names — they were
 * names the gateway priced but sent no change for, which land on chg 0 and
 * were being counted in the total and in neither direction. They now have
 * their own figure, and the four numbers sum.
 *
 * The bar splits advancing against declining among the names that actually
 * moved. Splitting it against the total painted every unreported name as a
 * decline, which is how 23 large caps quoting one share each became red.
 *
 * The three-sentence disclosure that used to close this tile is gone. Two of
 * its claims were already made better elsewhere — the ETF caveat is the index
 * note directly above, and the sample caveat is the basis clause below.
 */
function Breadth({
  index,
  breadth,
  basis,
}: {
  index: MarketIndex;
  breadth: { total: number; up: number; down: number; flat: number; unreported: number };
  /* How the sample was drawn, supplied by the data. The count moves with the
     sweep, and the wording must never harden into a claim of membership. */
  basis: string;
}) {
  /* Among the names that moved, not among the sample: an unreported name is not
     a decline, and the bar must not draw it as one. */
  const moved = breadth.up + breadth.down;
  const upShare = moved ? (breadth.up / moved) * 100 : 0;
  const reported = breadth.up + breadth.down + breadth.flat;

  return (
    /* Below `lg` the tile gives up its frame for a hairline: a thin bar and
       one line of counts, so the breadth reads at a glance and costs a
       fifth of the height. */
    <div className="min-w-0 rounded-[var(--radius-tile)] border border-rule-section bg-[linear-gradient(140deg,var(--c-tile-from),var(--c-tile-to))] p-5 max-sm:rounded-none max-sm:border-x-0 max-sm:border-b-0 max-sm:bg-none max-sm:p-0 max-sm:pt-3">
      <p className="card-label max-sm:text-[12.5px]!">How the {index.short} moved today</p>

      {/* One combed bar, hard-split at the advancing share: thin vertical
          ticks, 12px tall on a phone. */}
      <div
        aria-hidden="true"
        className="tick-split mt-4 h-[22px] w-full max-sm:mt-2.5 max-sm:h-[12px]"
        style={{
          background: `linear-gradient(90deg, ${C.up} 0 ${upShare}%, ${C.down} ${upShare}% 100%)`,
        }}
      />

      <div className="mt-3 flex items-baseline justify-between gap-4 max-sm:mt-2">
        <span className="font-mono text-[17px] max-sm:text-[12.5px]" style={{ color: C.up }}>
          {breadth.up} rose
        </span>
        {breadth.flat > 0 && (
          <span className="font-mono text-[11px] text-ink-3 sm:hidden">
            {breadth.flat} unchanged
          </span>
        )}
        <span className="font-mono text-[17px] max-sm:text-[12.5px]" style={{ color: C.down }}>
          {breadth.down} fell
        </span>
      </div>

      <p className="font-mono mt-4 border-t border-rule-section pt-3.5 text-[12px] leading-[1.6] text-ink-3 max-sm:hidden">
        <span className="text-ink-2">{reported}</span> of {breadth.total} reported
        {breadth.flat > 0 && <> · {breadth.flat} unchanged</>}
        {breadth.unreported > 0 && <> · {breadth.unreported} sent no change</>}
      </p>
      <p className="mt-1.5 text-[12px] leading-[1.55] text-ink-3 max-sm:hidden">{basis}.</p>
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
      <p className="card-label max-sm:text-[12.5px]!">{title}</p>
      <p className="mt-1 text-[12.5px] text-ink-3 max-sm:hidden">{caption}</p>
      {/* Pulled out by the rows' own px-2.5, so the monograms and prices land
          on CARD_X under the label while the hover tint gets room either side.

          Below `lg` each row is a two-line cell in half the card: symbol over
          name on the left, move over price on the right, no monogram. */}
      <ul className="m-0 mt-4 -mx-2.5 flex list-none flex-col gap-1 p-0 max-sm:mt-1 max-sm:-mx-2 max-sm:gap-0">
        {rows.map((q) => {
          const body = (
            <>
              <span
                aria-hidden="true"
                /* Sized from its tile, per the monogram rule. */
                className="font-serif grid h-9 w-9 flex-none place-items-center rounded-[10px] border border-[rgba(217,189,139,0.14)] max-sm:hidden"
                style={{ color: q.color, fontSize: 17 }}
              >
                {q.mark}
              </span>
              <span className="min-w-0 flex-1 max-sm:flex max-sm:flex-col">
                {/* Two lines, as on the boards: a fund's distinguishing word
                    is usually the last one. On a phone the symbol leads and
                    the name is one truncated line under it. */}
                <span className="line-clamp-2 text-[13.5px] font-medium break-words text-ink max-sm:mt-0.5 max-sm:block max-sm:truncate max-sm:text-[11px] max-sm:font-normal max-sm:text-ink-3">
                  {q.name}
                </span>
                <span className="font-mono mt-0.5 block text-[12px] tracking-[0.05em] text-ink-3 max-sm:order-first max-sm:mt-0 max-sm:text-[12.5px] max-sm:font-medium max-sm:text-ink">
                  {q.id}
                </span>
              </span>
              <span className="flex-none text-right max-sm:flex max-sm:flex-col max-sm:items-end">
                <span className="font-mono block text-[13.5px] text-ink-2 max-sm:mt-0.5 max-sm:text-[11px] max-sm:text-ink-3">
                  {money(q.price)}
                </span>
                <span className="mt-1 flex justify-end max-sm:order-first max-sm:mt-0">
                  <Delta value={q.chg} size="text-[12px] max-sm:gap-1" />
                </span>
              </span>
            </>
          );
          const inner =
            "flex min-h-[56px] items-center gap-3 rounded-[var(--radius-tile)] px-2.5 transition-colors max-sm:min-h-11 max-sm:gap-2 max-sm:px-2 max-sm:py-1";

          return (
            <li key={q.id}>
              <Link
                href={instrumentPath(q.id)}
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
