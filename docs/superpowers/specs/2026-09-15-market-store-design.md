# Durable market store, instant terminal, live-only prices — design spec

Date: 15 September 2026. Status: approved by Aayush in the plan-mode interview on 15 September 2026. Not committed (no git writes until asked). The implementation plan lives in `docs/superpowers/plans/2026-09-15-market-store.md`.

## Context

The terminal feels slow for three structural reasons, all measured in the repo:

1. **Nothing is durable.** The 5-minute sweep only warms Next's fetch cache (`lib/api/ttl.ts:10-13`, `app/api/sweep/route.ts`). Every deploy and every ~2 h ViewTrade token rotation empties it. A stock page whose data is not cached costs ~30 gateway calls in the render path: ADBE 7.7 s, CRM 15 s, ORCL 30.7 s (`lib/market/prerender.ts:6-9`). Only 500 of 13,797 tradable symbols are prerendered.
2. **Fetching runs inside page renders and inside the web process.** `getHomeSnapshot()` (`lib/market/home.ts:325`) fans out to the sweep + 156 reference calls; while it runs, every request on the single Render starter box slows from 0.36 s to 8.98 s (`lib/market/swept.ts:19-23`). There is no `loading.tsx` or `<Suspense>` anywhere, so the reader stares at the previous page.
3. **Live prices blank on every navigation.** `components/terminal/live-provider.tsx:161` drops the whole tick map whenever the subscribed symbol set changes, and the EventSource is torn down and reopened. Search results and the marketing hero link are not prefetched at all (`components/terminal/search.tsx:250-258`, `components/home/hero.tsx:42-48`).

Aayush's proposal: make Supabase the store for the ~4,400 eligible names, fill every field once, then refresh only what changes. ViewTrade has **no change notifications, ETags, deltas or bulk reference endpoints** (verified in `Global_API/raw_extract/live_catalog/*.json`), so "notice a change" can only mean re-fetch on a cadence and compare a hash. The savings come from cadence per data class, from a hash match writing nothing, and from the read path never touching the gateway. Institutional holdings and analyst data return **403 on this account** (`lib/api/clients/analysts.ts:5-19`); "holdings" in the terminal is short interest + dividends + the reader's own position, and that is what the store will hold.

### Decisions from the interview (15 Sep 2026)

| Question | Answer |
|---|---|
| Database | New `market` schema in the existing Supabase project `qtjnlkobvnhhgsnyufzv` (Mumbai) |
| Refresher | One loop module; deployed as a Render `type: worker`; `REFRESH_IN_PROCESS=1` switch runs the same loop from `instrumentation.ts` inside the web service; one-time fill runs from the laptop |
| Price before the live tick lands | Last known price, dimmed and labelled delayed; swaps to live when the tick arrives |
| Live board ranking from the stream | Deferred to a follow-up; boards keep ranking from the sweep, row prices go live |
| Universe enrolled | The ~4,400 eligible names + COVERED + wire/calendar/ETF names, plus any symbol a reader opens (pull-through) |

Verified Next 16 semantics (read in `node_modules/next/dist/docs`): tags on `unstable_cache` propagate to the ISR page entry, so one `revalidateTag(tag, "max")` refreshes data and HTML together (stale-while-revalidate); a raw `fetch` inside an `unstable_cache` callback is forced no-store and never opts the page out of static; `loading.tsx` makes client navigations paint instantly but does not stream a hard load of an uncached ISR path.

---

## Architecture

```
ViewTrade REST ──(worker: cadence + hash compare)──▶ Supabase `market` schema
                                                        │ one RPC per page regeneration
Next (Render) ◀── unstable_cache(tags market:<SYM>, market:home) ◀── POST /api/revalidate (worker, on change only)
ViewTrade WS ──▶ web process `latest` map ──▶ SSE (one connection per tab, additive subscribe) ──▶ live prices
```

- **Reference data + delayed quotes** live in Postgres. Pages read one RPC and run the existing normalisers/derivers unchanged.
- **Prices** keep flowing over the existing WebSocket → SSE path; the SSE connection becomes additive so it never blanks.
- **Refresh** is a loop module with a lease-based claim/complete queue in SQL (the outbox pattern already in `0012_intake_api.sql:349-408`).

---

## 1. Data model — migration `supabase/migrations/20260915090000_0031_market_store.sql`

