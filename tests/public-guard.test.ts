import test from "node:test";
import assert from "node:assert/strict";

import { browserOrigin, rateLimit, refusePublic, resetRateLimits } from "../lib/api/public-guard.ts";

/* What stands between a public URL and our credentials.
 *
 * Every route these guard is an anonymous GET that spends something we cannot
 * get back: the newsapi.ai key has a TWO THOUSAND REQUEST LIFETIME quota, the
 * ViewTrade feed is licensed per account, and `?gainers=1` fans one request
 * out to twenty-one upstream calls. None of them had any bound at all — the
 * search route's own comment says a public URL "turns into an open proxy for
 * our ViewTrade credentials", and then bounds only the query's LENGTH.
 *
 * Two independent bounds, because each catches what the other misses. The
 * origin check stops a script that is not our page at all; the rate limit
 * stops our page, or something imitating it, from asking too often.
 */

test.beforeEach(() => resetRateLimits());

/* ---------- is this our own page asking? ---------- */

/* Sec-Fetch-Site rather than Origin or Referer. Every browser since 2020 sends
   it on every request, a page cannot forge it, and unlike Origin it is present
   on same-origin GETs — which is exactly what these routes receive. */
test("our own page is allowed", () => {
  assert.equal(browserOrigin(new Headers({ "sec-fetch-site": "same-origin" })), "allow");
  assert.equal(browserOrigin(new Headers({ "sec-fetch-site": "same-site" })), "allow");
});

test("another site's page is refused", () => {
  assert.equal(browserOrigin(new Headers({ "sec-fetch-site": "cross-site" })), "refuse");
});

/* `none` is a URL typed into the address bar or opened from a bookmark. That
   is a person poking at an endpoint, not a page of ours rendering. */
test("a URL opened directly is refused", () => {
  assert.equal(browserOrigin(new Headers({ "sec-fetch-site": "none" })), "refuse");
});

/* A request with no Sec-Fetch-Site at all is curl, a scraper, or a browser old
   enough to predate the header. None of them is our page, and the thing being
   protected is not renewable, so the benefit of the doubt goes the other way. */
test("a caller that is not a browser is refused", () => {
  assert.equal(browserOrigin(new Headers()), "refuse");
});

/* ---------- how often may it ask? ---------- */

test("a caller inside its allowance passes", () => {
  for (let i = 0; i < 5; i += 1) {
    assert.equal(rateLimit("1.2.3.4", { limit: 5, windowMs: 60_000, now: 1_000 }), true, `call ${i}`);
  }
});

test("and is refused the moment it goes past", () => {
  for (let i = 0; i < 5; i += 1) rateLimit("1.2.3.4", { limit: 5, windowMs: 60_000, now: 1_000 });
  assert.equal(rateLimit("1.2.3.4", { limit: 5, windowMs: 60_000, now: 1_000 }), false);
});

test("callers are counted apart", () => {
  for (let i = 0; i < 5; i += 1) rateLimit("1.2.3.4", { limit: 5, windowMs: 60_000, now: 1_000 });
  assert.equal(
    rateLimit("5.6.7.8", { limit: 5, windowMs: 60_000, now: 1_000 }),
    true,
    "one caller's fuzzing must not lock everyone else out",
  );
});

test("the window slides, so a refusal is not a ban", () => {
  for (let i = 0; i < 5; i += 1) rateLimit("1.2.3.4", { limit: 5, windowMs: 60_000, now: 1_000 });
  assert.equal(rateLimit("1.2.3.4", { limit: 5, windowMs: 60_000, now: 1_000 }), false);
  assert.equal(
    rateLimit("1.2.3.4", { limit: 5, windowMs: 60_000, now: 62_000 }),
    true,
    "a minute later the same caller is welcome again",
  );
});

/* The limiter is the kind of thing that becomes the leak it was added to
   prevent. Every distinct caller is a key, and a scraper rotating addresses
   would otherwise grow this map for as long as the process lived. */
test("callers that have gone quiet are forgotten", () => {
  for (let i = 0; i < 400; i += 1) {
    rateLimit(`10.0.0.${i}`, { limit: 5, windowMs: 60_000, now: 1_000 });
  }
  /* Long after their window, one more call sweeps them out. */
  rateLimit("10.1.1.1", { limit: 5, windowMs: 60_000, now: 10_000_000 });
  assert.ok(
    rateLimit.size() < 50,
    `stale callers must not accumulate; held ${rateLimit.size()}`,
  );
});

/* The bug this pins was mine, and only a browser found it.
 *
 * The key was the caller alone, so every endpoint shared one bucket and the
 * cheapest route could spend the most expensive one's allowance. A burst of
 * search calls emptied the stream's budget, and a real page then took 429s on
 * its live feed, its day chart and its newswire at once — after the unit tests
 * and every curl had passed, because only a real page asks for several of
 * these together. */
test("a busy route does not spend a quiet one's allowance", () => {
  const caller = new Headers({ "sec-fetch-site": "same-origin", "x-forwarded-for": "9.9.9.9" });

  for (let i = 0; i < 30; i += 1) {
    refusePublic(caller, { route: "search", limit: 30, windowMs: 60_000 });
  }
  assert.ok(
    refusePublic(caller, { route: "search", limit: 30, windowMs: 60_000 }),
    "search itself is now spent",
  );
  assert.equal(
    refusePublic(caller, { route: "stream", limit: 20, windowMs: 60_000 }),
    null,
    "but the stream has not been touched",
  );
});
