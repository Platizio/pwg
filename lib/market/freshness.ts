/* How old a panel is allowed to say it is.
 *
 * Every board on the dashboard carries one freshness badge, drawn once and
 * applied to every row beneath it. That badge used to be dated by the panel's
 * NEWEST row, which meant a single currently-quoting symbol set the age for
 * the whole card. The "Most active" board rendered
 *
 *     Delayed · Quotes run fifteen minutes behind; the last tick arrived 25m ago
 *
 * above five figures that were 25 minutes, 13 days, 28 days, 62 days and 63
 * days old. The one live row wrote the badge and the four stale ones inherited
 * it. A disclosure that is wrong in the direction of looking trustworthy is
 * worse than no disclosure at all, so a card is now dated by its OLDEST row:
 * the worst thing on the card governs what the card may claim about itself.
 *
 * `newest` is kept because one caller genuinely wants it — the session
 * dateline is a feed heartbeat, answering "when did anything last arrive",
 * which is a question about the connection rather than about a card.
 *
 * Lives apart from home.ts because home.ts imports `server-only` and resolves
 * through the `@/` alias, so nothing in it can be reached by `node --test`.
 * These four functions are the part worth pinning, and they are pure.
 */

/** A timestamped row, as the boards and the tape hold them. */
export type Aged = { asOf?: number | null; delayed?: boolean };

/* `ages` separates the two kinds of timestamp on the page. A quote goes off:
   fifteen minutes on and it is history. A dividend date or a headline does
   not, so its stamp is shown and never judged. */
export type Freshness = { at: number | null; delayed: boolean; ages: boolean };

/** The latest stamp present, or null when none is. */
export function newest(stamps: ReadonlyArray<number | null>): number | null {
  let latest: number | null = null;
  for (const at of stamps) {
    if (at !== null && (latest === null || at > latest)) latest = at;
  }
  return latest;
}

/** The earliest stamp present, or null when none is. */
export function oldest(stamps: ReadonlyArray<number | null>): number | null {
  let earliest: number | null = null;
  for (const at of stamps) {
    if (at !== null && (earliest === null || at < earliest)) earliest = at;
  }
  return earliest;
}

/**
 * The freshness of a panel of quotes.
 *
 * Dated by the oldest row, for the reason at the top of this file. Delay is
 * read the other way round — one delayed row means the card cannot claim to be
 * live — because delay is a property of the feed the row came from rather than
 * of the row's age, and the two answer different questions.
 *
 * A row carrying no stamp contributes nothing rather than reading as the
 * epoch: absent is not 1970, and treating it as such would date every card
 * containing one unstamped row to fifty-six years ago.
 */
export function quoteAge(rows: ReadonlyArray<Aged>): Freshness {
  return {
    at: oldest(rows.map((r) => r.asOf ?? null)),
    delayed: rows.some((r) => r.delayed === true),
    ages: true,
  };
}
