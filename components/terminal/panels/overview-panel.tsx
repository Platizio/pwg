"use client";

import { dayStats, insights, returns } from "@/lib/market/instrument-derive";
import { relativeAge } from "@/lib/api/normalize/time";
import { useHydrated, useLiveSession } from "@/components/home/use-session";
import { useLiveSnapshot, useNow, useShownQuote } from "../live-provider";
import type { InstrumentSnapshot } from "@/lib/market/instrument";
import { Meter, Section } from "../ui";
import type { InsightTone } from "@/lib/market/insights";
import { dayLabel } from "./day-label";

/* "as of 23 Sep 2026" from "2026-09-23": locale-free, so the server and the
   browser print the same text. (insights.ts has the same helper; importing it
   would pull the whole ranking module into the client bundle for one line.) */
function asOfLabel(day: string | null): string | null {
  const label = dayLabel(day);
  return label === null ? null : `as of ${label}`;
}

const TONE: Record<InsightTone, string> = {
  up: "var(--color-up)",
  down: "var(--color-down)",
  neutral: "var(--c-gold)",
};

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
  const hydrated = useHydrated();
  const session = useLiveSession(snapshot.session);
  const isLive = useShownQuote(snapshot.profile, session.phase).live.state === "live";
  const asOf = snapshot.profile.asOf;
  const note =
    snapshot.status === "degraded"
      ? snapshot.note
      : snapshot.status === "stale" && !isLive
        ? `Quotes run fifteen minutes behind${
            /* The age only once hydrated: the server's "now" was the moment the
               page was cached, so the two renders could never agree on it and
               React would throw away the whole tree (error #418). */
            hydrated && asOf !== null ? `; the last tick arrived ${relativeAge(asOf, now)}` : ""
          }.`
        : null;

  /* The cards read the LIVE profile, not the one the page was cached with.

     The Day's open, high and low are re-checked against the reader's clock: a
     page rendered during yesterday's session and read before today's bell
     would otherwise print yesterday's range under "Day's", and one rendered
     at 06:00 carries the pre-market figures the server already withheld. The
     previous close is the one the header's change is measured from, and the
     52-week line in the insights takes in today's regular-session prints.
     Until hydration this is the server's own object, so nothing mismatches. */
  const live = useLiveSnapshot(snapshot);
  const stats = dayStats(live);
  /* Before the bell the day's open, high and low have not happened, and three
     bare dashes in five cells read as a broken feed. Each says when it will
     fill instead, on the India clock the pill already uses. Only in the
     pre-market: that is when the next opening is today's bell, and not a
     pre-market two days off across a weekend. */
  const bell =
    session.phase === "pre-market" && session.opens ? `Opens ${session.opens.time} IST` : null;
  const rows = insights(live);
  /* The ranked, dated insights from lib/market/insights.ts, computed on the
     server from five years of official closes; the older three-line list
     stays as the fallback for a snapshot built without them. */
  const ranked = snapshot.insights && snapshot.insights.length > 0 ? snapshot.insights : null;
  const perf = returns(snapshot);

  return (
    <div className="flex flex-col gap-8">
      {/* Ruled strip, not cards — Lux draws structure with lines only. */}
      {/* The rules are each cell's top and left edges, and the wrapper clips
          the ones that land on the strip's outer edge — the Performance
          strip's pattern. The old right-and-bottom rules were written for the
          five-across desktop row: in two columns they closed the box on the
          right only and doubled the rule under Day's low. The odd fifth cell
          takes the rest of its row wherever the columns do not divide five. */}
      <div className="overflow-hidden border-t border-b border-rule-section">
        <dl className="-mt-px -ml-px grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5">
          {stats.map((s) => {
            const note = bell !== null && s.value === "—" && s.label.startsWith("Day's") ? bell : null;
            return (
              <div
                key={s.label}
                /* No hover tint: these five are readouts, not controls, and a
                   highlight on something that cannot be clicked reads as broken. */
                /* Three rows of a subgrid (label, figure, note): at 1440
                   "Previous close" wraps to two lines, and a value placed under
                   its own label dropped 16px below the other four. Sharing the
                   rows keeps every value in a row on one line, and every note. */
                className="row-span-3 grid grid-rows-subgrid border-t border-l border-rule-section px-5 py-5 last:col-span-2 xl:last:col-span-1"
              >
                <dt className="eyebrow mb-3">{s.label}</dt>
                <dd className="font-serif m-0 text-[24px] tracking-[0.01em]">{s.value}</dd>
                {note && <p className="mt-2 text-[11.5px] leading-[1.5] text-ink-3">{note}</p>}
              </div>
            );
          })}
        </dl>
      </div>

      <div className="grid gap-8 xl:grid-cols-[1.4fr_1fr] xl:gap-[34px]">
        {/* This read "Updated 4 min ago" — a string literal, identical on every
            render, attached to three derived claims on a page whose quotes run
            fifteen minutes behind. A false freshness stamp is worse than none.
            getInstrumentSnapshot already composes the true line and nothing
            rendered it; `note` is null only when the feed is actually live. */}
        {/* Both headers carry a title and one eyebrow line, so the Insights
            and Returns lists start on the same line side by side. */}
        <Section
          title="Insights"
          eyebrow={
            /* Held to one line only where the two lists sit side by side.
               Below xl there is no neighbour to line up with, and a nowrap
               line here set the single column's minimum width: once hydrated,
               "…the last tick arrived 48m ago." pushed the column to 500px
               and the page scrolled sideways at 375. Wrapping there says it
               all instead of cutting it off. */
            <span className="block xl:truncate" title={note ?? undefined}>
              {note ?? (ranked ? "Ranked, dated, and sourced" : "From the latest prices")}
            </span>
          }
        >
          {ranked ? (
            <ol className="flex list-none flex-col p-0">
              {ranked.map((i, n) => (
                <li key={i.id} className="rule-t flex gap-[18px] py-4">
                  <span
                    aria-hidden="true"
                    className="font-serif w-7 flex-none text-[20px] leading-none"
                    style={{ color: TONE[i.tone] }}
                  >
                    {String(n + 1).padStart(2, "0")}
                  </span>
                  <div className="min-w-0">
                    <h4 className="mb-1.5 text-[13px] font-bold tracking-[0.01em]">{i.title}</h4>
                    <p className="text-[12px] leading-[1.65] text-pretty text-ink-3">{i.body}</p>
                    <p className="font-mono mt-1.5 text-[10.5px] tracking-[0.04em] text-ink-4">
                      {[i.source, asOfLabel(i.asOf)].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          ) : (
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
          )}
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
