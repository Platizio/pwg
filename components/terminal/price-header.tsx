"use client";
import { useLiveSession } from "@/components/home/use-session";

import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { useEffect, useRef } from "react";
import { money, pct } from "@/lib/market/format";
import { RANGES } from "@/lib/market/ranges";
import type { RangeId } from "@/lib/market/types";
import type { CompanyProfile } from "@/lib/api/normalize/profile";
import { type Session } from "@/lib/market/session";
import { livenessText } from "@/lib/market/liveness";
import { C } from "@/lib/tokens";
import { Segmented, SegmentedItem, cn } from "./ui";
import { useShownQuote } from "./live-provider";

/** Tick age in words. Short, because it sits inside a tooltip. */
const ago = (ms: number) =>
  ms < 60_000 ? `${Math.max(1, Math.round(ms / 1000))}s ago` : `${Math.round(ms / 60_000)} min ago`;

export function PriceHeader({
  profile,
  session: rendered,
  range,
  onRange,
}: {
  profile: CompanyProfile;
  session: Session;
  range: RangeId;
  onRange: (id: RangeId) => void;
}) {
  const session = useLiveSession(rendered);
  const priceRef = useRef<HTMLSpanElement>(null);

  /* The headline figure is the one a reader watches, so it takes live ticks
     first. The server profile is still what renders — a tick only replaces it
     once a real trade arrives for this symbol.

     Price and change move together or not at all: a live price beside the
     snapshot's change would pair this second's number with an older basis and
     quietly misstate the move.

     The choice itself lives in useShownQuote, so the cards that derive from
     the price — the market cap, the previous close the change is struck from,
     the Day's and 52-week ranges — read the very same one. The badge and the
     number are still decided by one predicate there, clock included: a feed
     that dies mid-session must not leave "Live" over a frozen price. A company
     the feed will not price shows a dash rather than a zero. */
  const { price, chg, live, fromLast } = useShownQuote(profile, session.phase);
  const up = (chg ?? 0) >= 0;

  const statusText = livenessText(live.state, session.phase, session.label);
  const statusTitle =
    live.state === "idle"
      ? session.label
      : live.ageMs === null
        ? "Showing the last published snapshot — no live tick received"
        : live.state === "live"
          ? `Live price — last tick ${ago(live.ageMs)}`
          : fromLast
            ? `Last trade ${ago(live.ageMs)}`
            : `Showing the last published snapshot — last live tick ${ago(live.ageMs)}`;

  /* Count the price into place on every instrument change. Written straight to
     the text node — routing 60 frames a second through React state would
     re-render the whole terminal for a cosmetic effect. */
  /* The price React is currently showing, for the count-up below to defer to.
     Updated after commit, which is before the next animation frame reads it. */
  const latestPrice = useRef(price);
  useEffect(() => {
    latestPrice.current = price;
  }, [price]);

  useGSAP(
    () => {
      const node = priceRef.current;
      if (!node) return;

      const mm = gsap.matchMedia();
      mm.add(
        {
          animate: "(prefers-reduced-motion: no-preference)",
          still: "(prefers-reduced-motion: reduce)",
        },
        (ctx) => {
          if (!ctx.conditions?.animate) {
            node.textContent = price === null ? "—" : money(price);
            return;
          }
          if (price === null) {
            node.textContent = "—";
            return;
          }
          const from = { v: price * 0.968 };
          const target = price;
          /* The tween must never have the last word. It writes the text node
             directly, sixty times a second for a second, and a live tick that
             landed in that second was committed by React and then painted over
             by the next frame — and React will not rewrite text whose string
             has not changed, so a quiet symbol could sit on the render-time
             price beside a live change figure and a "Live" badge. Each frame
             now checks the price React currently holds; the moment it differs
             from where the count-up was heading, the count-up stops and the
             real number goes in. */
          const settle = () => {
            const now = latestPrice.current;
            node.textContent = now === null ? "—" : money(now);
          };
          const tween = gsap.to(from, {
            v: target,
            duration: 1,
            ease: "power2.out",
            onUpdate: () => {
              if (latestPrice.current !== target) {
                tween.kill();
                settle();
                return;
              }
              node.textContent = money(from.v);
            },
            onComplete: settle,
          });
        },
      );

      return () => mm.revert();
    },
    { dependencies: [profile.id, profile.price] },
  );

  /* The price and the controls stack rather than sitting side by side. The
     working column is around 750px even on a wide display, and six ranges plus
     three toggles do not fit beside a 58px numeral — they wrapped into a ragged
     second line. Given the full width they read as one toolbar under the
     price. */
  return (
    <div className="mb-6 flex flex-col gap-6">
      <div>
        <p className="eyebrow eyebrow-wide mb-2.5">Last traded price · USD</p>
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-3">
          <p className="font-serif flex items-baseline gap-1.5">
            <span className="text-[24px] text-gold-dim">$</span>
            <span
              ref={priceRef}
              className="text-[42px] leading-[0.9] tracking-[0.005em] sm:text-[58px]"
            >
              {price === null ? "—" : money(price)}
            </span>
          </p>

          <span
            className="font-mono border px-3 py-1.5 text-[11.5px] tracking-[0.04em]"
            style={{
              color: up ? C.up : C.down,
              borderColor: `color-mix(in srgb, var(${up ? "--color-up" : "--color-down"}) 35%, transparent)`,
            }}
          >
            {chg === null ? "—" : pct(chg)}
          </span>

          <span className="eyebrow flex items-center gap-2.5" title={statusTitle}>
            {/* The dot follows the FEED, not the calendar.

                It used to pulse on pricesMove(phase) alone, which asks whether
                the market is trading — never whether we are receiving it. So
                during market hours it pulsed identically over a tick from this
                second and over a five-minute-old snapshot. That is the exact
                mechanism upstream.ts has on record: the gateway refusing every
                subscription while the terminal "looked exactly like a live page
                on a quiet day". The server half of that was fixed and this is
                the reader's half, so it now pulses only when the number beside
                it actually came off the wire.

                Pre-market and post-market still count as live — quotes move in
                both, and the earlier note is right that pairing them with a
                dead dot understated a number that was moving. */}
            <span
              aria-hidden="true"
              className={cn(
                "h-[5px] w-[5px] rounded-full",
                live.state === "live" ? "animate-gold-pulse bg-gold" : "bg-ink-4",
              )}
            />
            {statusText}
          </span>
        </div>
      </div>

      {/* The range is the control reached for repeatedly, so it keeps the
          bordered strip. There is no candlestick link: the owner wants every
          chart as a line ("i dont want any candle chart or bar chart"). */}
      <div className="flex flex-wrap items-center justify-end gap-x-8 gap-y-5">
        <Segmented label="Time range">
          {RANGES.map((r) => (
            <SegmentedItem
              key={r.id}
              active={range === r.id}
              onClick={() => onRange(r.id)}
              className="px-3.5"
            >
              {r.label}
            </SegmentedItem>
          ))}
        </Segmented>
      </div>
    </div>
  );
}
