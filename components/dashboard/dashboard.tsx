"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { IconCalendar, IconChevron } from "@/components/icons";
import { useLive } from "@/components/terminal/live-provider";
import { TickerTape } from "@/components/terminal/ticker-tape";
import { Reader } from "@/components/ui/reader";
import { Badge, Card, Delta } from "@/components/ui/surface";
import type { Tick } from "@/lib/api/stream/tick";
import { money, signed } from "@/lib/market/format";
import { SECTOR_ETF } from "@/lib/market/universe";
import type { HomeSnapshot, Panel, SectorGroup, WireItem } from "@/lib/market/home";
import { calendarDate, sectorSlug } from "@/lib/market/session";
import type { CalendarEvent, Quote } from "@/lib/market/session";
import { cn } from "@/lib/ui";
import { MarketCard } from "./market-card";
import { PopularRibbon } from "./popular-ribbon";
import { instrumentPath, sectorPath } from "@/lib/market/paths";

/** Sectors shown before the reader asks for the rest. */
const COLLAPSED = 4;

/** Names on a sector card. The caption beside the heading says the same. */
const PER_SECTOR = 4;

/**
 * The dashboard, composed to the marked-up wireframe.
 *
 * The working column carries what moved — gainers against losers, the rotating
 * ribbon, then sectors cut four deep. The reference rail carries what is coming
 * and what has just happened, which is where the wireframe put them.
 *
 * The terminal runs edge to edge; the marks at the outer margins were an
 * instruction to use that width.
 *
 * Every figure arrives as one snapshot from the server, and the snapshot is
 * what renders. The boards then take live ticks from the one connection the
 * layout's LiveProvider owns — read out of shared state, never a feed opened
 * down here. Nothing below reads a clock of its own either: the tree under
 * app/(terminal)/layout.tsx is a client tree, and a second source of time down
 * here is a hydration failure.
 */
export function Dashboard({ data }: { data: HomeSnapshot }) {
  const at = anchorOf(data.diagnostics.sweptAt);

  return (
    <div className="grid min-w-0 lg:h-full lg:overflow-hidden xl:grid-cols-[minmax(0,1fr)_340px]">
      <main
        id="terminal-main"
        className="flex min-w-0 flex-col overflow-hidden lg:h-full"
      >
        <TickerTape rows={data.tape.data} />

        <div className="flex-1 px-4 pt-5 pb-10 sm:px-6 lg:overflow-y-auto lg:px-7">
          <MarketCard views={data.indices.data} />

          <div className="mt-5 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            <MoversCard title="Top gainers" panel={data.gainers} tone="up" />
            <MoversCard title="Top losers" panel={data.losers} tone="down" />
            <MoversCard
              title="Most active"
              note="By value traded"
              panel={data.mostActive}
              metric="turnover"
            />
          </div>

          <Card lit className="mt-5 px-7 py-7">
            <div className="flex flex-wrap items-baseline justify-between gap-4">
              <h2 className="font-serif text-[21px] leading-none text-ink-2">
                Popular right now
              </h2>
              <p className="text-[13px] text-ink-3">Hold to read</p>
            </div>
            {data.popular.data.length === 0 ? (
              <p className="mt-5 text-[13.5px] leading-[1.7] text-ink-3">
                {emptyReason(
                  data.popular,
                  "No name is trading at unusual volume just now.",
                )}
              </p>
            ) : (
              <>
                <PanelNote panel={data.popular} className="mt-4" />
                <div className="mt-7">
                  <PopularRibbon rows={data.popular.data} />
                </div>
              </>
            )}
          </Card>

          <SectorCards panel={data.sectors} />

          {/* Below `xl` the rail is not a rail — it reads as the last part of
              the page rather than a squeezed column. */}
          <div className="mt-5 h-[860px] xl:hidden">
            <Rail events={data.events} news={data.wire} at={at} />
          </div>

          {/*
            Not fine print, and not optional. The prices here are real and a
            quarter of an hour old, and a public surface that looks this much
            like a live quote screen has to say so where a visitor will
            actually meet it.
          */}
          <p className="mt-8 max-w-[70ch] text-[12.5px] leading-[1.75] text-ink-3">
            Prices come from a US market feed and reach this page about fifteen
            minutes behind the exchange. The index tabs are priced through the
            funds that track them, so each level shown is the price of the fund
            rather than of the index itself. Nothing here is advice.
          </p>
        </div>
      </main>

      {/* The rail owns its own height and never scrolls as a whole; each half
          inside it scrolls independently. */}
      <aside
        aria-label="Reference"
        className="hidden min-h-0 border-l border-rule-section xl:block xl:overflow-hidden"
      >
        <Rail events={data.events} news={data.wire} at={at} />
      </aside>
    </div>
  );
}

