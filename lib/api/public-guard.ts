/* What stands between a public URL and our credentials.
 *
 * WHAT THESE ROUTES SPEND. Every endpoint this guards is an anonymous GET, and
 * each of them spends something that does not come back:
 *
 *   - /api/news and /api/stock-news reach newsapi.ai, whose key carries a TWO
 *     THOUSAND REQUEST LIFETIME quota. Not per month. Ever. A script left
 *     running overnight ends the feature permanently.
 *   - /api/quotes, /api/search and /api/intraday reach ViewTrade, licensed per
 *     account, and `?gainers=1` fans a single request out to twenty-one calls.
 *   - /api/history and /api/stream serve that licensed data back out.
 *
 * None of them had any bound. The search route's own comment names the danger
 * exactly — a public URL "turns into an open proxy for our ViewTrade
 * credentials" — and then bounds only the length of the query string, which
 * limits what one request costs and not how many arrive.
 *
 * TWO BOUNDS, because each catches what the other cannot. The origin check
 * refuses a caller that is not our page at all; the rate limit refuses our
 * page, or something imitating it well, asking far too often.
 *
 * Deliberately NOT authentication. These routes serve a public marketing site
 * and a public terminal, and there is no reader to identify. The question is
 * only whether the request came from our own pages at a human rate.
 */

/* ------------------------------------------------------------------ */
/* Is this our own page asking?                                        */
/* ------------------------------------------------------------------ */

export type OriginVerdict = "allow" | "refuse";

/**
 * Whether a request came from a page of ours.
 *
 * `Sec-Fetch-Site` rather than `Origin` or `Referer`, for three reasons that
 * matter here. Every browser since 2020 sends it on every request; a page
 * cannot set or forge it, because it is one of the headers script is forbidden
 * to touch; and unlike `Origin` it is present on same-origin GETs, which is
 * what all of these actually receive.
 *
 * `none` — a URL typed into the address bar, or opened from a bookmark — is
 * refused along with `cross-site`. That is a person poking at an endpoint
 * rather than a page of ours rendering, and the thing being protected is not
 * renewable.
 *
 * A request carrying no such header is curl, a scraper, or a browser old
 * enough to predate it. None of those is our page, so the benefit of the doubt
 * goes the other way. That is a deliberate trade: it means these routes are
 * not usable as a public API, which they were never meant to be.
 */
export function browserOrigin(headers: Headers): OriginVerdict {
  const site = headers.get("sec-fetch-site");
  return site === "same-origin" || site === "same-site" ? "allow" : "refuse";
}

/* ------------------------------------------------------------------ */
/* How often may it ask?                                               */
/* ------------------------------------------------------------------ */

type Window = { hits: number[] };

const CALLERS = new Map<string, Window>();

/* Swept rather than left to grow. A limiter keyed by caller is exactly the
   kind of thing that becomes the leak it was added to prevent: a scraper
   rotating addresses would otherwise add a key per request for as long as the
   process lived, on a box with 512MB. The sweep runs on write and only when
   the map has grown enough to be worth walking. */
const SWEEP_ABOVE = 256;

function sweep(now: number, windowMs: number): void {
  for (const [key, held] of CALLERS) {
    const live = held.hits.filter((t) => now - t < windowMs);
    if (live.length === 0) CALLERS.delete(key);
    else held.hits = live;
  }
}

export type RateOptions = {
  limit: number;
  windowMs: number;
  /** Injected by tests; production reads the clock. */
  now?: number;
};

/**
 * Whether this caller may make one more request.
 *
 * A sliding window rather than a fixed one: a fixed window lets a caller spend
 * its whole allowance in the last second of one bucket and again in the first
 * second of the next, which is the burst these limits exist to stop.
 *
 * Counted per caller so one script's fuzzing cannot lock every reader out —
 * the failure mode of a global limit, and worse than what it prevents.
 */
export function rateLimit(caller: string, opts: RateOptions): boolean {
  const now = opts.now ?? Date.now();

  if (CALLERS.size > SWEEP_ABOVE) sweep(now, opts.windowMs);

  const held = CALLERS.get(caller) ?? { hits: [] };
  const live = held.hits.filter((t) => now - t < opts.windowMs);

  if (live.length >= opts.limit) {
    held.hits = live;
    CALLERS.set(caller, held);
    return false;
  }

  live.push(now);
  held.hits = live;
  CALLERS.set(caller, held);
  return true;
}

/** How many callers are being tracked. For tests and the health route. */
rateLimit.size = (): number => CALLERS.size;

/** Between tests. Never called in production. */
export function resetRateLimits(): void {
  CALLERS.clear();
}

/* ------------------------------------------------------------------ */
/* The two, applied                                                    */
/* ------------------------------------------------------------------ */

/**
 * Which caller this is.
 *
 * Render terminates TLS at its proxy, so the socket address is the proxy's and
 * the same for everybody; `x-forwarded-for`'s FIRST entry is the client. Later
 * entries are proxies and a caller can prepend to the header, so only the
 * leftmost is read and only as a rate-limit key — nothing here is a security
 * decision about identity.
 */
export function callerKey(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  return first && first.length > 0 ? first : "unknown";
}

export type GuardOptions = RateOptions & {
  /** Names the route in the refusal, so a log line says which bound was hit. */
  route: string;
};

/**
 * The refusal to send, or null to carry on.
 *
 * Returns a Response rather than throwing so each route keeps its own shape:
 * these answer `{ results: [] }`, `{ intraday: [] }` and so on, and a caller
 * that is refused should still be able to parse what it gets back.
 */
export function refusePublic(headers: Headers, opts: GuardOptions): Response | null {
  if (browserOrigin(headers) === "refuse") {
    return Response.json(
      { error: "This endpoint serves Platizio Global's own pages." },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
  }

  /* Keyed by ROUTE AND CALLER, not by caller alone. Sharing one bucket across
     every endpoint means the cheapest route can spend the most expensive one's
     allowance — and it does: a burst of search calls emptied the stream's
     budget and a real page then took 429s on its live feed, its day chart and
     its newswire at once. Caught in a browser, having passed every test and
     every curl, because only a real page asks for several of these together. */
  if (!rateLimit(`${opts.route}:${callerKey(headers)}`, opts)) {
    /* Retry-After in seconds, so a well-behaved client waits rather than
       spinning — and an ill-behaved one has been told plainly. */
    return Response.json(
      { error: "Too many requests." },
      {
        status: 429,
        headers: {
          "Cache-Control": "no-store",
          "Retry-After": String(Math.ceil(opts.windowMs / 1000)),
        },
      },
    );
  }

  return null;
}
