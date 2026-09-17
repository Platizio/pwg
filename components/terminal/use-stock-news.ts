"use client";

import { useEffect, useMemo, useState } from "react";
import type { WireItem } from "@/lib/market/home";

/* The newswire's wider half, fetched by the browser instead of by the render.

   The gateway's own three headlines ride the snapshot and cost nothing extra,
   so the rail is already drawn when this mounts. What it used to wait for is
   the second source — newsapi.ai, one to one and a half seconds of a cold
   page, more than the database read and the React render put together. That
   call now lives in app/api/stock-news/[ticker]/route.ts and the rail simply
   gets better a moment after it appears.

   This is deliberately smaller than use-intraday.ts beside it, and the
   difference is the whole point: THERE IS NO TIMER. The day's bars move every
   minute the market is open, so that hook re-asks while prices move. News is
   reading material. A story that arrives four minutes after the page did is
   not a figure going stale, and polling for it would spend a request a minute
   on a background tab to be told the same three headlines — against an upstream
   that bills a non-renewable lifetime allowance. One fetch, on mount, per
   symbol.

   The abort is not optional even so. A reader tabbing between stocks starts a
   fetch per stock, and without it the slowest answer wins whichever symbol it
   belongs to. */

/** What the route sends back, before it has been believed. */
type Body = { news?: unknown };

export type StockNewsRead = {
  /** The richest rail available for this symbol right now. */
  news: WireItem[];
  /**
   * Whether this hook has finished asking about this symbol.
   *
   * This exists for ONE caller and one sentence. The rail's empty state says
   * "Nothing published about X in the last two weeks. The feed carried other
   * stories naming it...", which is a claim about the whole feed — and the
   * page now renders before half the feed has been consulted. On a name whose
   * three bundled gateway articles are all filler, and stock-news.ts puts that
   * at roughly one name in three, the paragraph would appear on a page that
   * had asked one of its two sources, and be contradicted by headlines a
   * second later. That is the flash this whole wave exists to avoid. So the
   * rail waits for this before making the claim.
   *
   * A FAILED request settles too. There is no second attempt — no timer, by
   * design — so an unsettled-forever rail would leave a quiet company's
   * newswire as a heading over blank space for the life of the page. Between
   * a sentence that is true of everything the page was able to learn and a
   * section that never resolves, the sentence wins; it is the same trade the
   * route makes when the provider is dead.
   */
  settled: boolean;
};

/**
 * The richest rail available for `symbol`.
 *
 * `rendered` is what the page was drawn with — the gateway half, ranked by the
 * same assembler the route runs — and it is returned unchanged until an answer
 * lands for this symbol.
 *
 * IT ONLY EVER GETS RICHER. The route returns the whole merged list rather
 * than the new half, so the swap is a replacement and not a client-side merge;
 * what makes that safe is that the route ranks the same gateway items the page
 * rendered against a wider pool, so every slot is filled by something ranked
 * at least as high as what it replaces. An EMPTY answer is the one case where
 * that is not true — it means the route could not confirm the symbol or found
 * nothing at all, which is less than the page already knows — so it is
 * discarded and the rendered rail stands. Nothing here can take a headline off
 * the screen and leave a gap.
 */
export function useStockNews(symbol: string, rendered: WireItem[]): StockNewsRead {
  /* Keyed by symbol rather than reset on change, so a navigation between two
     stocks cannot show the first one's headlines under the second one's name
     for the frame before the new answer arrives.

     `news: null` is a settled answer that is not worth swapping in — an empty
     list, a body of the wrong shape, a 400, an offline browser. It is not the
     same as the outer null, which means this symbol has not been asked about
     yet; the rail reads exactly that difference. */
  const [answer, setAnswer] = useState<{ symbol: string; news: WireItem[] | null } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    /* Belt and braces with the signal: `setState` after unmount is the thing
       being prevented, and an abort only rejects a fetch that is still in the
       network — one that has already resolved and is being parsed is not. */
    let live = true;

    const load = async () => {
      try {
        const res = await fetch(`/api/stock-news/${encodeURIComponent(symbol)}`, {
          signal: controller.signal,
        });
        const body = res.ok ? ((await res.json()) as Body) : null;
        if (!live) return;
        /* Parsed JSON wearing a type. An answer that is not the shape this
           expects leaves the rail exactly as it was rather than throwing
           inside a render — and so does an empty one, for the reason above.
           Either way the symbol has now been asked about, and `settled` says
           so, because the rail's empty sentence is owed an answer from this
           source whether or not the answer was any use. */
        const news =
          Array.isArray(body?.news) && body.news.length > 0 ? (body.news as WireItem[]) : null;
        setAnswer({ symbol, news });
      } catch {
        /* Aborted, offline, or a body that would not parse. Whatever is on
           screen stays on screen, and there is no next attempt: see above. An
           abort has already had `live` cleared by the cleanup below, so the
           symbol being navigated away from cannot settle the one arriving. */
        if (live) setAnswer({ symbol, news: null });
      }
    };

    void load();

    return () => {
      live = false;
      controller.abort();
    };
  }, [symbol]);

  return useMemo(() => {
    const mine = answer !== null && answer.symbol === symbol ? answer : null;
    return { news: mine?.news ?? rendered, settled: mine !== null };
  }, [answer, symbol, rendered]);
}
