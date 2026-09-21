# Operations

How the terminal is run and fed. `PRODUCT.md` has the why, `DESIGN.md` the look.

## Running it locally

```bash
npm ci
npm run dev            # http://localhost:3000, terminal at /terminal
```

Credentials live in `.env.local`, which is not in the repository. Without the
three ViewTrade variables the site still builds and serves — every quote is
simply empty — so a first run against a fresh clone is not blocked on secrets.

Before opening a pull request:

```bash
npm test               # node:test, no network
npx tsc --noEmit
npm run lint
npm run probe          # talks to the live gateway; see below
```

## The market store

ViewTrade has no change notifications, no ETags, no deltas and no bulk reference
endpoint. "Notice that Oracle's profile changed" can therefore mean only one
thing: fetch it again on a cadence, reduce the answer to a canonical form, hash
it, compare. A hash that matches writes nothing at all, and that match is the
whole economy: the call is paid for either way; the write, the invalidation and
the page regeneration behind it are not.

That work is cheap in a worker and ruinous in a page render, which is what the
terminal used to do — thirty gateway calls inside one request. So the fetching
lives in a refresher and the answers land in the Postgres `market` schema
(`supabase/migrations/20260917044709_0032_market_store.sql`), so that a page can
read one RPC. Seven sections exist — profile, gateway news, corporate actions,
annual financials, daily history, short interest, analyst — each on its own
cadence (`lib/market/store/cadence.ts`); a symbol carries six, gateway news
going only to the attended names the wire strip draws from. Quotes keep their own
rhythm: the hot list every five minutes while prices move and half-hourly when
they do not, the whole universe hourly either way.

The schema has no anon grants and is not in PostgREST's exposed list, because
ViewTrade's licence does not permit anonymous scraping. The only way in is
`SUPABASE_SERVICE_ROLE_KEY`, held server-side by `lib/market/store/client.ts`,
and that name must never gain a `NEXT_PUBLIC_` prefix — the prefix is what
inlines a value into the browser bundle.

The store is optional — and, as the tree stands, still unread. The schema, the
refresher and the cached read path (`lib/market/store/reads.ts`) are all here,
but no page imports the last of them yet: every surface is still assembled from
the gateway fan-out the terminal has always had, while the worker fills the
store behind it. Switching the pages over is its own piece of work. That same
fan-out is also what the store degrades to afterwards, wherever Supabase is not
configured: slower, but correct.

The landing page's core answer (`sweptAt`, `rows`, `strip`, `weekBars`) is not
computed on read. The worker builds it once after every sweep with
`market_build_home` (`0034_market_home_blob.sql`) and `market_home` returns the
stored row, adding wire and calendar live; with no row, or a strip list that
differs from `lib/market/store/strip.ts`, it computes live as it always did. A
`refresh home built rows=… bytes=…` line follows every `refresh sweep` line in
the worker log; its absence means the page is paying the aggregate itself.

## The refresher

Two ways to run it, and **never both at once**: they would claim the same
leases and double the gateway traffic.

- The `platizio-refresh` worker in `render.yaml`, which is the deployed
  arrangement — Render's Free plan has no workers, so read that file first.
- `REFRESH_IN_PROCESS=1` on the web service, which starts the same loop inside
  Next from `instrumentation.ts`. Default off; useful on a single box.
- A laptop, under launchd, which is what is actually running today — see
  below, because a laptop is the one of the three that stops on its own.

On change — and only on change — the worker POSTs the affected cache tags to
`/api/revalidate`, bearing `CRON_SECRET`. Unchanged sections invalidate nothing.

Filling an empty store is a one-time job, run from a laptop while the site is
still serving from the gateway — `npm run worker:bootstrap`.

### Keeping the laptop worker alive

While the web service is on Render's Free plan there is no worker to deploy to,
so the refresher runs on a developer's laptop — and a laptop reboots. It has
stopped after a Friday close twice and stayed stopped until somebody read the
health route on Monday, by which point the backlog was large enough that
claiming jobs timed out and it could not catch up on its own.

So it runs under launchd rather than from a shell:
`~/Library/LaunchAgents/com.platizio.refresh-worker.plist`, `RunAtLoad` with
`KeepAlive`, logging to `~/Library/Logs/platizio/refresh-worker.log`.

```bash
launchctl list | grep platizio                 # pid and last exit status
launchctl kickstart -k gui/$(id -u)/com.platizio.refresh-worker   # restart now
tail -f ~/Library/Logs/platizio/refresh-worker.log
```

Two details in that plist are load-bearing and neither is obvious.

It execs `node` directly rather than a shell wrapper. The checkout is under
`~/Desktop`, which macOS protects, and a launchd agent does not inherit the
Terminal's access to it; whatever launchd execs needs that access in its own
right. Because the grant follows the image across an `exec`, a wrapper script
would have needed the permission twice — once for the shell, once for node. A
wrapper was written first and failed exactly that way, with
`/bin/bash: …/worker-daemon.sh: Operation not permitted`.

And `--conditions=react-server` is not decoration: `lib/api` and
`lib/market/store` are written to be loadable outside a Next render, and that
flag selects those exports. Without it the worker fails at import.

Nothing rotates the log. In steady state the worker writes a few lines a
minute, so this is slow; it is chatty only while draining a backlog, which is
when you want the detail. Truncate it if it ever matters.

## Reading the health

`public.market_status()` is the health read: when the quotes were last swept,
how many symbols are enrolled, how deep the due queue is, how many sections are
erroring, and the last hour's outcomes. `unchanged` far ahead of `changed` is
the hash compare doing its job; the two converging means something volatile has
crept into a canonical form and every fetch is now writing.

`npm run probe -- --only=store` reads it and applies the thresholds, reporting
`SKIP` when the store is not configured — a deployment choice, not a fault. A
sweep older than six minutes fails while prices are moving and is forgiven
outside the session: the overnight sweeps do run, but a shut market reprints the
same quote and an unchanged quote is never written, so `swept_at` stops
advancing at the close. `npm run probe` alone runs every check against the live
gateway, a full universe sweep included.

## Environment

**The site** requires `VIEWTRADE_GATEWAY`, `VIEWTRADE_API_KEY` and
`VIEWTRADE_API_SECRET`, and nothing else. Optional: `SUPABASE_URL` (falling back
to `NEXT_PUBLIC_SUPABASE_URL`) and `SUPABASE_SERVICE_ROLE_KEY` to read the
store; `CRON_SECRET` to accept `/api/revalidate` and `/api/sweep`;
`NEWSAPI_AI_KEY` with `NEWS_ENABLED`; `PROBE_TOKEN` to expose `/api/probe` in
production; `REFRESH_IN_PROCESS`.

**The worker** requires the same three ViewTrade variables and both Supabase
ones — with no store to write to it says so and exits. `CRON_SECRET` and
`SITE_URL` let it post a revalidation, since a separate process has no idea what
host the site answers on; without them the store still fills and pages wait for
their own timers. `REFRESH_CONCURRENCY` tunes how many section jobs run at once,
`SWEEP_CONCURRENCY` how many quote chunks — the sweep is the larger spender of
the two, so backing off a refusing gateway means lowering both.
