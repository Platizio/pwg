"use client";

import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { useRef } from "react";
import { IconArea, IconCandles } from "@/components/icons";
import { money, pct } from "@/lib/market/format";
import { RANGES } from "@/lib/market/ranges";
import type { RangeId } from "@/lib/market/types";
import type { CompanyProfile } from "@/lib/api/normalize/profile";
import type { Session } from "@/lib/market/session";
import { C } from "@/lib/tokens";
import type { ChartKind } from "./price-chart";
import { QuietToggle, Segmented, SegmentedItem, cn } from "./ui";
import { useLiveQuote } from "./live-provider";

export function PriceHeader({
  profile,
  session,
  range,
  onRange,
  kind,
  onKind,
}: {
  profile: CompanyProfile;
  session: Session;
  range: RangeId;
  onRange: (id: RangeId) => void;
  kind: ChartKind;
  onKind: (k: ChartKind) => void;
}) {
  const priceRef = useRef<HTMLSpanElement>(null);

  /* The headline figure is the one a reader watches, so it takes live ticks
     first. The server profile is still what renders — a tick only replaces it
     once a real trade arrives for this symbol.

     Price and change move together or not at all: a live price beside the
     snapshot's change would pair this second's number with an older basis and
     quietly misstate the move. */
  const tick = useLiveQuote(profile.id);
  const usable = tick !== null && tick.changePercent !== null;

  /* A company the feed will not price shows a dash rather than a zero: a zero
     in this position reads as a real quote. */
  const price = usable ? tick.price : profile.price;
  const chg = usable ? tick.changePercent : profile.chg;
  const up = (chg ?? 0) >= 0;

  /* Count the price into place on every instrument change. Written straight to
     the text node — routing 60 frames a second through React state would
     re-render the whole terminal for a cosmetic effect. */
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
          gsap.to(from, {
            v: price,
            duration: 1,
            ease: "power2.out",
            onUpdate: () => {
              node.textContent = money(from.v);
            },
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

          <span className="eyebrow flex items-center gap-2.5">
            {/* The dot pulses only while the book is actually live. */}
            <span
              aria-hidden="true"
              className={cn(
                "h-[5px] w-[5px] rounded-full",
                session.live ? "animate-gold-pulse bg-gold" : "bg-ink-4",
              )}
            />
            {session.label}
          </span>
        </div>
      </div>

      {/* Two tiers, separated by space rather than by boxes.

          The range is the only control here that gets reached for repeatedly,
          so it keeps the bordered strip; chart type is set once and recedes to
          a quiet toggle. Boxing both equally is what made this row read as a
          line of cells shoved together. */}
      <div className="flex flex-wrap items-center justify-between gap-x-8 gap-y-5">
        <div role="group" aria-label="Chart type" className="flex items-center gap-4">
          <QuietToggle
            active={kind === "area"}
            onClick={() => onKind("area")}
            title="Area chart"
          >
            <IconArea className="h-3.5 w-3.5" />
            <span>AREA</span>
          </QuietToggle>
          <QuietToggle
            active={kind === "candles"}
            onClick={() => onKind("candles")}
            title="Candlestick chart"
          >
            <IconCandles className="h-3.5 w-3.5" />
            <span>CANDLES</span>
          </QuietToggle>
        </div>

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
