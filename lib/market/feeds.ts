import "server-only";
import { cache } from "react";

import { getCorporateActions, getFundamentals } from "@/lib/api/cache-layer";
import { toCalendarEvents } from "@/lib/api/normalize/calendar";
import { toWireItems } from "@/lib/api/normalize/wire";
import { nowMs } from "@/lib/market/clock";
import { CALENDAR_TICKERS, WIRE_TICKERS } from "@/lib/market/universe";
import { storeConfigured } from "./store/client.ts";
import { readSections } from "./store/reads.ts";
import { fromStored } from "./store/sections.ts";
import type { RawCorporateActions, RawTickerNews } from "@/lib/api/clients/fundamentals";
import type { Section } from "./store/types.ts";
import type { CalendarEvent } from "@/lib/market/session";
import type { WireItem } from "@/lib/market/home";

/* The wire and the calendar, at their own length.

   The dashboard shows eight headlines and five dated events because that is
   what a rail has room for. Their own pages are the place a reader goes when
   that was not enough, so they ask the same sources for more of the same
   thing rather than for something different.

   WHAT EACH PATH COSTS. On the store path it is one `market_sections` call per
   feed — the refresher has already fetched these documents, and the read is
   tagged per symbol, so a company whose news has not moved is served from the
   cached entry without the database being asked at all. On the gateway path
   nothing here costs an extra request either: both underlying fetchers are
   cached by ticker, so a reader arriving from the dashboard is reading what the
   dashboard already paid for.

   Both lists sit inside the 128-symbol cap `readSections` documents — 51 wire
   tickers and 93 calendar tickers — so neither batch silently loses the tags
   that make it invalidable. */

type Feed<T> = { items: T[]; asked: number; answered: number };

/* One feed's worth of documents, and how many tickers answered at all.

   `answered` is measured before anything is filtered for content, on both
   paths. A company that answered with no headlines is not a company that
   failed to answer, and the count the page shows is about the connection
   rather than about the news. */
type Gathered<T> = { rows: Array<{ ticker: string; value: T }>; answered: number };

/* Structurally whatever the cached fetcher returns, so this stays a plain
   fan-out rather than a second copy of every response type. */
async function gather<T>(
  tickers: readonly string[],
  fetcher: (t: string) => Promise<{ ok: true; data: T } | { ok: false }>,
): Promise<Array<{ ticker: string; value: T }>> {
  const settled = await Promise.allSettled(
    tickers.map(async (ticker) => ({ ticker, result: await fetcher(ticker) })),
  );
  const out: Array<{ ticker: string; value: T }> = [];
  for (const s of settled) {
    if (s.status !== "fulfilled") continue;
    const { ticker, result } = s.value;
    if (!result.ok) continue;
    out.push({ ticker, value: result.data });
  }
  return out;
}

/**
 * One stored section across a list of tickers, or null.
 *
 * Null is the signal to fall through to the gateway, and it covers the three
 * ways the store can decline: unconfigured, unreachable, and not yet filled.
 * The third is the one that matters here. The refresher works through the
 * sections in priority order over hours, so a feed page opened on the first
 * afternoon may find nothing at all — and an empty answer would render an empty
 * page under a heading promising the day's news, which is worse than paying the
 * gateway for it.
 *
 * `read` is `fromStored`, so a payload that came back malformed is dropped by
 * exactly the rules the instrument page uses. Such a row still counts as
 * answered: the store had something for that ticker, and pretending otherwise
 * would report a connection fault for a parsing one.
 */
async function storedFeed<T>(
  tickers: readonly string[],
  section: Section,
  read: (payload: unknown) => T | null,
): Promise<Gathered<T> | null> {
  if (!storeConfigured()) return null;

  const result = await readSections([...tickers], section);
  if (!result.ok || result.data.length === 0) return null;

  const rows: Array<{ ticker: string; value: T }> = [];
  for (const row of result.data) {
    const value = read(row.payload);
    if (value === null) continue;
    rows.push({ ticker: row.symbol, value });
  }

  return { rows, answered: result.data.length };
}

export const getWireFeed = cache(async (limit = 40): Promise<Feed<WireItem>> => {
  const now = nowMs();

  const feed =
    (await storedFeed<RawTickerNews[]>(WIRE_TICKERS, "news_gateway", (p) =>
      fromStored("news_gateway", p),
    )) ?? (await gatewayWire());

  return {
    items: toWireItems(
      feed.rows.map((r) => ({ ticker: r.ticker, news: r.value })),
      now,
      limit,
    ),
    asked: WIRE_TICKERS.length,
    answered: feed.answered,
  };
});

async function gatewayWire(): Promise<Gathered<RawTickerNews[]>> {
  const gathered = await gather(WIRE_TICKERS, getFundamentals);
  return {
    rows: gathered
      .filter((g) => (g.value.ticker_news?.length ?? 0) > 0)
      .map((g) => ({ ticker: g.ticker, value: g.value.ticker_news ?? [] })),
    answered: gathered.length,
  };
}

export const getEventsFeed = cache(async (limit = 40): Promise<Feed<CalendarEvent>> => {
  const now = nowMs();

  const feed =
    (await storedFeed<RawCorporateActions>(CALENDAR_TICKERS, "corporate_actions", (p) =>
      fromStored("corporate_actions", p),
    )) ?? (await gatewayEvents());

  return {
    items: toCalendarEvents(
      feed.rows.map((r) => ({ ticker: r.ticker, actions: r.value })),
      now,
      limit,
    ),
    asked: CALENDAR_TICKERS.length,
    answered: feed.answered,
  };
});

async function gatewayEvents(): Promise<Gathered<RawCorporateActions>> {
  const gathered = await gather(CALENDAR_TICKERS, getCorporateActions);
  return {
    rows: gathered.map((g) => ({ ticker: g.ticker, value: g.value })),
    answered: gathered.length,
  };
}
