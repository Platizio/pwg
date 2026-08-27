"use client";

import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { useRef } from "react";
import { money, pct } from "@/lib/market/format";
import { C } from "@/lib/tokens";

/**
 * Seamless marquee. The row renders twice and translates by exactly half its
 * own width, so the loop point stays invisible no matter how wide the content
 * becomes — a fixed pixel keyframe seams the moment a price grows a digit.
 */
export function TickerTape({
  rows = [],
}: {
  /* Optional so the instrument page, which is still on authored data and has
     no snapshot to hand, can mount the tape without one. An empty tape renders
     nothing rather than scrolling blank. */
  rows?: Array<{ id: string; price: number; chg: number }>;
}) {
  const scope = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();

      mm.add(
        {
          animate: "(prefers-reduced-motion: no-preference)",
          still: "(prefers-reduced-motion: reduce)",
        },
        (ctx) => {
          if (!ctx.conditions?.animate || !track.current) return;

          const tween = gsap.to(track.current, {
            xPercent: -50,
            duration: 52,
            ease: "none",
            repeat: -1,
          });

          const el = scope.current;
          const hold = () => gsap.to(tween, { timeScale: 0, duration: 0.45 });
          const resume = () => gsap.to(tween, { timeScale: 1, duration: 0.45 });

          el?.addEventListener("pointerenter", hold);
          el?.addEventListener("pointerleave", resume);
          el?.addEventListener("focusin", hold);
          el?.addEventListener("focusout", resume);

          return () => {
            el?.removeEventListener("pointerenter", hold);
            el?.removeEventListener("pointerleave", resume);
            el?.removeEventListener("focusin", hold);
            el?.removeEventListener("focusout", resume);
          };
        },
      );

      return () => mm.revert();
    },
    { scope },
  );

  /* A tape with nothing on it is a strip of empty rule, not a tape. */
  if (rows.length === 0) return null;

  const row = rows.concat(rows);

  return (
    /* A labelled region, not a bare div: `aria-label` on an element with no
       role is dropped, which left the tape anonymous to assistive tech. */
    <section
      ref={scope}
      className="flex h-10 flex-none items-center overflow-hidden border-b border-rule-list"
      aria-label="Market tape"
    >
      <div ref={track} className="flex whitespace-nowrap will-change-transform">
        {row.map((s, i) => (
          <div
            key={`${s.id}-${i}`}
            className="font-mono flex items-center gap-3 border-r border-rule-list px-6 text-[12px] tracking-[0.05em]"
            aria-hidden={i >= rows.length}
          >
            <span className="text-ink-3">{s.id}</span>
            <span className="text-ink-2">{money(s.price)}</span>
            <span style={{ color: s.chg >= 0 ? C.up : C.down }}>{pct(s.chg)}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
