"use client";

import { dayStats, insights, returns } from "@/lib/market/instrument-derive";
import type { InstrumentSnapshot } from "@/lib/market/instrument";
import { Meter, Section } from "../ui";

export function OverviewPanel({ snapshot }: { snapshot: InstrumentSnapshot }) {
  const stats = dayStats(snapshot);
  const rows = insights(snapshot);
  const perf = returns(snapshot);

  return (
    <div className="flex flex-col gap-8">
      {/* Ruled strip, not cards — Lux draws structure with lines only. */}
      <dl className="grid grid-cols-2 border-t border-b border-rule-section sm:grid-cols-3 xl:grid-cols-5">
        {stats.map((s) => (
          <div
            key={s.label}
            /* No hover tint: these five are readouts, not controls, and a
               highlight on something that cannot be clicked reads as broken. */
            className="border-r border-b border-rule-section px-5 py-5 last:border-r-0 xl:border-b-0"
          >
            <dt className="eyebrow mb-3">{s.label}</dt>
            <dd className="font-serif m-0 text-[24px] tracking-[0.01em] sm:text-[24px]">
              {s.value}
            </dd>
          </div>
        ))}
      </dl>

      <div className="grid gap-8 xl:grid-cols-[1.4fr_1fr] xl:gap-[34px]">
        <Section title="Insights" action={<span className="eyebrow">Updated 4 min ago</span>}>
          <ol className="flex list-none flex-col p-0">
            {rows.map((i) => (
              <li key={i.title} className="rule-t flex gap-[18px] py-4">
                <span
                  aria-hidden="true"
                  className="font-serif w-7 flex-none text-[20px] leading-none"
                  style={{ color: i.color }}
                >
                  {i.num}
                </span>
                <div>
                  <h4 className="mb-1.5 text-[13px] font-bold tracking-[0.01em]">
                    {i.title}
                  </h4>
                  <p className="text-[12px] leading-[1.65] text-pretty text-ink-3">
                    {i.body}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </Section>

        <Section title="Returns" eyebrow="Total return incl. dividends">
          <div className="flex flex-col gap-[18px]">
            {perf.map((r, i) => (
              <div key={r.label}>
                <div className="mb-2 flex items-baseline justify-between gap-3">
                  <span className="text-[11px] font-bold tracking-[0.16em] text-ink-3 uppercase">
                    {r.label}
                  </span>
                  <span className="font-mono text-[12px]" style={{ color: r.color }}>
                    {r.value}
                  </span>
                </div>
                <Meter width={r.width} color={r.color} delay={i * 0.06} />
              </div>
            ))}
          </div>
        </Section>
      </div>
    </div>
  );
}
