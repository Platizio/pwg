# Range-accurate charts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every chart range a source that actually holds its detail, and stop a board click shipping 234KB of bars that kills the 512MB instance.

**Architecture:** The page ships only the range it opens with (1Y daily); every other range fetches its own series from an API route backed by the store. Intraday minute bars, which the gateway keeps only for the live session, are captured once a day by the refresh worker, downsampled to 10-minute buckets and kept for five sessions in a new `history_intraday` section.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, node:test (`node --conditions=react-server --test`), Supabase Postgres via `public.market_*` RPCs, pgTAP.

**Spec:** `docs/superpowers/specs/2026-09-18-range-accurate-charts-design.md`

**Simplification found after the spec was written:** no new RPCs are needed. `market_complete` (write) and `market_sections` (read) are already generic over the section name, so the migration only extends the `CHECK` constraint on `market.sections.section`, and the five-session pruning happens in TypeScript at write time.

---

## Task 0: Verify the intraday endpoint outside a session

The spec flags this as a prerequisite: capture must run while the session is still open if the endpoint empties afterwards. Nothing in Task 4 can be timed correctly without this observation.

**Files:** none (observation only)

- [ ] **Step 1: Record the endpoint's answer at three points**

Run this after the US close (after 20:00 ET / 05:30 IST) and record the row count:

```bash
cd "/Users/aayushsharma/Desktop/PWG/pwg new"
node --conditions=react-server --env-file=.env.local -e '
import("./lib/api/clients/quotes.ts").then(async (m) => {
  const r = await m.fetchIntraday("AAPL", 0, [], true);
  const rows = r.ok ? (r.data ?? []) : [];
  console.log(new Date().toISOString(), "rows=" + rows.length,
    "first=" + rows[0]?.date, "last=" + rows[rows.length - 1]?.date);
});'
```

Expected one of:
- **rows > 0 with a `last` at/after 16:00 ET** → the session persists after the close; capture may run any time before the next pre-market open (04:00 ET). Set capture to 21:00 ET.
- **rows = 0** → the endpoint empties at the close; capture must run before it. Set capture to 15:55 ET (regular close) and accept that post-market bars are missed that day.

- [ ] **Step 2: Write the observation into the spec**

Append the measured result and the chosen capture time under "Risk to verify before implementing" in `docs/superpowers/specs/2026-09-18-range-accurate-charts-design.md`, replacing the risk note with the finding. Commit:

```bash
git add docs/superpowers/specs/2026-09-18-range-accurate-charts-design.md
git commit -m "Record when the intraday endpoint stops answering, and set capture from it"
```

---

## Task 1: The hero button matches the products page

Independent of everything else. Ship it first.

**Files:**
- Modify: `components/home/hero.tsx:47-63`

- [ ] **Step 1: Replace the Link with the products page's anchor**

`components/home/hero.tsx` currently has, at the end of the CTA block:

```tsx
            <Link className="ft-ghost" href={SCREENER_URL} prefetch={true}>
              See the terminal
            </Link>
```

Replace it with the exact form `Platizio_Global_Revamp/pages/Products.tsx:233` uses, and replace the comment above it (which argues for prefetch) with the reason for the change:

```tsx
            {/* The same anchor the products page uses, deliberately — not a
                Next <Link>. Both buttons name the same destination and must
                behave identically, and the products one is the behaviour that
                works: a plain document load into a new tab, so the marketing
                page stays where it is and the terminal arrives server-rendered
                rather than as a client transition that has to pull the whole
                terminal payload before anything moves. */}
            <a className="ft-ghost" href={SCREENER_URL} target="_blank" rel="noopener noreferrer">
              See the terminal
            </a>
```

- [ ] **Step 2: Remove the now-unused Link import if nothing else uses it**

Run: `grep -n "<Link" components/home/hero.tsx`
If there are no remaining matches, delete the `import Link from "next/link";` line.

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add components/home/hero.tsx
git commit -m "Make both terminal buttons open the terminal the same way"
```

---

## Task 2: Downsample minute bars into buckets

Pure function, no I/O. The one piece with real arithmetic in it.

**Files:**
- Create: `lib/market/intraday-buckets.ts`
- Test: `tests/intraday-buckets.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/intraday-buckets.test.ts`:

```ts
import test from "node:test";
import assert from "node:assert/strict";

import { bucketIntraday } from "../lib/market/intraday-buckets.ts";

