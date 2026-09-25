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
import { CARD_X } from "./inset";
import { withTick } from "./same-session";

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
  /* Whether the column shows below `sm`. A phone gets Name and Price only.
     All six columns inside a 301px scroller cut the Price figure mid-number
     at rest ("160."), and after a sideways scroll there was no name left to
     say which company a row was. */
  phone: boolean;
  /** Sorting a column of dashes is meaningless; absent values sink. */
  value: (r: SectorRow) => number | string | null;
};

const COLUMNS: Column[] = [
  { key: "name", label: "Name", numeric: false, phone: true, value: (r) => r.name.toLowerCase() },
  { key: "price", label: "Price", numeric: true, phone: true, value: (r) => r.price },
  { key: "mcap", label: "Market Cap", numeric: true, phone: false, value: (r) => r.mcap },
  { key: "pe", label: "P/E Ratio", numeric: true, phone: false, value: (r) => r.pe },
  { key: "ret1y", label: "1Y Returns", numeric: true, phone: false, value: (r) => r.ret1y },
  { key: "cagr5y", label: "5Y CAGR", numeric: true, phone: false, value: (r) => r.cagr5y },
];

/* Hides a desktop-only cell below `sm`. */
const DESKTOP_CELL = "hidden sm:table-cell";

/* The table's outer cells lose their outer padding, so the first column's
   text, the last column's figures and every row rule sit on CARD_X, the same
   line as the toolbar above. Below `sm` the last visible column is Price,
   not the DOM's last cell. */
