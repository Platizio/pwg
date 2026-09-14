/**
 * Errors Next throws that are not failures.
 *
 * WHY THIS EXISTS
 *
 * Next signals control flow by throwing: notFound(), redirect(), a dynamic
 * bailout, a `no-store` fetch inside a static render. Those throws are meant to
 * be caught by Next, not by us, and catching one does not make a page more
 * robust — it silently cancels the thing Next was asking to do.
 *
 * http.ts wraps every fetch in one try/catch and turns whatever it catches into
 * `fail(msg, 0, ms)`. Status 0 means "transport failure" to every caller. So a
 * thrown control-flow signal arrived at the instrument layer wearing the
 * costume of a dead socket.
 *
 * That is not hypothetical. The retry added to fix the baked-404 bug passed
 * `noStore: true`, which sets `cache: "no-store"`. Inside a static render
 * patch-fetch.js:854 calls markCurrentScopeAsDynamic, and for a
 * `prerender-legacy` store dynamic-rendering.js:238 sets `revalidate = 0` and
 * throws DynamicServerError — before the request leaves the process. http.ts
 * caught it, reported a gateway transport failure, the verdict read
 * "unavailable" a second time, and the build died blaming ViewTrade for a call
 * it had never received. The retry never retried anything.
 *
 * THE MARKERS
 *
 * Read out of Next's own source rather than invented, and matched structurally
 * so no Next internals are imported into the request path:
 *
 *   DYNAMIC_SERVER_USAGE      hooks-server-context.js:23   digest
 *   NEXT_REDIRECT             redirect-error.js:24         digest prefix
 *   NEXT_HTTP_ERROR_FALLBACK  http-access-fallback:41      digest prefix
 *   NEXT_STATIC_GEN_BAILOUT   static-generation-bailout:23 code
 *
 * Prefixes for the two that carry payload: a redirect digest is
 * `NEXT_REDIRECT;replace;/path;307;` and an HTTP fallback is
 * `NEXT_HTTP_ERROR_FALLBACK;404`.
 */

const DIGESTS = ["DYNAMIC_SERVER_USAGE", "NEXT_REDIRECT", "NEXT_HTTP_ERROR_FALLBACK"] as const;

/**
 * True when `e` is Next asking for something rather than something going wrong.
 * Callers must re-throw these untouched.
 */
export function isControlFlowError(e: unknown): boolean {
  if (typeof e !== "object" || e === null) return false;

  const { digest, code } = e as { digest?: unknown; code?: unknown };

  if (typeof digest === "string" && DIGESTS.some((d) => digest === d || digest.startsWith(`${d};`))) {
    return true;
  }

  /* StaticGenBailoutError carries a `code` rather than a digest. Matched
     exactly: ECONNRESET is also a `code`, and is emphatically a real failure. */
  return code === "NEXT_STATIC_GEN_BAILOUT";
}
