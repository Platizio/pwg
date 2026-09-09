import "server-only";

/**
 * Run `work` over `items`, at most `limit` at a time, taking the next item the
 * moment a worker frees up.
 *
 * This replaces the wave pattern the sweep used to run:
 *
 *     for (let i = 0; i < groups.length; i += concurrency) {
 *       await Promise.allSettled(groups.slice(i, i + concurrency).map(fetch))
 *     }
 *
 * A wave costs whatever its slowest member costs. Measured against the live
 * gateway, quote calls varied from a few hundred milliseconds to several
 * seconds, so every wave of eight paid for its worst call and seven workers sat
 * idle waiting for it. Over 54 waves that is most of a two-and-a-half minute
 * sweep spent doing nothing.
 *
 * Settled semantics, deliberately: a sweep of four hundred chunks must not lose
 * three hundred and ninety-nine good ones because a single symbol 500s. The
 * caller counts the rejections — `failedChunks` in the sweep — and reports them
 * as a fault rather than as an outage.
 *
 * Results are returned in INPUT order, not completion order. Callers merge
 * quote chunks positionally and a reordered result set would silently scramble
 * which symbols came back.
 */
export async function pooled<T, R>(
  items: readonly T[],
  limit: number,
  work: (item: T, index: number) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  const results = new Array<PromiseSettledResult<R>>(items.length);

  /* `limit` arrives from configuration and from callers that compute it, so a
     zero or a negative would otherwise spawn no workers and hang forever on a
     promise nobody resolves. One worker is slow; no workers is a deadlock. */
  const workers = Math.max(1, Math.min(Math.floor(limit) || 1, items.length));
  if (items.length === 0) return results;

  let next = 0;

  await Promise.all(
    Array.from({ length: workers }, async () => {
      for (;;) {
        const index = next;
        next += 1;
        if (index >= items.length) return;

        try {
          results[index] = { status: "fulfilled", value: await work(items[index], index) };
        } catch (reason) {
          results[index] = { status: "rejected", reason };
        }
      }
    }),
  );

  return results;
}