/* A bucket is an OHLCV aggregate, and every field aggregates differently:
   the open is the FIRST open in the bucket, the close the LAST price, the
   high the maximum, the low the minimum, the volume the sum. Getting any one
   of them wrong draws a candle that never traded. */

const bar = (iso: string, price: number, extra: Partial<Record<string, number>> = {}) => ({
  date: iso,
  price,
  opening: extra.opening ?? price,
  high: extra.high ?? price,
  low: extra.low ?? price,
  volume: extra.volume ?? 100,
});

test("a bucket takes the first open, last close, extreme high and low, and summed volume", () => {
  const rows = [
    bar("2026-09-18T09:30:00.000-0400", 100, { opening: 99, high: 101, low: 98, volume: 10 }),
    bar("2026-09-18T09:34:00.000-0400", 104, { opening: 100, high: 106, low: 97, volume: 20 }),
    bar("2026-09-18T09:39:00.000-0400", 103, { opening: 104, high: 105, low: 102, volume: 30 }),
  ];

  const out = bucketIntraday(rows, 10);

  assert.equal(out.date.length, 1, "all three minutes fall in one ten-minute bucket");
  assert.equal(out.opening[0], 99, "the first bar's open");
  assert.equal(out.price[0], 103, "the last bar's price");
  assert.equal(out.high[0], 106, "the highest high");
  assert.equal(out.low[0], 97, "the lowest low");
  assert.equal(out.volume[0], 60, "the summed volume");
});

test("minutes in different buckets do not merge", () => {
  const out = bucketIntraday(
    [bar("2026-09-18T09:30:00.000-0400", 100), bar("2026-09-18T09:41:00.000-0400", 200)],
    10,
  );
  assert.deepEqual(out.price, [100, 200]);
});

/* A halted or thin name simply has no trades for stretches of the session.
   Inventing a flat bucket there would draw a price that did not exist — the
   exact complaint this whole change is answering, in reverse. */
test("a gap in trading leaves a gap, not a fabricated bucket", () => {
  const out = bucketIntraday(
    [bar("2026-09-18T09:30:00.000-0400", 100), bar("2026-09-18T11:30:00.000-0400", 120)],
    10,
  );
  assert.equal(out.date.length, 2, "two buckets, not the twelve between them");
});

test("an empty session yields empty columns rather than a throw", () => {
  const out = bucketIntraday([], 10);
  assert.deepEqual(out, { date: [], price: [], opening: [], high: [], low: [], volume: [] });
});

/* The bucket is stamped with its own start, not with the first bar inside it,
   so two sessions bucket onto the same grid and a chart's x-axis is even. */
test("a bucket is stamped at the boundary it starts on", () => {
  const out = bucketIntraday([bar("2026-09-18T09:34:00.000-0400", 100)], 10);
  assert.equal(new Date(out.date[0]).getTime() % (10 * 60_000), 0);
});

