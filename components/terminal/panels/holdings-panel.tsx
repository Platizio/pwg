"use client";

import { position } from "@/lib/market/instrument-derive";
import { shortInterestIsCurrent } from "@/lib/market/short-interest-age";
import type { InstrumentSnapshot } from "@/lib/market/instrument";
import { useLiveSnapshot } from "../live-provider";
import { GoldButton, Section } from "../ui";

export function HoldingsPanel({
  snapshot,
  held,
  portfolio,
  onTrade,
}: {
  snapshot: InstrumentSnapshot;
  held: number;
  portfolio: number;
  onTrade: () => void;
}) {
  /* Market value and today's move at the header's price and change. */
  const mine = position(useLiveSnapshot(snapshot), held, portfolio);

  /* A filing older than six weeks is history, not the position: every record
     on file today settled in Dec 2017. Measured against the last daily bar,
     which is server data, so both renders agree. */
  const short = snapshot.shortInterest;
  const shortCurrent = shortInterestIsCurrent(
    short.settlementDate,
    snapshot.history.daily.at(-1)?.at ?? null,
  );
  const sharesShort = shortCurrent ? short.shortInterest : null;
  const daysToCover = shortCurrent ? short.daysToCover : null;

  return (
    <div className="grid gap-8 xl:grid-cols-[1.3fr_1fr] xl:gap-11">
      <Section title="Short interest and dividends">
        {/* The institutional-holders table here was invented. Ownership data
            lives behind the insight endpoints, which this account cannot
            reach. These two are real, and they are what the record does
            carry about who holds the stock and what it pays. */}
        <dl className="m-0 grid grid-cols-2 gap-x-6 gap-y-4">
          <div>
            <dt className="card-label">Shares short</dt>
            <dd className="font-mono mt-2 text-[15px] text-ink-2">
              {sharesShort === null ? "—" : sharesShort.toLocaleString("en-US")}
            </dd>
          </div>
          <div>
            <dt className="card-label">Days to cover</dt>
            <dd className="font-mono mt-2 text-[15px] text-ink-2">
              {daysToCover === null ? "—" : daysToCover.toFixed(2)}
            </dd>
          </div>
        </dl>
        {short.settlementDate &&
          (shortCurrent ? (
            <p className="mt-3 text-[12px] text-ink-3">
              As at settlement on {short.settlementDate}.
            </p>
          ) : (
            <p className="mt-3 max-w-[46ch] text-[12px] leading-[1.6] text-ink-3">
              No current filing. The latest on record settled on {short.settlementDate}, too
              long ago to show as today&rsquo;s position.
            </p>
          ))}

        <p className="card-label mt-7">Recent dividends</p>
        {snapshot.dividends.length === 0 ? (
          <p className="mt-3 text-[13.5px] text-ink-3">
            No dividend has been recorded for this company.
          </p>
        ) : (
          <ul className="m-0 mt-3 flex list-none flex-col p-0">
            {snapshot.dividends.map((d) => (
              <li key={d.exDate} className="rule-t flex items-baseline justify-between gap-3 py-3">
                <span className="text-[13.5px] text-ink-2">Ex-dividend {d.exDate}</span>
                <span className="font-mono text-[13px] text-ink">
                  ${d.amount.toFixed(4).replace(/0+$/, "").replace(/\.$/, "")}
                </span>
              </li>
            ))}
          </ul>
        )}

        <p className="mt-6 max-w-[46ch] text-[12.5px] leading-[1.7] text-ink-3">
          Institutional ownership is not available on this account.
        </p>
      </Section>

      {/* Titled the way the left column is, so the two headings share a top
          line and a line height. The box holds only the figures and the
          action, and ends where they do rather than stretching to the height
          of the column beside it. */}
      <Section title="Your position" className="xl:self-start">
        <div
          className="border border-rule-raised px-6 pt-3 pb-6"
          style={{
            background:
              "linear-gradient(165deg, rgba(217,189,139,0.07), transparent 70%)",
          }}
        >
          <dl className="flex flex-col [&>div:first-child]:border-t-0">
            {mine.map((p) => (
              <div
                key={p.label}
                className="flex items-baseline justify-between gap-3 border-t border-rule py-3"
              >
                <dt className="text-[12px] font-bold tracking-[0.16em] text-ink-3 uppercase">
                  {p.label}
                </dt>
                <dd
                  className="font-serif m-0 text-[21px]"
                  style={{ color: p.color }}
                >
                  {p.value}
                </dd>
              </div>
            ))}
          </dl>
          <GoldButton onClick={onTrade} className="mt-6 w-full">
            Manage position
          </GoldButton>
        </div>
      </Section>
    </div>
  );
}
