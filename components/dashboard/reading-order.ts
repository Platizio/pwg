/* How the terminal's reference lists read. Pure, so both the dashboard rail
   and the full pages share one rule and the rule has tests around it
   (tests/dashboard-reading-order.test.ts). */

/**
 * Stories in time order, freshest first.
 *
 * The wire is chosen on relevance and impact (lib/api/normalize/wire.ts), and
 * that choice stands: this only orders what was chosen. `age` is hours since
 * publication. The sort is stable, so stories of one age keep the order the
 * feed ranked them in. A copy is sorted; the caller's array is left alone.
 */
export function newestFirst<T extends { age: number }>(stories: readonly T[]): T[] {
  return [...stories].sort((a, b) => a.age - b.age);
}

/**
 * The time line for an event, or null where it would only repeat the title.
 *
 * A corporate action's `time` is often a word, not a time — "Ex-dividend"
 * under "Medtronic · ex-dividend" — and printing it on the line where a time
 * belongs says the title twice.
 */
export function eventTime(event: { title: string; time: string }): string | null {
  const time = event.time.trim();
  if (time === "") return null;
  return event.title.toLowerCase().includes(time.toLowerCase()) ? null : time;
}
