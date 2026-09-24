"use client";

import type { ReactNode } from "react";
import { money, pct } from "@/lib/market/format";
import {
  distributionSummary,
  formatRatingDate,
  formatRetrieved,
  type AnalystModel,
  type AnalystSource,
  type ConsensusView,
  type RatingAction,
  type RatingChange,
  type RatingTier,
  type TargetView,
} from "@/lib/market/analyst";
import { C, trend } from "@/lib/tokens";
import { Meter, Section } from "../ui";

/**
 * What the street thinks of the company, or an honest account of why this
 * terminal cannot say.
 *
 * Everything here is shaped by lib/market/analyst.ts, which is where the
 * refusals live: a missing count is never nought, a missing target is never a
 * currency symbol against nought, a bucket the source did not report is never
 * drawn, and the upside is struck against this terminal's own last price. This
 * file only lays it out.
 *
 * Four states and never a blur between them. `not-entitled` is about this
 * account, `no-coverage` about this company, `unavailable` about this request
 * — and telling a reader that no analyst covers Apple because a request failed
 * would be a fabricated claim about Apple.
 *
 * Per the terminal's design record: the consensus split is a 3px bar, legend
 * swatches are a 1px line, and the consensus target is the one figure set in
 * gilt near display size.
 */

const DASH = "—";

const SOURCE_NAME: Record<AnalystSource, string> = {
  tipranks: "TipRanks",
  benzinga: "Benzinga",
};

/* ── tone ──────────────────────────────────────────────────────────────── */

/* Sage for the buy side, terracotta for the sell side, neutral ink for hold.
   Gilt is not spent on a rating: on this panel it belongs to the target.

   Where a source splits strong from ordinary, the ordinary bucket steps back
   in weight so the two stay distinguishable on the bar. Where it does not —
   TipRanks reports buy, hold and sell only — "buy" is the whole buy side and
   is drawn at full strength. */
function tierColor(tier: RatingTier | null): string {
  if (tier === "strong-buy" || tier === "buy") return C.up;
  if (tier === "sell" || tier === "strong-sell") return C.down;
  if (tier === "hold") return C.ink3;
  return C.ink;
}

function tierOpacity(tier: RatingTier, fiveWay: boolean): number {
  if (!fiveWay) return 1;
  return tier === "buy" || tier === "sell" ? 0.55 : 1;
}

function actionColor(action: RatingAction): string {
  if (action === "upgrade" || action === "target-raised") return C.up;
  if (action === "downgrade" || action === "target-lowered") return C.down;
  return C.ink2;
}

/* ── figures ───────────────────────────────────────────────────────────── */

/* A target is printed in the currency the source named, or in none. This
   terminal sells US equities to readers who hold rupees, and "$290" where the
   feed meant ₹290 is a different investment case, not a formatting slip. */
function figureIn(currency: string | null) {
  return (n: number | null): string => {
    if (n === null) return DASH;
    if (currency === null) return money(n);
    return currency === "USD" ? `$${money(n)}` : `${money(n)} ${currency}`;
  };
}

const move = (n: number | null) => (n === null ? DASH : pct(n, 1));
const moveTone = (n: number | null) => (n === null ? C.ink4 : trend(n >= 0));

/* ── shared bits ───────────────────────────────────────────────────────── */

function Prose({ children }: { children: ReactNode }) {
  return (
    <div className="flex max-w-[56ch] flex-col gap-3 text-[13.5px] leading-[1.75] text-ink-3">
      {children}
    </div>
  );
}

function Note({ children }: { children: ReactNode }) {
  return <p className="m-0 mt-4 max-w-[56ch] text-[12px] leading-[1.7] text-ink-3">{children}</p>;
}

/* ── the states that are not figures ───────────────────────────────────── */

function StateSection({ eyebrow, children }: { eyebrow: string; children: ReactNode }) {
  return (
    <Section title="Analyst ratings" eyebrow={eyebrow}>
      <Prose>{children}</Prose>
    </Section>
  );
}

function Loading() {
  return (
    <Section title="Analyst ratings" eyebrow="Loading">
      <div aria-busy="true" aria-live="polite" className="flex max-w-[56ch] flex-col gap-4">
        <p className="m-0 text-[13.5px] leading-[1.75] text-ink-3">Loading analyst coverage…</p>
        {/* Hairlines where the bar and the target rail will land, so the tab
            does not jump when they arrive. */}
        <span aria-hidden="true" className="block h-[3px] w-full bg-rule-list" />
        <span aria-hidden="true" className="block h-px w-2/3 bg-rule-list" />
      </div>
    </Section>
  );
}