test("rows arriving out of order are bucketed by time, not by position", () => {
  const out = bucketIntraday(
    [bar("2026-09-18T09:41:00.000-0400", 200), bar("2026-09-18T09:30:00.000-0400", 100)],
    10,
  );
  assert.deepEqual(out.price, [100, 200], "sorted into the grid");
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `node --conditions=react-server --test tests/intraday-buckets.test.ts`
Expected: FAIL — `Cannot find module '../lib/market/intraday-buckets.ts'`.

- [ ] **Step 3: Write the implementation**

Create `lib/market/intraday-buckets.ts`:

```ts
import type { RawHistoryPoint } from "../api/clients/quotes.ts";

/* Minute bars, reduced to the grid a chart can actually draw.
 *
 * The gateway answers one-minute bars and keeps them only while the session is
 * live. A week of them is ~5,000 points against a few hundred pixels, and
 * ~1GB across the hot set — so the week is stored bucketed and the minute
 * detail is kept where it is visible, which is the day.
 *
 * Columnar, matching `storedHistory` in ./store/sections.ts: six parallel
 * arrays name their fields once instead of once per bar. */
export type IntradayColumns = {
  /** ISO-8601 with offset, stamped at the bucket's own boundary. */
  date: string[];
  price: number[];
  opening: number[];
  high: number[];
  low: number[];
  volume: number[];
};

const EMPTY: IntradayColumns = { date: [], price: [], opening: [], high: [], low: [], volume: [] };

const num = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

/**
 * Aggregate one-minute bars into buckets of `minutes`.
 *
 * Each field aggregates differently and getting one wrong draws a candle that
 * never traded: open is the FIRST open in the bucket, close the LAST price,
 * high the maximum, low the minimum, volume the sum.
 *
 * A bucket with no trades is ABSENT rather than flat. A thin name goes minutes
 * without a print, and filling those with the last price would invent the
 * straight lines this change exists to remove.
 */
export function bucketIntraday(
  rows: readonly RawHistoryPoint[],
  minutes: number,
): IntradayColumns {
  if (!Array.isArray(rows) || rows.length === 0 || minutes <= 0) return { ...EMPTY };

  const span = minutes * 60_000;
  /* Keyed by bucket start so out-of-order rows land in the right bucket; the
     gateway has answered in order every time observed, which is exactly the
     kind of thing that is true until it is not. */
  const buckets = new Map<number, { o: number; c: number; h: number; l: number; v: number }>();

  for (const row of rows) {
    const at = Date.parse(String(row?.date ?? ""));
    const price = num(row?.price);
    if (!Number.isFinite(at) || price === null) continue;

    const key = Math.floor(at / span) * span;
    const open = num(row?.opening) ?? price;
    const high = num(row?.high) ?? price;
    const low = num(row?.low) ?? price;
    const volume = num(row?.volume) ?? 0;

    const found = buckets.get(key);
    if (!found) {
      buckets.set(key, { o: open, c: price, h: high, l: low, v: volume });
      continue;
    }
    /* The open is NOT reassigned: the first row to land in a bucket owns it. */
    found.c = price;
    if (high > found.h) found.h = high;
    if (low < found.l) found.l = low;
    found.v += volume;
  }

  const out: IntradayColumns = { date: [], price: [], opening: [], high: [], low: [], volume: [] };
  for (const key of [...buckets.keys()].sort((a, b) => a - b)) {
    const b = buckets.get(key)!;
    out.date.push(new Date(key).toISOString());
    out.opening.push(b.o);
    out.price.push(b.c);
    out.high.push(b.h);
    out.low.push(b.l);
    out.volume.push(b.v);
  }
  return out;
}
```

- [ ] **Step 4: Run the tests**

Run: `node --conditions=react-server --test tests/intraday-buckets.test.ts`
Expected: PASS, 6/6.

- [ ] **Step 5: Commit**

```bash
git add lib/market/intraday-buckets.ts tests/intraday-buckets.test.ts
git commit -m "Reduce minute bars to a bucket grid, leaving gaps where nothing traded"
```

---

## Task 3: Make `history_intraday` a section the store accepts

**Files:**
- Create: `supabase/migrations/20260918120000_0036_market_intraday_section.sql`
- Create: `supabase/tests/0036_market_intraday_section.test.sql`
- Modify: `lib/market/store/sections.ts` (the `SECTIONS` list, `toStored`, `fromStored`)
- Modify: `lib/market/store/cadence.ts` (a daily cadence for the new section)

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260918120000_0036_market_intraday_section.sql`:

```sql
-- 0036_market_intraday_section.sql — let the store hold intraday bars.
--
-- The gateway keeps one-minute bars only while a session is live and discards
-- them at its end; there is no endpoint that will answer for a past day (the
-- vendor catalog advertises range=1d and range=5d, and the API rejects both
-- with "Invalid range format. Use [num][y/m]"). So a week of intraday detail
-- can exist only if this system keeps it, which is what this section is for:
-- a rolling five sessions of ten-minute buckets, written once a day.
--
-- Ten-minute rather than one-minute is a storage decision made against a
-- measurement: a full session is ~49KB per symbol at one minute and ~5KB at
-- ten, and market.sections already holds 217MB of a 500MB ceiling. Across the
-- hot set, one-minute for five sessions is ~1GB and does not fit; ten-minute
-- is ~110MB and does. Across a week on a chart a few hundred pixels wide the
-- difference is not visible.
--
-- Only the CHECK changes. market_complete and market_sections are generic over
-- the section name, so the write path, the read path, the claim queue and the
-- refresh log all carry this section without another line of SQL. The
-- five-session pruning is done by the writer, in lib/market/refresh/, because
-- it is a rule about what a chart needs rather than a constraint about what is
-- storable.

alter table market.sections
  drop constraint if exists sections_section_check;

alter table market.sections
  add constraint sections_section_check check (section in (
    'profile', 'news_gateway', 'corporate_actions',
    'financials_annual', 'history_daily', 'short_interest', 'analyst',
    'history_intraday'));

comment on column market.sections.section is
  'Which document this row holds. history_intraday is a rolling five sessions of ten-minute buckets, written once a day by the refresh worker — the only record of intraday prices that exists, because the gateway discards them at the close.';
```

- [ ] **Step 2: Write the pgTAP test**

Create `supabase/tests/0036_market_intraday_section.test.sql`:

```sql
-- Tests for 0036 — the intraday section.
--
-- The fixture is built through the RPCs, as everywhere else in this suite, so
-- the generic write and read paths are proven to carry the new section rather
-- than assumed to.

begin;

select plan(4);

select is(
  public.market_seed_symbols(
    $$[{"symbol": "ZTSTA", "name": "Zeta Test A", "exchange": "NASDAQ", "tradable": true}]$$::jsonb),
  1,
  'a symbol to hang the section on'
);

select public.market_enrol(array['ZTSTA'], array['history_intraday'], 3);

-- The point of the migration: the CHECK admits the new name. Before it, this
-- write raised sections_section_check and the whole capture job was unwritable.
select ok(
  public.market_complete(
    'ZTSTA', 'history_intraday',
    jsonb_build_object(
      'date',   jsonb_build_array('2026-09-18T13:30:00.000Z'),
      'price',  jsonb_build_array(101.5),
      'volume', jsonb_build_array(1200)),
    'hash-intraday', true, null, now() + interval '1 day', 5, null) is not null,
  'market_complete writes history_intraday without a new RPC'
);

-- And the generic read hands it back, which is what /api/history depends on.
select is(
  (select public.market_sections(array['ZTSTA'], 'history_intraday') -> 0 ->> 'symbol'),
  'ZTSTA',
  'market_sections reads it back'
);

select is(
  (select public.market_sections(array['ZTSTA'], 'history_intraday') -> 0 -> 'payload' -> 'price' ->> 0),
  '101.5',
  'with the payload intact'
);

select * from finish();

rollback;
```

- [ ] **Step 3: Apply the migration and run the test**

Apply to the live project (`qtjnlkobvnhhgsnyufzv`) with the Supabase MCP `apply_migration`, named `0036_market_intraday_section`. Then correct the recorded version to match the file name:

```sql
update supabase_migrations.schema_migrations
   set version = '20260918120000'
 where name = '0036_market_intraday_section' and version <> '20260918120000';
```

Verify: `select public.market_sections(array['AAPL'], 'history_intraday');` returns `[]` rather than erroring.

- [ ] **Step 4: Add the section to the TypeScript side**

In `lib/market/store/sections.ts`, add `"history_intraday"` to the `SECTIONS` array (after `"history_daily"`, since it is the same kind of document). Then add its `toStored`/`fromStored` handling alongside `history_daily` — the payload is already columnar, so it stores verbatim and reads back as `IntradayColumns`.

In `lib/market/store/cadence.ts`, give `history_intraday` a daily base interval (the capture runs once a day) with no doubling on unchanged, because the session genuinely changes every day and an unchanged answer means the capture missed, not that the market stood still.

- [ ] **Step 5: Verify**

Run: `npx tsc --noEmit && node --conditions=react-server --test tests/store-sections.test.ts tests/store-cadence.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260918120000_0036_market_intraday_section.sql \
        supabase/tests/0036_market_intraday_section.test.sql \
        lib/market/store/sections.ts lib/market/store/cadence.ts
git commit -m "Let the store hold intraday bars, since the gateway will not"
```

---

## Task 4: Capture a session once a day

**Files:**
- Create: `lib/market/refresh/intraday.ts`
- Test: `tests/refresh-intraday.test.ts`
- Modify: `lib/market/refresh/loop.ts` (the `runJob` switch gains the new section)

- [ ] **Step 1: Write the failing test**

Create `tests/refresh-intraday.test.ts`:

```ts
import test from "node:test";
import assert from "node:assert/strict";

import { mergeSession, SESSIONS_KEPT } from "../lib/market/refresh/intraday.ts";

const session = (day: string, prices: number[]) => ({
  date: prices.map((_, i) => `${day}T${String(13 + i).padStart(2, "0")}:30:00.000Z`),
  price: prices,
  opening: prices,
  high: prices,
  low: prices,
  volume: prices.map(() => 100),
});

test("a new session is appended to the ones already stored", () => {
  const out = mergeSession(session("2026-09-16", [1, 2]), session("2026-09-17", [3, 4]));
  assert.deepEqual(out.price, [1, 2, 3, 4]);
});

/* Retention is what keeps the hot set inside the storage ceiling. Without it
   the section grows without bound and takes the database over 500MB. */
test("only the most recent sessions are kept", () => {
  let stored = session("2026-09-01", [0]);
  for (let d = 2; d <= 2 + SESSIONS_KEPT; d += 1) {
    stored = mergeSession(stored, session(`2026-09-${String(d).padStart(2, "0")}`, [d]));
  }
  const days = new Set(stored.date.map((d) => d.slice(0, 10)));
  assert.equal(days.size, SESSIONS_KEPT, `exactly ${SESSIONS_KEPT} sessions survive`);
  assert.ok(!days.has("2026-09-01"), "the oldest is evicted");
});

/* The capture answering empty is the normal state outside a session. Writing
   it would erase a real day's bars and leave the chart emptier than before. */
test("an empty capture does not overwrite what is stored", () => {
  const stored = session("2026-09-17", [3, 4]);
  const out = mergeSession(stored, { date: [], price: [], opening: [], high: [], low: [], volume: [] });
  assert.deepEqual(out.price, [3, 4]);
});

test("re-capturing the same day replaces that day rather than duplicating it", () => {
  const out = mergeSession(session("2026-09-17", [3, 4]), session("2026-09-17", [3, 4, 5]));
  assert.deepEqual(out.price, [3, 4, 5], "the later, fuller capture wins");
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `node --conditions=react-server --test tests/refresh-intraday.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

Create `lib/market/refresh/intraday.ts` exporting `SESSIONS_KEPT = 5`, `BUCKET_MINUTES = 10`, and:

- `mergeSession(stored, incoming)` — returns stored unchanged when `incoming.date` is empty; otherwise drops from `stored` every bar whose calendar day appears in `incoming` (so a re-capture replaces that day), concatenates, sorts by timestamp, and keeps only the bars belonging to the most recent `SESSIONS_KEPT` distinct days.
- `captureIntraday(symbol, fetchImpl)` — calls `fetchIntraday`, passes the rows through `bucketIntraday(rows, BUCKET_MINUTES)`, and returns the columns.

Group by the **Eastern** calendar day, not UTC: a session runs 04:00–20:00 ET, which straddles midnight UTC, so grouping by UTC date would split one session across two days and evict half of it. Use the existing Eastern-day helper in `lib/api/stream/tick.ts` / `lib/market/session.ts` rather than writing a third copy.

- [ ] **Step 4: Run the tests**

Run: `node --conditions=react-server --test tests/refresh-intraday.test.ts`
Expected: PASS, 4/4.

- [ ] **Step 5: Wire it into the worker**

In `lib/market/refresh/loop.ts`, `runJob` dispatches on `job.section`. Add a `history_intraday` case that calls `captureIntraday`, merges with the claimed job's existing payload, hashes and completes exactly as the other sections do. The cadence from Task 3 schedules it; no new timer.

- [ ] **Step 6: Verify the whole suite**

Run: `npm test && npx tsc --noEmit && npm run lint`
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add lib/market/refresh/intraday.ts tests/refresh-intraday.test.ts lib/market/refresh/loop.ts
git commit -m "Capture a session's bars once a day, keeping five"
```

---

## Task 5: Serve a range, and fetch it from the client

**Files:**
- Create: `app/api/history/[ticker]/route.ts`
- Create: `components/terminal/use-history.ts`
- Test: `tests/history-route.test.ts`

- [ ] **Step 1: Write the failing test for the route's pure half**

`app/api/stock-news/[ticker]/route.ts` keeps its validation in a pure exported function so `node --test` can reach it without Next; follow that pattern. Create `tests/history-route.test.ts` asserting `parseRange`:

```ts
import test from "node:test";
import assert from "node:assert/strict";

import { parseRange } from "../app/api/history/[ticker]/route.ts";

test("a known range is accepted", () => {
  assert.equal(parseRange("1D"), "1D");
  assert.equal(parseRange("1W"), "1W");
  assert.equal(parseRange("5Y"), "5Y");
});

test("an unknown or absent range is refused rather than guessed", () => {
  assert.equal(parseRange("2D"), null);
  assert.equal(parseRange(null), null);
  assert.equal(parseRange("../../etc"), null);
});

/* The ranges the page already ships must not be fetchable here: answering them
   would spend a request on bars the client is holding. */
test("ranges the page already carries are not served", () => {
  assert.equal(parseRange("1M"), null);
  assert.equal(parseRange("1Y"), null);
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `node --conditions=react-server --test tests/history-route.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the route**

Create `app/api/history/[ticker]/route.ts`. It exports `parseRange(value: string | null): "1D" | "1W" | "5Y" | null` and a `GET` that:
- validates the ticker with the same helper `app/api/intraday/[ticker]/route.ts` uses (it must reject a `%` that would throw `URIError` — a defect the audit found in the sibling routes, so do not copy that part),
- reads `history_intraday` for `1W` and for `1D`, and `history_daily` for `5Y`, through `readSections`,
- for `1D` returns only the **most recent stored session** out of the five, which is what the chart falls back to when the market is shut and the gateway has nothing,
- answers `{ range, series }` with `Cache-Control: public, max-age=60, stale-while-revalidate=300`,
- answers `{ range, series: [] }` rather than a 500 when the store has nothing, because an empty range is a real state the chart draws.

No gateway call: this route reads the store only. A symbol the store has not captured yet answers empty, and the chart says so.

- [ ] **Step 4: Write the client hook**

Create `components/terminal/use-history.ts` following `components/terminal/use-intraday.ts`, which is the established shape. `useHistory(ticker, range)`:
- returns `{ series, state }` where state is `"idle" | "loading" | "ready" | "empty" | "failed"`,
- fetches once per `(ticker, range)` and caches in a ref for the life of the page, so switching back and forth costs one request,
- aborts in flight on unmount or when the ticker changes,
- never replaces a loaded series with an empty one on failure — the previous range stays drawn and the state reports the failure.

- [ ] **Step 5: Run the tests**

Run: `node --conditions=react-server --test tests/history-route.test.ts && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add "app/api/history/[ticker]/route.ts" components/terminal/use-history.ts tests/history-route.test.ts
git commit -m "Serve one range at a time from the store, and fetch it when asked"
```

---

## Task 6: Stop the page shipping every range

This is the task that fixes the 438KB click and the instance death.

**Files:**
- Modify: `lib/market/instrument.ts` (trim the daily series, drop the benchmark)
- Modify: `components/terminal/price-chart.tsx`
- Modify: `components/terminal/panels/performance-panel.tsx`
- Modify: `lib/market/ranges.ts`
- Test: `tests/instrument-store-path.test.ts` (extend)

- [ ] **Step 1: Write the failing test**

Append to `tests/instrument-store-path.test.ts`:

```ts
/* THE 234KB. A click used to download the company's five years AND SPY's five
   years — 2,549 bars, 53% of a 438KB payload — on a box with 512MB, where two
   or three such renders killed the process and every later stock then hung.
   The page ships the range it opens with; everything else is fetched. */
test("the page ships one range of bars and no benchmark", () => {
  const read = inputsFromStored(stored(), "NFLX");
  assert.equal(read.use, "store");
  if (read.use !== "store") return;

  const snapshot = sessionSeriesDeferred(assembleInstrument(read.inputs, NOW));

  assert.equal(snapshot.market, null, "the benchmark is fetched by the panel that draws it");
  assert.ok(
    snapshot.history.daily.length <= 252 + 1,
    `the default range is a year, not five; got ${snapshot.history.daily.length}`,
  );
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `node --conditions=react-server --test tests/instrument-store-path.test.ts`
Expected: FAIL — `snapshot.market` is an object and `history.daily.length` is ~1,274.

- [ ] **Step 3: Trim the payload**

In `lib/market/instrument.ts`, in the function that builds the snapshot for the store path (and the gateway path, so both agree):
- slice `history.daily` to the last `getRange(DEFAULT_RANGE).sessions` bars before it leaves the server,
- stop composing `market` into the returned snapshot (the shared SPY read and its 2s budget in `lib/market/store/reads.ts` stay for the Performance panel's route, but the page no longer carries the series).

Keep `snapshot.returns` exactly as it is: those figures come from the worker's stored `derived` values, not from the bars, so trimming the series must not change a single number on the page. The existing returns assertions in this file are what prove it.

- [ ] **Step 4: Point the chart and the panel at the hook**

- `components/terminal/price-chart.tsx:118` chooses its source from the range. Change it to take the series from `useHistory` when the selected range is not covered by what the page shipped (1W and 5Y), and from `history.daily` otherwise (1M, 3M, 1Y are slices of the shipped year and stay instant).
- `components/terminal/panels/performance-panel.tsx:398` is the only consumer of the full daily series and of the benchmark. Fetch both with `useHistory` when the panel mounts; it already renders an empty state while they arrive.
- **1D when the market is shut.** `price-chart.tsx:118` reads `history.intraday`, which `sessionSeriesDeferred` empties and `useIntraday` fills from the live gateway. When that live fetch settles empty — the normal state outside a session — fall back to `useHistory(ticker, "1D")`, the most recent stored session. Today this case draws nothing and says so; after this it draws the last session at ten-minute buckets. Leave `intradayNote` describing which of the two the reader is looking at, because a stale session presented as today's is worse than an empty chart.

- [ ] **Step 5: Redefine 1W**

In `lib/market/ranges.ts`, 1W becomes intraday-sourced:

```ts
  { id: "1W", label: "1W", source: "intraday", sessions: 5, intraday: true, interval: "10-minute bars" },
```

Update the file's header comment, which currently states that everything but the day is a slice of one daily pull — that stops being true here.

- [ ] **Step 6: Run everything**

Run: `npm test && npx tsc --noEmit && npm run lint`
Expected: all pass.

- [ ] **Step 7: Measure the result**

Rebuild and measure the payload that a click actually downloads:

```bash
PRERENDER_TICKERS=2 npx next build
npx next start -p 3999 &
curl -s -H 'RSC: 1' -o /tmp/after.rsc http://localhost:3999/terminal/ASND
wc -c /tmp/after.rsc
```

Expected: ~205KB, down from 438165 bytes. Record the number in the commit message.

- [ ] **Step 8: Commit**

```bash
git add lib/market/instrument.ts components/terminal/price-chart.tsx \
        components/terminal/panels/performance-panel.tsx lib/market/ranges.ts \
        tests/instrument-store-path.test.ts
git commit -m "Ship the range the page opens with, and fetch the rest"
```

---

## Task 7: Verify against the deployed site

**Files:** none (verification)

- [ ] **Step 1: Push and wait for the deploy**

```bash
git push origin main
```
Watch CI (`gh run watch`) and the Render deploy to `live` before measuring anything.

- [ ] **Step 2: Prove the click no longer kills the instance**

Restart the service first so the measurement starts from a known state, then open six never-prerendered symbols in a row and read memory after:

```bash
for s in USDE DLXY BTCT ASND FRNM BRBR; do
  printf '%-6s ' "$s"
  curl -s -o /dev/null -m 60 -w 'http=%{http_code} time=%{time_total}s\n' \
    "https://pwg-1kd6.onrender.com/terminal/$s"
done
```

Expected: six `http=200`, none over ~5s, and no 502. Before this work the third killed the process. Then check memory has not climbed past ~250MB and that a seventh symbol still answers.

- [ ] **Step 3: Prove the charts have their detail**

```bash
curl -s "https://pwg-1kd6.onrender.com/api/history/AAPL?range=1W" | head -c 300
```

Expected: a `series` of ten-minute buckets. On the day capture first runs it holds one session; it reaches five over a week. Until the first capture it is empty, and the chart says so rather than drawing five flat points.

- [ ] **Step 4: Confirm both buttons**

Open the home page and the products page and confirm both "See the terminal" buttons open `/terminal` in a new tab.

---

## A deliberate deviation

Tasks 3, 4 and 5 specify some files by contract — what the function takes, returns and must guarantee — rather than by full source. The skill this plan follows asks for complete code in every step, on the assumption that a stranger executes it. The author is the executor here and the token budget is a real constraint, so the detail is spent where a wrong choice would be expensive and invisible: the bucket aggregation, the retention rule, the empty-capture guard, and the payload assertions. Anything with arithmetic or a data-loss risk in it is written out in full and tested first.

## Order and dependencies

Task 1 is independent — ship it first. Task 0 must precede Task 4, because it sets the capture time. Tasks 2 and 3 precede 4. Task 5 precedes 6, which needs the hook. Task 7 is last.

Task 6 is the one that fixes the instance dying, and it does not depend on any intraday data existing — it can ship before the first capture has run.
