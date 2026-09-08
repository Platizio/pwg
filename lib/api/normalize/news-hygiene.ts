/* Two things a news feed does that no relevance score can fix.
 *
 * SYNDICATION. One wire story runs under three mastheads. Event Registry's own
 * `isDuplicateFilter: "skipDuplicates"` is switched on in the query and it does
 * not catch cross-publisher copies — observed in a single live page for AAPL,
 * where "Apple changes name of Lake Ontario to Lake America" arrived from both
 * Yahoo and UPI, and "With Tim Cook's Era Ending, Is Apple Stock a Buy Under
 * John Ternus?" from both NASDAQ and Yahoo! Finance. Four of ten slots, two
 * stories. A rail of three would have shown one of them twice.
 *
 * CONCENTRATION. All three of the gateway's AAPL headlines came from The
 * Motley Fool. One publisher's editorial line is not the market's, and three
 * slots spent on one desk is a narrower view than the rail claims to give.
 *
 * Both passes are order-preserving and take the FIRST item they see, so a
 * caller that has already sorted by relevance keeps its best copy of a
 * duplicated story and its best two from a prolific publisher. Sort first,
 * then run these.
 */

/** No more than this many items from any one publisher. */
export const SOURCE_CAP = 2;

/* Mastheads append their own name, and punctuation drifts between copies of
   one wire story, so the key is the alphanumeric spine of the headline. The
   prefix cut is what makes " | PYMNTS.com" and an em-dashed masthead collapse
   onto the original; 60 characters is long enough that two genuinely different
   headlines almost never share one. */
const KEY_LENGTH = 60;

export function titleKey(title: string): string {
  return (
    (title ?? "")
      .toLowerCase()
      /* Apostrophes are inside words, not between them, and mastheads disagree
         about them — a curly ’, a straight ', or none at all. Replacing them
         with a space the way other punctuation is replaced turns "Tim Cook's"
         into "tim cook s" while another paper's "Tim Cooks" becomes "tim
         cooks", and the same wire story then reads as two. Strip, don't split. */
      .replace(/['‘’]/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .trim()
      .slice(0, KEY_LENGTH)
  );
}

/**
 * One story per headline, keeping the first seen.
 *
 * A headline that reduces to nothing — empty, or punctuation only — is dropped
 * rather than kept under an empty key, which would otherwise collapse every
 * untitled item onto a single entry and hide all but one of them.
 */
export function dedupeByTitle<T extends { title: string }>(items: readonly T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    const key = titleKey(item.title);
    if (!key) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

/**
 * At most `SOURCE_CAP` items from any one publisher.
 *
 * An item with no publisher is passed through uncapped: a missing name is an
 * absent reading, not evidence that several items came from one desk, and
 * bucketing them together would silently drop unrelated stories.
 */
export function capPerSource<T extends { source: string }>(
  items: readonly T[],
  cap = SOURCE_CAP,
): T[] {
  const taken = new Map<string, number>();
  const out: T[] = [];
  for (const item of items) {
    const key = (item.source ?? "").trim().toLowerCase();
    if (!key) {
      out.push(item);
      continue;
    }
    const n = taken.get(key) ?? 0;
    if (n >= cap) continue;
    taken.set(key, n + 1);
    out.push(item);
  }
  return out;
}
