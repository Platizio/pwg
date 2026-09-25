"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { IconCalendar, IconChevron } from "@/components/icons";
import { useLive } from "@/components/terminal/live-provider";
import { TickerTape } from "@/components/terminal/ticker-tape";
import { Reader } from "@/components/ui/reader";
import { Badge, Card, Delta } from "@/components/ui/surface";
import type { Tick } from "@/lib/api/stream/tick";
import { money, pct } from "@/lib/market/format";
/* From sectors.ts, NOT universe.ts. universe.ts imports a 2.4 MB symbol
   master that no bundler can tree-shake, and this is a client component: the
   one constant below was shipping all 30,809 tickers to the browser. */
import { SECTOR_ETF } from "@/lib/market/sectors";
import type { HomeSnapshot, Panel, SectorGroup, WireItem } from "@/lib/market/home";
import { calendarDate, sectorSlug } from "@/lib/market/session";
import type { CalendarEvent, Quote } from "@/lib/market/session";
import { cn } from "@/lib/ui";
import { MarketCard } from "./market-card";
import { PopularRibbon } from "./popular-ribbon";
import { CALENDAR_PATH, WIRE_PATH, instrumentPath, sectorPath } from "@/lib/market/paths";
import { CARD_BLEED, CARD_X, ROW_BLEED } from "./inset";
import { eventTime, newestFirst } from "./reading-order";
import { withTick } from "./same-session";

/** Sectors shown before the reader asks for the rest. */
const COLLAPSED = 4;

/** Names on a sector card. The caption beside the heading says the same. */
const PER_SECTOR = 4;

/** Headlines the rail prints when it sits inline under the page, below `xl`;
    the rest are a link away on the wire. */
const INLINE_NEWS = 6;

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

  return (
    <div className="grid min-w-0 lg:h-full lg:overflow-hidden xl:grid-cols-[minmax(0,1fr)_340px]">
      <main
        id="terminal-main"
        className="flex min-w-0 flex-col overflow-hidden lg:h-full"
      >
        <TickerTape rows={data.tape.data} />

        {/* A size container: the boards below are laid out by the width of
            this column, not the viewport's. The column already gives up 246px
            to the sidebar and 340px to the rail at xl, so a viewport
            breakpoint put three boards side by side exactly where each was
            too narrow to hold a company name. */}
        <div className="@container flex-1 px-4 pt-5 pb-10 sm:px-6 lg:overflow-y-auto lg:px-7">
          <MarketCard views={data.indices.data} />

          {/* Three across only once the column is wide enough to hold them
              (62rem). Below that, two boards share a row and "Most active"
              takes the whole row beneath, its list in two columns, rather than
              sitting at half width beside an empty cell. */}
          <div className="mt-5 grid gap-5 md:grid-cols-2 @min-[62rem]:grid-cols-3">
            <MoversCard title="Top gainers" panel={data.gainers} tone="up" />
            <MoversCard title="Top losers" panel={data.losers} tone="down" />
            <MoversCard
              title="Most active"
              note="By value traded"
              panel={data.mostActive}
              metric="turnover"
              wide
            />
          </div>

          <Card lit className={cn("mt-5 py-7", CARD_X)}>
            <div className="flex flex-wrap items-baseline justify-between gap-4">
              {/* "right now" went with the old relative-volume screen, which
                  really did change hour to hour. The ribbon is a curated list
                  of household names now, so the qualifier promised a liveness
                  the card no longer has. */}
              <h2 className="font-serif text-[21px] leading-none text-ink-2">
                Popular
              </h2>
              <p className="text-[13px] text-ink-3">Hold to read</p>
            </div>
            {data.popular.data.length === 0 ? (
              <p className="mt-5 text-[13.5px] leading-[1.7] text-ink-3">
                {/* An empty ribbon no longer means a quiet market — these
                    names trade every session — so it can only mean the feed
                    priced none of them. */}
                {emptyReason(
                  data.popular,
                  "None of these names is quoting; the ribbon fills when the feed returns.",
                )}
              </p>
            ) : (
              <>
                <PanelNote panel={data.popular} className="mt-4" />
                {/* The strip runs out to the card's edge, so moving cells are
                    cut by the card border rather than by a hard line inside
                    it. Its padding puts the first cell back on CARD_X at
                    rest. */}
                <div className={cn("mt-7", CARD_BLEED)}>
                  <PopularRibbon rows={data.popular.data} className={CARD_X} />
                </div>
              </>
            )}
          </Card>

          <SectorCards panel={data.sectors} />

          {/* Below `xl` the rail is not a rail — it reads as the last part of
              the page rather than a squeezed column. It flows with the page
              instead of being a fixed-height box with two scrollers inside
              it, which on a phone stacked three scrolls on top of each other,
              and it sits on the same edges as every card above it. */}
          <div className="mt-5 xl:hidden">
            <Rail events={data.events} news={data.wire} inline />
          </div>

          {/*
            What the figures are, and that they are not advice. The sentence
            on the feed's fifteen-minute delay came out at the owner's request
            (24 Sep 2026): no delay label on the terminal's home. The fund
            proxy stays, because a reader comparing a tab against the index
            itself is owed the reason they differ.
          */}
          <p className="mt-8 max-w-[70ch] text-[12.5px] leading-[1.75] text-ink-3">
            The index tabs are priced through the funds that track them, so
            each level shown is the price of the fund rather than of the index
            itself. Nothing here is advice.
          </p>
        </div>
      </main>

      {/* The rail owns its own height and never scrolls as a whole; each half
          inside it scrolls independently. */}
      <aside
        aria-label="Reference"
        className="hidden min-h-0 border-l border-rule-section xl:block xl:overflow-hidden"
      >
        <Rail events={data.events} news={data.wire} />
      </aside>
    </div>
  );
}

