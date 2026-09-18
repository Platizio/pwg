import "server-only";
import { type ApiResult, fail, ok, scrub } from "../../api/errors.ts";
import { gated } from "./gate.ts";
import type {
  ClaimedJob,
  CompleteArgs,
  QuoteUpsertRow,
  Section,
  SeedSymbolRow,
  StoreStatus,
  StoredHome,
  StoredInstrumentRecord,
  StoredSectionRow,
} from "./types.ts";

/* The only place fetch touches Supabase.
 *
 * Deliberately raw fetch and not @supabase/supabase-js. The site already talks
 * to Supabase this way (src/lib/backend.ts), every call here is one POST to one
 * RPC, and the client library would add a dependency, a bundle and a second
 * error shape for no behaviour we use. PostgREST exposes a function as
 * POST /rest/v1/rpc/<name> taking a JSON object of NAMED parameters — position
 * means nothing, so the `p_` spellings in the wrappers at the foot of this file
 * are load-bearing and are checked in tests/store-client.test.ts.
 *
 * It carries the SERVICE-ROLE key, which reads and writes every row in the
 * project. Two consequences run through the whole module. The key is never
 * logged and never allowed into an error string (`redact` below), and this file
 * starts with server-only so an accidental import from a client component is a
 * build error rather than a credential in the browser bundle. Market data must
 * not be anonymously scrapeable under the ViewTrade licence, which is why the
 * `market` schema has no anon grants and this is the only way in.
 *
 * Nothing here throws, matching lib/api/errors.ts: a dead network, a timeout, a
 * 500 and a body that is not JSON all arrive as `ok: false`. The cached readers
 * in reads.ts reason about that value — an exception thrown inside an
 * unstable_cache callback means something quite different to Next, and it is
 * not what a store outage should mean.
 *
 * Relative imports with .ts extensions, no `@/`: the refresh worker loads this
 * from a plain Node process where the alias does not exist.
 */

export type StoreConfig = { url: string; key: string };

export type RpcOptions = {
  timeoutMs?: number;
  /** Test seam. Production always uses the global fetch. */
  fetchImpl?: typeof fetch;
  /** Skips the memoised environment read — used by the tests and the probe. */
  config?: StoreConfig;
};

/* Eight seconds, for the writes and the health read. Each of those is a bounded
   upsert or a handful of aggregate counts against a database in the same region
   as nothing in particular — the web service is in Singapore and the project is
   in Mumbai — so the ceiling is set by the round trip and the JSON, not by the
   work. A 500-row quote upsert or a 2,000-row seed chunk genuinely takes
   seconds, and nothing is waiting on a page for either. */
const DEFAULT_TIMEOUT_MS = 8_000;

/* Four seconds for the three reads a RENDER waits on, and the difference from
 * the number above is the point.
 *
 * Eight was never a budget a page could spend. A read that has not answered
 * in four seconds is not answering inside a page render, so the `ms: 8165` in
 * the failure log was time the client spent on an answer nothing was going to
 * use. That was free when a read cost
 * nothing but a socket. It is not free now: under the gate next door a read
 * that runs to the ceiling holds one of four permits for the whole of it, and
 * the pages queued behind it pay for every second twice.
 *
 * Four is still generous by an order of magnitude. One of these is a single
 * indexed query returning ~127KB, measured at 0.27-0.72s against this
 * database. A read that has not answered in four seconds is not answering
 * inside a page render, and the caller has a correct page to fall back to. */
const READ_TIMEOUT_MS = 4_000;

let memo: StoreConfig | null = null;
let read = false;

/**
 * Where the store lives, or null if it has not been pointed at.
 *
 * Null rather than a throw, and memoised like lib/api/env.ts. The site must
 * still build, prerender and deploy with no Supabase configuration at all —
 * that is the state src/lib/backend.ts already assumes — so an unconfigured
 * store degrades to the gateway fan-out the terminal has always had, rather
 * than failing the build.
 *
 * SUPABASE_URL first so the server can be pointed somewhere the browser is
 * not; NEXT_PUBLIC_SUPABASE_URL is the fallback because it is already set in
 * every environment and names the same project. The key has no such fallback
 * and must NEVER gain a NEXT_PUBLIC_ prefix: that prefix is what inlines a
 * value into the client bundle, and this particular value owns the database.
 */
