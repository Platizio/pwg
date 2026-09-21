import test from "node:test";
import assert from "node:assert/strict";

import {
  SECTIONS,
  canonicalise,
  derivedOf,
  fromStored,
  hashOf,
  sourceUpdatedAt,
  toStored,
} from "../lib/market/store/sections.ts";
import { returnsAgainst, splitRecord } from "../lib/market/split-record.ts";
import type { RawHistoryPoint } from "../lib/api/clients/quotes.ts";
import type { RawCorporateActions } from "../lib/api/clients/fundamentals.ts";

/* The store notices a change by re-reading and comparing a hash, because the
   gateway offers nothing better — no ETags, no deltas, no change feed.

   That makes the hash the whole mechanism, and it fails in two directions.
   Hash too much and every read looks like a change: the profile document
   carries the gateway's "OK" and a rolling news feed, so a company that has
   not moved in a year rewrites its row several times a day and the cadence
   saves nothing. Hash too little and a real revision passes unseen — which is
   why the keys stripped here are enumerated rather than pattern-matched, and
   why `ticker.last_updated_utc`, the one field that actually says when Polygon
   revised the record, is pinned below as a key that must survive. */

const DAY = 86_400_000;
const END = Date.UTC(2026, 7, 21, 20, 0, 0);

/** The gateway's daily-history date format, for a bar that many days back. */
function feedDate(daysAgo: number): string {
  const d = new Date(END - daysAgo * DAY);
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${mm}/${dd}/${d.getUTCFullYear()} 16:00:00 EDT`;
}

function isoDaysAgo(daysAgo: number): string {
  return new Date(END - daysAgo * DAY).toISOString().slice(0, 10);
}

/* Netflix as the feed actually served it, the fixture from
   tests/split-record.test.ts: a ten-for-one split the vendor never applied. */
const NFLX: RawHistoryPoint[] = [
  { date: feedDate(366), price: 700, opening: 690, high: 710, low: 680, volume: 1_000 },
  { date: feedDate(101), price: 800, opening: 790, high: 810, low: 780, volume: null },
  { date: feedDate(100), price: 80, opening: null, high: null, low: null, volume: 2_000 },
  { date: feedDate(0), price: 90, opening: 89, high: 91, low: 88, volume: 3_000 },
];

const TEN_FOR_ONE: RawCorporateActions = {
  status: "OK",
  dividends: null,
  splits: [
    {
      execution_date: isoDaysAgo(100),
      split_from: 1,
      split_to: 10,
      adjustment_type: "forward_split",
      ticker: "NFLX",
    },
  ],
  ipos: null,
  events: null,
};

/* A fundamentals document with the gateway's own top-level shape. */
const FUNDAMENTALS = {
  status: "OK",
  ticker: {
    ticker: "NFLX",
    name: "Netflix, Inc.",
    last_updated_utc: "2026-08-20T00:00:00Z",
    total_employees: 14_000,
  },
  ticker_news: [
    { id: "n1", title: "Something", published_utc: "2026-08-21T10:00:00Z" },
    { id: "n2", title: "Else", published_utc: "2026-08-19T10:00:00Z" },
  ],
  ratios: { price: 90, date: "2026-08-21" },
  related_companies: [{ ticker: "DIS" }],
};

/* ---------- canonicalise ---------- */

test("the key order a JSON parser happened to give us is not a change", () => {
  const a = { status: "OK", ticker: { name: "X", ticker: "NFLX" }, ratios: { date: "1", price: 2 } };
  const b = { ratios: { price: 2, date: "1" }, ticker: { ticker: "NFLX", name: "X" }, status: "OK" };
  assert.deepEqual(canonicalise("profile", a), canonicalise("profile", b));
  assert.equal(hashOf(canonicalise("profile", a)), hashOf(canonicalise("profile", b)));
});

test("array order is content, and is left exactly as it arrived", () => {
  const forwards = canonicalise("corporate_actions", { splits: [{ a: 1 }, { a: 2 }] });
  const backwards = canonicalise("corporate_actions", { splits: [{ a: 2 }, { a: 1 }] });
  assert.notEqual(hashOf(forwards), hashOf(backwards));
});

test("the gateway's envelope is stripped at the root and nowhere else", () => {
  const c = canonicalise("short_interest", {
    status: "OK",
    request_id: "abc",
    requestId: "abc",
    results: [{ ticker: "NFLX", status: "settled", short_interest: 12 }],
  }) as Record<string, unknown>;

  assert.deepEqual(Object.keys(c), ["results"]);
  const row = (c.results as Array<Record<string, unknown>>)[0];
  assert.equal(row.status, "settled", "a nested status is the company's data, not the envelope");
});

test("the profile also sheds its news feed, which turns over hourly in its own section", () => {
  const c = canonicalise("profile", FUNDAMENTALS) as Record<string, unknown>;
  assert.deepEqual(Object.keys(c), ["ratios", "related_companies", "ticker"]);
});

test("the one field that says when the record changed must survive", () => {
  const c = canonicalise("profile", FUNDAMENTALS) as { ticker: Record<string, unknown> };
  assert.equal(c.ticker.last_updated_utc, "2026-08-20T00:00:00Z");
});

/* The analyst section exists to hold the refusal where a panel can read it.
   Strip the status out of the hash and a 403 that becomes a 200 writes
   nothing, which is the one transition the section is watching for. */
test("the analyst section keeps its status, because the status is the content", () => {
  const c = canonicalise("analyst", { ok: false, status: 403 }) as Record<string, unknown>;
  assert.equal(c.status, 403);
  assert.notEqual(
    hashOf(canonicalise("analyst", { ok: false, status: 403 })),
    hashOf(canonicalise("analyst", { ok: true, status: 200 })),
  );
});

/* What canonicalise is handed is the STORED payload, never the ApiResult the
   client wrapped it in. Six sections would make that mistake loudly; this one
   would not, because `{ok, status}` is a subset of the wrapper's own fields —
   and the wrapper carries `ms`, which is a different number every call. Hash
   that and every check reports a change, rewrites the row and revalidates a
   page that never moved: the exact cost the cadence exists to avoid. */
test("the analyst hash is the observation, not the call that fetched it", () => {
  const first = { ok: false, error: "403 from /analysts", status: 403, ms: 214 };
  const slower = { ok: false, error: "403 from /analysts", status: 403, ms: 1_907 };

  assert.equal(
    hashOf(canonicalise("analyst", first)),
    hashOf(canonicalise("analyst", slower)),
    "the same refusal, timed twice, is one observation",
  );
  assert.equal(
    hashOf(canonicalise("analyst", first)),
    hashOf(canonicalise("analyst", toStored("analyst", first))),
    "the wrapper and the payload it holds must hash alike",
  );
  assert.deepEqual(Object.keys(canonicalise("analyst", first) as object), ["ok", "status"]);
});

/* The same contract, seen from the other side: each section hashes its own
   stored payload, so the news feed turning over is not a revision of the
   company record and vice versa. Hashing the raw fundamentals document under
   both sections would have made each one report the other's changes. */
test("a section moves on its own content, because the hash is over what it stores", () => {
  const newsHash = (raw: unknown) =>
    hashOf(canonicalise("news_gateway", toStored("news_gateway", raw)));

  assert.equal(
    newsHash(FUNDAMENTALS),
    newsHash({ ...FUNDAMENTALS, ticker: { ...FUNDAMENTALS.ticker, total_employees: 15_000 } }),
    "the company record is the profile's business",
  );
  assert.notEqual(
    newsHash(FUNDAMENTALS),
    newsHash({
      ...FUNDAMENTALS,
      ticker_news: [
        ...FUNDAMENTALS.ticker_news,
        { id: "n3", title: "Later", published_utc: "2026-08-21T12:00:00Z" },
      ],
    }),
  );
});

/* And the reason history is hashed stored rather than raw: on the day a split
   is finally published the bars are byte-identical and the returns are not.
   Hash the raw rows and the corrected figures stay unwritten for as long as
   the bars hold still — which, after the close, is all night. */
test("a split published after the bars were stored still moves the history hash", () => {
  const historyHash = (context?: { actions: RawCorporateActions }) =>
    hashOf(canonicalise("history_daily", toStored("history_daily", NFLX, context)));

  assert.notEqual(historyHash(), historyHash({ actions: TEN_FOR_ONE }));
});

test("a changed value changes the hash", () => {
  const before = hashOf(canonicalise("profile", FUNDAMENTALS));
  const after = hashOf(
    canonicalise("profile", { ...FUNDAMENTALS, ticker: { ...FUNDAMENTALS.ticker, total_employees: 15_000 } }),
  );
  assert.notEqual(before, after);
});

test("a new batch of headlines is not a new profile", () => {
  const before = hashOf(canonicalise("profile", FUNDAMENTALS));
  const after = hashOf(canonicalise("profile", { ...FUNDAMENTALS, ticker_news: [] }));
  assert.equal(before, after);
});

test("hashOf is sha256 hex", () => {
  assert.match(hashOf(canonicalise("analyst", { ok: true, status: 200 })), /^[0-9a-f]{64}$/);
});

/* ---------- source stamps ---------- */

test("each section reports the stamp its own document carries, or nothing", () => {
  assert.equal(sourceUpdatedAt("profile", FUNDAMENTALS), "2026-08-20T00:00:00Z");
  assert.equal(sourceUpdatedAt("news_gateway", FUNDAMENTALS), "2026-08-21T10:00:00Z");
  assert.equal(sourceUpdatedAt("short_interest", { results: [{ settlement_date: "2026-08-15" }] }), "2026-08-15");
  assert.equal(sourceUpdatedAt("analyst", { ok: false, status: 403 }), null);
  assert.equal(sourceUpdatedAt("corporate_actions", TEN_FOR_ONE), null);
});

/* ---------- history, stored columnar ---------- */

test("five years of bars survive the round trip, nulls included", () => {
  const stored = toStored("history_daily", NFLX, { actions: TEN_FOR_ONE });
  const back = fromStored("history_daily", stored);
  assert.deepEqual(back, NFLX);
});

test("the columns are parallel, so a row can never lose half of itself", () => {
  const stored = toStored("history_daily", NFLX) as Record<string, unknown[]>;
  for (const column of ["date", "price", "opening", "high", "low", "volume"]) {
    assert.equal(stored[column].length, NFLX.length, `${column} is short`);
  }
  assert.equal(stored.opening[2], null, "a null open is stored as null, not as a zero");
});

/* The derived block exists so a peer's trailing year costs the page nothing.
   It has to be the same number the page would have computed itself. */
test("the derived returns are the ones returnsAgainst would have given", () => {
  const stored = toStored("history_daily", NFLX, { actions: TEN_FOR_ONE });
  const derived = derivedOf(stored);
  const expected = returnsAgainst(NFLX, splitRecord(TEN_FOR_ONE));
  assert.notEqual(expected.ret1y, null);
  assert.deepEqual(derived, expected);
});

/* Without the corporate-actions document we cannot know whether the −87% step
   is a split or a collapse, so the stored history carries no return at all. */
test("no corporate-actions context means no derived return, never a wrong one", () => {
  const derived = derivedOf(toStored("history_daily", NFLX));
  assert.deepEqual(derived, { ret1y: null, ret5y: null, cagr5y: null });
});

/* ---------- the other sections, there and back ---------- */

test("profile stores the record without its news and gives it back that way", () => {
  const stored = toStored("profile", FUNDAMENTALS) as Record<string, unknown>;
  assert.equal("ticker_news" in stored, false);
  const back = fromStored("profile", stored) as Record<string, unknown>;
  assert.equal("ticker_news" in back, false);
  assert.deepEqual(back, stored);
});

test("the news section is the headlines alone", () => {
  const stored = toStored("news_gateway", FUNDAMENTALS);
  assert.deepEqual(stored, { ticker_news: FUNDAMENTALS.ticker_news });
  assert.deepEqual(fromStored("news_gateway", stored), FUNDAMENTALS.ticker_news);
});

test("corporate actions, financials and short interest are kept verbatim", () => {
  for (const section of ["corporate_actions", "financials_annual", "short_interest"] as const) {
    const raw = { status: "OK", results: [{ a: 1 }] };
    assert.deepEqual(toStored(section, raw), raw);
    assert.deepEqual(fromStored(section, raw), raw);
  }
});

test("the analyst section keeps the observation and nothing else", () => {
  assert.deepEqual(toStored("analyst", { ok: false, status: 403, error: "forbidden" }), {
    ok: false,
    status: 403,
  });
  assert.deepEqual(fromStored("analyst", { ok: false, status: 403 }), { ok: false, status: 403 });
});

/* ---------- garbage ---------- */

test("a malformed payload reads as nothing rather than throwing into a render", () => {
  for (const section of SECTIONS) {
    assert.equal(fromStored(section, null), null, section);
    assert.equal(fromStored(section, "nonsense"), null, section);
    assert.equal(fromStored(section, 42), null, section);
  }
  assert.equal(fromStored("history_daily", { date: ["a"], price: [] }), null, "ragged columns");
  assert.equal(fromStored("news_gateway", { ticker_news: "no" }), null);
  assert.equal(fromStored("analyst", { ok: "yes" }), null);
  assert.equal(derivedOf({ date: [], price: [] }), null);
  assert.equal(derivedOf(null), null);
});

/* ---------- the absent marker is not a document ---------- */

/* WHAT THE MARKER IS. When the gateway answers definitely that it has nothing
 * for a symbol — a 404, or the `Invalid ticker` 400 the preferred classes get
 * — the worker records that fact so it stops asking. It records it by writing
 * `{absent: true, status}` into the section's payload, because the payload is
 * the only column there is.
 *
 * WHAT IT IS NOT is a document. Nothing on the read path knew about it, so a
 * marker came back through fromStored looking like a real answer: a profile
 * that passed the "do we have a profile" gate and rendered a company page of
 * blanks, and — worse, because it is silent — a corporate_actions marker that
 * splitRecord read as `readable: true, splits: []`, publishing a confidently
 * unadjusted five-year return. A stock that split 10-for-1 reads about -93%
 * that way, with no dash and no warning anywhere.
 *
 * So the marker stops here. `null` is what "we have nothing stored" already
 * means to every caller, and every caller already handles it. */
test("an absent marker reads back as nothing, not as an empty document", () => {
  const marker = { absent: true, status: 404 };
  for (const section of SECTIONS) {
    assert.equal(
      fromStored(section, marker),
      null,
      `${section} must not hand an absent marker to the page`,
    );
  }
});

test("and a real payload that merely mentions absence is still a document", () => {
  /* The guard keys on the marker's exact shape rather than on the word, so a
     genuine profile carrying an `absent` field of its own is untouched. */
  const profile = fromStored("profile", { ticker: "AAPL", absent: false });
  assert.notEqual(profile, null);
});
