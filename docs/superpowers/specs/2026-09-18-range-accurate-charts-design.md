# Range-accurate charts, and a click that does not kill the box

**Date:** 2026-09-18
**Status:** design, awaiting review

## The two problems, measured

### 1. The 1D and 1W charts do not have the detail they claim

`lib/market/ranges.ts:13-20` defines the ranges:

```ts
{ id: "1D", source: "intraday", interval: "1-minute bars" },
{ id: "1W", source: "daily", sessions: 5,  interval: "daily closes" },
```

So **1W is five daily closes** — five points for a week. That is the "very straight line". It is not a rendering fault; the range is defined that way, and the file's own comment admits it: *"asking the gateway for a week returns the same five rows that slice contains."*

**1D** is a live pull of the current session's minute bars. The route works — `/api/intraday/AAPL` returned 133 one-minute bars while this was written. It shows nothing only when the market is shut, because the gateway holds nothing then.

A third effect is real market data rather than a defect: a thin name's minute bars genuinely repeat. ASND in pre-market printed `239.1, 241, 239.29` with `open == high == low` and ~1,000 shares a minute. No amount of granularity invents trades that did not happen.

### 2. A board click renders a page that can kill the instance

A click downloads **438KB**, of which **234KB (53%) is 2,549 daily bars** — the company's full five years *and* SPY's full five years, on every stock.

On the 512MB instance each on-demand render holds ~40–60MB and is not released (measured: a fresh instance at 81MB → 200MB → 212MB over three renders, then a 502 mid-render). Once the process dies this way, every subsequent on-demand page hangs indefinitely while the ~500 prerendered ones keep serving — five symbols were observed stuck for 90–200s each, with the instance pinned at 337MB until restarted.

This is why prerendering more names cannot fix it. The boards rank by movement, so they surface volatile tickers that are never in the prerendered set: **every board click is the expensive path.**

## The upstream constraint

Probed directly, because the vendor catalog is wrong — it advertises `range=1d` and `range=5d`, and the API rejects both with `"Invalid range format. Use [num][y/m]"`.

| Endpoint | Actually returns |
|---|---|
| `/aes/api/quotes/equity/intraday` | 1-minute bars, **current session only**; takes `symbol` and nothing else |
| `/aes/api/quotes/equity/historical` | **Daily** bars; `range` accepts months and years only |

Every quote/aggregation route in the catalog was listed: there is no aggregates endpoint and no way to ask for a past day's minutes.

**Minute history for past sessions does not exist upstream. It exists while a session is live and is then gone.** A week of intraday detail can therefore only exist if this system keeps it, and it cannot be backfilled: from the day capture is switched on, 1W fills in over five sessions.

## Design

### Principle

Each range is served by a source that actually holds the detail for its span, and **the page ships only the range it opens with**. Everything else is fetched when the reader asks for it. One mechanism solves both problems: it removes the 234KB of bars from the click, and it is the delivery path for intraday.

### Range table (target)

| Range | Source | Points | Where it comes from |
|---|---|---|---|
| 1D | 1-minute live / 10-minute when shut | ~390–960 live, ~96 when shut | live gateway during a session; the most recent stored session outside one |
| 1W | 10-minute | ~480 | stored, 5 sessions |
| 1M | daily | 21 | **already shipped** — a slice of 1Y |
| 3M | daily | 64 | **already shipped** — a slice of 1Y |
| 1Y | daily | 252 | **shipped with the page** (the default range) |
| 5Y | daily | ~1,275 | stored daily, fetched on demand |

Two consequences worth stating. 1M and 3M are slices of the 1Y series the page already carries, so they need no fetch at all and stay instant — among the daily ranges only 5Y costs a request. And 1D outside a session is the last stored session at 10-minute buckets rather than 1-minute: coarser than the live view, but ~96 points where today it shows nothing. Keeping a 1-minute copy of the last session for every hot symbol would add ~216MB and does not fit.

### Why 10-minute for the week

Measured from a real session: a full day is **49KB at 1-minute, 10KB at 5-minute, ~5KB at 10-minute** per symbol, stored columnar as `history_daily` already is.

The database is at **288MB of the 500MB free ceiling** (`market.sections` alone is 217MB), with 4,424 hot symbols.

| Bucket | 4,400 symbols × 5 sessions | Resulting DB total |
|---|---|---|
| 1-minute | ~1,080MB | far over the ceiling |
| 5-minute | ~220MB | **508MB — over** |
| **10-minute** | **~110MB** | **~398MB — fits** |

