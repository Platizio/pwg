/* When the intraday endpoint stops answering.
 *
 * THE QUESTION THIS SETTLES. The refresher captures a session's minute bars
 * once a day, and those bars exist nowhere else — /quotes/equity/intraday
 * serves the CURRENT session and there is no endpoint that will answer for a
 * past one. So the capture has to run while there is still something to take,
 * and "while" is the part nobody has measured.
 *
 * Capture is set to 15:55 Eastern, five minutes before the regular close. That
 * is the conservative choice: it is certainly inside a session, so it cannot
 * come back empty. It also certainly misses that day's post-market bars, which
 * on this codebase's own reading of the market are real prices and not noise.
 *
 * If the endpoint keeps answering after 16:00 — or after the 20:00 extended
 * close — the capture can move later and pick those up. If it empties at the
 * bell, 15:55 is already right and the post-market is simply not available to
 * us. Either answer is worth having; guessing is not.
 *
 * Writes one line per run, appended, so the shape of the evening is readable
 * at a glance afterwards:
 *
 *   2026-09-21T20:05Z  16:05 ET  rows=960  04:00:00 -> 16:04:00
 *
 * Run by ~/Library/LaunchAgents/com.platizio.intraday-probe.plist at a handful
 * of times across one evening. It is a measurement, not a fixture: delete both
 * once the answer is written into the design note.
 */

import { fetchIntraday } from "../lib/api/clients/quotes.ts";

const SYMBOL = process.env.PROBE_SYMBOL ?? "AAPL";

/* AAPL by default because the question is about the ENDPOINT, and a liquid
   name prints every minute — a thin one going quiet would look exactly like
   the endpoint closing, which is the thing being measured. */
const result = await fetchIntraday(SYMBOL, 0, [], true);
const rows = result.ok ? (result.data ?? []) : [];

const now = new Date();
const et = new Intl.DateTimeFormat("en-GB", {
  timeZone: "America/New_York",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
}).format(now);

/* The feed's own stamps, not reformatted: if the last bar says 16:04 then the
   endpoint was still serving at 16:04, and that is the whole finding. */
const first = rows[0]?.date ?? "-";
const last = rows[rows.length - 1]?.date ?? "-";
const failure = result.ok ? "" : `  FAILED ${String(result.error).slice(0, 80)}`;

console.log(
  `${now.toISOString().slice(0, 16)}Z  ${et} ET  ${SYMBOL}  rows=${String(rows.length).padStart(4)}  ${first} -> ${last}${failure}`,
);
