"use client";

import { position } from "@/lib/market/instrument-derive";
import type { InstrumentSnapshot } from "@/lib/market/instrument";
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
  const mine = position(snapshot, held, portfolio);

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
              {snapshot.shortInterest.shortInterest === null
                ? "—"
                : snapshot.shortInterest.shortInterest.toLocaleString("en-US")}
            </dd>
          </div>
          <div>
            <dt className="card-label">Days to cover</dt>
            <dd className="font-mono mt-2 text-[15px] text-ink-2">
              {snapshot.shortInterest.daysToCover === null
                ? "—"
                : snapshot.shortInterest.daysToCover.toFixed(2)}
            </dd>
          </div>
        </dl>
        {snapshot.shortInterest.settlementDate && (
          <p className="mt-3 text-[12px] text-ink-3">
            As at settlement on {snapshot.shortInterest.settlementDate}.
          </p>
        )}

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

      <section
        className="border border-rule-raised p-6"
        style={{
          background:
            "linear-gradient(165deg, rgba(217,189,139,0.07), transparent 70%)",
        }}
      >
        <h3 className="font-serif mb-5 text-[24px]">Your position</h3>
        <dl className="flex flex-col">
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
      </section>
    </div>
  );
}