/* ------------------------------------------------------------------ */

/**
 * The instant the snapshot was taken, in seconds.
 *
 * `calendarDate` falls back to the fixed ANCHOR the mock was built around, and
 * corporate actions are dated in days from the real morning the sweep ran —
 * reading one against the other would date every row from an August that has
 * gone. The sweep's stamp is the only real clock the snapshot carries.
 */
function anchorOf(sweptAt: string): number | undefined {
  const ms = Date.parse(sweptAt);
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : undefined;
}

/**
 * Why a board is empty.
 *
 * "Nothing moved that way this session" is true of a quiet board and a lie
 * about a dead feed, and the reader cannot tell the two apart from the gap
 * alone. A panel that failed says so in its own words; a panel that is merely
 * thin keeps the quiet sentence.
 */
function emptyReason<T>(panel: Panel<T[]>, quiet: string): string {
  if (panel.status === "down") {
    return panel.note ?? "Quotes are unavailable. This board will fill when the feed returns.";
  }
  /* A degraded panel already carries the sentence that explains itself. A
     stale one only says the feed is behind, which is not why a list is short. */
  return panel.status === "degraded" && panel.note !== null ? panel.note : quiet;
}

/**
 * A panel that is behind or incomplete, stated under the card's heading.
 *
 * DESIGN.md defines no staleness treatment, so this borrows what exists — the
 * outline badge and the quiet ink — rather than inventing a style for a state
 * that should read as ordinary. A panel that is down says its piece through
 * the empty board instead, and never twice.
 */
function PanelNote({ panel, className }: { panel: Panel<unknown>; className?: string }) {
  if (panel.note === null || panel.status === "live" || panel.status === "down") {
    return null;
  }

  /* `cn` is a plain join rather than a merge, so the spacing is the caller's
     to state — a base margin here could not be overridden. */
  return (
    <div className={cn("flex flex-wrap items-center gap-2.5", className)}>
      <Badge tone="outline">{panel.status === "stale" ? "Delayed" : "Partial"}</Badge>
      <p className="max-w-[46ch] text-[12.5px] leading-[1.6] text-ink-3">{panel.note}</p>
    </div>
  );
}

/**
 * Money traded in a name, in the unit a reader can hold.
 *
 * The board is ranked on this figure, so it is the figure the board prints. A
 * quote that arrived without one prints nothing rather than the seeded shape
 * the mock used to supply in its place.
 */
function traded(quote: Quote): string {
  if (quote.turnoverM === undefined) return "—";
  return quote.turnoverM >= 1000
    ? `$${(quote.turnoverM / 1000).toFixed(1)}B`
    : `$${quote.turnoverM.toFixed(0)}M`;
}

/**
 * A row with this second's numbers in it, or the row the server rendered.
 *
 * The tick is taken whole or not at all. `changePercent` is null whenever the
 * feed sent no previous close, and a live price beside the snapshot's change
 * would pair this second's number with an older basis and misstate the move —
 * so a tick that cannot supply both supplies neither.
 *
 * `turnoverM` is deliberately left alone. Nothing on the wire carries money
 * traded, and it is the figure the "most active" board is ranked on: a stale
 * turnover under a fresh change is honest about what the sweep saw, while a
 * turnover reconstructed from price and volume would be a number no screen
 * ever ran on.
 */
function freshen(quote: Quote, ticks: ReadonlyMap<string, Tick>): Quote {
  const tick = ticks.get(quote.id.toUpperCase());
  if (!tick || tick.changePercent === null) return quote;
  return { ...quote, price: tick.price, chg: tick.changePercent };
}

