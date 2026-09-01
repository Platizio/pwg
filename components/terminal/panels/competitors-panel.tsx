"use client";

import Link from "next/link";
import { competitors } from "@/lib/market/instrument-derive";
import type { InstrumentSnapshot } from "@/lib/market/instrument";
import { Monogram, Section } from "../ui";
import { instrumentPath } from "@/lib/market/paths";

const COLS = "grid-cols-[1.6fr_1fr_1fr_1fr_1fr]";

export function CompetitorsPanel({ snapshot }: { snapshot: InstrumentSnapshot }) {
  const peers = competitors(snapshot);

  return (
    <div className="flex flex-col gap-9">
      <Section
        title="Peer comparison"
        action={<span className="eyebrow">{snapshot.profile.sector}</span>}
      >
        {/* Five columns of mono numerals do not survive a phone, so below `sm`
            each peer collapses into its own ruled block instead of scrolling. */}
        <ul className="flex list-none flex-col p-0 sm:hidden">
          {peers.map((c) => (
            <li
              key={c.id}
              className="border-b border-rule-table py-4"
              style={c.isSelf ? { background: "var(--tint-gold-faint)" } : undefined}
            >
              <div className="mb-3 flex items-center gap-3.5">
                <Monogram mark={c.mark} color={c.color} size={26} />
                <span className="font-serif text-[20px]">{c.name}</span>
                <span
                  className="font-mono ms-auto text-[11.5px]"
                  style={{ color: c.retColor }}
                >
                  {c.ret}
                </span>
              </div>
              <dl className="grid grid-cols-3 gap-3">
                {[
                  ["Price", c.price],
                  ["Mkt cap", c.mcap],
                  ["P/E", c.pe],
                ].map(([k, v]) => (
                  <div key={k}>
                    <dt className="eyebrow mb-1">{k}</dt>
                    <dd className="font-mono m-0 text-[11.5px] text-ink-2">{v}</dd>
                  </div>
                ))}
              </dl>
            </li>
          ))}
        </ul>

        <table className="hidden w-full border-collapse sm:table">
          <thead>
            <tr className={`grid ${COLS} border-b border-rule-section pb-3`}>
              <th scope="col" className="eyebrow text-left">
                Company
              </th>
              <th scope="col" className="eyebrow text-right">
                Price
              </th>
              <th scope="col" className="eyebrow text-right">
                Mkt cap
              </th>
              <th scope="col" className="eyebrow text-right">
                P/E
              </th>
              <th scope="col" className="eyebrow text-right">
                1Y return
              </th>
            </tr>
          </thead>
          <tbody>
            {peers.map((c) => (
              <tr
                key={c.id}
                className={`grid ${COLS} items-center border-b border-rule-table py-4 transition-colors ${
                  c.covered && !c.isSelf ? "hover:bg-[var(--tint-gold-faint)]" : ""
                }`}
                style={c.isSelf ? { background: "var(--tint-gold-soft)" } : undefined}
              >
                <th
                  scope="row"
                  className="flex items-center gap-3.5 text-left font-normal"
                >
                  {/* The row lights up on hover, so it has to lead somewhere.
                      Peers we do not cover get no link and no affordance —
                      offering one and refusing it is worse than neither. */}
                  {c.covered && !c.isSelf ? (
                    <Link
                      href={instrumentPath(c.id)}
                      className="flex min-w-0 items-center gap-3.5 transition-colors hover:text-gold"
                    >
                      <Monogram mark={c.mark} color={c.color} size={26} />
                      <span className="font-serif text-[20px]">{c.name}</span>
                    </Link>
                  ) : (
                    <>
                      <Monogram mark={c.mark} color={c.color} size={26} />
                      <span className="font-serif text-[20px]">{c.name}</span>
                    </>
                  )}
                </th>
                <td className="font-mono text-right text-[11.5px]">{c.price}</td>
                <td className="font-mono text-right text-[11.5px] text-ink-3">
                  {c.mcap}
                </td>
                <td className="font-mono text-right text-[11.5px] text-ink-3">{c.pe}</td>
                <td
                  className="font-mono text-right text-[11.5px]"
                  style={{ color: c.retColor }}
                >
                  {c.ret}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section title="Market share" eyebrow="Not available">
        {/* This was a fabricated breakdown. Market-share data sits behind the
            insight endpoints, which this account is not entitled to, and there
            is no honest way to derive a company's share of its market from a
            price feed. */}
        <p className="max-w-[52ch] text-[13.5px] leading-[1.7] text-ink-3">
          Market-share data is not available on this account. The comparison
          above is the closest this terminal can get: the company set against
          the peers its own record names.
        </p>
      </Section>
    </div>
  );
}