/* ------------------------------------------------------------------ */

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

  /* No delay label on the terminal's home — the owner's call (24 Sep 2026).
     A stale panel carried a "Delayed" badge over "Quotes run fifteen minutes
     behind; …" (lib/market/home.ts, panelOf), and since every quote the feed
     sends is flagged delayed, that was on every board, every day. It goes,
     badge and sentence; the data and its status are untouched.

     The one stale note that stays is the cold-start fallback, which is not
     about delay: it says the live feed has not answered and names the date
     the figures come from (lib/market/baseline.ts, describeBaseline). It is
     recognised by its opening words; if that wording ever changes, the
     notice falls silent rather than a delay label coming back. */
  if (panel.status === "stale" && !panel.note.startsWith("Showing the last sweep")) return null;

  /* `cn` is a plain join rather than a merge, so the spacing is the caller's
     to state — a base margin here could not be overridden. */
  return (
    <div className={cn("flex flex-wrap items-center gap-2.5", className)}>
      {panel.status === "degraded" && <Badge tone="outline">Partial</Badge>}
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
 * The tick is taken whole or not at all, and only when it measures from the
 * same previous close as the row (see same-session.ts). A board is ranked on
 * one session's move. Before this check, the morning's pre-market tick was
 * written into boards ranked on the previous session, and "Top gainers"
 * printed red rows.
 *
 * `turnoverM` is deliberately left alone. Nothing on the wire carries money
 * traded, and it is the figure the "most active" board is ranked on: a stale
 * turnover under a fresh change is honest about what the sweep saw, while a
 * turnover reconstructed from price and volume would be a number no screen
 * ever ran on.
 */
function freshen(quote: Quote, ticks: ReadonlyMap<string, Tick>): Quote {
  return withTick(quote, ticks.get(quote.id.toUpperCase()));
}

function MoversCard({
  title,
  note = "Session",
  panel,
  metric = "price",
  tone,
  wide = false,
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
  /* Takes the whole row while the boards are two across, with its list in
     two columns (read down, then across, as a ranking is). Three across, it
     is one board among three again. */
  wide?: boolean;
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
    <Card
      tone={tone}
      className={cn("py-6", CARD_X, wide && "md:col-span-2 @min-[62rem]:col-span-1")}
    >
      {/* The title never wraps: a two-line title pushed one board's list
          below its neighbours'. The note gives way instead. */}
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-serif text-[21px] leading-none whitespace-nowrap text-ink-2">
          {title}
        </h2>
        <p className="min-w-0 truncate text-[12.5px] text-ink-3">{note}</p>
      </div>

      {rows.length === 0 ? (
        <p className="mt-6 text-[13.5px] leading-[1.7] text-ink-3">
          {emptyReason(panel, "Nothing moved that way this session.")}
        </p>
      ) : (
        <>
          <PanelNote panel={panel} className="mt-4" />
          <ul
            className={cn(
              "m-0 mt-6 flex list-none flex-col gap-1 p-0",
              ROW_BLEED,
              wide &&
                "md:grid md:grid-flow-col md:grid-cols-2 md:gap-x-6 md:[grid-template-rows:repeat(var(--rows),auto)] @min-[62rem]:flex",
            )}
            style={
              wide ? ({ "--rows": Math.ceil(live.length / 2) } as React.CSSProperties) : undefined
            }
          >
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
                    {/* Two lines, not one. SOXL and SOXS are both "Direxion
                        Daily Semiconductor Bull/Bear 3x ETF", and one line cut
                        off "Bull" and "Bear", the only words that tell them
                        apart. line-clamp sets its own display, so no `block`. */}
                    <span className="line-clamp-2 text-[13.5px] font-medium break-words text-ink">
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
      {/* Text outside a card sits on the page gutter, like the footnote at the
          foot of the page. Text inside a card sits on CARD_X. The old px-1 put
          this heading at 20px, which matched neither. */}
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="font-serif text-[21px] leading-none text-ink-2">By sector</h2>
        {groups.length > 0 && (
          <p className="text-[12.5px] text-ink-3">
            {groups.length} sectors · four largest movers each
          </p>
        )}
      </div>

      {groups.length === 0 ? (
        <p className="mt-4 text-[13.5px] leading-[1.7] text-ink-3">
          {emptyReason(panel, "No sector is quoting just now.")}
        </p>
      ) : (
        <>
          <PanelNote panel={panel} className="mt-4" />

          <div className="mt-4 grid gap-5 md:grid-cols-2 2xl:grid-cols-4">
            {shown.map((group) => (
              <Card key={group.name} className={cn("flex flex-col py-5", CARD_X)}>
                <header className="flex items-baseline justify-between gap-3">
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
                <p className="mt-1.5 text-[11.5px] leading-[1.55] text-ink-3">
                  {SECTOR_ETF[group.name as keyof typeof SECTOR_ETF] ?? "Fund"} ·{" "}
                  {pct(group.membersChg, 2)} across the {group.total} quoted here
                </p>

                <ul className={cn("m-0 mt-4 mb-5 flex list-none flex-col gap-0.5 p-0", ROW_BLEED)}>
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
                      "flex min-h-[44px] items-center gap-2.5 rounded-[9px] px-2 transition-colors";

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
function when(event: CalendarEvent) {
  const { date, relative } = calendarDate(event);
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
  inline = false,
}: {
  events: Panel<CalendarEvent[]>;
  news: Panel<WireItem[]>;
  /* Below `xl`, where the rail is appended under the page: no frame padding,
     no fixed halves, no inner scrollers — the two cards flow with the page
     and the headlines stop at INLINE_NEWS with the wire a link away. */
  inline?: boolean;
}) {
  const [openEvent, setOpenEvent] = useState<CalendarEvent | null>(null);
  const [openNews, setOpenNews] = useState<WireItem | null>(null);

  /* The rail keeps a few actions that have already happened so the card is
     never empty out of season, so the count is of the ones still to come. */
  const ahead = events.data.filter((event) => event.offset >= 0).length;
  const eventNote =
    events.data.length === 0 ? "None dated" : ahead > 0 ? `${ahead} ahead` : "All past";

  /* The rail's stories are the wire's top cut by relevance and impact
     (lib/api/normalize/wire.ts), not its newest. The card is headed "Top
     stories" for that reason; "Latest news" over a list whose newest item was
     16 hours old promised something it did not hold. Inside the cut, they read
     in time order. */
  const headlines = newestFirst(news.data);
  const shownNews = inline ? headlines.slice(0, INLINE_NEWS) : headlines;

  return (
    <>
      <div
        className={
          inline ? "grid gap-5" : "grid h-full min-h-0 grid-rows-2 gap-4 p-4 sm:p-5"
        }
      >
        <RailCard
          title="Key events"
          note={eventNote}
          inline={inline}
          more={
            inline && events.data.length > 0
              ? { href: CALENDAR_PATH, label: "Open the calendar" }
              : undefined
          }
        >
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
                const { date, relative } = when(event);
                /* A corporate action's "time" is often the word already in
                   its title ("ex-dividend"), and says it twice here. */
                const time = eventTime(event);
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
                          {relative} · {date}
                          {time && ` · ${time}`}
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

        <RailCard
          title="Top stories"
          note="The wire"
          inline={inline}
          more={
            /* No count. `news.data` is the rail's cut, not the wire, which
               holds several times as many stories, so "Read all 8" undercounted
               the page it opened. */
            inline && news.data.length > 0 ? { href: WIRE_PATH, label: "Read the wire" } : undefined
          }
        >
          <PanelNote panel={news} className="mb-2 px-2.5" />
          {news.data.length === 0 ? (
            <p className="px-2.5 pt-1 text-[13.5px] leading-[1.7] text-ink-3">
              {emptyReason(news, "Nothing has come over the wire today.")}
            </p>
          ) : (
            <ul className="m-0 flex list-none flex-col p-0">
              {shownNews.map((item, i) => (
                <li key={item.id}>
                  {/* The rule sits on the text line, inset by the rows' own
                      px-2.5. Drawn on the <li>, it ran 10px past the headlines
                      on both sides and matched neither the text nor the card. */}
                  {i > 0 && (
                    <span aria-hidden="true" className="mx-2.5 block border-t border-rule-list" />
                  )}
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
                {when(openEvent).relative} · {when(openEvent).date}
                {eventTime(openEvent) && ` · ${eventTime(openEvent)}`}
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

/**
 * A rail half: a pinned heading over its own scroller. Inline, below `xl`,
 * the list flows with the page and ends on a link to the full page instead.
 */
function RailCard({
  title,
  note,
  inline = false,
  more,
  children,
}: {
  title: string;
  note: string;
  inline?: boolean;
  more?: { href: string; label: string };
  children: React.ReactNode;
}) {
  return (
    <Card className="flex min-h-0 flex-col">
      <div className={cn("flex flex-none items-baseline justify-between gap-3 pt-5 pb-3", CARD_X)}>
        <h2 className="font-serif text-[21px] leading-none text-ink-2">{title}</h2>
        <p className="flex-none text-[12.5px] text-ink-3">{note}</p>
      </div>
      {/* The scroller, not the card. The heading above stays put. Its padding
          plus the rows' own px-2.5 lands their text on CARD_X, the heading's
          line. */}
      <div
        className={cn(
          "px-2.5 pb-4 sm:px-3.5",
          inline ? "overflow-visible" : "min-h-0 flex-1 overflow-y-auto",
        )}
      >
        {children}
      </div>
      {more && (
        <div className={cn("pb-5", CARD_X)}>
          <Link
            href={more.href}
            className="flex min-h-11 items-center justify-between gap-2 rounded-[10px] border border-rule-control px-3 text-[12.5px] font-medium text-ink-3 transition-colors hover:border-gold hover:text-gold"
          >
            {more.label}
            <IconChevron className="h-3.5 w-3.5" />
          </Link>
        </div>
      )}
    </Card>
  );
}
