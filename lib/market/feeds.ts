import "server-only";
import { cache } from "react";

import { getCorporateActions, getFundamentals } from "@/lib/api/cache-layer";
import { toCalendarEvents } from "@/lib/api/normalize/calendar";
import { toWireItems } from "@/lib/api/normalize/wire";
import { nowMs } from "@/lib/market/clock";
import { CALENDAR_TICKERS, WIRE_TICKERS } from "@/lib/market/universe";
import type { CalendarEvent } from "@/lib/market/session";
import type { WireItem } from "@/lib/market/home";

/* The wire and the calendar, at their own length.

   The dashboard shows eight headlines and five dated events because that is
   what a rail has room for. Their own pages are the place a reader goes when
   that was not enough, so they ask the same sources for more of the same
   thing rather than for something different.

   Nothing here costs an extra request: both underlying fetchers are cached by
   ticker, so a reader arriving from the dashboard is reading what the
   dashboard already paid for. */

type Feed<T> = { items: T[]; asked: number; answered: number };

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

export const getWireFeed = cache(async (limit = 40): Promise<Feed<WireItem>> => {
  const now = nowMs();
  const gathered = await gather(WIRE_TICKERS, getFundamentals);

  const input = gathered
    .filter((g) => (g.value.ticker_news?.length ?? 0) > 0)
    .map((g) => ({ ticker: g.ticker, news: g.value.ticker_news ?? [] }));

  return {
    items: toWireItems(input, now, limit),
    asked: WIRE_TICKERS.length,
    answered: gathered.length,
  };
});

export const getEventsFeed = cache(async (limit = 40): Promise<Feed<CalendarEvent>> => {
  const now = nowMs();
  const gathered = await gather(CALENDAR_TICKERS, getCorporateActions);

  return {
    items: toCalendarEvents(
      gathered.map((g) => ({ ticker: g.ticker, actions: g.value })),
      now,
      limit,
    ),
    asked: CALENDAR_TICKERS.length,
    answered: gathered.length,
  };
});