/* ── the consensus ─────────────────────────────────────────────────────── */

/** A 1px legend line, per the design record — never a square chip. */
function Swatch({ tier, fiveWay }: { tier: RatingTier; fiveWay: boolean }) {
  return (
    <span
      aria-hidden="true"
      className="inline-block h-px w-3.5"
      style={{ background: tierColor(tier), opacity: tierOpacity(tier, fiveWay) }}
    />
  );
}

function Consensus({
  consensus,
  ticker,
  source,
  hasChanges,
}: {
  consensus: ConsensusView | null;
  ticker: string;
  source: AnalystSource | null;
  hasChanges: boolean;
}) {
  if (consensus === null) {
    return (
      <Section title="Consensus" eyebrow="Not published">
        <Prose>
          <p className="m-0">
            No consensus rating has been published for {ticker}.
            {hasChanges && " The rating changes below are individual calls, not an average of them."}
          </p>
        </Prose>
      </Section>
    );
  }

  const { label, tier, analysts, buckets } = consensus;
  const fiveWay = buckets?.some((b) => b.tier === "strong-buy" || b.tier === "strong-sell") ?? false;
  const summary = distributionSummary(consensus);

  return (
    <Section
      title="Consensus"
      eyebrow={source ? `${SOURCE_NAME[source]} consensus` : "Street consensus"}
    >
      <div className="rule-t pt-5">
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
          <div className="min-w-0">
            <p className="eyebrow mb-2">Rating</p>
            <p
              className="font-serif m-0 text-[36px] leading-none sm:text-[40px]"
              style={{ color: tierColor(tier) }}
            >
              {label ?? DASH}
            </p>
          </div>
          <div className="text-right">
            <p className="eyebrow mb-2">Analysts</p>
            <p className="font-mono m-0 text-[19px] text-ink">{analysts ?? DASH}</p>
          </div>
        </div>

        {buckets ? (
          <>
            {/* One 3px bar, segments in the source's own buckets, most bullish
                on the left. A bucket of nought takes no width but keeps its
                place in the legend: "no sell ratings" is a finding. */}
            <div
              role="img"
              aria-label={summary ?? undefined}
              className="mt-6 flex w-full items-stretch gap-px"
            >
              {buckets.map((b, i) =>
                b.share > 0 ? (
                  <div
                    key={b.tier}
                    style={{ width: `${b.share}%`, opacity: tierOpacity(b.tier, fiveWay) }}
                  >
                    <Meter width="100%" color={tierColor(b.tier)} delay={i * 0.08} height={3} />
                  </div>
                ) : null,
              )}
            </div>

            {buckets.length > 3 ? (
              /* Five buckets do not fit five columns in a rail-width column —
                 "Strong buy" wraps under its own swatch. A ledger list holds
                 any number of them at any width. */
              <dl className="m-0 mt-5 flex flex-col">
                {buckets.map((b) => (
                  <div key={b.tier} className="rule-t flex items-baseline gap-3 py-2.5">
                    <dt className="flex flex-none items-center gap-2">
                      <Swatch tier={b.tier} fiveWay={fiveWay} />
                      <span className="eyebrow">{b.label}</span>
                    </dt>
                    <span aria-hidden="true" className="leader" />
                    <dd className="m-0 flex flex-none items-baseline">
                      <span className="font-mono text-[14px] text-ink">{b.count}</span>
                      <span className="font-mono w-11 text-right text-[11.5px] text-ink-3">
                        {Math.round(b.share)}%
                      </span>
                    </dd>
                  </div>
                ))}
              </dl>
            ) : (
              <dl className="m-0 mt-5 grid grid-cols-3 gap-x-4">
                {buckets.map((b) => (
                  <div key={b.tier}>
                    <dt className="flex items-center gap-2">
                      <Swatch tier={b.tier} fiveWay={fiveWay} />
                      <span className="eyebrow">{b.label}</span>
                    </dt>
                    <dd className="m-0 mt-2">
                      <span className="font-mono text-[19px] text-ink">{b.count}</span>
                      <span className="font-mono ms-2 text-[11.5px] text-ink-3">
                        {Math.round(b.share)}%
                      </span>
                    </dd>
                  </div>
                ))}
              </dl>
            )}
          </>
        ) : (
          <Note>
            {analysts === null
              ? "The provider did not report how many analysts cover this company, or how they split."
              : `The provider did not report how the ${analysts} ${analysts === 1 ? "analyst splits" : "analysts split"}, so no distribution is drawn.`}
          </Note>
        )}

        {consensus.countsDisputed && consensus.reportedTotal !== null && (
          <Note>
            The provider reported {consensus.reportedTotal} analysts in total; the
            figure above is the sum of the buckets, which is what the bar is drawn from.
          </Note>
        )}
      </div>
    </Section>
  );
}

