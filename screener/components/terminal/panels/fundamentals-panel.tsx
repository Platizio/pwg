"use client";

import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { useRef } from "react";
import { ratios, revenue } from "@/lib/market/instrument-derive";
import type { InstrumentSnapshot } from "@/lib/market/instrument";
import { LeaderRow, Section } from "../ui";

export function FundamentalsPanel({ snapshot }: { snapshot: InstrumentSnapshot }) {
  const rows = ratios(snapshot);
  const bars = revenue(snapshot);
  const chartRef = useRef<HTMLDivElement>(null);

  /* Bars grow off the axis. transform-origin anchors them to the baseline
     rather than the box centre. */
  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add(
        {
          animate: "(prefers-reduced-motion: no-preference)",
          still: "(prefers-reduced-motion: reduce)",
        },
        (ctx) => {
          const targets = chartRef.current?.querySelectorAll("[data-bar]");
          if (!targets?.length) return;
          if (!ctx.conditions?.animate) {
            gsap.set(targets, { scaleY: 1 });
            return;
          }
          gsap.fromTo(
            targets,
            { scaleY: 0 },
            {
              scaleY: 1,
              duration: 0.8,
              ease: "expo.out",
              stagger: 0.06,
              transformOrigin: "bottom center",
            },
          );
        },
      );
      return () => mm.revert();
    },
    { scope: chartRef, dependencies: [snapshot.profile.id] },
  );

  return (
    <div className="grid gap-8 xl:grid-cols-[1.25fr_1fr] xl:gap-11">
      <Section title="Key ratios">
        <dl className="grid grid-cols-1 gap-x-10 sm:grid-cols-2">
          {rows.map((r) => (
            <LeaderRow key={r.label} label={r.label} value={r.value} />
          ))}
        </dl>
      </Section>

      <Section title="Revenue" eyebrow="Fiscal year · billions USD">
        <div ref={chartRef} className="flex h-48 items-end gap-4">
          {bars.map((b) => (
            <div
              key={b.year}
              className="flex h-full flex-1 flex-col items-center justify-end gap-2.5"
            >
              <p className="font-mono text-[12px] text-ink-2">{b.value}</p>
              <div
                data-bar
                className="w-full"
                style={{ background: b.background, height: b.height }}
              />
              <p className="font-mono text-[11px] text-ink-3">{b.year}</p>
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}
