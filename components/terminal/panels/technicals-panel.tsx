"use client";

import { returns, technicals } from "@/lib/market/instrument-derive";
import type { InstrumentSnapshot } from "@/lib/market/instrument";
import { Meter, Section } from "../ui";

export function TechnicalsPanel({ snapshot }: { snapshot: InstrumentSnapshot }) {
  const rows = technicals(snapshot);

  return (
    <div className="grid gap-8 xl:grid-cols-[1.3fr_1fr] xl:gap-11">
      <Section title="Technical indicators">
        <ul className="flex list-none flex-col p-0">
          {rows.map((t, i) => (
            <li
              key={t.label}
              className="rule-t grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-3 py-4 sm:grid-cols-[92px_minmax(0,1fr)_60px_78px] sm:gap-[18px]"
            >
              <span className="text-[11px] font-semibold tracking-[0.1em] text-ink-3 uppercase">
                {t.label}
              </span>
              {/* On narrow screens the meter drops to its own full-width row
                  rather than being squeezed to nothing between the numbers. */}
              <span className="order-last col-span-full sm:order-none sm:col-span-1">
                <Meter width={t.width} color={t.color} delay={i * 0.05} />
              </span>
              <span className="font-mono text-right text-[12px]">{t.value}</span>
              <span
                className="text-right text-[11px] font-bold tracking-[0.18em]"
                style={{ color: t.color }}
              >
                {t.signal}
              </span>
            </li>
          ))}
        </ul>
      </Section>

      <Section
        title="Trailing performance"
        eyebrow="Split-adjusted, to the last completed session"
        className="xl:border-l xl:border-rule-section xl:pl-[34px]"
      >
        {/* An analyst consensus stood here, generated from a seed: a target
            price, an upside, and a buy/hold/sell split that no analyst had
            ever given. Consensus data sits behind the insight endpoints this
            account cannot reach, so the space now shows something the feed
            can actually answer. */}
        <ul className="m-0 flex list-none flex-col p-0">
          {returns(snapshot).map((r, i) => (
            <li key={r.label} className="rule-t py-4">
              <div className="mb-2.5 flex items-baseline justify-between gap-3">
                <span className="text-[11px] font-semibold tracking-[0.1em] text-ink-3 uppercase">
                  {r.label}
                </span>
                <span className="font-mono text-[14px]" style={{ color: r.color }}>
                  {r.value}
                </span>
              </div>
              <Meter width={r.width} color={r.color} delay={i * 0.05} />
            </li>
          ))}
        </ul>

        <p className="mt-6 max-w-[46ch] text-[12.5px] leading-[1.7] text-ink-3">
          The five-year figure is a cumulative return, not a compound annual
          rate. Analyst targets are not available on this account.
        </p>
      </Section>
    </div>
  );
}