/* ── the target ────────────────────────────────────────────────────────── */

function Target({ target, ticker }: { target: TargetView | null; ticker: string }) {
  if (target === null) {
    return (
      <Section title="Price target" eyebrow="Not published">
        <Prose>
          <p className="m-0">No analyst price target has been published for {ticker}.</p>
        </Prose>
      </Section>
    );
  }

  const figure = figureIn(target.currency);
  const { rail } = target;
  const direction = target.upsidePct !== null && target.upsidePct < 0 ? "downside" : "upside";

  const cells: Array<{ label: string; value: number | null; change: number | null }> = [
    { label: "Low", value: target.low, change: target.lowPct },
    { label: "Mean", value: target.mean, change: target.upsidePct },
    { label: "High", value: target.high, change: target.highPct },
  ];

  const railLabel =
    rail && target.low !== null && target.high !== null
      ? [
          `Published targets run from ${figure(target.low)} to ${figure(target.high)}.`,
          target.mean !== null ? `The mean is ${figure(target.mean)}.` : "",
          target.price !== null ? `The last price is ${figure(target.price)}.` : "",
        ]
          .filter(Boolean)
          .join(" ")
      : undefined;

  return (
    <Section title="Price target" eyebrow="Low · mean · high">
      <div className="rule-t pt-5">
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
          <div className="min-w-0">
            <p className="eyebrow mb-2">Mean target</p>
            {/* The one figure the design record sets in gilt near display size. */}
            <p
              className="font-serif m-0 text-[44px] leading-none sm:text-[52px]"
              style={{ color: C.gold }}
            >
              {figure(target.mean)}
            </p>
          </div>
          <div className="text-right">
            <p className="eyebrow mb-2">Implied {direction}</p>
            <p className="font-mono m-0 text-[19px]" style={{ color: moveTone(target.upsidePct) }}>
              {move(target.upsidePct)}
            </p>
            {target.price !== null && target.upsidePct !== null && (
              <p className="font-mono m-0 mt-1 text-[11.5px] text-ink-3">
                from {figure(target.price)}
              </p>
            )}
          </div>
        </div>

        {rail && (
          <div role="img" aria-label={railLabel} className="mt-7">
            <div className="relative h-[17px]">
              {/* The axis, then the published range on it, then two ticks:
                  gilt for the mean target, ink for the last price. */}
              <span
                aria-hidden="true"
                className="absolute inset-x-0 top-1/2 h-px"
                style={{ background: C.ruleMono }}
              />
              <span
                aria-hidden="true"
                className="absolute top-1/2 h-[3px] -translate-y-1/2"
                style={{
                  left: `${rail.low}%`,
                  width: `${Math.max(0, rail.high - rail.low)}%`,
                  background: C.ink4,
                  opacity: 0.55,
                }}
              />
              {rail.mean !== null && (
                <span
                  aria-hidden="true"
                  className="absolute top-0 h-[17px] w-[2px] -translate-x-1/2"
                  style={{ left: `${rail.mean}%`, background: C.gold }}
                />
              )}
              {rail.price !== null && (
                <span
                  aria-hidden="true"
                  className="absolute top-[4px] h-[9px] w-[2px] -translate-x-1/2"
                  style={{ left: `${rail.price}%`, background: C.ink }}
                />
              )}
            </div>
            <div aria-hidden="true" className="mt-2.5 flex items-center gap-5">
              <span className="flex items-center gap-2">
                <span className="inline-block h-px w-3.5" style={{ background: C.gold }} />
                <span className="eyebrow">Mean target</span>
              </span>
              {rail.price !== null && (
                <span className="flex items-center gap-2">
                  <span className="inline-block h-px w-3.5" style={{ background: C.ink }} />
                  <span className="eyebrow">Last price</span>
                </span>
              )}
            </div>
          </div>
        )}

        <dl className="m-0 mt-6 grid grid-cols-3 border-t border-rule-section">
          {cells.map((cell) => (
            <div
              key={cell.label}
              className="min-w-0 border-r border-rule-section py-3.5 pr-3 pl-3 first:pl-0 last:border-r-0"
            >
              <dt className="eyebrow mb-2">{cell.label}</dt>
              <dd className="m-0">
                <span className="font-mono block text-[14px] text-ink">{figure(cell.value)}</span>
                <span
                  className="font-mono mt-1 block text-[11.5px]"
                  style={{ color: moveTone(cell.change) }}
                >
                  {move(cell.change)}
                </span>
              </dd>
            </div>
          ))}
        </dl>

        <Note>
          {target.price !== null && target.upsidePct !== null && (
            <>Percentages are measured from the last price of {figure(target.price)}. </>
          )}
          {rail?.priceOutside && (
            <span className="text-ink-2">
              The last price sits outside every published target.{" "}
            </span>
          )}
          {target.currency !== null && target.currency !== "USD" && (
            <>
              Targets are quoted in {target.currency}, so no move is set against the
              dollar price.{" "}
            </>
          )}
          {target.currency === null && (
            <>The provider did not state a currency, so figures are printed without one. </>
          )}
          {target.low === null && target.high === null && target.mean !== null && (
            <>No low or high target was published, so no range is drawn. </>
          )}
        </Note>
      </div>
    </Section>
  );
}

