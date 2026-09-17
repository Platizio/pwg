/* The refresher's own process.

   Run:  npm run worker             the steady loop
         npm run worker:bootstrap   seed, sweep and enrol, then the loop
         node --conditions=react-server scripts/refresh-worker.mts --once

   Deployed as the Render `platizio-refresh` worker, which runs the bare
   command above; render.yaml carries it and the reasoning behind the service.
   The one-time fill of an empty store is the same binary run from a laptop
   with --bootstrap while the site still serves from the gateway.

   --conditions=react-server, as with every other script here, so `server-only`
   resolves to its empty shim. Nothing on this import graph may reach
   next/cache either — there is no Next server in this process to hold a cache,
   which is why ../lib/market/refresh/loop.ts invalidates over HTTP against
   /api/revalidate instead.

   Two things this file deliberately does not do. It does not decide anything:
   every interval, priority and retreat belongs to lib/market/refresh/plan.ts
   and lib/market/store/cadence.ts, and a copy of any of it here would be a
   second opinion nothing reconciles. And it never reads an environment value
   into a log line — the loop's error strings arrive already through `scrub`,
   the gateway credential is printed only as an expiry, and there is no line in
   this process that could carry a key or an Authorization header. */

import { scrub } from "../lib/api/errors.ts";
import { getToken, tokenStatus } from "../lib/api/token.ts";
import { startRefresher } from "../lib/market/refresh/loop.ts";

const args = process.argv.slice(2);
const bootstrap = args.includes("--bootstrap");
const once = args.includes("--once");

/* How many jobs run at once, tunable on the host so a gateway that starts
   refusing under load can be backed off without a deploy.

   It is a ceiling for the whole run, not just the opening number: the loop
   halves itself on a bad batch and restores a worker at a time afterwards, and
   this is the figure it climbs back to. It can only lower — the ceiling in
   lib/market/refresh/plan.ts was measured against the gateway, and a larger
   value here is clamped to it rather than honoured.

   Anything that is not a positive number is dropped rather than passed on.
   `startRefresher` floors whatever it is handed, and Math.floor(NaN) is NaN —
   an unset or fat-fingered variable would take the pool to NaN workers rather
   than to the default it is supposed to fall back to. */
const requested = Number(process.env.REFRESH_CONCURRENCY);
const concurrency = Number.isFinite(requested) && requested > 0 ? requested : undefined;

/* One line per event, structured by the loop, with the time in front.

   Render stamps its own log stream and a laptop does not, and the lines worth
   having are the ones read the following morning: which bootstrap stage wrote
   how many rows, how a batch went, when the gateway was refusing. A single
   write rather than console.log so a line cannot interleave with another. */
const log = (line: string): void => {
  process.stdout.write(`${new Date().toISOString()} ${line}\n`);
};

const message = (e: unknown): string =>
  scrub(e instanceof Error ? (e.message ? `${e.name}: ${e.message}` : e.name) : String(e));

/* Exit, but not before the line explaining why has left the process.
 *
 * Under Render stdout is a pipe, where a write is asynchronous, and
 * `process.exit` takes the process down without flushing what is queued behind
 * it. The lines at risk are exactly the ones worth having — the fatal at
 * startup and the second-signal exit — since both are written immediately
 * before going down. An empty write's callback fires behind the ones already
 * queued, which is Node's own way of asking whether it is out yet. */
const exitWhenWritten = async (code: number): Promise<never> => {
  await new Promise<void>((resolve) => {
    process.stdout.write("", () => resolve());
  });
  process.exit(code);
};

/* Log in before anything else, exactly as the build scripts do.

   A missing VIEWTRADE_* or a rejected key would otherwise surface as sixty
   failed jobs inside the first batch, each one backing its section off five
   minutes and writing an error row — which reads like a gateway outage rather
   than a worker that was never going to work. One login up front turns that
   into one line and a non-zero exit, and on Render a service that exits
   non-zero at startup is visibly failing rather than quietly idle.

   `tokenStatus()` is the broker's own diagnostic and is incapable of returning
   the token; the expiry is the only part of a credential that belongs in a
   log. */
try {
  await getToken();
  const { expiresAt } = tokenStatus();
  log(`worker token ok expiresAt=${expiresAt ? new Date(expiresAt * 1000).toISOString() : "unknown"}`);
} catch (e) {
  log(`worker fatal stage=token error=${message(e)}`);
  await exitWhenWritten(1);
}

const refresher = startRefresher({ once, bootstrap, concurrency, log });

/* Stopping.
 *
 * SIGTERM is how Render ends a deploy and SIGINT is Ctrl-C on a laptop, and
 * both mean the same thing here. Waiting at all is not about the claims: every
 * one of them is a fifteen-minute lease that simply expires, so a worker killed
 * mid-batch costs the requests in flight and nothing else. It is about the
 * batch that has ALREADY written rows and has not yet told the web service
 * which pages they sit behind — `stop()` posts those pending tags on the way
 * out, and a page that is never marked stale stays wrong until its own timer
 * comes round.
 *
 * A second signal means somebody wants it gone now, and it goes. Zero either
 * way: a refresher asked to stop has not failed, and the only non-zero this
 * process produces is the startup above, which never reached a batch.
 */
let stopping = false;

const shutdown = (signal: NodeJS.Signals): void => {
  if (stopping) {
    log(`worker signal=${signal} state=stopping exit=immediate`);
    void exitWhenWritten(0);
    return;
  }
  stopping = true;
  log(`worker signal=${signal} draining`);
  void refresher
    .stop()
    .catch((e: unknown) => log(`worker stop error=${message(e)}`))
    .finally(() => exitWhenWritten(0));
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

if (once) {
  /* One pass and out, through the same handle rather than a second code path.
     A refresher started with `once` ends after one pass by itself, and `stop()`
     in that mode is the wait for it — not an interruption, which is the whole
     reason it does not raise the loop's drain flag: the drain checks exist to
     abandon work, and a `--once` run is asking for the work. Waiting through
     this handle is also what posts the revalidations that pass gathered and
     clears the debounce timer behind them.

     The local flag goes up first so a signal arriving during that pass takes
     the immediate branch above: a process already on its way out should end
     when it is asked a second time. */
  stopping = true;
  await refresher.stop().catch((e: unknown) => log(`worker stop error=${message(e)}`));
  await exitWhenWritten(0);
}

/* Nothing follows, and nothing needs to: the loop holds its own timers, so the
   process stays up until a signal arrives. The one exception is a worker with
   no SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, which logs `refresh disabled
   reason=store-not-configured`, leaves no timer behind and exits 0 within the
   second. Render restarts it, which is the right loop for a value that is
   about to be pasted into the dashboard. */
