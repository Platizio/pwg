/* One way to print a calendar day on the instrument tabs: "24 Sep 2026".
 *
 * The tabs had four: "23 Sep 2026" under the Insights, "April 9, 2025" on the
 * deepest drawdown, "September 24, 2026" in the Performance note and a raw
 * "2026-08-10" on every dividend and short-interest filing. This is the first
 * of them, day first and the month in three letters, because it is the form
 * the Insights already write into their own sentences (lib/market/insights.ts,
 * dateLabel) and the order a reader in India writes a date in.
 *
 * Spelled out by hand rather than handed to Intl: `en-GB` prints September as
 * "Sept" on current ICU, and a visitor-locale formatter would let the server
 * and the browser disagree and throw away the hydrated tree. */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "24 Sep 2026" from "2026-09-24" (a time after the day is ignored), or null
    when the text is not a calendar day. */
export function dayLabel(iso: string | null | undefined): string | null {
  const m = iso ? /^(\d{4})-(\d{2})-(\d{2})/.exec(iso.trim()) : null;
  if (!m) return null;
  const month = MONTHS[Number(m[2]) - 1];
  const day = Number(m[3]);
  return month && day >= 1 && day <= 31 ? `${day} ${month} ${m[1]}` : null;
}

/** "24 Sep 2026" for a daily bar's epoch ms. Read in UTC: a daily bar is
    stamped at Eastern midnight, which is the same calendar day in UTC. */
export function dayLabelAt(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}