Ten-minute buckets keep full hot-set coverage, which is the decision taken, and still give ~480 points across the week. On a chart a few hundred pixels wide, finer buckets are invisible; 1-minute detail is kept where it is visible, which is the day.

Extended hours are included in the buckets. Pre- and post-market carry real price movement and this codebase already refuses to gate on the regular session.

### Capture is one call per symbol per day

`/intraday` returns the whole session-to-date in one response, so a single call near the close captures that entire day. No polling. The refresh worker already sweeps on a schedule and already has a lease-based job queue; this is one more section on a daily cadence.

**Risk to verify before implementing:** the endpoint is documented to answer an empty array *outside* a session, so the capture must run while the session is still open (near the close) rather than after it. This will be confirmed by observation against the live gateway before the job is written, and the capture time set from what is observed.

### Retention

Five sessions, pruned on write. The existing `private.purge_expired_records()` is the established place for retention in this schema and gains the intraday rows.

### Components

Each has one responsibility and a stated interface.

- **`supabase/migrations/…_0036_market_intraday.sql`** — a `history_intraday` section holding the rolling five sessions, columnar (`date[]`, `price[]`, `open[]`, `high[]`, `low[]`, `volume[]`) exactly as `history_daily` is, plus an RPC to read one symbol's series and one to write a session with pruning. Grants follow the schema's rule: revoked from `public, anon, authenticated`, granted to `service_role`.
- **`app/api/history/[ticker]/route.ts`** — serves a named range's series as JSON from the store. No gateway call. Cached, tagged `market:<SYM>` so the worker's existing invalidation reaches it.
- **`components/terminal/use-history.ts`** — client hook. Given a range, returns its series, fetching once and caching per symbol+range for the life of the page. Owns the loading and empty states.
- **`lib/market/refresh/intraday.ts`** — the capture job: pull `/intraday`, downsample to 10-minute buckets, append as a new session, prune to five.
- **Modified `lib/market/instrument.ts`** — ship `history.daily` trimmed to the default range and stop shipping `market` (the SPY series) in the page payload.
- **Modified `components/terminal/price-chart.tsx`** — take the series for the selected range from the hook rather than assuming the snapshot holds every range.
- **Modified `components/terminal/panels/performance-panel.tsx`** — the only consumer of the full daily series and of the benchmark (`:398`); fetches both when it opens. It already renders an empty state.
- **Modified `lib/market/ranges.ts`** — 1W becomes an intraday-sourced range; the table above becomes the definition.

### Data flow

```
worker ──(once per day, near close)──▶ /intraday ──downsample 10m──▶ market.sections.history_intraday (5 sessions)
                                                                      │
reader clicks a stock                                                 │
  page ships: quote + profile + 1Y daily + derived returns            │
  picks 1D ──▶ /api/intraday/[ticker]   (live, 1-minute)              │
  picks 1W ──▶ /api/history/[ticker]?range=1W ─────────────────────────┘
  picks 5Y ──▶ /api/history/[ticker]?range=5Y ──▶ stored daily
  opens Performance ──▶ full daily + benchmark
```

### Error handling

Every fetched range degrades to a stated empty state rather than a blank chart or a thrown render — the pattern `price-chart.tsx` already uses for an empty session. A failed range fetch leaves the previously shown range in place and reports itself; it never replaces real bars with invented ones. The store reads keep the existing budget-and-fallback contract, so a store outage costs the extra ranges, not the page.

### Testing

- `ranges.ts` table pinned: every range names a source that can supply its span, and 1W is no longer daily.
- Downsampling: 1-minute input to 10-minute buckets preserves first open, last close, max high, min low, summed volume; a session with gaps does not invent buckets.
- Retention: a sixth session evicts the oldest, and exactly five remain.
- The instrument payload no longer carries the benchmark, and carries only the default range — asserted on the assembled snapshot, which is the test that would have caught the 234KB.
- pgTAP for the new RPCs, including that `anon` cannot execute them.
- The capture job stores nothing when the gateway answers empty, rather than writing an empty session over a real one.

## Scope explicitly excluded

- **No backfill.** Week one shows however many sessions have been captured.
- Symbols outside the hot set keep daily-close 1W.
- The Render instance upgrade, which is deferred by decision. This work reduces the cost of a render substantially but does not remove the 512MB ceiling; it is what makes the box survivable until then, and it still pays after the upgrade.

## Separate, unrelated fix folded in

`components/home/hero.tsx:61` uses a Next `<Link … prefetch>` (same tab, client transition) while the products page at `Platizio_Global_Revamp/pages/Products.tsx:233` uses a plain anchor opening a new tab. Both point at the same `SCREENER_URL`. The hero adopts the products form verbatim so both behave identically.
