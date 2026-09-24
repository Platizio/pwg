"use client";

import Link from "next/link";
import { competitors } from "@/lib/market/instrument-derive";
import type { InstrumentSnapshot } from "@/lib/market/instrument";
import { useLiveSnapshot } from "../live-provider";
import { Monogram, Section } from "../ui";
import { instrumentPath } from "@/lib/market/paths";

const COLS = "grid-cols-[1.6fr_1fr_1fr_1fr_1fr]";

/* The name and, under it, the symbol. Two share classes of one company —
   GOOGL and GOOG — carry the same name and the same monogram, and without the
   symbol nothing on the row told them apart. */
function Identity({ name, id }: { name: string; id: string }) {
  return (
    <span className="flex min-w-0 flex-col">
      <span className="font-serif text-[20px] leading-tight">{name}</span>
      <span className="font-mono mt-0.5 text-[11px] tracking-[0.05em] text-ink-3">{id}</span>
    </span>
  );
}

export function CompetitorsPanel({ snapshot }: { snapshot: InstrumentSnapshot }) {
  /* The subject's own row prints the header's price and the cap struck at it,
     not the figures the page was cached with. */
  const peers = competitors(useLiveSnapshot(snapshot));
  /* The subject is always the first row, so a list holding only it is a
     table header over the company itself. Said in a sentence instead. */
  const hasPeers = peers.some((p) => !p.isSelf);

  return (
    <div className="flex flex-col gap-9">
      <Section
        title="Peer comparison"
        action={<span className="eyebrow">{snapshot.profile.sector}</span>}
      >
        {!hasPeers ? (
          <p className="max-w-[52ch] text-[13.5px] leading-[1.7] text-ink-3">
            No peers are recorded for {snapshot.profile.id}.
          </p>
        ) : (
          <>
            {/* Five columns of mono numerals do not survive a phone, so below
                `sm` each peer collapses into its own ruled block instead of
                scrolling.

                In both layouts the rows are inset inside their tint and the
                list is pulled out by the same amount, so the columns stay on
                the page's content edge while the gold of the subject's row
                (and a peer's hover) frames its content instead of clipping
                it. */}
            <ul className="-mx-3 flex list-none flex-col p-0 sm:hidden">
              {peers.map((c) => (
                <li
                  key={c.id}
                  className="border-b border-rule-table px-3 py-4"
                  style={c.isSelf ? { background: "var(--tint-gold-faint)" } : undefined}
                >
                  <div className="mb-3 flex items-center gap-3.5">
                    {/* The table linked each peer; this phone layout did not, so on a
                        phone the Competitors tab was a dead end. Same rule as the
                        table: link a peer with a page, never the company itself. */}
                    {c.covered && !c.isSelf ? (
                      <Link
                        href={instrumentPath(c.id)}
                        className="flex min-h-11 items-center gap-3.5 hover:text-gold"
                      >
                        <Monogram mark={c.mark} color={c.color} size={26} />
                        <Identity name={c.name} id={c.id} />
                      </Link>
                    ) : (
                      <>
                        <Monogram mark={c.mark} color={c.color} size={26} />
                        <Identity name={c.name} id={c.id} />
                      </>
                    )}
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

            <div className="-mx-3 hidden sm:block">
              <table className="w-full border-collapse">
                <thead>
                  <tr className={`grid ${COLS} border-b border-rule-section px-3 pb-3`}>
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
                      className={`grid ${COLS} items-center border-b border-rule-table px-3 py-4 transition-colors ${
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
                            <Identity name={c.name} id={c.id} />
                          </Link>
                        ) : (
                          <>
                            <Monogram mark={c.mark} color={c.color} size={26} />
                            <Identity name={c.name} id={c.id} />
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
            </div>
          </>
        )}
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
