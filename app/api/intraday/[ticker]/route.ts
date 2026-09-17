import type { NextRequest } from "next/server";
import { fetchIntraday } from "@/lib/api/clients/quotes";
import { toPricePoints } from "@/lib/api/normalize/series";
import { TAGS, TTL } from "@/lib/api/ttl";

/* The current session's one-minute bars, off the render path.

   Every other figure on an instrument page has a horizon of half an hour or
   more — fundamentals six hours, corporate actions twelve, news a day — which
   is what makes the durable store worth having. The day's bars are the
   exception: they change every minute the market is open, they cannot be
   stored usefully at that cadence, and they were one of the calls the reader
   waited on before the page appeared at all.

   So they load here instead, after hydration, through
   components/terminal/use-intraday.ts. The chart already reserves its height
   and already knows how to draw an empty day view, so nothing moves while this
   is in flight — see the note in lib/market/instrument.ts about what the page
   says in the meantime.

   Anonymous surface, so it is bounded like app/api/search/route.ts: a symbol
   that is not a symbol is refused here rather than forwarded, because a public
   URL that forwards anything is an open proxy for our ViewTrade credentials. */

/* Thirty seconds. The upstream series is published a minute at a time and the
   hook re-asks every sixty, so this collapses two readers of the same stock
   onto one gateway call without ever holding a bar back for a whole minute. */
const CACHE = "public, max-age=30";

/* market.symbols caps a symbol at sixteen characters (migration:51) and the
   longest listed US ticker is well under that — nine, `AAAA.TEST`, across the
   33,440 rows of the symbol master. Anything longer is not a lookup.

   The character class is the master's own: every symbol in it is drawn from
   A-Z, 0-9 and `$ + - .`, the `$` being the 1,937 index instruments. None of
   those has a page today — SPX$ and its family answer notPermissioned, so the
   instrument route 404s before this is ever asked — but a class that refused
   them would be a guess where the master is a fact, and the day the
   entitlement lands the chart should not quietly go blank. `_` is kept for the
   preferred-share spelling some feeds use. */
const MAX_SYMBOL = 16;
const SYMBOL = /^[A-Z0-9.$+_-]+$/;

/* The wording the assembler uses for the same state, kept identical on
   purpose: which of the two filled the field is not something a reader should
   be able to tell from the sentence. */
const CLOSED_NOTE = "No trades yet this session. The day view fills when the market opens.";

/* A failed call is not an empty session, and saying so is the whole point. The
   chart draws this over the day view instead of an unexplained blank. */
const UNAVAILABLE_NOTE = "This session's trades could not be loaded just now.";

/* And a string that cannot be a ticker is neither. Answering the guard below
   with CLOSED_NOTE would have this route say "No trades yet this session"
   about something that is not a session and not a symbol — a sentence that is
   false rather than merely unhelpful, and the kind of small invented fact this
   codebase spends the rest of its comments refusing to print. Nothing a reader
   can reach produces it: the hook only ever asks about a symbol the page it is
   mounted on was drawn for. */
const REFUSED_NOTE = "That is not a symbol this terminal can quote.";

export async function GET(
  _request: NextRequest,
  /* `params` is a PROMISE in this version — a dynamic route handler's context
     is `{ params: Promise<…> }`, as
     docs/01-app/03-api-reference/03-file-conventions/route.md:82 spells it, and
     as .next/types/validator.ts checks each handler against. Spelled out rather
     than taken from the global `RouteContext<'/api/intraday/[ticker]'>` helper
     because that helper is generated from the route list, and a route added
     since the last `next typegen` is not in it yet — the shape below is the one
     the validator compares to, so it is the shape that cannot go stale.

     Worth knowing which tool actually enforces that: `next build` does, and
     `npx tsc --noEmit` does not. tsconfig.json excludes `.next`, and the
     exclude beats the `.next/types/**` include, so the generated validator is
     never handed to tsc. A green typecheck says nothing about this signature. */
  context: { params: Promise<{ ticker: string }> },
) {
  const { ticker } = await context.params;
  const symbol = decodeURIComponent(ticker ?? "")
    .trim()
    .toUpperCase();

  if (!symbol || symbol.length > MAX_SYMBOL || !SYMBOL.test(symbol)) {
    /* 400, because the path segment is the thing that is wrong and a caller
       should be told so. Cached like the rest: a refusal for a given string is
       the same refusal every time, so repeats of someone's fuzzing are absorbed
       at the edge rather than here. */
    return Response.json(
      { intraday: [], note: REFUSED_NOTE },
      { status: 400, headers: { "Cache-Control": CACHE } },
    );
  }

  /* `fetchIntraday` returns rather than throws — nothing in lib/api throws —
     and the catch is for whatever Next itself decides to do to a fetch inside
     a route handler. Either way a dead gateway costs this page its day view
     and nothing else. */
  const result = await fetchIntraday(symbol, TTL.sweep, [TAGS.history]).catch(() => null);

  if (!result?.ok) {
    /* The upstream's own words are not for an anonymous caller — they can name
       hosts and quota state. A 200 with an empty series and an honest note is
       what the chart can actually use; the failure is already in the gateway's
       own logs. */
    return Response.json(
      { intraday: [], note: UNAVAILABLE_NOTE },
      { headers: { "Cache-Control": CACHE } },
    );
  }

  const intraday = toPricePoints(result.data);

  return Response.json(
    { intraday, note: intraday.length > 0 ? null : CLOSED_NOTE },
    { headers: { "Cache-Control": CACHE } },
  );
}