Follow the house conventions exactly (`security definer`, `set search_path = ''`, fully qualified names, `stable` for reads, jsonb in/out, `comment on`, `revoke all … from public, anon, authenticated; grant execute … to service_role;`, RLS enabled on every table with no policies). `market` stays **out** of `[api] schemas` in `supabase/config.toml`; all access is through `public.market_*` RPCs.

**Tables**

- `market.symbols` — `symbol pk, name, exchange, tradable bool, hot bool, priority int (3 covered/ETF/wire/calendar, 2 visited, 1 hot, 0 rest), enrolled_at, last_visited_at, created_at, updated_at` (+ `public.set_updated_at()` trigger, partial index on `hot`).
- `market.quotes` — the `SweepRow` shape from `lib/api/sweep.ts:20-45` (`px, chg, chg_known, vol, avg_vol, dollar_vol, rel_vol, mcap, pe, ex, as_of, delayed`) plus `raw jsonb` (the `RawEquityQuote` verbatim, needed by `toCompanyProfile` and the index/sector strips) and `swept_at`. Upsert uses `where (px, vol, chg, as_of) is distinct from (excluded …)` so a closed market writes nothing.
- `market.sections` — `(symbol, section) pk, payload jsonb, content_hash, version int, fetched_at, checked_at, next_check_at, source_updated_at, unchanged_streak int, attempts int, claimed_at, last_error`. Partial index on `next_check_at where claimed_at is null`.
  Sections: `profile` (fundamentals minus `ticker_news`), `news_gateway` (the 3 gateway articles; wire tickers only), `corporate_actions`, `financials_annual`, `history_daily` (5y bars stored columnar `{date[],price[],opening[],high[],low[],volume[]}` **unrepaired**, plus `derived.ret1y/ret5y/cagr5y` from `returnsAgainst(raw, splitRecord(actions))` so peers' 1Y needs no per-peer work), `short_interest`, `analyst` (keeps the 403 observed, 30 d cadence). No `indicators` section: RSI/SMA/EMA are computed from `history_daily` with the existing `sma/ema/rsi` in `lib/market/indicators.ts:73-170`, removing three calls per symbol. `financials_quarterly` is not stored (nothing in `components/` reads it).
- `market.refresh_log` — `symbol, section, outcome ('changed'|'unchanged'|'error'|'absent'), changed, ms, error, at`; 7-day retention folded into `private.purge_expired_records()` (re-create from its latest body in `0027_contact_enquiries.sql`, adding the delete). Never a competing cron job.

**RPCs** (all `public.`, service_role only)

| Function | Purpose |
|---|---|
| `market_seed_symbols(p_rows jsonb)` | bootstrap: upsert the 13,797 tradable names from `symbol-master.json` |
| `market_upsert_quotes(p_rows jsonb, p_swept_at)` → `{upserted, unchanged}` | one call per sweep, rows chunked ≤2,000 |
| `market_set_hot(p_symbols text[])` | mark the hot list after each full sweep |
| `market_enrol(p_symbols text[], p_sections text[], p_priority int)` | insert missing section rows with `next_check_at = now() + random()*20 min` |
| `market_touch_visit(p_symbol)` | `last_visited_at = now()`, priority ≥ 2, enrol all sections if new (pull-through) |
| `market_claim_due(p_limit int, p_sections text[])` → `setof jsonb` | `next_check_at <= now()` and lease free (`claimed_at is null or < now() − 15 min`), `order by priority desc, next_check_at`, `for update skip locked`; sets `claimed_at`, `attempts+1`; returns `{symbol, section, version, contentHash, priority, attempts, context}` where `context` is the stored `corporate_actions` payload for `history_daily`/`financials_annual` |
| `market_complete(p_symbol, p_section, p_payload, p_hash, p_changed, p_error, p_next_check_at, p_ms, p_source_updated_at)` → `{version}` | changed: write payload/hash, `version+1`, `fetched_at=checked_at=now()`, streak 0; a changed `corporate_actions` makes `history_daily` and `financials_annual` due now. unchanged: `checked_at`, `unchanged_streak+1`, next check only. error: `last_error`, backoff `5 min × 3^(attempts−1)` capped 6 h. Always clears the lease and logs |
| `market_instrument(p_symbol)` (stable) → jsonb | `{enrolled, quote: raw, row: SweepRow, sections: {…}, meta: {section: {fetchedAt, version}}, market: {symbol:'SPY', history_daily}, peers: [{s,name,px,chg,mcap,pe,ret1y}]}` — peers = first 8 of `profile.related_companies` joined to `quotes` and `history_daily.derived` |
| `market_home(p_strip text[], p_wire text[], p_calendar text[])` (stable) → jsonb | `{sweptAt, rows: SweepRow where hot, strip: raw quotes, weekBars: last 10 bars per ETF, wire: news_gateway payloads, calendar: corporate_actions payloads}` |
| `market_sections(p_symbols text[], p_section)` (stable) | generic batch read (sector pages, feeds) |
| `market_status()` (stable) | `{quotesSweptAt, hotCount, enrolled, due, claimed, erroring, lastRefreshAt, lastHour:{changed,unchanged,error}}` for `/api/sweep` (becomes a health read) and the probe |

**pgTAP** `supabase/tests/0031_market_store.test.sql`: RLS on all four tables; anon cannot execute `market_instrument`; upsert then repeat reports unchanged; claim sets lease and skips a row claimed 1 min ago; complete-unchanged keeps version 0 and payload untouched; complete-changed bumps to 1; corporate_actions change makes history_daily due; touch_visit enrols; `market_instrument` carries SPY; purge removes an 8-day-old log row. Every assertion writes a real row.

**Cadence** (`lib/market/store/cadence.ts`, pure, tested). Unchanged results double the interval up to the cap; errors back off `5 min × 3^(n−1)` ≤ 6 h.

| Section | Base (priority ≥2 / others) | Cap | Special |
|---|---|---|---|
| profile | 1 d / 3 d | 7 d | mcap/PE in the panel prefer the 5-min `quotes` row at assembly |
| news_gateway | 6 h, wire tickers only | 6 h | |
| corporate_actions | 1 d | 7 d | 12 h when an ex-date or event is ≤ 3 d away |
| financials_annual | 7 d | 30 d | due 1 d after an earnings date in `context` passes |
| history_daily | next ET close + 20 min | — | the 14 ETFs also every 30 min while `pricesMove(phase)`; re-derived when corporate_actions changes |
| short_interest | 3 d | 14 d | |
| analyst | 30 d | 30 d | |

Hash = sha256 over canonical JSON (sorted keys) with volatile keys stripped (`status`, `ticker_news`, request ids). `lib/market/store/sections.ts` owns `canonicalise`, `hashOf`, `toStored`, `fromStored` (back to the `Raw*` shapes the normalisers already take). Pure, tested.

---

## 2. Refresher — `lib/market/refresh/loop.ts` + `scripts/refresh-worker.mts`

The loop is a module with `startRefresher({ once, bootstrap, concurrency })` and a `stop()`; two entry points:

- `scripts/refresh-worker.mts` — `node --conditions=react-server scripts/refresh-worker.mts [--bootstrap] [--once]` (same invocation style as `scripts/build-baseline.mts`). Render service `platizio-refresh` (`type: worker`, `plan: starter`, `region: singapore`, `buildCommand: npm ci`). `npm run worker`, `npm run worker:bootstrap`.
- `instrumentation.ts` (new, repo root) — when `REFRESH_IN_PROCESS=1` and `NEXT_RUNTIME === "nodejs"`, `register()` starts the same loop inside the web service. Default off. Both entry points never run at once (documented in `render.yaml`).

Imports only what the build scripts already prove loadable outside Next: `lib/api/clients/*`, `lib/api/sweep.ts` (`runSweep` gains a `keepRaw` option), `lib/api/pool.ts`, `lib/market/hot-list.ts`, `lib/market/split-record.ts`, the store client, sections and cadence. Writes through the RPC client with `SUPABASE_SERVICE_ROLE_KEY`.

```
bootstrap: seed symbols (market_seed_symbols, 2,000/chunk) → full sweep → set hot
           → enrol COVERED + WIRE + CALENDAR + 14 ETFs + SPY (all sections, priority 3)
           → enrol hot list (all but news_gateway, priority 1) → fall into the loop (resumable: claims are leases)
loop:      hotSweep every 5 min (90 calls) → market_upsert_quotes → revalidate ['market:home']
           fullSweep hourly at :07 (276 calls) → upsert + market_set_hot → revalidate ['market:home','market:quotes']
           refresh: claim ≤60 due → pooled(concurrency 10) runJob → complete → batch revalidate ['market:<SYM>' …] ≤200/req, 5 s debounce
           idle: sleep 20 s when nothing is due
runJob:    fetch (noStore) → stable failure (404/410/422) → complete 'absent'; transient → complete error
           canonical → hash → changed = hash !== job.contentHash → payload only when changed → complete(next = cadence(...))
pacing:    ≥60 ms between request starts (≤16 req/s ceiling shared with the sweep); on >20 % errors in a batch halve concurrency (min 2), sleep 60 s, restore after 3 clean batches
```

Steady state ≈ 10–12k calls/day (history, corporate actions, profile, short interest across ~4,400 names), mostly after the US close. Today's page-driven fan-out and the 5-minute 90-call sweep both disappear from the web process.

---

## 3. Read path

- `lib/market/store/client.ts` (server-only, raw `fetch` to `/rest/v1/rpc/<fn>`, `apikey` + `Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>`, `AbortSignal.timeout(8_000)`, returns `ApiResult<T>` from `lib/api/errors.ts`; no `@supabase/supabase-js`, per `src/lib/backend.ts` house style). Env: `SUPABASE_URL ?? NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`. Market data must not be anonymously scrapeable (ViewTrade licensing), so no anon grants.
- `lib/market/store/reads.ts` — `readInstrument(symbol)`, `readHome()`, `readSections(symbols, section)` wrapped in `unstable_cache` with tags `market:<SYM>` + `market:quotes` / `market:home` and safety-net `revalidate` (900 / 300). Pattern: `lib/api/cache-layer.ts` (`guard`/`settle` so a transient RPC failure is never memoised). Second `next/cache` importer after `cache-layer.ts`; keep it the only one.
- `app/api/revalidate/route.ts` — `POST {tags[]}`, bearer `CRON_SECRET` (same `||` guard as `app/api/sweep/route.ts:38-44`), `revalidateTag(t, "max")` each, ≤200 tags.
- `lib/market/instrument.ts` — `getInstrumentSnapshot` (`:181-300`) becomes: `readInstrument` → if enrolled with a `profile`, build inputs via `fromStored` (quote = stored raw, peers from the RPC, technicals from local `sma/ema/rsi` over the repaired daily series), `articles: null` (the wider news pool has since left the render too — see below), then `assembleInstrument(inputs, now)`. Otherwise today's gateway fan-out (`:189-226` minus `fetchIntraday` and minus the SPY history when the store supplied it), quote retry `:265-279` unchanged, peers `:350-408` unchanged, then fire-and-forget `market_touch_visit` so the next visit is served from the store. The `notFound`/placeholder rules (`:283`, `:300`) keep their positions.
- `lib/market/instrument-assemble.ts` (new, pure) — lines `:302-493` lifted verbatim as `assembleInstrument(inputs, now): InstrumentSnapshot`; `InstrumentSnapshot` (`:94-139`) unchanged apart from a `storedAt: string | null`. Tested against a stored fixture equalling the gateway-path snapshot.
- `lib/market/home.ts:334-341` — the five-way `allSettled` becomes `readHome()`; `swept`, `stripResult`, `week`, `news`, `actions` are rebuilt from the RPC payload; ranking code (`screen.ts`, `hot-list.ts`, the rest of `home.ts`) untouched; `diagnostics.calls` → 0; new `degraded` fault when `sweptAt` is older than 15 min ("store: last sweep N min ago"); the `baselineSnapshot()` fallback (`:357`) stays as the last resort. `lib/market/sector.ts` and `lib/market/feeds.ts` read the same `readHome()`/`readSections`; `lib/market/swept.ts` is deleted.
- **The wider news pool leaves the render, after this wave.** `getStockArticles` (newsapi.ai) was the last third-party call left in the instrument render once the store landed, and measured 1–1.5 s of a cold page against 0.23–0.34 s for the `market_instrument` RPC that fetches everything else. New `app/api/stock-news/[ticker]/route.ts` returns the merged, ranked rail (`toStockNews` over the gateway half plus the wider pool), `Cache-Control: public, s-maxage=1800, stale-while-revalidate=86400`; `components/terminal/use-stock-news.ts` fetches it once on mount, with no timer. `articles` is now null on BOTH paths in `lib/market/instrument.ts`, so the snapshot's `news` is the gateway's own three bundled articles — which the `news_gateway` section already carries and which cost nothing — and the rail only ever gets richer. The route asks the paid provider only about a symbol the store or a fundamentals document has recognised, because that allowance is a non-renewable 2,000 for the life of the account.

- **Intraday leaves the render.** New `app/api/intraday/[ticker]/route.ts` (`fetchIntraday(ticker, 60, [TAGS.history])`, `Cache-Control: public, max-age=30`). `components/terminal/instrument-view.tsx:58-64` gains `useIntraday(id, phase)` (fetch on mount, every 60 s while `pricesMove`), merged through `liveTail` as today; `price-chart.tsx` already renders `intradayNote` for the empty state. The chart's reserved height (`instrument-view.tsx:33`) means no layout shift.
- `app/api/sweep/route.ts` — returns `market_status()` (health read, <200 ms); the Render cron and `vercel.json` `crons` are removed. `app/terminal/[ticker]/page.tsx` unchanged (`revalidate = 900` stays as a safety net; `generateStaticParams` keeps `baseline.json`; the build's 500 pages now read the store, which needs `SUPABASE_*` at build time on Render — without it the gateway fallback makes the build slow, not broken).
- `lib/api/probe.ts` — new `store.freshness` check (`quotesSweptAt` < 6 min during a session, `erroring` < 1 %).

---

## 4. Instant navigation

- `app/terminal/[ticker]/loading.tsx` and `app/terminal/loading.tsx` — skeletons in the ledger idiom (`docs/terminal/DESIGN.md`: rules not boxes, square corners, no resting shadow, chart box `h-[240px] sm:h-[300px] lg:h-[340px]` with `bg-[var(--tint-gold-ghost)]` exactly as `instrument-view.tsx:33`).
- `components/home/hero.tsx:47` — the `/terminal` anchor becomes `<Link prefetch href={SCREENER_URL}>` so the RSC payload and chunks arrive before the click (the root layout is shared, so it is a client transition).
- `components/terminal/search.tsx` — `router.prefetch(instrumentPath(id))` for the highlighted result (100 ms debounce) and on row hover; `components/dashboard/sector-view.tsx:379` hover prefetch; board `<Link>`s keep the default prefetch (an ISR route prefetches fully in the viewport; cheap once DB-backed).

---

## 5. Live prices that never blank

- `lib/api/stream/registry.ts` (server) — `Map<id, {want: Set<string>, send}>`, `register/unregister/update(id, add, remove)`; `update` emits a `snapshot` for the added symbols from `snapshotFor()` (`lib/api/stream/upstream.ts:127`). `lib/api/stream/subscription.ts` (pure) — `diffSubscription(prev, next)`, `capped(list, 256)`.
- `app/api/stream/route.ts` — assign `id = crypto.randomUUID()`, include it in the `snapshot` frame (`:117`), filter ticks with the registry's live set (`:120-123`), `unregister` on detach (`:85-90`, via `streamLifecycle`).
- `app/api/stream/subscribe/route.ts` — `POST {id, add[], remove[]}` → registry; unknown id → 404 so the client reconnects.
- `components/terminal/live-provider.tsx` — one EventSource for the life of the layout: drop `key` state (`:48`) and the `state.key` compare (`:161`); `recompute` (`:55-65`) diffs the union and POSTs it (the 250 ms coalesce applies only to the first open); removed symbols leave the buffer; on POST failure or a closed socket reconnect with the full union, keeping the buffer (freshness ages ticks out). `price-header.tsx` policy unchanged: live tick when fresh, else the server price labelled delayed.

---

## 6. Config, env, deploy

- `render.yaml`: web service gains `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (`sync: false`), `REFRESH_IN_PROCESS` (default unset); `platizio-sweep` cron removed; new `platizio-refresh` worker with ViewTrade vars, `SUPABASE_*`, `CRON_SECRET`, `SITE_URL`, `REFRESH_CONCURRENCY`. Note in the file that `VIEWTRADE_GATEWAY` (what `lib/api/env.ts:31` reads) must be set in the dashboard alongside `VIEWTRADE_BASE_URL`.
- `vercel.json`: drop `crons`. `src/env.d.ts`: the new names. `package.json`: `worker`, `worker:bootstrap`, `test:db` (`supabase test db`).
- No secret enters the repo or `.env.local` beyond what is already there; the service-role key is server-only (never `NEXT_PUBLIC_`).
- Docs: design spec to `docs/superpowers/specs/2026-09-15-market-store-design.md` and the implementation plan to `docs/superpowers/plans/` — **uncommitted** (no git writes until asked). Stale figures in code comments (`swept.ts:12-13`, `hot-list.ts:6-7`, `sweep.ts:11` say 21,600/432; `sectors.ts:11` says 30,809) get corrected where those files are touched.

---

## 7. Task order (each phase ships on its own)

**Phase A — perceived speed, no database (can ship first)**
1. `stream/subscription.ts` + `registry.ts` with tests → additive SSE (`route.ts`, `subscribe/route.ts`, `live-provider.tsx`).
2. `loading.tsx` ×2, hero `Link`, search/sector prefetch.

**Phase B — the store**
3. Pure modules with tests: `store/sections.ts`, `store/cadence.ts`, `instrument-assemble.ts` (refactor `instrument.ts` to call it; behaviour identical, gateway path still live).
4. Migration 0031 + pgTAP; `supabase db push` to the Mumbai project (schema only, no data yet).
5. `store/client.ts`, `store/reads.ts`, `/api/revalidate`, env additions.
6. `refresh/loop.ts`, `scripts/refresh-worker.mts`, `instrumentation.ts`; run `npm run worker:bootstrap` from the laptop while the site still renders from the gateway; watch `market_status()` until `enrolled ≥ 4,400` and `due` trends to 0.
7. Switch the read path: `instrument.ts`, `home.ts`, `sector.ts`, `feeds.ts`, delete `swept.ts`; `/api/intraday` + `useIntraday`; `/api/sweep` → health; remove crons; deploy the worker.
8. Probe check, README ops note, comment corrections.

Follow-ups (out of scope): live board ranking from the stream; a shared-token row if two ViewTrade logins prove to conflict; a `market.bars` append-only table if daily history rewrites ever matter.

---

## 8. Verification

- `npm test` — new suites: canonicalise is key-order stable; hash changes only on content; cadence table incl. earnings trigger and backoff; `assembleInstrument(storedFixture)` deep-equals the gateway-path snapshot for AAPL; `diffSubscription`/registry semantics. Existing 60 files stay green. `tsc --noEmit`, `next lint`, `next build`.
- `supabase test db` — 0031 green; after `db push`, `select public.market_status()` answers.
- Bootstrap: completes in ~2 h at concurrency 10; `market_status().erroring < 1 %`; `refresh_log` in a quiet hour shows `unchanged ≫ changed` (hash compare working); `quotes` rows unchanged outside sessions.
- Timings against the Render URL (`curl -o /dev/null -s -w '%{time_total}\n'`): `/terminal` warm < 0.4 s; `/terminal/ORCL` first hit after revalidation < 1.0 s (was 30.7 s), warm < 0.4 s; a never-visited symbol < 1.0 s and enrolled within a minute; `/api/intraday/AAPL` warm < 0.1 s; `/api/sweep` < 0.2 s.
- Browser (in-app preview): from `/terminal`, five board-row navigations show the skeleton within a frame and content < 500 ms; DevTools shows one `/api/stream` request surviving all five plus one `POST /api/stream/subscribe` each; the tape never blanks; the added symbol's `snapshot` frame arrives < 300 ms; the header reads Live during the session and Delayed then Live on first paint. Marketing hero → `/terminal` is a client transition (no document reload). Screenshot proof for both.
- Render: blueprint applies with the worker and without the cron; `/api/stream/status` healthy; worker logs show batches, not bursts.

## 9. Risks

- **Two ViewTrade logins** (web + worker). Builds already run several concurrently without complaint; if the gateway invalidates the older token on login, the probe's `auth.login` will show 401 ping-pong within a day. Fallback: run in-process (`REFRESH_IN_PROCESS=1`, one token) or a shared token row.
- **Regeneration load**: `market:quotes` is revalidated hourly (full sweep) not every 5 min, so instrument pages regenerate at most hourly plus on their own changes; the server price is labelled delayed and the live tick overrides it within ~200 ms.
- **Supabase size/egress**: ~200 MB after TOAST for 4,400 names; ~1.5 GB/month egress from regenerations. Fine on Pro; near the Free tier's 5 GB only under heavy traffic. Confirm the project's plan before bootstrap.
- **Hard loads of never-visited symbols** still block for the render (~0.3–0.6 s: one RPC to Mumbai plus React). `loading.tsx` only makes client navigations instant. The 8–30 s case disappears.
- **Build-time DB dependency**: `next build` prerenders 500 pages from the store; missing env falls back to the gateway (slow build, not a failed one). Keep `PRERENDER_TICKERS` tunable.
