/**
 * Whether an instrument URL is allowed to answer 404.
 *
 * THE BUG THIS EXISTS TO CLOSE
 *
 * `getInstrumentSnapshot` returned `null` for three unrelated situations — the
 * promise rejected, the call came back `ok: false`, or the gateway said the
 * symbol is not there — and the page turned any `null` into `notFound()`. Next
 * then bakes that into the prerender. A clean build measured `"status": 404`
 * on AAPL, TSLA, NVDA, AMZN, SPOT and MSFT: every covered ticker, gone,
 * because the gateway was busy for a moment while the build fanned out. The
 * same thing was caught live in dev — /terminal/AAPL answered "Stock not
 * found" and then 200 on the very next request.
 *
 * THE FACT THE RULE RESTS ON
 *
 * A symbol the gateway does not know comes back as a SUCCESSFUL response with
 * `notFound: true` on the quote — not as an HTTP error. So no failure status
 * can mean "this ticker does not exist". A failed call means we were not told,
 * and being untold is not the same answer as being told no. A 404 is a durable
 * claim; it may only be made on a gateway that actually answered.
 *
 * `notPermissioned` is deliberately on the 404 side. It is deterministic — the
 * entitlement will be identical on the next request — and a page of dashes
 * wearing a real company's name is the one failure this layer exists to
 * prevent.
 */

/** Only the two fields that decide this; structural so callers need not cast. */
type QuoteLike = { notFound: boolean; notPermissioned: boolean };

/** Mirrors ApiResult without importing it: that module is server-only. */
type ResultLike = { ok: true; data: readonly QuoteLike[] } | { ok: false; status: number };

export type Verdict =
  /** The gateway answered and priced it. */
  | "ok"
  /** The gateway answered and does not have it. A 404 is honest. */
  | "missing"
  /** We were not told. Anything durable said here would be a guess. */
  | "unavailable";

export function quoteVerdict(
  settled: PromiseSettledResult<ResultLike> | undefined,
): Verdict {
  /* A rejected promise is the original bug in one line: it carried no status,
     so it fell through the same `null` as a genuine absence. */
  if (settled === undefined || settled.status === "rejected") return "unavailable";

  const result = settled.value;
  if (!result.ok) return "unavailable";

  /* Requested but absent from the response body counts as absent: the quotes
     client already treats a symbol missing from the payload the same as one
     flagged notFound. */
  const quote = result.data[0];
  if (!quote) return "missing";

  return quote.notFound || quote.notPermissioned ? "missing" : "ok";
}
