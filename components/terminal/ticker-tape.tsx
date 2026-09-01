"use client";

import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { useMemo, useRef } from "react";
import { money, pct } from "@/lib/market/format";
import { C } from "@/lib/tokens";
import { useLive } from "./live-provider";

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

  /* The tape is the one surface where a stale number is most obvious, so it is
     the first to take live ticks. The server snapshot is still what renders —
     these only overwrite a row once a real trade arrives for that symbol, and
     a symbol the stream never mentions keeps the price it was given. */
  const symbols = useMemo(() => rows.map((r) => r.id), [rows]);
  const ticks = useLive(symbols);

  const live = useMemo(
    () =>
      rows.map((r) => {
        const t = ticks.get(r.id.toUpperCase());
        if (!t) return r;
        /* changePercent is null when the feed sent no previous close. Keeping
           the snapshot's change beside a live price would pair today's move
           with yesterday's basis, so the row stays whole rather than half-fresh. */
        if (t.changePercent === null) return r;
        return { ...r, price: t.price, chg: t.changePercent };
      }),
    [rows, ticks],
  );

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

  const row = live.concat(live);

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