/* ── rating changes ────────────────────────────────────────────────────── */

const CHANGE_COLS = "grid-cols-[6.5rem_minmax(0,1.3fr)_7.5rem_minmax(0,1.3fr)_minmax(0,1fr)]";

function RatingPath({ change }: { change: RatingChange }) {
  const shift = change.from !== null && change.to !== null && change.from !== change.to;
  return (
    <>
      {shift && (
        <>
          <span className="text-ink-3">{change.from}</span>
          <span aria-hidden="true" className="mx-1.5 text-ink-4">
            →
          </span>
          <span className="sr-only"> to </span>
        </>
      )}
      <span className="text-ink">{change.to ?? DASH}</span>
    </>
  );
}

function TargetPath({ change }: { change: RatingChange }) {
  const f = figureIn(change.currency);
  if (change.targetTo === null) return <span className="text-ink-4">{DASH}</span>;
  return (
    <>
      {change.targetFrom !== null && change.targetFrom !== change.targetTo && (
        <>
          <span className="text-ink-3">{f(change.targetFrom)}</span>
          <span aria-hidden="true" className="mx-1.5 text-ink-4">
            →
          </span>
          <span className="sr-only"> to </span>
        </>
      )}
      <span className="text-ink">{f(change.targetTo)}</span>
    </>
  );
}

