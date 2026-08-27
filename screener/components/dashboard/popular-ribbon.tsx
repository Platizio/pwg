"use client";

import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import Link from "next/link";
import { useRef } from "react";
import { Delta } from "@/components/ui/surface";
import { money } from "@/lib/market/format";
import type { Quote } from "@/lib/market/session";
import { cn } from "@/lib/ui";

/**
 * The popular names, rotating.
 *
 * The market tape's seamless-marquee mechanic at card scale: the row is
 * rendered twice and translated by exactly half its own width, so the loop
 * point stays invisible however wide a cell grows. Each cell carries the
 * instrument's mark, its ticker and its quote — the "logo and the info
 * required" the wireframe asks for.
 *
 * It holds on hover and on focus. A ribbon that keeps moving while someone is
 * reading or tabbing through it cannot be used, and the whole strip is inert
 * under `prefers-reduced-motion`.
 */
export function PopularRibbon({ rows }: { rows: Quote[] }) {
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
            duration: 62,
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

  /* An empty ribbon still scrolls, forever, past nothing. Better to be absent
     than to advertise a loop with no contents. */
  if (rows.length === 0) return null;

  const doubled = rows.concat(rows);

  return (
    <div ref={scope} className="overflow-hidden">
      <div ref={track} className="flex w-max gap-3 will-change-transform">
        {doubled.map((quote, i) => (
          <RibbonCell
            key={`${quote.id}-${i}`}
            quote={quote}
            /* The second pass is a visual duplicate only — it must not be read
               out twice, nor collect a second tab stop. */
            duplicate={i >= rows.length}
          />
        ))}
      </div>
    </div>
  );
}

function RibbonCell({ quote, duplicate }: { quote: Quote; duplicate: boolean }) {
  const inner = (
    <>
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          /* Sized from its tile, per the monogram rule. */
          className="font-serif grid h-10 w-10 flex-none place-items-center rounded-[11px] border border-[rgba(217,189,139,0.16)]"
          style={{ color: quote.color, fontSize: 19 }}
        >
          {quote.mark}
        </span>
        <div className="min-w-0">
          <p className="font-mono text-[12.5px] tracking-[0.08em] text-ink">
            {quote.id}
          </p>
          <p className="mt-1 truncate text-[12px] text-ink-3">{quote.name}</p>
        </div>
      </div>

      <div className="flex items-baseline justify-between gap-3">
        <p className="font-serif text-[24px] leading-none">{money(quote.price)}</p>
        <Delta value={quote.chg} size="text-[12px]" />
      </div>
    </>
  );

  /* Cells carry their own surface now that the card behind them is plain:
     the same lit gradient the cards use, one step darker so they read as
     inset into the card rather than stacked on top of it. */
  const shell = cn(
    "flex w-[222px] flex-none flex-col justify-between gap-5 rounded-[var(--radius-tile)]",
    "border border-[rgba(var(--c-gold-rgb),0.09)] px-4 py-4 transition-colors",
    "bg-[linear-gradient(170deg,var(--c-inset-from),var(--c-inset-to))]",
    "shadow-[inset_0_1px_0_rgba(var(--c-gold-hi-rgb),0.045)]",
  );

  if (duplicate) {
    return (
      <div aria-hidden="true" className={shell}>
        {inner}
      </div>
    );
  }

  return (
    <Link
      href={`/instrument/${quote.id}`}
      className={cn(shell, "hover:border-[rgba(var(--c-gold-rgb),0.28)] hover:bg-[linear-gradient(170deg,var(--c-inset-hover-from),var(--c-inset-hover-to))]")}
    >
      {inner}
    </Link>
  );
}