function MoversCard({
  title,
  note = "Session",
  panel,
  metric = "price",
  tone,
}: {
  title: string;
  note?: string;
  panel: Panel<Quote[]>;
  /* A board should show the figure it is sorted by. Ranking names by value
     traded and then printing their price leaves the reader to take the order
     on trust. */
  metric?: "price" | "turnover";
  /* Set only on the two boards that are about a direction. "Most active" is
     ranked by value traded and contains both risers and fallers, so it stays
     on the common card. */
  tone?: "up" | "down";
}) {
  const rows = panel.data;

  /* A board is a ranking the sweep froze, not a live leaderboard. The rows and
     their order stay exactly as the server screened them and only the figures
     inside them move; re-sorting on ticks would have names climbing past each
     other under a heading that describes a screen nobody re-ran. */
  const symbols = useMemo(() => rows.map((r) => r.id), [rows]);
  const ticks = useLive(symbols);
  const live = useMemo(() => rows.map((q) => freshen(q, ticks)), [rows, ticks]);

  return (
    <Card tone={tone} className="px-5 py-6">
      <div className="flex items-baseline justify-between gap-3 px-1">
        <h2 className="font-serif text-[21px] leading-none text-ink-2">{title}</h2>
        <p className="flex-none text-[12.5px] text-ink-3">{note}</p>
      </div>

      {rows.length === 0 ? (
        <p className="mt-6 px-1 text-[13.5px] leading-[1.7] text-ink-3">
          {emptyReason(panel, "Nothing moved that way this session.")}
        </p>
      ) : (
        <>
          <PanelNote panel={panel} className="mt-4 px-1" />
          <ul className="m-0 mt-6 flex list-none flex-col gap-1 p-0">
            {live.map((q) => {
              const body = (
                <>
                  <span
                    aria-hidden="true"
                    /* Sized from its tile, per the monogram rule. */
                    className="font-serif grid h-8 w-8 flex-none place-items-center rounded-[9px] border border-[rgba(217,189,139,0.14)]"
                    style={{ color: q.color, fontSize: 15 }}
                  >
                    {q.mark}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-medium text-ink">
                      {q.name}
                    </span>
                    <span className="font-mono mt-1 block text-[12px] tracking-[0.05em] text-ink-3">
                      {q.id}
                    </span>
                  </span>
                  <span className="w-[66px] flex-none text-right">
                    <span className="font-mono block text-[13.5px] text-ink-2">
                      {metric === "turnover" ? traded(q) : money(q.price)}
                    </span>
                    <span className="mt-1 flex justify-end">
                      <Delta value={q.chg} size="text-[12px]" />
                    </span>
                  </span>
                </>
              );
              const inner =
                "flex min-h-[58px] items-center gap-2.5 rounded-[var(--radius-tile)] px-2 transition-colors";

              return (
                <li key={q.id}>
                  <Link
                    href={instrumentPath(q.id)}
                    className={cn(inner, "hover:bg-[rgba(217,189,139,0.06)]")}
                  >
                    {body}
                  </Link>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </Card>
  );
}

/**
 * Sectors, one card each.
 *
 * They used to be four columns inside a single card, which made every sector
 * look like a column of a table rather than a place you could go. Each is its
 * own bordered card now, and each carries its own way in: the four largest
 * movers, then a control that opens the whole sector.
 */
function SectorCards({ panel }: { panel: Panel<SectorGroup[]> }) {
  const [expanded, setExpanded] = useState(false);

  /* The four rows a card prints, and nothing else. `members` is the sector's
     entire list — the number under "View all" — so registering it whole would
     subscribe most of the swept universe to keep sixteen figures moving. The
     slice is also the same set open or collapsed, so expanding never re-keys
     the shared connection. */
  const symbols = useMemo(
    () => panel.data.flatMap((g) => g.members.slice(0, PER_SECTOR).map((q) => q.id)),
    [panel.data],
  );
  const ticks = useLive(symbols);

  /* A sector with no classified names behind it would price a fund and then
     open onto an empty room. The fund quoted; there is simply nothing to show
     underneath it. */
  const groups = panel.data.filter((group) => group.total > 0);
  const shown = expanded ? groups : groups.slice(0, COLLAPSED);

  return (
    <section className="mt-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3 px-1">
        <h2 className="font-serif text-[21px] leading-none text-ink-2">By sector</h2>
        {groups.length > 0 && (
          <p className="text-[12.5px] text-ink-3">
            {groups.length} sectors · four largest movers each
          </p>
        )}
      </div>

      {groups.length === 0 ? (
        <p className="mt-4 px-1 text-[13.5px] leading-[1.7] text-ink-3">
          {emptyReason(panel, "No sector is quoting just now.")}
        </p>
      ) : (
        <>
          <PanelNote panel={panel} className="mt-4 px-1" />

          <div className="mt-4 grid gap-5 md:grid-cols-2 2xl:grid-cols-4">
            {shown.map((group) => (
              <Card key={group.name} className="flex flex-col px-5 py-5">
                <header className="flex items-baseline justify-between gap-3 px-1">
                  <h3 className="font-serif min-w-0 text-[20px] leading-tight text-balance">
                    {group.name}
                  </h3>
                  {group.day === null ? (
                    <span className="font-mono text-[12.5px] text-ink-3">—</span>
                  ) : (
                    <Delta value={group.day} size="text-[12.5px]" />
                  )}
                </header>

                {/* The headline is the sector fund's move; the rows below are
                    the companies this terminal quotes. They measure different
                    things and they disagree often enough that a reader is owed
                    the reason rather than left to reconcile them. */}
                <p className="mt-1.5 px-1 text-[11.5px] leading-[1.55] text-ink-3">
                  {SECTOR_ETF[group.name as keyof typeof SECTOR_ETF] ?? "Fund"} ·{" "}
                  {signed(group.membersChg, 2)} across the {group.total} quoted here
                </p>

                <ul className="m-0 mt-4 mb-5 flex list-none flex-col gap-0.5 p-0">
                  {group.members.slice(0, PER_SECTOR).map((member) => {
                    /* The rows take ticks; the two figures above them do not.
                       `day` is the sector fund's own quote, and `membersChg` is
                       weighted across every name in the sector rather than the
                       four shown — neither is recoverable from four ticks, so
                       both stay as the sweep computed them. */
                    const q = freshen(member, ticks);
                    const row = (
                      <>
                        <span className="font-mono w-[58px] flex-none text-[12.5px] tracking-[0.05em] text-ink-3">
                          {q.id}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-[13px] text-ink-2">
                          {q.name}
                        </span>
                        <span className="w-[70px] flex-none text-right">
                          <Delta value={q.chg} size="text-[12px]" />
                        </span>
                      </>
                    );
                    const inner =
                      "flex min-h-[44px] items-center gap-2.5 rounded-[9px] px-1.5 transition-colors";

                    return (
                      <li key={q.id}>
                        <Link
                          href={instrumentPath(q.id)}
                          className={cn(inner, "hover:bg-[rgba(217,189,139,0.06)]")}
                        >
                          {row}
                        </Link>
                      </li>
                    );
                  })}
                </ul>

                <Link
                  href={sectorPath(sectorSlug(group.name))}
                  className="mt-auto flex min-h-11 items-center justify-between gap-2 rounded-[10px] border border-rule-control px-3 text-[12.5px] font-medium text-ink-3 transition-colors hover:border-gold hover:text-gold"
                >
                  View all {group.total}
                  <IconChevron className="h-3.5 w-3.5" />
                </Link>
              </Card>
            ))}
          </div>
        </>
      )}

      {groups.length > COLLAPSED && (
        <div className="mt-5 flex justify-center">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            className="flex min-h-11 items-center gap-2.5 rounded-full border border-rule-control px-6 text-[13px] font-medium text-ink-2 transition-colors hover:border-gold hover:text-gold"
          >
            {expanded ? "Show fewer sectors" : `Show all ${groups.length} sectors`}
            <IconChevron
              className={cn("h-3.5 w-3.5 transition-transform", expanded && "rotate-90")}
            />
          </button>
        </div>
      )}
    </section>
  );
}

const KIND_LABEL = {
  earnings: "Earnings",
  macro: "Macro",
  policy: "Policy",
  corporate: "Corporate action",
} as const;

/**
 * When an event lands, worded for a reader.
 *
 * The feed dates real corporate actions, and the rail keeps a few that have
 * already happened so the card is never empty out of season. `calendarDate`
 * words the future only, so the past is worded here.
 */
function when(event: CalendarEvent, at: number | undefined) {
  const { date, relative } = calendarDate(event, at);
  if (event.offset >= 0) return { date, relative };
  return {
    date,
    relative: event.offset === -1 ? "Yesterday" : `${-event.offset} days ago`,
  };
}

/**
 * The reference rail: two fixed halves, each scrolling inside itself.
 *
 * It used to be one long column that scrolled as a whole, which meant the
 * news headings disappeared the moment you went looking through the events,
 * and neither list was ever fully in view. Splitting the height in two and
 * giving each card its own scroller keeps both headings pinned and both lists
 * reachable without losing your place in the other.
 */
function Rail({
  events,
  news,
  at,
}: {
  events: Panel<CalendarEvent[]>;
  news: Panel<WireItem[]>;
  /** The snapshot's own instant — see `anchorOf`. */
  at: number | undefined;
}) {
  const [openEvent, setOpenEvent] = useState<CalendarEvent | null>(null);
  const [openNews, setOpenNews] = useState<WireItem | null>(null);

  /* The rail keeps a few actions that have already happened so the card is
     never empty out of season, so the count is of the ones still to come. */
  const ahead = events.data.filter((event) => event.offset >= 0).length;
  const eventNote =
    events.data.length === 0 ? "None dated" : ahead > 0 ? `${ahead} ahead` : "All past";

  return (
    <>
      <div className="grid h-full min-h-0 grid-rows-2 gap-4 p-4 sm:p-5">
        <RailCard title="Key events" note={eventNote}>
          {/* An empty panel is a down panel, so the note and the empty line
              below can never state the same thing twice. */}
          <PanelNote panel={events} className="mb-2 px-2.5" />
          {events.data.length === 0 ? (
            <p className="px-2.5 pt-1 text-[13.5px] leading-[1.7] text-ink-3">
              {emptyReason(events, "Nothing is dated in the days around now.")}
            </p>
          ) : (
            <ol className="m-0 flex list-none flex-col gap-1 p-0">
              {events.data.map((event) => {
                const { date, relative } = when(event, at);
                return (
                  <li key={`${event.title}-${event.offset}`}>
                    <button
                      type="button"
                      onClick={() => setOpenEvent(event)}
                      className="flex w-full min-h-[58px] items-center gap-3 rounded-[10px] px-2.5 py-2.5 text-left transition-colors hover:bg-[rgba(217,189,139,0.06)]"
                    >
                      <span
                        aria-hidden="true"
                        className="tile grid h-9 w-9 flex-none place-items-center text-gold"
                      >
                        <IconCalendar className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13.5px] font-medium text-ink">
                          {event.title}
                        </span>
                        <span className="mt-1 block truncate text-[12.5px] text-ink-3">
                          {relative} · {date} · {event.time}
                        </span>
                      </span>
                      <IconChevron
                        aria-hidden="true"
                        className="h-3.5 w-3.5 flex-none text-ink-3"
                      />
                    </button>
                  </li>
                );
              })}
            </ol>
          )}
        </RailCard>

        <RailCard title="Latest news" note="The wire">
          <PanelNote panel={news} className="mb-2 px-2.5" />
          {news.data.length === 0 ? (
            <p className="px-2.5 pt-1 text-[13.5px] leading-[1.7] text-ink-3">
              {emptyReason(news, "Nothing has come over the wire today.")}
            </p>
          ) : (
            <ul className="m-0 flex list-none flex-col p-0">
              {news.data.map((item) => (
                <li key={item.id} className="border-t border-rule-list first:border-t-0">
                  <button
                    type="button"
                    onClick={() => setOpenNews(item)}
                    className="w-full rounded-[10px] px-2.5 py-3.5 text-left transition-colors hover:bg-[rgba(217,189,139,0.06)]"
                  >
                    <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                      <span className="text-[12px] font-semibold text-gold-dim">
                        {item.source}
                      </span>
                      <span aria-hidden="true" className="h-2.5 w-px bg-rule-mono" />
                      <span
                        className="font-mono text-[12px] tracking-[0.06em]"
                        style={{ color: item.color }}
                      >
                        {item.ticker}
                      </span>
                      <span aria-hidden="true" className="h-2.5 w-px bg-rule-mono" />
                      <span className="text-[12px] text-ink-3">{item.time}</span>
                    </span>
                    <span className="font-serif mt-2 block text-[20px] leading-[1.4] text-pretty text-ink">
                      {item.title}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </RailCard>
      </div>

      <Reader
        open={!!openEvent}
        onClose={() => setOpenEvent(null)}
        title={openEvent?.title ?? ""}
        eyebrow={
          openEvent && (
            <>
              <Badge tone="quiet">{KIND_LABEL[openEvent.kind]}</Badge>
              <span className="text-[12.5px] text-ink-3">
                {when(openEvent, at).relative} · {when(openEvent, at).date} ·{" "}
                {openEvent.time}
              </span>
            </>
          )
        }
        footer={
          openEvent?.ticker && (
            <Link
              href={instrumentPath(openEvent.ticker)}
              className="flex min-h-11 items-center gap-2 text-[13px] font-medium text-gold transition-colors hover:text-gold-hi"
            >
              Open {openEvent.ticker}
              <IconChevron className="h-3.5 w-3.5" />
            </Link>
          )
        }
      >
        {openEvent && (
          <>
            <p className="text-[14px] leading-[1.75] text-pretty text-ink-2">
              {openEvent.summary}
            </p>
            <div className="mt-5 rounded-[var(--radius-tile)] border border-rule-section bg-[linear-gradient(140deg,var(--c-tile-from),var(--c-tile-to))] p-4">
              <p className="card-label">What to watch</p>
              <p className="mt-2 text-[13.5px] leading-[1.7] text-pretty text-ink-2">
                {openEvent.watch}
              </p>
            </div>
          </>
        )}
      </Reader>

      <Reader
        open={!!openNews}
        onClose={() => setOpenNews(null)}
        title={openNews?.title ?? ""}
        eyebrow={
          openNews && (
            <>
              <span className="text-[12.5px] font-semibold text-gold-dim">
                {openNews.source}
              </span>
              <span aria-hidden="true" className="h-2.5 w-px bg-rule-mono" />
              <span className="text-[12.5px] text-ink-3">
                {openNews.company} · {openNews.time}
              </span>
            </>
          )
        }
        footer={
          openNews && (
            <Link
              href={instrumentPath(openNews.ticker)}
              className="flex min-h-11 items-center gap-2 text-[13px] font-medium text-gold transition-colors hover:text-gold-hi"
            >
              Open {openNews.ticker}
              <IconChevron className="h-3.5 w-3.5" />
            </Link>
          )
        }
      >
        {openNews && (
          <p className="text-[14px] leading-[1.75] text-pretty text-ink-2">
            {/* The wire sends headlines without a description often enough that
                an empty panel is a state, not an accident. */}
            {openNews.summary === ""
              ? "No summary came with this headline."
              : openNews.summary}
          </p>
        )}
      </Reader>
    </>
  );
}

/** A rail half: a pinned heading over its own scroller. */
function RailCard({
  title,
  note,
  children,
}: {
  title: string;
  note: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="flex min-h-0 flex-col">
      <div className="flex flex-none items-baseline justify-between gap-3 px-5 pt-5 pb-3">
        <h2 className="font-serif text-[21px] leading-none text-ink-2">{title}</h2>
        <p className="flex-none text-[12.5px] text-ink-3">{note}</p>
      </div>
      {/* The scroller, not the card. The heading above stays put. */}
      <div className="min-h-0 flex-1 overflow-y-auto px-2.5 pb-4">{children}</div>
    </Card>
  );
}
