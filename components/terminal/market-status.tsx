"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { phaseWord, pricesMove, type Session } from "@/lib/market/session";
import { EASE } from "@/lib/tokens";
import { cn } from "./ui";

/**
 * Whether the US market is trading, and when it next opens.
 *
 * It used to live on the dashboard header and therefore stated the session on
 * exactly one route. A reader on /instrument/NVDA or /wire had no way to tell
 * whether the figures in front of them were moving or frozen — which is the
 * first thing any of them needs to know. It now sits in the shell's chrome bar
 * beside the search, on every route, and is rendered here and nowhere else.
 *
 * The anatomy is deliberately shared with the search that sits opposite it:
 * a mark, a label, a hairline divider, a mono tail. Two controls at either end
 * of one bar reading as one family is the whole reason the divider is here
 * rather than a second border.
 *
 * IT ROLLS. This audience trades US hours from India, where the bell is 7pm and
 * the close is half past one in the morning, so "when" is as load-bearing as
 * "what". One pill cannot hold both without becoming a sentence, so it holds
 * them in turn — and it changes over the way a departure board does, the old
 * line leaving upwards as the new one arrives from below, because a hard cut
 * at the edge of vision reads as a glitch while a roll reads as an update.
 */

/* Ten and four. The status is the resting state and earns the long dwell; the
   opening is the interruption and needs only long enough to be read once. */
const STATUS_MS = 10_000;
const OPENS_MS = 4_000;

/* Long enough to read as movement, short enough that a reader glancing up
   mid-roll is not left waiting for a word to land. */
const ROLL_S = 0.42;

/**
 * One slot of the pill, rolling between values.
 *
 * `widest` is rendered invisibly underneath and is what actually sizes the
 * slot. Without it the pill would resize on every changeover — "US Post-market
 * opens" is far wider than "US Market" — and shove the Invest button beside it
 * back and forth all day. The visible line is layered on top and clipped, so a
 * departing line disappears at the pill's own edge rather than outside it.
 */
function Rolling({
  value,
  widest,
  className,
}: {
  value: string;
  widest: string;
  className?: string;
}) {
  return (
    <span aria-hidden="true" className={cn("relative grid overflow-hidden", className)}>
      <span aria-hidden="true" className="invisible col-start-1 row-start-1 whitespace-nowrap">
        {widest}
      </span>
      <AnimatePresence initial={false}>
        <motion.span
          key={value}
          initial={{ y: "110%", opacity: 0 }}
          animate={{ y: "0%", opacity: 1 }}
          exit={{ y: "-110%", opacity: 0 }}
          transition={{ duration: ROLL_S, ease: EASE }}
          className="col-start-1 row-start-1 whitespace-nowrap"
        >
          {value}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

const longer = (a: string, b: string) => (b.length > a.length ? b : a);

export function MarketStatus({ session }: { session: Session }) {
  /* Warm and pulsing whenever prices are actually moving — which includes the
     extended hours, not just the bell. The pill used to key on `session.live`
     (regular session only) and so sat grey and dead through a pre-market in
     which every price on the page was changing. */
  const moving = pricesMove(session.phase);
  const opens = session.opens;

  const [showOpens, setShowOpens] = useState(false);

  useEffect(() => {
    /* Nothing to alternate with — a market with no opening inside eight days is
       not a market, but the pill should sit still rather than roll between one
       message and itself. */
    if (!opens) return;
    const t = setTimeout(() => setShowOpens((v) => !v), showOpens ? OPENS_MS : STATUS_MS);
    return () => clearTimeout(t);
  }, [showOpens, opens]);

  const label = `US ${phaseWord(session.phase)}`;
  const showing = showOpens && opens ? opens : null;

  return (
    <div
      className={cn(
        "flex min-h-11 flex-none items-center gap-2.5 rounded-full border px-4",
        moving
          ? "border-[rgba(217,189,139,0.28)] bg-[rgba(217,189,139,0.08)]"
          : "border-rule-control",
      )}
      /* One stable sentence for assistive tech. The visible halves roll and are
         hidden from the tree, because a pill that re-announced itself every few
         seconds would make the page unusable with a screen reader. Deliberately
         NOT role="status": that is a live region, and a live region wrapped
         around text that changes every few seconds is precisely the thing that
         makes a screen reader unusable. The label is stated once, as a label.
         Reduced motion is handled globally by the shell's <MotionConfig
         reducedMotion="user">, which turns the roll into a plain swap. */
      aria-label={opens ? `${label}. ${opens.label} at ${opens.time}.` : label}
    >
      <span
        aria-hidden="true"
        className={cn(
          "h-[7px] w-[7px] flex-none rounded-full",
          moving ? "animate-gold-pulse bg-gold" : "bg-ink-3",
        )}
      />

      <Rolling
        value={showing ? showing.label : label}
        widest={opens ? longer(label, opens.label) : label}
        className={cn(
          "text-[13px] font-medium",
          moving ? "text-gold" : "text-ink-3",
        )}
      />

      <span aria-hidden="true" className="h-3 w-px bg-rule-mono" />

      <Rolling
        value={showing ? showing.time : session.clock}
        widest={opens ? longer(session.clock, opens.time) : session.clock}
        className="font-mono text-[12.5px] tracking-[0.04em] text-ink-3"
      />
    </div>
  );
}
