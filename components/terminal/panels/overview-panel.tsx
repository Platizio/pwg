"use client";

import { dayStats, insights, returns } from "@/lib/market/instrument-derive";
import { relativeAge } from "@/lib/api/normalize/time";
import { liveness } from "@/lib/market/liveness";
import { useLiveSession } from "@/components/home/use-session";
import { useLiveQuote, useNow } from "../live-provider";
import type { InstrumentSnapshot } from "@/lib/market/instrument";
import { Meter, Section } from "../ui";

export function OverviewPanel({ snapshot }: { snapshot: InstrumentSnapshot }) {
  /* The freshness line, measured when it is READ.
   *
   * It used to be composed on the server — "the last tick arrived 2m ago" —
   * and these are cached pages, so the age was frozen at render and could be
   * hours wrong by the time anyone saw it. And it said "Quotes run fifteen
   * minutes behind" while the header directly above said Live off a tick
   * seconds old: two opposite claims about the same number. Now the age is
   * computed here against a ticking clock, and the delay sentence is withheld
   * whenever the header would call the price live. A degraded note is kept as
   * the server wrote it — it is about missing data, not about time. */
  const now = useNow();
  const session = useLiveSession(snapshot.session);
  const tick = useLiveQuote(snapshot.profile.id);
  const priced = tick !== null && tick.changePercent !== null ? tick : null;
  const isLive = liveness(priced, session.phase, now).state === "live";
  const asOf = snapshot.profile.asOf;
  const note =
    snapshot.status === "degraded"
      ? snapshot.note
      : snapshot.status === "stale" && !isLive
        ? `Quotes run fifteen minutes behind${asOf === null ? "" : `; the last tick arrived ${relativeAge(asOf, now)}`}.`
        : null;

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
        {/* This read "Updated 4 min ago" — a string literal, identical on every
            render, attached to three derived claims on a page whose quotes run
            fifteen minutes behind. A false freshness stamp is worse than none.
            getInstrumentSnapshot already composes the true line and nothing
            rendered it; `note` is null only when the feed is actually live. */}
        <Section
          title="Insights"
          action={
            note ? (
              <span className="eyebrow" title={note}>
                {note}
              </span>
            ) : null
          }
        >
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

        {/* "Total return incl. dividends" was a false label. Every figure
            beneath it is computed from RawHistoryPoint.price — the close —
            and repairSplitBreaks adjusts for splits only. There is no
            dividend adjustment anywhere in this repository. A total return
            includes dividends by definition; on a high-yield name held five
            years the gap is material, and the label was overstating nothing
            while claiming to include something. */}
        <Section title="Returns" eyebrow="Price return, split-adjusted">
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
