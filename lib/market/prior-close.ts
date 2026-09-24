/* The close a session is measured against: the one before it.
 *
 * The day chart used the LAST daily bar, which is right only while it draws
 * today's live session. Before the bell it draws the previous session, and the
 * last daily bar is then that session's own close — or, before the bar is
 * published, the one before; the line landed on whichever happened to be
 * newest. Choosing by date fixes both: the last close strictly before the
 * drawn session's New York day.
 */

const EASTERN_DAY = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function priorClose(
  daily: ReadonlyArray<{ at: number; price: number }>,
  sessionAtMs: number | null,
): number | null {
  if (sessionAtMs === null || !Number.isFinite(sessionAtMs)) return daily.at(-1)?.price ?? null;
  const session = EASTERN_DAY.format(sessionAtMs);
  for (let i = daily.length - 1; i >= 0; i -= 1) {
    if (EASTERN_DAY.format(daily[i].at) < session) return daily[i].price;
  }
  return null;
}
