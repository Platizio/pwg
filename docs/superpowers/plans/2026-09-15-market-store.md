# Market store implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the terminal instant and its prices live-only by moving per-symbol reference data and delayed quotes into a Supabase `market` schema that a background worker refreshes by cadence and hash-compare, and by making the live SSE subscription additive.

**Architecture:** Worker (Render `type: worker`, same TypeScript clients, `REFRESH_IN_PROCESS=1` switch) → Supabase RPCs → Next reads one RPC per regeneration under `unstable_cache` tags that the worker revalidates only on change. Prices stay on WebSocket → SSE with an additive per-connection filter.

**Tech Stack:** Next 16 App Router, React 19, node:test, Postgres 17 (pg_cron, pg_net), PostgREST RPC via raw fetch.

Spec: `docs/superpowers/specs/2026-09-15-market-store-design.md` (the full design, cadence table, RPC signatures, verification).

---

## Phase A — perceived speed (no database)

### Task 1: Additive SSE subscription
**Files:** create `lib/api/stream/subscription.ts`, `lib/api/stream/registry.ts`, `app/api/stream/subscribe/route.ts`, `tests/stream-subscription.test.ts`, `tests/stream-registry.test.ts`; modify `app/api/stream/route.ts`, `components/terminal/live-provider.tsx`.
- [ ] Failing tests for `normalise`, `diffSubscription`, `capped`, `unionOf`; implement.
- [ ] Failing tests for `createRegistry` (register/unregister/update/snapshot-on-add/cap/unknown id); implement.
- [ ] Route: connection id in the snapshot frame; filter from the registry; unregister on every exit.
- [ ] Subscribe route: POST `{id, add, remove}` → 200 / 400 / 404.
- [ ] Provider: one EventSource for the layout's life; diffs POSTed; never blank the map.
- [ ] `npm test`, `tsc --noEmit`, lint.

### Task 2: Loading skeletons and prefetch
**Files:** create `app/terminal/loading.tsx`, `app/terminal/[ticker]/loading.tsx`; modify `components/home/hero.tsx`, `components/terminal/search.tsx`, `components/dashboard/sector-view.tsx`.
- [ ] Skeletons in the ledger idiom with reserved chart heights.
- [ ] Hero `/terminal` anchor → `<Link prefetch>`.
- [ ] Search highlighted/hovered result prefetch; sector rows hover prefetch.

## Phase B — the store

### Task 3: Pure store modules and the assemble refactor
**Files:** create `lib/market/store/sections.ts`, `lib/market/store/cadence.ts`, `lib/market/store/local-indicators.ts`, `lib/market/instrument-assemble.ts` and their tests; modify `lib/market/instrument.ts` (behaviour identical).

### Task 4: Migration 0031 and pgTAP
**Files:** create `supabase/migrations/20260915090000_0031_market_store.sql`, `supabase/tests/0031_market_store.test.sql`. Apply to the Mumbai project after a rollback dry run.

### Task 5: Store client, cached reads, revalidate route
**Files:** create `lib/market/store/client.ts`, `lib/market/store/types.ts`, `lib/market/store/reads.ts`, `app/api/revalidate/route.ts`, `tests/store-client.test.ts`; modify `src/env.d.ts`.

### Task 6: Refresh loop, worker script, instrumentation
**Files:** create `lib/market/refresh/loop.ts`, `scripts/refresh-worker.mts`, `instrumentation.ts`, tests for the pure scheduling/pacing helpers; modify `lib/api/sweep.ts` (`keepRaw`), `package.json`, `render.yaml`, `vercel.json`.
- [ ] `npm run worker:bootstrap` from the laptop fills the store; watch `market_status()`.

### Task 7: Read-path switch
**Files:** modify `lib/market/instrument.ts`, `lib/market/home.ts`, `lib/market/sector.ts`, `lib/market/feeds.ts`, `app/api/sweep/route.ts`, `components/terminal/instrument-view.tsx`; create `app/api/intraday/[ticker]/route.ts`; delete `lib/market/swept.ts`.

### Task 8: Probe check, docs, comment corrections
**Files:** `lib/api/probe.ts`, `docs/terminal/README.md`, stale-figure comments in `lib/api/sweep.ts`, `lib/market/hot-list.ts`, `lib/market/sectors.ts`.

## Verification
See the spec §8: timings via curl against Render, browser proof of one surviving `/api/stream` across five navigations, `market_status()` freshness, `npm test` / `tsc` / lint / `next build` green.
