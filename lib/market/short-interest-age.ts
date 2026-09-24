/**
 * Whether a short-interest filing is recent enough to present as the stock's
 * current short position.
 *
 * Filings settle twice a month and publish about a week later, so the newest
 * is normally ten to twenty-five days old. Past six weeks it is history, not
 * the position. On 24 Sep 2026 every record on file had settled on
 * 29 Dec 2017 (the client reads the first row of an oldest-first list), and
 * the Holdings tab printed those eight-year-old figures as if they were
 * today's. insights.ts applies the same limit to its short-interest item.
 *
 * Measured against the last daily bar rather than the clock, so the answer is
 * a property of the server's snapshot: the server and the browser render the
 * same thing and there is nothing for hydration to disagree about.
 */

/** Oldest settlement, in days before the last bar, still shown as current. */
export const SHORT_INTEREST_MAX_AGE_DAYS = 45;

/* A settlement a few days after the last bar is a weekend or a holiday
   between them, not a filing from the future. */
const FUTURE_TOLERANCE_DAYS = 3;

const DAY_MS = 86_400_000;

/** A `yyyy-mm-dd` day as its UTC midnight, or null when it is not a real day. */
function dayStart(day: string | null | undefined): number | null {
  if (!day) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const at = Date.UTC(y, mo - 1, d);
  const back = new Date(at);
  /* Date.UTC rolls 31 Feb into March; a day that does not round-trip is not a day. */
  if (back.getUTCFullYear() !== y || back.getUTCMonth() !== mo - 1 || back.getUTCDate() !== d) {
    return null;
  }
  return at;
}

/**
 * @param settlementDate The filing's settlement day, `yyyy-mm-dd`.
 * @param referenceAt    The last daily bar's timestamp (ms). When there is no
 *                       bar to measure against, a readable filing is shown as
 *                       it always was, with its settlement date beside it.
 */
export function shortInterestIsCurrent(
  settlementDate: string | null | undefined,
  referenceAt: number | null | undefined,
): boolean {
  const settled = dayStart(settlementDate);
  if (settled === null) return false;
  if (referenceAt == null || !Number.isFinite(referenceAt)) return true;
  const reference = Math.floor(referenceAt / DAY_MS) * DAY_MS;
  const age = (reference - settled) / DAY_MS;
  return age >= -FUTURE_TOLERANCE_DAYS && age <= SHORT_INTEREST_MAX_AGE_DAYS;
}
