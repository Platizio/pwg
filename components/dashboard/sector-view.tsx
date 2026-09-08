"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { IconSearch } from "@/components/icons";
import { Card, Delta } from "@/components/ui/surface";
import { useLive } from "@/components/terminal/live-provider";
import { marketCap, money, ratio } from "@/lib/market/format";
import type { SectorRow, SectorSnapshot } from "@/lib/market/sector";
import { cn } from "@/lib/ui";
import { instrumentPath } from "@/lib/market/paths";

/**
 * One sector, in full.
 *
 * The dashboard shows four names per sector; this is where the rest live, as a
 * plain complete table rather than another set of boards — a reader who
 * clicked "view all" has asked for everything, and a second edited selection
 * would be answering a different question.
 *
 * Sorting is client-side because the whole sector is already here. Sending a
 * request per column press would be slower than the array sort it replaces.
 */

type Column = {
  key: "name" | "price" | "mcap" | "pe" | "ret1y" | "cagr5y";
  label: string;
  numeric: boolean;
  /** Sorting a column of dashes is meaningless; absent values sink. */
  value: (r: SectorRow) => number | string | null;
};

const COLUMNS: Column[] = [
  { key: "name", label: "Name", numeric: false, value: (r) => r.name.toLowerCase() },
  { key: "price", label: "Price", numeric: true, value: (r) => r.price },
  { key: "mcap", label: "Market Cap", numeric: true, value: (r) => r.mcap },
  { key: "pe", label: "P/E Ratio", numeric: true, value: (r) => r.pe },
  { key: "ret1y", label: "1Y Returns", numeric: true, value: (r) => r.ret1y },
  { key: "cagr5y", label: "5Y CAGR", numeric: true, value: (r) => r.cagr5y },
];

const PAGE = 50;
const COUNT_FMT = new Intl.NumberFormat("en-US");