const PRICE_EDGE = "max-sm:pr-0";

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

  /* A tick is taken whole, and only when it measures from the same previous
     close as the row (same-session.ts). A price with no previous close, or one
     measured from a newer session's close, would pair this second's number
     with a different basis. */
  const visible = useMemo(
    () => shown.map((r) => withTick(r, ticks.get(r.id.toUpperCase()))),
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
        {/* CARD_X, the dashboard's inset, so content lines do not jump from
            page to page (this card was px-7, the table card px-5 + px-2). */}
        <Card className={cn("py-7", CARD_X)}>
          {/* Top-aligned, so the three labels share one line over figures of
              different sizes. On a phone the row is a two-column grid rather
              than a wrapping flex row, which had thrown the second figure to
              the far edge and the third alone onto the next line. */}
          <div className="grid grid-cols-2 items-start gap-x-8 gap-y-5 sm:flex sm:flex-wrap sm:justify-between">
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
            {/* Three outcomes, not two. A sweep that did not answer and a
                sector with nothing in it both used to reach the same sentence,
                which then asserted "the 0 companies this terminal quotes" — a
                confident claim about the market built out of our own failure
                to look. */}
            {sector.sweepFailed ? (
              <>
                The market sweep has not answered, so the companies in this sector cannot be
                listed right now.
              </>
            ) : sector.stocks.length === 0 ? (
              <>No companies have been classified into this sector yet.</>
            ) : (
              <>
                The table lists the{" "}
                <span className="text-ink-2">
                  {COUNT_FMT.format(sector.stocks.length)} companies
                </span>{" "}
                this terminal quotes and has classified here.
              </>
            )}
          </p>
        </Card>

        <Card className={cn("mt-5 py-6", CARD_X)}>
          <div className="flex flex-wrap items-center justify-between gap-4">
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
                    "min-h-11 rounded-full px-4 text-[13px] font-medium transition-all duration-300",
                    tab === key
                      ? "bg-[image:var(--cta-buy)] text-on-gold"
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
              <span className="sr-only">Filter this sector</span>
              <input
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPage(0);
                }}
                /* It filters this sector's rows only; "Search any stock" sent
                   readers after tickers the table cannot hold. 16px below
                   `sm`, because iOS Safari zooms the page into any field set
                   smaller. */
                placeholder="Filter this sector"
                className="min-h-11 w-full rounded-full border border-rule-control bg-transparent pr-3 pl-9 text-[16px] text-ink placeholder:text-ink-3 focus:border-[rgba(217,189,139,0.35)] focus:outline-none sm:text-[13.5px]"
              />
            </label>
          </div>

          <p className="mt-4 text-[12.5px] text-ink-3">
            {COUNT_FMT.format(rows.length)}{" "}
            {tab === "stocks" ? (rows.length === 1 ? "stock" : "stocks") : rows.length === 1 ? "fund" : "funds"}
            {query && ` matching “${query}”`}
          </p>

          {visible.length === 0 ? (
            <p className="py-10 text-center text-[13.5px] text-ink-3">
              {tab === "funds"
                ? "No sector funds were matched. Funds carry no sector classification, so these are found by name."
                : "Nothing here matches that search."}
            </p>
          ) : (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full border-collapse text-left sm:min-w-[760px]">
                <thead>
                  <tr className="border-b border-rule">
                    {COLUMNS.map((c) => (
                      <th
                        key={c.key}
                        scope="col"
                        aria-sort={
                          sort === c.key ? (desc ? "descending" : "ascending") : "none"
                        }
                        /* py-1 around a 44px button keeps the header row at
                           the 52px it was with py-2.5 around a 32px one. */
                        className={cn(
                          "px-3 py-1 text-[12px] font-medium tracking-[0.04em] text-ink-3 first:pl-0 last:pr-0",
                          c.numeric && "text-right",
                          c.key === "price" && PRICE_EDGE,
                          !c.phone && DESKTOP_CELL,
                        )}
                      >
                        <button
                          type="button"
                          onClick={() => press(c.key)}
                          className={cn(
                            "inline-flex min-h-11 items-center gap-1.5 transition-colors hover:text-ink",
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
            <div className="mt-5 flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={current === 0}
                className="min-h-11 rounded-full border border-rule-control px-4 text-[12.5px] text-ink-3 transition-colors enabled:hover:text-ink disabled:opacity-40"
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
                className="min-h-11 rounded-full border border-rule-control px-4 text-[12.5px] text-ink-3 transition-colors enabled:hover:text-ink disabled:opacity-40"
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
  /* Prefetch on intent rather than on sight.
     A sector page prints fifty of these at a time, and a <Link> prefetches
     itself the moment it enters the viewport — so scrolling this table once
     would queue fifty instrument routes to satisfy the one the reader is
     going to open. The Next prefetching guide's answer for exactly this case
     ("Preventing too many prefetches", node_modules/next/dist/docs/01-app/
     02-guides/prefetching.md) is to start at `false` and hand the link back
     its default the moment the reader hovers: `null` means "auto", so a
     prerendered name is then fetched whole and an unbuilt one down to its
     loading boundary, which is the skeleton this route now ships. */
  const [wanted, setWanted] = useState(false);
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
    /* The whole row is the hover target, not just the name cell: the row
       already warms on hover, and a reader crossing it anywhere is as good a
       signal as one landing on the link itself. */
    <tr
      onMouseEnter={() => setWanted(true)}
      className="border-b border-rule/60 transition-colors hover:bg-[rgba(217,189,139,0.04)]"
    >
      {/* The link carries the cell's padding, so the whole cell, the full
          height of the row, is the tap target. It used to cover only the name
          block, 39.5px inside a 64px row.

          Below `sm` this column takes whatever Price leaves (w-full), and
          max-w-0 lets a long name truncate instead of pushing Price out of
          the card. */}
      <td className="p-0 max-sm:w-full max-sm:max-w-0">
        <Link
          href={instrumentPath(row.id)}
          prefetch={wanted ? null : false}
          className="block py-3 pr-3"
        >
          {identity}
        </Link>
      </td>
      <td className={cn(cell, PRICE_EDGE)}>
        <span className="block">{money(row.price)}</span>
        <span className="mt-0.5 flex justify-end">
          {/* A dash, not "+0.00%", when the gateway priced the name but sent no
              change for it. Same guard the two return columns below already
              use, for the same reason. */}
          {row.chg === null ? "—" : <Delta value={row.chg} size="text-[11.5px]" />}
        </span>
      </td>
      <td className={cn(cell, DESKTOP_CELL)}>{marketCap(row.mcap)}</td>
      <td className={cn(cell, DESKTOP_CELL)}>{ratio(row.pe)}</td>
      <td className={cn(cell, DESKTOP_CELL)}>
        {row.ret1y === null ? "—" : <Delta value={row.ret1y} size="text-[13.5px]" />}
      </td>
      <td className={cn(cell, DESKTOP_CELL, "pr-0")}>
        {row.cagr5y === null ? "—" : <Delta value={row.cagr5y} size="text-[13.5px]" />}
      </td>
    </tr>
  );
}
