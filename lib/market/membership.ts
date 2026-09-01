import { isFund } from "./universe.ts";
import type { IndexId } from "./universe.ts";
import type { Quote } from "./session.ts";

/* The breadth sample.

   No constituent endpoint is entitled on this account, so there is no way to
   ask which companies are in the S&P 500. What the breadth bar counts is
   therefore a sample of large US companies standing in for the index, not the
   index's own membership, and the wording it carries says exactly that. The
   previous copy claimed the terminal quoted "N of the companies in this
   index", which asserts a membership nothing here can verify.

   Two things keep the approximation defensible. Funds are excluded, because an
   exchange-traded fund is never a constituent of the index it tracks and
   including them inflated every count. And the cutoffs are ranks rather than
   absolute capitalisations, so the shape survives a market that has doubled. */

const RANK: Record<IndexId, { from: number; to: number; nasdaqOnly?: boolean }> = {
  SPX: { from: 0, to: 500 },
  NDX: { from: 0, to: 100, nasdaqOnly: true },
  RUT: { from: 1000, to: 3000 },
};

/** How each sample is drawn, in the reader's words. Never claims membership. */
export const INDEX_BASIS: Record<IndexId, string> = {
  SPX: "the largest US companies this terminal quotes, by market value",
  NDX: "the largest Nasdaq-listed companies this terminal quotes, by market value",
  RUT: "smaller US companies this terminal quotes, by market value",
};

export type BreadthSample = {
  members: Quote[];
  size: number;
  basis: string;
};

export function breadthSample(
  id: IndexId,
  universe: readonly Quote[],
  marketCapOf: (ticker: string) => number,
  exchangeOf: (ticker: string) => string,
): BreadthSample {
  const rule = RANK[id];

  const ranked = universe
    .filter((q) => !isFund(q.name))
    .filter((q) => (rule.nasdaqOnly ? exchangeOf(q.id) === "NSDQ" : true))
    /* A name the gateway priced but did not size cannot be ranked by size.
       The absent cap arrives here as 0, which sorts to the bottom of a
       descending list — so Electronic Arts and Webster Financial were dropping
       out of the large-cap sample and being counted as small-caps in the same
       pass. Roughly one name in a hundred comes through unsized. Leave them out
       of the ranking rather than ranking them wrongly; `size` already tells the
       reader this is a sample rather than the index. */
    .filter((q) => marketCapOf(q.id) > 0)
    .slice()
    .sort((a, b) => marketCapOf(b.id) - marketCapOf(a.id));

  const members = ranked.slice(rule.from, rule.to);
  return { members, size: members.length, basis: INDEX_BASIS[id] };
}
