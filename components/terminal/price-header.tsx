"use client";
import { useLiveSession } from "@/components/home/use-session";

import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { useEffect, useRef } from "react";
import { IconCandles } from "@/components/icons";
import { money, pct } from "@/lib/market/format";
import { RANGES } from "@/lib/market/ranges";
import type { RangeId } from "@/lib/market/types";
import { chartPath } from "@/lib/market/paths";
import type { CompanyProfile } from "@/lib/api/normalize/profile";
import { type Session } from "@/lib/market/session";
import { liveness, livenessText } from "@/lib/market/liveness";
import { C } from "@/lib/tokens";
import { Segmented, SegmentedItem, cn } from "./ui";
import { useLastTick, useLiveQuote, useNow } from "./live-provider";

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
     quietly misstate the move. */
  const tick = useLiveQuote(profile.id);
  /* A tick that cannot supply both halves is not a live price, so it is not
     treated as one anywhere below — including by the badge. */
  const priced = tick !== null && tick.changePercent !== null ? tick : null;

  /* One predicate decides the badge AND the number, so the two can never
     disagree. The clock is half of it: live-provider's buffer never expires a
     tick, so a feed that dies mid-session leaves its last one sitting there and
     nothing re-renders to notice. Without `now` this would read "Live" over a
     frozen price for as long as the tab stayed open. */
  const now = useNow();
  const live = liveness(priced, session.phase, now);
  const showing = priced !== null && live.state === "live";

  /* A company the feed will not price shows a dash rather than a zero: a zero
     in this position reads as a real quote. */
  /* When the live tick has aged out, the last real trade is still usually
     NEWER than the price this page was rendered with. Showing the render-time
     price then puts an older number on screen than the one the reader just
     watched go past — overnight it presented a mid-session price as the
     close. Use whichever is newer; price and change still travel together. */
  const last = useLastTick(profile.id);
  const lastPriced = last !== null && last.changePercent !== null ? last : null;
  const fromLast =
    !showing && lastPriced !== null && (profile.asOf === null || lastPriced.at > profile.asOf);

  const price = showing ? priced.price : fromLast ? lastPriced.price : profile.price;
  const chg = showing ? priced.changePercent : fromLast ? lastPriced.changePercent : profile.chg;
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
              borderColor: up ? "rgba(125,211,160,.35)" : "rgba(224,121,107,.35)",
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

      {/* Two tiers, separated by space rather than by boxes. The range is the
          control reached for repeatedly, so it keeps the bordered strip.

          CANDLES used to be the other half of an in-page AREA/CANDLES toggle.
          It is now a departure: candlesticks live in TradingView's advanced
          chart, which brings its own data and toolset rather than drawing our
          delayed, minute-sparse feed. It is deliberately NOT the old quiet
          toggle vocabulary — that styling carried no border and no fill, and
          the owner could not find the control at all. A link that leaves the
          page should look like one. */}
      <div className="flex flex-wrap items-center justify-between gap-x-8 gap-y-5">
        <a
          href={chartPath(profile.id)}
          target="_blank"
          rel="noopener noreferrer"
          title={`Open ${profile.id} candlesticks in TradingView`}
          className="font-mono flex min-h-11 items-center gap-2 text-[11px] tracking-[0.1em] text-gold transition-colors hover:text-gold-hi md:min-h-0 md:py-2.5"
        >
          <IconCandles className="h-3.5 w-3.5" />
          <span>CANDLES</span>
          <span aria-hidden="true" className="text-[10px]">&#8599;</span>
          <span className="sr-only"> (opens in a new tab)</span>
        </a>

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