function Changes({ changes, ticker }: { changes: RatingChange[]; ticker: string }) {
  if (changes.length === 0) {
    return (
      <Section title="Rating changes" eyebrow="Not available">
        <Prose>
          <p className="m-0">
            Individual upgrades, downgrades and initiations for {ticker} are not
            carried by the current data source. The consensus above is the average
            view; which firm moved, and when, is not something it reports.
          </p>
        </Prose>
      </Section>
    );
  }

  return (
    <Section title="Rating changes" eyebrow="Most recent first">
      {/* Five columns do not survive a phone: below `sm` each change is its
          own ruled block, the same move the peer table makes. */}
      <ul className="m-0 flex list-none flex-col p-0 sm:hidden">
        {changes.map((c) => (
          <li
            key={`${c.date}-${c.firm}-${c.action}`}
            className="border-b border-rule-table py-4 first:border-t first:border-rule-section"
          >
            <div className="flex items-baseline justify-between gap-3">
              <span className="font-serif min-w-0 truncate text-[17px]">{c.firm}</span>
              <span className="font-mono flex-none text-[11.5px] text-ink-3">
                {formatRatingDate(c.date) ?? c.date}
              </span>
            </div>
            <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span
                className="text-[11px] font-bold tracking-[0.16em] uppercase"
                style={{ color: actionColor(c.action) }}
              >
                {c.actionLabel}
              </span>
              <span className="text-[13px]">
                <RatingPath change={c} />
              </span>
            </div>
            {c.targetTo !== null && (
              <p className="font-mono m-0 mt-1.5 text-[12px]">
                <span className="eyebrow me-2">Target</span>
                <TargetPath change={c} />
              </p>
            )}
          </li>
        ))}
      </ul>

      <table className="hidden w-full border-collapse sm:table">
        <caption className="sr-only">Recent analyst rating changes for {ticker}</caption>
        <thead>
          <tr className={`grid ${CHANGE_COLS} gap-x-4 border-b border-rule-section pb-3`}>
            <th scope="col" className="eyebrow text-left">
              Date
            </th>
            <th scope="col" className="eyebrow text-left">
              Firm
            </th>
            <th scope="col" className="eyebrow text-left">
              Action
            </th>
            <th scope="col" className="eyebrow text-left">
              Rating
            </th>
            <th scope="col" className="eyebrow text-right">
              Target
            </th>
          </tr>
        </thead>
        <tbody>
          {changes.map((c) => (
            <tr
              key={`${c.date}-${c.firm}-${c.action}`}
              className={`grid ${CHANGE_COLS} items-baseline gap-x-4 border-b border-rule-table py-3.5`}
            >
              <td className="font-mono text-[12px] text-ink-3">
                {formatRatingDate(c.date) ?? c.date}
              </td>
              <th scope="row" className="min-w-0 text-left font-normal">
                <span title={c.firm} className="block truncate text-[13.5px] text-ink">
                  {c.firm}
                </span>
                {c.analyst && (
                  <span className="block truncate text-[11.5px] text-ink-3">{c.analyst}</span>
                )}
              </th>
              <td
                className="text-[11px] font-bold tracking-[0.14em] uppercase"
                style={{ color: actionColor(c.action) }}
              >
                {c.actionLabel}
              </td>
              <td className="min-w-0 text-[13px]">
                <RatingPath change={c} />
              </td>
              <td className="font-mono text-right text-[12px]">
                <TargetPath change={c} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Section>
  );
}

/* ── the panel ─────────────────────────────────────────────────────────── */

export function AnalystPanel({ model, ticker }: { model: AnalystModel; ticker: string }) {
  if (model.state === "loading") return <Loading />;

  if (model.state === "not-entitled") {
    return (
      <StateSection eyebrow="Not available on this account">
        <p className="m-0">
          Analyst ratings, price targets and rating changes are not available on
          this account yet. Our data provider refuses the request, so there is
          nothing here to show.
        </p>
        <p className="m-0">
          That is a limit on what we can see, and nothing more. It is{" "}
          <span className="text-ink-2">not</span> a statement that no analyst
          covers {ticker}, and it should not be read as one.
        </p>
      </StateSection>
    );
  }

  if (model.state === "no-coverage") {
    return (
      <StateSection eyebrow="No coverage">
        <p className="m-0">
          No analyst consensus has been published for {ticker}. Our provider
          answered in full and returned no rating and no price target.
        </p>
        <p className="m-0">
          That is ordinary for smaller companies and for funds, which sell-side
          research rarely follows. It is a finding about {ticker}, not a limit on
          this account.
        </p>
      </StateSection>
    );
  }

  if (model.state === "unavailable") {
    return (
      <StateSection eyebrow="Could not be retrieved">
        <p className="m-0">
          The request for analyst coverage did not complete
          {model.status > 0 ? ` (the provider answered ${model.status})` : ""}, so
          we do not know whether {ticker} is covered.
        </p>
        <p className="m-0">
          This is a fault on our side rather than a finding about the company, and
          it may well succeed on a later load.
        </p>
      </StateSection>
    );
  }

  const retrieved = formatRetrieved(model.asOf);
  const source = model.source ? SOURCE_NAME[model.source] : "our data provider";

  return (
    <div className="flex flex-col gap-11">
      <div className="grid gap-11 xl:grid-cols-[1fr_1.15fr]">
        <Consensus
          consensus={model.consensus}
          ticker={ticker}
          source={model.source}
          hasChanges={model.changes.length > 0}
        />
        <Target target={model.target} ticker={ticker} />
      </div>

      <Changes changes={model.changes} ticker={ticker} />

      <div className="border-t border-rule-section pt-4">
        <p className="m-0 max-w-[64ch] text-[12px] leading-[1.7] text-ink-3">
          Source: {source}
          {retrieved ? `, retrieved ${retrieved}` : ""}. These are the provider&rsquo;s
          figures, not ours, and the consensus carries no date of its own &mdash; a
          target struck months ago is not a current view. Nothing here is a
          recommendation to buy or sell.
        </p>
      </div>
    </div>
  );
}
