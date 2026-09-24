"use client";

import { motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { TabId } from "@/lib/market/types";
import { edgeMask, overflowEdges, revealScrollLeft, stepTab } from "./tab-strip";
import { cn } from "./ui";

export const TABS: Array<{ id: TabId; label: string }> = [
  { id: "overview", label: "OVERVIEW" },
  { id: "performance", label: "PERFORMANCE" },
  { id: "analysts", label: "ANALYSTS" },
  { id: "fundamentals", label: "FUNDAMENTALS" },
  { id: "technicals", label: "TECHNICALS" },
  { id: "competitors", label: "COMPETITORS" },
  { id: "holdings", label: "HOLDINGS" },
];

/* Width of the edge fade, and how far clear of it a tab is brought to rest. */
const FADE = 28;

/* Quick and fully damped: the bar arrives under the new label without
   overshooting it, so it reads as a precise move rather than a bounce. */
const SLIDE = { type: "spring", stiffness: 560, damping: 46, mass: 0.9 } as const;

/* The rule under a label is inset by the tab's own padding on the left, and on
   the right by that padding plus the 0.18em of tracking the last letter
   carries, so it spans the glyphs exactly rather than trailing past them. */
const UNDER_LABEL = "absolute bottom-0 left-3 right-[calc(0.75rem+0.18em)] h-0.5";

/**
 * How far the row of tabs runs, read from layout rather than `scrollWidth`.
 * While the bar slides, its in-flight transform counts toward the strip's
 * scrollable overflow: at 390px, selecting HOLDINGS read 732px against a
 * resting 722px, so the strip, sitting at its true end, measured as having
 * more beyond it and left the end fade over the last label. Offsets ignore
 * transforms.
 */
function rowWidth(list: HTMLElement, tabs: Array<HTMLButtonElement | null>): number {
  const last = tabs[tabs.length - 1];
  return last ? last.offsetLeft + last.offsetWidth : list.scrollWidth;
}

/**
 * The instrument's view switcher.
 *
 * The selected tab reads by three things together: its label at full ink while
 * the rest sit a clear step down at ink-4, a 2px gold rule under it that slides
 * from tab to tab, and that rule sitting on the strip's hairline so the two read
 * as one line with a lit segment. The strip used to draw a 1px rule at
 * `-bottom-px`, which put it on the list's border, outside the scroll
 * container's padding box, where `overflow-x: auto` clipped it away entirely:
 * the selected tab had no marker at all, only a colour one step lighter.
 *
 * Narrow widths scroll the strip sideways. The content fades toward whichever
 * edge has more beyond it, and the selected tab is always brought clear of the
 * fades, which is what keeps HOLDINGS from resting half off the screen.
 *
 * Roving-tabindex tablist per the WAI-ARIA tabs pattern: only the selected tab
 * is in the tab order, arrows move and select, Home and End jump to the ends.
 */
export function TabBar({
  active,
  onChange,
}: {
  active: TabId;
  onChange: (id: TabId) => void;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const settled = useRef(false);
  const reduce = useReducedMotion();

  /* Starts with no fades, as the server renders it; measured after mount. */
  const [edges, setEdges] = useState({ start: false, end: false });

  const measure = useCallback(() => {
    const list = listRef.current;
    if (!list) return;
    const next = overflowEdges(
      list.scrollLeft,
      list.clientWidth,
      rowWidth(list, tabRefs.current),
    );
    setEdges((prev) =>
      prev.start === next.start && prev.end === next.end ? prev : next,
    );
  }, []);

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    measure();
    list.addEventListener("scroll", measure, { passive: true });
    /* The strip's own box does not change when the webfont lands and every
       label widens, so the tabs are observed as well as the strip. */
    const observer = new ResizeObserver(measure);
    observer.observe(list);
    for (const tab of tabRefs.current) if (tab) observer.observe(tab);
    return () => {
      list.removeEventListener("scroll", measure);
      observer.disconnect();
    };
  }, [measure]);

  useEffect(() => {
    const list = listRef.current;
    const index = TABS.findIndex((t) => t.id === active);
    const tab = tabRefs.current[index];
    if (!list || !tab) return;
    const left = revealScrollLeft({
      scrollLeft: list.scrollLeft,
      viewport: list.clientWidth,
      content: rowWidth(list, tabRefs.current),
      start: tab.offsetLeft,
      end: tab.offsetLeft + tab.offsetWidth,
      margin: FADE,
    });
    if (left !== null) {
      list.scrollTo({ left, behavior: reduce || !settled.current ? "auto" : "smooth" });
    }
    settled.current = true;
  }, [active, reduce]);

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const index = TABS.findIndex((t) => t.id === active);
    const next = stepTab(e.key, index, TABS.length);
    if (next === null) return;
    e.preventDefault();
    onChange(TABS[next].id);
    /* The strip scrolls the tab clear of the fades itself; letting focus
       scroll it too would jump it flush against the edge first. */
    tabRefs.current[next]?.focus({ preventScroll: true });
  }

  const mask = edgeMask(edges, FADE);

  return (
    /* Bled 12px past the column on each side so the tabs can carry padding for
       their hit area and focus ring while the first label still starts on the
       column's edge. The hairline is inset back to the column's width, so it
       lines up with the rule the header draws above it.

       Labels sit 32px apart where the strip has room for that and 24px where
       it does not, decided by the strip's own width rather than the viewport's,
       since the rails either side change how much of the viewport it gets. At
       32px the six labels need about 737px; at 24px about 697px, which is what
       lets the whole row fit a 1024 display instead of scrolling by 17px and
       leaving HOLDINGS under the fade. */
    <div className="@container relative -mx-3">
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-3 bottom-0 h-px bg-rule-section"
      />
      <motion.div
        ref={listRef}
        layoutScroll
        role="tablist"
        aria-label="Stock detail"
        onKeyDown={onKeyDown}
        className="no-scrollbar relative flex overflow-x-auto overscroll-x-contain @min-[760px]:gap-2"
        style={{ maskImage: mask, WebkitMaskImage: mask }}
      >
        {TABS.map((tab, i) => {
          const selected = tab.id === active;
          return (
            <button
              key={tab.id}
              ref={(node) => {
                tabRefs.current[i] = node;
              }}
              type="button"
              role="tab"
              id={`tab-${tab.id}`}
              aria-selected={selected}
              aria-controls={`panel-${tab.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => onChange(tab.id)}
              className={cn(
                "group relative flex min-h-11 flex-none items-center px-3 py-4 text-[11px] font-bold tracking-[0.18em] whitespace-nowrap",
                "transition-colors duration-200 ease-lux focus-visible:outline-offset-[-3px]",
                selected
                  ? "text-ink"
                  : "text-ink-4 hover:text-ink-2 active:text-gold active:duration-0",
              )}
            >
              {tab.label}
              {selected ? (
                <motion.span
                  layoutId="instrument-tab-indicator"
                  aria-hidden="true"
                  transition={reduce ? { duration: 0 } : SLIDE}
                  className={cn(UNDER_LABEL, "pointer-events-none bg-gold")}
                />
              ) : (
                /* Where the bar would land: a quiet rule on hover that warms
                   toward gold while the press is held. */
                <span
                  aria-hidden="true"
                  className={cn(
                    UNDER_LABEL,
                    "pointer-events-none bg-rule-mono opacity-0 transition-opacity duration-200",
                    "group-hover:opacity-100 group-active:bg-gold-deep group-active:opacity-100",
                  )}
                />
              )}
            </button>
          );
        })}
      </motion.div>
    </div>
  );
}