export function storeConfig(): StoreConfig | null {
  if (read) return memo;
  read = true;
  const url = (process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(
    /\/+$/,
    "",
  );
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  memo = url && key ? { url, key } : null;
  return memo;
}

export function storeConfigured(): boolean {
  return storeConfig() !== null;
}

/** Test seam — lets a test mutate process.env and read it again. */
export function resetStoreConfig(): void {
  memo = null;
  read = false;
}

/**
 * Strip the credential out of anything on its way to a log line.
 *
 * `scrub` handles `Bearer <token>`, which covers the shape lib/api/http.ts
 * meets. PostgREST says the key other ways — it quotes the request back on a
 * malformed one, and fetch puts the whole URL into the TypeError it throws — so
 * the raw value is removed here as well, wherever it appears.
 */
function redact(message: string, key: string): string {
  const scrubbed = scrub(message);
  return key ? scrubbed.split(key).join("<redacted>") : scrubbed;
}

/**
 * Call one `public.market_*` function.
 *
 * `args` is a JSON object of named parameters; an omitted key takes the SQL
 * default, which is why the wrappers below pass `undefined` rather than null
 * for anything optional — JSON.stringify drops the key entirely.
 */
export async function rpc<T>(
  fn: string,
  args: Record<string, unknown> = {},
  opts: RpcOptions = {},
): Promise<ApiResult<T>> {
  const config = opts.config ?? storeConfig();
  /* Answered before the clock starts and without a request: there is nothing
     to time and nothing to blame on the network. Callers distinguish this from
     an outage by the message, and the read path treats both the same way —
     fall back to the gateway. */
  if (!config) return fail("store not configured", 0, 0);

  const url = `${config.url.replace(/\/+$/, "")}/rest/v1/rpc/${fn}`;
  const doFetch = opts.fetchImpl ?? fetch;
  const started = Date.now();

  let res: Response;
  try {
    res = await doFetch(url, {
      method: "POST",
      headers: {
        apikey: config.key,
        Authorization: `Bearer ${config.key}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(args),
      /* no-store, not a tagged Next fetch. The caching for these reads lives
         one layer up in reads.ts, keyed on the symbol and tagged so the worker
         can invalidate exactly what changed; a fetch cache keyed on a URL that
         is identical for every symbol could do neither. */
      cache: "no-store",
      signal: AbortSignal.timeout(opts.timeoutMs ?? DEFAULT_TIMEOUT_MS),
    });
  } catch (e) {
    /* Keep what was actually thrown, redacted, rather than flattening it to the
       word "timeout". The name is the stable part — AbortSignal.timeout always
       aborts with a DOMException named TimeoutError, and an abort from any
       other cause says so under a different name — while the message is the
       part that tells a caller whether the store's DNS is gone, TLS failed, or
       the connection was refused. Flattening loses exactly that, and makes a
       timeout and an unrelated abort read identically in a log. The message is
       the part that varies between Node versions, so tests match the name. */
    const msg =
      e instanceof Error ? (e.message ? `${e.name}: ${e.message}` : e.name) : String(e);
    return fail(redact(msg, config.key), 0, Date.now() - started);
  }

  if (!res.ok) {
    /* PostgREST answers errors as a JSON envelope with `message`, `hint` and
       `details`, but a gateway in front of it answers HTML and a missing
       function answers a bare line. Take the text either way, and keep the
       function name in the message: "rpc market_home 404" is the whole
       diagnosis when a migration has not been applied, and a body without it
       reads like a network fault.

       The swallow is safe on THIS side and only this side: the status is
       already the diagnosis, so a body that fails to arrive costs a sentence of
       detail and changes nothing about what is returned. Below a 2xx the body
       IS the answer, and the same swallow would invent one — see there. */
    const body = await res.text().catch(() => "");
    /* Redact first, truncate second. The other order looks equivalent and is
       not: a service-role JWT is around 230 characters, so a cut at 200 lands
       inside one, and a prefix of the key is no longer the key — `redact` would
       find nothing to replace and leave the header, the project ref and the
       service_role claim in a string this module's callers log. Redacting the
       whole body costs one pass over bytes res.text() has already
       materialised. */
    const short = redact(body.replace(/\s+/g, " ").trim(), config.key).slice(0, 200);
    return fail(`rpc ${fn} ${res.status}${short ? `: ${short}` : ""}`, res.status, Date.now() - started);
  }

  /* The body is its own fallible step, and reading it with a `.catch` that
   * returns "" would be a lie.
   *
   * A 200 means the status line arrived. The bytes are a separate arrival, and
   * the abort signal above covers them too — so a payload that outruns the
   * timeout half way down aborts HERE, with a perfectly good Response object
   * already in hand. market_home is the read that does it: hot rows, the strip,
   * a week of bars per strip symbol, the wire and the calendar, over a link to
   * Mumbai. A mid-stream disconnect lands in the same place.
   *
   * Swallowed, every one of those becomes an empty string, which is
   * indistinguishable from the 204 market_touch_visit really does return — so
   * the read reports `ok(null)`, `guard` in reads.ts sees a success and
   * memoises it for the full TTL, and callers dereference a null cast to
   * StoredHome. That is a TypeError in a render rather than one degraded panel,
   * which is the single outcome the contract at the top of this file rules out.
   * So the failure is reported as a failure, and `ok(null)` is kept for a body
   * that genuinely arrived with no bytes in it.
   *
   * The status stays the response's own: something did answer, and 200 is not
   * in cache-policy's STABLE set, so the layer above treats it as the transient
   * thing it is. */
  let text: string;
  try {
    text = await res.text();
  } catch (e) {
    const why = e instanceof Error ? (e.message ? `${e.name}: ${e.message}` : e.name) : String(e);
    return fail(
      `rpc ${fn} ${res.status} body: ${redact(why, config.key)}`,
      res.status,
      Date.now() - started,
    );
  }

  /* Timed after the download, not after the headers. The other order reads a
     four-second body as a four-millisecond call, and `ms` is the number the
     refresh log and /api/sweep use to decide whether the store is healthy. */
  const ms = Date.now() - started;

  /* market_touch_visit returns void, and PostgREST answers that with 204 and no
     bytes at all. JSON.parse("") throws, so an empty body is read as the null
     it means rather than as a broken response. */
  if (!text.trim()) return ok(null as T, res.status, ms);

  try {
    return ok(JSON.parse(text) as T, res.status, ms);
  } catch {
    return fail(`rpc ${fn} returned a body that was not JSON`, res.status, ms);
  }
}

/* ---- reads ------------------------------------------------------------ */

/**
 * One page read: behind the gate, and on the render's ceiling rather than the
 * worker's.
 *
 * Both are here rather than inside `rpc` because both are wrong for a write.
 * Single-flight would collapse two identical upserts into one — which is a
 * LOST WRITE, not a saving — and the worker already bounds its own concurrency
 * with `pooled`, so a second bound around it would only fight the first. The
 * stampede in the log is a read stampede; this is the path it travels.
 *
 * The key is the question, spelled the way the wire spells it. `opts` is not in
 * it: a `fetchImpl` or a `config` is a test seam, and in a running process
 * there is exactly one store to ask.
 */
function pageRead<T>(
  fn: string,
  args: Record<string, unknown>,
  opts?: RpcOptions,
): Promise<ApiResult<T>> {
  /* Spread second, so a caller that names its own timeout still gets it — the
     tests do, at 20ms, to watch an abort without waiting four seconds. */
  return gated(`${fn} ${JSON.stringify(args)}`, () =>
    rpc<T>(fn, args, { timeoutMs: READ_TIMEOUT_MS, ...opts }),
  );
}

export const readInstrumentRaw = (symbol: string, opts?: RpcOptions) =>
  pageRead<StoredInstrumentRecord>("market_instrument", { p_symbol: symbol }, opts);

export const readHomeRaw = (
  strip: string[],
  wire: string[],
  calendar: string[],
  opts?: RpcOptions,
) =>
  pageRead<StoredHome>(
    "market_home",
    { p_strip: strip, p_wire: wire, p_calendar: calendar },
    opts,
  );

export const readSectionsRaw = (symbols: string[], section: Section, opts?: RpcOptions) =>
  pageRead<StoredSectionRow[]>("market_sections", { p_symbols: symbols, p_section: section }, opts);

/* Gated like the others — two probes arriving together should ask once — but on
   the eight-second ceiling, because market_status counts across the whole
   universe and nobody's page is waiting for the answer. */
export const readStatus = (opts?: RpcOptions) =>
  gated("market_status", () => rpc<StoreStatus>("market_status", {}, opts));

/* ---- writes, called by the refresh worker ----------------------------- */

export const seedSymbols = (rows: SeedSymbolRow[], opts?: RpcOptions) =>
  rpc<number>("market_seed_symbols", { p_rows: rows }, opts);

export const upsertQuotes = (rows: QuoteUpsertRow[], sweptAt?: string, opts?: RpcOptions) =>
  rpc<{ upserted: number; unchanged: number }>(
    "market_upsert_quotes",
    { p_rows: rows, p_swept_at: sweptAt },
    opts,
  );

export const setHot = (symbols: string[], opts?: RpcOptions) =>
  rpc<number>("market_set_hot", { p_symbols: symbols }, opts);

export const enrol = (
  symbols: string[],
  sections: Section[],
  priority?: number,
  opts?: RpcOptions,
) => rpc<number>("market_enrol", { p_symbols: symbols, p_sections: sections, p_priority: priority }, opts);

export const touchVisit = (symbol: string, opts?: RpcOptions) =>
  rpc<null>("market_touch_visit", { p_symbol: symbol }, opts);

export const claimDue = (limit?: number, sections?: Section[], opts?: RpcOptions) =>
  rpc<ClaimedJob[]>("market_claim_due", { p_limit: limit, p_sections: sections }, opts);

export const complete = (args: CompleteArgs, opts?: RpcOptions) =>
  rpc<{ version: number }>(
    "market_complete",
    {
      p_symbol: args.symbol,
      p_section: args.section,
      p_payload: args.payload,
      p_hash: args.hash,
      p_changed: args.changed,
      p_error: args.error,
      p_next_check_at: args.nextCheckAt,
      p_ms: args.ms,
      p_source_updated_at: args.sourceUpdatedAt,
    },
    opts,
  );
