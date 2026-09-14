import "server-only";
import { env } from "./env.ts";
import { authHeader, resetToken } from "./token.ts";
import { type ApiResult, fail, ok, scrub } from "./errors.ts";
import { isControlFlowError } from "./control-flow.ts";

/* The only place fetch touches ViewTrade.

   Everything funnels through here so that authentication, timeouts, the 401
   retry, cache tagging and error shaping exist once.

   It does not throw for anything the GATEWAY does: a DNS failure, an abort and
   a 502 all come back as `ok: false`. It does re-throw what NEXT throws —
   notFound(), redirect(), a dynamic bailout — because those are control flow
   addressed to Next, and catching them cancels the thing being asked for while
   reporting a network failure that never happened. See control-flow.ts. */

export type GetOptions = {
  query?: Record<string, string | number | undefined>;
  /** Seconds. Passed straight to Next's fetch cache. */
  revalidate: number;
  tags: string[];
  timeoutMs?: number;
  /** Skip the cache entirely — used by the probe to measure real latency. */
  noStore?: boolean;
};

function buildUrl(path: string, query?: GetOptions["query"]): string {
  const { gateway } = env();
  const url = new URL(`${gateway}${path.startsWith("/") ? path : `/${path}`}`);
  for (const [k, v] of Object.entries(query ?? {})) {
    if (v !== undefined && v !== "") url.searchParams.set(k, String(v));
  }
  return url.toString();
}

async function once<T>(url: string, o: GetOptions): Promise<ApiResult<T>> {
  const started = Date.now();
  let res: Response;

  try {
    res = await fetch(url, {
      headers: await authHeader(),
      signal: AbortSignal.timeout(o.timeoutMs ?? 15_000),
      ...(o.noStore
        ? { cache: "no-store" as const }
        : { next: { revalidate: o.revalidate, tags: o.tags } }),
    });
  } catch (e) {
    /* Next signals control flow by throwing — notFound(), redirect(), and the
       dynamic bailout that a `no-store` fetch triggers inside a static render.
       Those throws belong to Next and have to reach it untouched. Converting
       one into `fail(msg, 0, ms)` reports a dead socket for a request that was
       never issued, which is exactly how a retry came to look as though it had
       contacted the gateway when it never had: dynamic-rendering.js:238 threw,
       this catch laundered it, and the caller blamed ViewTrade. */
    if (isControlFlowError(e)) throw e;

    const msg = e instanceof Error && e.name === "TimeoutError" ? "timeout" : scrub(String(e));
    return fail(msg, 0, Date.now() - started);
  }

  const ms = Date.now() - started;

  if (!res.ok) {
    // The gateway is inconsistent: JSON envelopes on some services, bare text
    // on others ("Too many symbols, max 50 allowed"). Take whichever we get.
    const body = await res.text().catch(() => "");
    return fail(scrub(body.slice(0, 300) || res.statusText), res.status, ms);
  }

  try {
    return ok((await res.json()) as T, res.status, ms);
  } catch {
    return fail("Response was not valid JSON", res.status, ms);
  }
}

export async function vtGet<T>(path: string, o: GetOptions): Promise<ApiResult<T>> {
  const url = buildUrl(path, o.query);
  const first = await once<T>(url, o);

  // A 401 means the token aged out mid-flight. Drop it and try exactly once
  // more; a second 401 is a credential problem, not a staleness problem.
  if (!first.ok && first.status === 401) {
    resetToken();
    return once<T>(url, o);
  }

  return first;
}

/** Escape hatch for the probe, which needs the URL it is about to call. */
export const urlFor = buildUrl;