export function SectorView({ sector }: { sector: SectorSnapshot }) {
  const [tab, setTab] = useState<"stocks" | "funds">("stocks");
  const [sort, setSort] = useState<Column["key"]>("mcap");
  const [desc, setDesc] = useState(true);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);

  const source = tab === "stocks" ? sector.stocks : sector.funds;

  const rows = useMemo(() => {
    const term = query.trim().toLowerCase();
    const filtered = term
      ? source.filter(
          (r) => r.id.toLowerCase().includes(term) || r.name.toLowerCase().includes(term),
        )
      : source;

    const column = COLUMNS.find((c) => c.key === sort) ?? COLUMNS[2];
    return [...filtered].sort((a, b) => {
      const av = column.value(a);
      const bv = column.value(b);
      /* A name without a figure has not underperformed — it is unknown, and it
         belongs at the bottom of the sort in either direction. */
      if (av === null && bv === null) return 0;
      if (av === null) return 1;
      if (bv === null) return -1;
      if (typeof av === "string" || typeof bv === "string") {
        return desc ? String(bv).localeCompare(String(av)) : String(av).localeCompare(String(bv));
      }
      return desc ? bv - av : av - bv;
    });
  }, [source, sort, desc, query]);

  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  const current = Math.min(page, pages - 1);
  const shown = useMemo(
    () => rows.slice(current * PAGE, current * PAGE + PAGE),
    [rows, current],
  );

  /* Ticks are merged after the sort and after the slice, never into `source` or
     `rows`. Price is a sortable column here: a live price folded in upstream
     would re-run the comparator every tick and re-rank the table under the
     reader's cursor, moving names between pages while they read. The order and
     the page contents stay the server's; only the figures printed in the rows
     already on screen are replaced.

     Subscribing to `shown` rather than the whole sector keeps the union at one
     page — a sector can carry several hundred names, and none of the ones the
     reader cannot see need a quote. */
  const symbols = useMemo(() => shown.map((r) => r.id), [shown]);
  const ticks = useLive(symbols);

  const visible = useMemo(
    () =>
      shown.map((r) => {
        const t = ticks.get(r.id.toUpperCase());
        if (!t) return r;
        /* changePercent is null when the feed sent no previous close. A live
           price beside the snapshot's change would pair this second's number
           with an older basis, so the whole tick is dropped. */
        if (t.changePercent === null) return r;
        return { ...r, price: t.price, chg: t.changePercent };
      }),
    [shown, ticks],
  );

  const press = (key: Column["key"]) => {
    if (key === sort) setDesc((v) => !v);
    else {
      setSort(key);
      setDesc(key !== "name");
    }
    setPage(0);
  };

  return (
    <main id="terminal-main" className="flex min-w-0 flex-col overflow-hidden lg:h-full">
      <header className="border-b border-rule-section px-4 py-5 sm:px-6 lg:px-7">
        <h1 className="font-serif text-[clamp(1.75rem,3vw,2.25rem)] leading-none">
          {sector.name}
        </h1>
      </header>

      <div className="flex-1 px-4 pt-5 pb-10 sm:px-6 lg:overflow-y-auto lg:px-7">
        <Card className="px-7 py-7">
          <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-5">
            <div>
              <p className="card-label">Today</p>
              <p className="mt-3">
                {sector.day === null ? (
                  <span className="font-mono text-[clamp(1.75rem,3vw,2.25rem)] text-ink-3">—</span>
                ) : (
                  <Delta value={sector.day} size="text-[clamp(1.75rem,3vw,2.25rem)]" />
                )}
              </p>
            </div>
            <div>
              <p className="card-label">Past five sessions</p>
              <p className="mt-3">
                {sector.week === null ? (
                  <span className="font-mono text-[21px] text-ink-3">—</span>
                ) : (
                  <Delta value={sector.week} size="text-[21px]" />
                )}
              </p>
            </div>
            <div>
              <p className="card-label">Rose / fell today</p>
              <p className="font-mono mt-3 text-[21px] text-ink-2">
                {sector.up} / {sector.down}
              </p>
            </div>
          </div>

          <p className="mt-6 max-w-[64ch] text-[13.5px] leading-[1.7] text-ink-3">
            {sector.day === null ? (
              <>
                <span className="text-ink-2">{sector.fund}</span>, the fund that tracks this
                sector, is not quoting, so there is no sector-wide move to show.
              </>
            ) : (
              <>
                The move above is <span className="text-ink-2">{sector.fund}</span>, the fund that
                tracks this sector, so it covers the whole sector rather than only the names below.
              </>
            )}{" "}
            The table lists the{" "}
            <span className="text-ink-2">{COUNT_FMT.format(sector.stocks.length)} companies</span>{" "}
            this terminal quotes and has classified here.
          </p>
        </Card>

        <Card className="mt-5 px-5 py-6">
          <div className="flex flex-wrap items-center justify-between gap-4 px-2">
            <div
              role="tablist"
              aria-label="Stock type"
              className="flex gap-1 rounded-full border border-rule-control p-1"
            >
              {(
                [
                  ["stocks", "Stocks", sector.stocks.length],
                  ["funds", "ETFs", sector.funds.length],
                ] as const
              ).map(([key, label, n]) => (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={tab === key}
                  onClick={() => {
                    setTab(key);
                    setPage(0);
                  }}
                  className={cn(
                    "min-h-9 rounded-full px-4 text-[13px] font-medium transition-all duration-300",
                    tab === key
                      ? "bg-[linear-gradient(140deg,#f6e6c6,#dcbb8a)] text-on-gold"
                      : "text-ink-3 hover:text-ink",
                  )}
                >
                  {label} <span className="font-mono text-[11.5px]">{n}</span>
                </button>
              ))}
            </div>

            <label className="relative flex min-w-[220px] flex-1 items-center sm:max-w-[300px]">
              <IconSearch
                aria-hidden="true"
                className="pointer-events-none absolute left-3 h-4 w-4 text-ink-3"
              />
              <span className="sr-only">Search this sector</span>
              <input
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPage(0);
                }}
                placeholder="Search any stock"
                className="min-h-10 w-full rounded-full border border-rule-control bg-transparent pr-3 pl-9 text-[13.5px] text-ink placeholder:text-ink-3 focus:border-[rgba(217,189,139,0.35)] focus:outline-none"
              />
            </label>
          </div>

          <p className="mt-4 px-2 text-[12.5px] text-ink-3">
            {COUNT_FMT.format(rows.length)}{" "}
            {tab === "stocks" ? (rows.length === 1 ? "stock" : "stocks") : rows.length === 1 ? "fund" : "funds"}
            {query && ` matching “${query}”`}
          </p>

          {visible.length === 0 ? (
            <p className="px-2 py-10 text-center text-[13.5px] text-ink-3">
              {tab === "funds"
                ? "No sector funds were matched. Funds carry no sector classification, so these are found by name."
                : "Nothing here matches that search."}
            </p>
          ) : (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[760px] border-collapse text-left">
                <thead>
                  <tr className="border-b border-rule">
                    {COLUMNS.map((c) => (
                      <th
                        key={c.key}
                        scope="col"
                        aria-sort={
                          sort === c.key ? (desc ? "descending" : "ascending") : "none"
                        }
                        className={cn(
                          "px-3 py-2.5 text-[12px] font-medium tracking-[0.04em] text-ink-3",
                          c.numeric && "text-right",
                        )}
                      >
                        <button
                          type="button"
                          onClick={() => press(c.key)}
                          className={cn(
                            "inline-flex min-h-8 items-center gap-1.5 transition-colors hover:text-ink",
                            sort === c.key && "text-ink-2",
                          )}
                        >
                          {c.label}
                          <span aria-hidden="true" className="font-mono text-[9px] opacity-70">
                            {sort === c.key ? (desc ? "▼" : "▲") : "⇅"}
                          </span>
                        </button>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visible.map((r) => (
                    <Row key={r.id} row={r} />
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {pages > 1 && (
            <div className="mt-5 flex items-center justify-center gap-3 px-2">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={current === 0}
                className="min-h-9 rounded-full border border-rule-control px-4 text-[12.5px] text-ink-3 transition-colors enabled:hover:text-ink disabled:opacity-40"
              >
                Previous
              </button>
              <span className="font-mono text-[12px] text-ink-3">
                {current + 1} / {pages}
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(pages - 1, p + 1))}
                disabled={current === pages - 1}
                className="min-h-9 rounded-full border border-rule-control px-4 text-[12.5px] text-ink-3 transition-colors enabled:hover:text-ink disabled:opacity-40"
              >
                Next
              </button>
            </div>
          )}
        </Card>

        <p className="mt-8 max-w-[74ch] text-[12.5px] leading-[1.75] text-ink-3">
          Prices come from a US market feed and reach this page about fifteen minutes behind the
          exchange. One-year and five-year figures are price returns to the last completed
          session, adjusted for splits but not for dividends, and are refreshed daily, not live.
          Five-year CAGR is a compound annual rate, not the cumulative move. Nothing here is
          advice.
        </p>
      </div>
    </main>
  );
}

function Row({ row }: { row: SectorRow }) {
  const [logoFailed, setLogoFailed] = useState(false);
  const cell = "px-3 py-3 text-right font-mono text-[13.5px] text-ink-2";

  const identity = (
    <span className="flex min-w-0 items-center gap-3">
      {row.logo && !logoFailed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={row.logo}
          alt=""
          width={32}
          height={32}
          loading="lazy"
          onError={() => setLogoFailed(true)}
          className="h-8 w-8 flex-none rounded-[9px] bg-white/5 object-contain p-0.5"
        />
      ) : (
        <span
          aria-hidden="true"
          /* Sized from its tile, per the monogram rule. */
          className="font-serif grid h-8 w-8 flex-none place-items-center rounded-[9px] border border-[rgba(217,189,139,0.14)]"
          style={{ color: row.color, fontSize: 15 }}
        >
          {row.mark}
        </span>
      )}
      <span className="min-w-0">
        <span className="block truncate text-[13.5px] font-medium text-ink">{row.name}</span>
        <span className="font-mono mt-0.5 block text-[11.5px] tracking-[0.05em] text-ink-3">
          {row.id}
        </span>
      </span>
    </span>
  );

  return (
    <tr className="border-b border-rule/60 transition-colors hover:bg-[rgba(217,189,139,0.04)]">
      <td className="px-3 py-3">
        <Link href={instrumentPath(row.id)} className="block">
          {identity}
        </Link>
      </td>
      <td className={cell}>
        <span className="block">{money(row.price)}</span>
        <span className="mt-0.5 flex justify-end">
          <Delta value={row.chg} size="text-[11.5px]" />
        </span>
      </td>
      <td className={cell}>{marketCap(row.mcap)}</td>
      <td className={cell}>{ratio(row.pe)}</td>
      <td className={cell}>
        {row.ret1y === null ? "—" : <Delta value={row.ret1y} size="text-[13.5px]" />}
      </td>
      <td className={cell}>
        {row.cagr5y === null ? "—" : <Delta value={row.cagr5y} size="text-[13.5px]" />}
      </td>
    </tr>
  );
}
