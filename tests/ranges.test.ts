import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_RANGE,
  HISTORY_RETRY_MS,
  RANGES,
  SPACING_MINUTES,
  getRange,
  historyAnswered,
  historyNextFetch,
  rangeCaption,
  rangeCaptionParts,
  spacingLabel,
  zoneLabel,
} from "../lib/market/ranges.ts";

/* The range table decides which feed answers each button. It was briefly cut
   to three entries on the belief that the gateway served only 1m, 1y and 5y —
   it serves [num][w|m|y], and its intraday endpoint serves the day. */

test("every range the control offers has a source", () => {
  assert.equal(RANGES.length, 6);
  for (const r of RANGES) {
    assert.ok(r.label.length > 0, `${r.id} has no label`);
    assert.ok(r.source === "daily" || r.source === "intraday", `${r.id} has no source`);
  }
});

test("only the day comes from the intraday feed", () => {
  const intraday = RANGES.filter((r) => r.source === "intraday");
  assert.deepEqual(intraday.map((r) => r.id), ["1D"]);
  // Everything else is a slice of one daily pull, so none may carry its own call.
  assert.ok(RANGES.filter((r) => r.source === "daily").every((r) => r.id !== "1D"));
});

test("windows grow with the range, and the fetched ones are unbounded", () => {
  const daily = RANGES.filter((r) => r.source === "daily");
  const sessions = daily.map((r) => r.sessions);

  /* 1W and 5Y have no window, and for the same reason: their series is FETCHED
     rather than sliced out of the year the page ships, so what arrives is
     already exactly the range asked for. Slicing 1W to five rows would draw
     the last fifty minutes of a week of ten-minute buckets — which is how the
     old five-daily-closes week looked, and the fault this replaced. */
  assert.deepEqual(sessions, [undefined, 21, 64, 252, undefined], "1W 1M 3M 1Y 5Y");

  const shipped = sessions.filter((n): n is number => n !== undefined);
  assert.deepEqual([...shipped].sort((a, b) => a - b), shipped, "windows must ascend");

  /* Every windowed range is a slice of the year the page carries, which is
     what lets 1M and 3M cost nothing. A window longer than that would slice
     bars the page never shipped and quietly draw a shorter range than it
     names. */
  const shippedYear = getRange(DEFAULT_RANGE).sessions;
  assert.equal(typeof shippedYear, "number");
  for (const n of shipped) {
    assert.ok(n <= (shippedYear as number), `a ${n}-session window exceeds the shipped year`);
  }
});

test("the clock only shows on the range measured in minutes", () => {
  for (const r of RANGES) {
    assert.equal(r.intraday, r.source === "intraday", `${r.id} disagrees with its own source`);
  }
});

test("the default range is one that survives a closed market", () => {
  /* The day is the one range whose emptiness is a real state, so it must not
     be what a visitor lands on out of hours. */
  const def = getRange(DEFAULT_RANGE);
  assert.equal(def.source, "daily");
  assert.equal(def.id, DEFAULT_RANGE);
});

test("an unknown id falls back to a real range rather than undefined", () => {
  const r = getRange("nonsense");
  assert.ok(RANGES.some((x) => x.id === r.id));
});

/* ------------------------------------------------------------------ */
/* What the chart says it is showing                                   */
/* ------------------------------------------------------------------ */

/* The chart offered six buttons and never once stated a bar interval, a date
   span or a timezone. A reader could not tell that 1W is five daily closes
   rather than a week of minutes, nor that the 13:30 on the day axis is UTC
   rather than a 1:30pm session.

   Two traps this caption exists to expose:

   - The window is a tail-slice of ROWS, not a date range. If the feed's last
     row is Friday and today is Tuesday, 1W silently shows last Mon-Fri. So the
     span is read off the plotted points, never computed from today.
   - The count is the points actually drawn, not the nominal `sessions`. A
     short feed plots fewer, and claiming 252 while drawing 200 is the same
     class of lie. */

/* 16:00 EDT on each date, so the UTC instant and the ET calendar day agree. */
const AUG_4 = Date.UTC(2026, 7, 4, 20, 0);
const SEP_1 = Date.UTC(2026, 8, 1, 20, 0);
const SEP_1_2025 = Date.UTC(2025, 8, 1, 20, 0);

test("a daily range names its interval, its real count and its real span", () => {
  /* The zone is stated rather than inherited. This assertion is about the
     interval, the count and the span; leaving the zone to the machine made it
     say one thing on a laptop in Kolkata and another on a CI runner in UTC,
     and the dates either side of it can shift with it. */
  /* The month drawn from the page's daily closes — its fallback while its
     intraday bars load — names what is drawn, not its usual bar size. */
  const c = rangeCaption(
    { ...getRange("1M"), interval: "daily closes" },
    AUG_4,
    SEP_1,
    21,
    "America/New_York",
  );
  assert.match(c, /^1M/);
  assert.match(c, /21 daily closes/);
  assert.match(
    rangeCaption(getRange("1M"), AUG_4, SEP_1, 546, "America/New_York"),
    /546 prices, every 15 minutes/,
    "and when its intraday bars arrive, it says so",
  );
  assert.match(
    rangeCaption(getRange("5Y"), AUG_4, SEP_1, 1275, "America/New_York"),
    /1,275 daily closes/,
  );
  assert.match(c, /Aug 4/);
  assert.match(c, /Sep 1/);
  assert.match(c, /2026/);
  assert.ok(
    c.endsWith(zoneLabel("America/New_York", SEP_1)),
    `should be stamped with the zone its times are in: ${c}`,
  );
});

test("the day range says it is minutes, not closes", () => {
  const c = rangeCaption(getRange("1D"), SEP_1, SEP_1, 391, "America/New_York");
  assert.match(c, /minute/);
  assert.ok(!/daily closes/.test(c), `the day is not daily closes: ${c}`);
});

/* One session is a date, not a range from a date to itself. */
test("a span inside one day reads as that day", () => {
  const c = rangeCaption(getRange("1D"), SEP_1, SEP_1, 391);
  assert.ok(!c.includes("\u2013"), `no dash for a single session: ${c}`);
});

test("a span crossing a year carries both years", () => {
  const c = rangeCaption(getRange("5Y"), SEP_1_2025, SEP_1, 1274);
  assert.match(c, /2025/);
  assert.match(c, /2026/);
});

/* The count is the drawn points. 1,274 must not print as 1274 beside prose. */
test("a long count is grouped for reading", () => {
  assert.match(rangeCaption(getRange("5Y"), SEP_1_2025, SEP_1, 1274), /1,274/);
});

test("the caption reports what is drawn, not what the range nominally holds", () => {
  /* 1Y nominally slices 252 sessions; a short feed plots fewer. */
  const c = rangeCaption({ ...getRange("1Y"), interval: "daily closes" }, AUG_4, SEP_1, 200);
  assert.match(c, /200 daily closes/);
  assert.ok(!c.includes("252"), `must not claim the nominal window: ${c}`);
});

test("an empty series claims no span at all rather than a zero one", () => {
  const c = rangeCaption(getRange("1D"), null, null, 0);
  assert.ok(!/1970|Jan 1|NaN|Invalid/.test(c), `no epoch leakage: ${c}`);
  assert.match(c, /^1D/);
});

test("every range can caption itself", () => {
  for (const r of RANGES) {
    const c = rangeCaption(r, AUG_4, SEP_1, 10);
    assert.ok(c.startsWith(r.label), `${r.id} should lead with its own label`);
    assert.ok(c.length > r.label.length, `${r.id} caption is empty`);
    assert.ok(!/undefined|NaN/.test(c), `${r.id} caption leaks: ${c}`);
  }
});

test("every range declares an interval, so no caption has to guess", () => {
  for (const r of RANGES) {
    assert.ok(r.interval && r.interval.length > 0, `${r.id} has no interval`);
  }
});

/* ---------- whose clock the chart is on ---------- */

/* THE COMPLAINT THIS ANSWERS, in the reader's own words: "the chart timings
 * are off — in India it should be from 7 pm to 1:30 am". They are right, and
 * the arithmetic is exact: the US regular session is 09:30-16:00 in New York,
 * which is 19:00-01:30 in Kolkata. The axis was labelled in New York's hours,
 * so a reader sitting down at 7pm saw a chart that said 09:30.
 *
 * The axis is the reader's zone now. What makes that safe rather than a
 * different flavour of the same bug is the LABEL: the original fault was never
 * which zone, it was that the caption said nothing at all, so 13:30 could have
 * been anyone's afternoon.
 */

const SESSION_OPEN = Date.UTC(2026, 8, 21, 13, 30); // 09:30 New York
const SESSION_CLOSE = Date.UTC(2026, 8, 21, 20, 0); // 16:00 New York

test("a session reads 7pm to 1:30am for a reader in India", () => {
  const at = (ms: number) =>
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Kolkata",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(ms);

  assert.equal(at(SESSION_OPEN), "19:00", "the open, on an Indian clock");
  assert.equal(at(SESSION_CLOSE), "01:30", "and the close, after midnight");
});

test("the caption names the zone it is stating times in", () => {
  const day = getRange("1Y");
  const caption = rangeCaption(day, SESSION_OPEN, SESSION_CLOSE, 2, "Asia/Kolkata");

  assert.ok(
    caption.includes(zoneLabel("Asia/Kolkata", SESSION_CLOSE)),
    `the zone must be named, got ${caption}`,
  );
  assert.ok(!caption.includes(" ET"), "and it is no longer claiming New York");
});

test("a caption with nothing plotted does not label an empty chart with a zone", () => {
  const caption = rangeCaption(getRange("1Y"), null, null, 0, "Asia/Kolkata");
  assert.ok(!caption.includes(zoneLabel("Asia/Kolkata")), "no dates, so nothing to stamp");
});

test("the dates a caption states are the reader's dates, not New York's", () => {
  /* 00:30 on the 22nd in Kolkata is still the 21st in New York, and a reader
     whose clock says Tuesday should not be told Monday. */
  const afterMidnightIST = Date.UTC(2026, 8, 21, 19, 0);
  const ist = rangeCaption(getRange("1Y"), afterMidnightIST, afterMidnightIST, 1, "Asia/Kolkata");
  const et = rangeCaption(getRange("1Y"), afterMidnightIST, afterMidnightIST, 1, "America/New_York");
  assert.notEqual(ist, et, "the two clocks disagree about the day, and the caption follows one");
});

/* ---------- what the zone is called ---------- */

/* A reader who has just asked why the chart is not in Indian time is not
 * helped by a label reading "GMT+5:30". That is what an en-US browser sitting
 * in India got, because `timeZoneName: "short"` falls back to a bare offset
 * for any zone the locale has no abbreviation for — and the two cases where
 * that bites are exactly this app's: en-US looking at India, and en-IN looking
 * at New York.
 *
 * Asserted as a contract rather than against literal strings, because the
 * abbreviation a locale offers is the locale's business and CI does not run in
 * Mumbai. The rule is only: never nothing but an offset when a name exists. */
const BARE_OFFSET = /^(GMT|UTC)[+-]/;

test("a zone is named, not reduced to its offset", () => {
  for (const zone of ["Asia/Calcutta", "Asia/Kolkata", "America/New_York", "Europe/London"]) {
    const label = zoneLabel(zone, SEP_1);
    assert.ok(!BARE_OFFSET.test(label), `${zone} came back as a bare offset: "${label}"`);
    assert.ok(label.length > 0, `${zone} came back empty`);
  }
});

test("and India is recognisably India", () => {
  const label = zoneLabel("Asia/Calcutta", SEP_1);
  assert.ok(
    /India|IST/i.test(label),
    `an Indian reader should see their own zone named, got "${label}"`,
  );
});

/* A zone that genuinely has no name but its offset keeps it — unambiguous
   beats empty. */
test("UTC keeps the only name it has", () => {
  assert.ok(zoneLabel("UTC", SEP_1).length > 0);
});

/* Every range is a line, and the caption must not call its points "bars" —
   that reads as a bar chart. */
test("the caption names a line's spacing without calling it bars", () => {
  for (const r of ["1D", "1W", "1M", "3M", "1Y", "5Y"]) {
    assert.doesNotMatch(getRange(r as never).interval, /bar|candle/i, r);
  }
});

/* ---------- the spacing a live tail is bucketed to ---------- */

/* The long charts end on the live price by folding today's minutes into the
   same buckets the fetched series is drawn in. The caption already names that
   spacing, so the number and the words must be the same fact. */
test("each intraday range's spacing is the one its caption names", () => {
  for (const id of ["1D", "1W", "1M", "3M", "1Y"] as const) {
    const minutes = SPACING_MINUTES[id];
    assert.equal(typeof minutes, "number", `${id} has no spacing`);
    assert.equal(spacingLabel(minutes as number), getRange(id).interval, `${id}`);
  }
  assert.deepEqual(
    [SPACING_MINUTES["1W"], SPACING_MINUTES["1M"], SPACING_MINUTES["3M"], SPACING_MINUTES["1Y"]],
    [5, 15, 30, 30],
  );
  assert.equal(SPACING_MINUTES["5Y"], undefined, "five years is daily closes, never bucketed");
});

/* ---------- how long a fetched range may be kept ---------- */

/* Three faults this policy closes. An EMPTY answer was cached for the range's
   whole TTL — up to three hours of a blank 1Y after one bad moment upstream.
   A FAILED fetch was never retried at all until the reader changed range. And
   an answer fetched before the open or the bell went on being served after
   it. That last one is now judged by what the answer reaches rather than by
   the phase it was fetched in — history-schedule.test.ts. */

/* 09:00 ET on the 24th, pre-market: every minute range should reach the
   23rd's bell, where the route stamps its official close. */
const T0 = Date.parse("2026-09-24T13:00:00Z");
const BELL_23 = Date.parse("2026-09-23T20:00:00Z");

test("a range with points keeps them for its TTL", () => {
  const held = { count: 390, at: T0, lastAt: BELL_23 };
  assert.equal(historyNextFetch(held, undefined, "1D", T0), T0 + 5 * 60_000);
  assert.equal(historyNextFetch(held, undefined, "1Y", T0), T0 + 3 * 3_600_000);
});

test("an empty answer is asked again within half a minute, not after the TTL", () => {
  const held = { count: 0, at: T0, lastAt: null };
  assert.equal(historyNextFetch(held, undefined, "1Y", T0), T0 + HISTORY_RETRY_MS);
  assert.ok(HISTORY_RETRY_MS <= 30_000);
});

test("a failure is retried within half a minute, whatever is held", () => {
  assert.equal(historyNextFetch(undefined, T0, "3M", T0), T0 + HISTORY_RETRY_MS);
  const stale = { count: 500, at: T0 - 2 * 3_600_000, lastAt: BELL_23 };
  assert.equal(historyNextFetch(stale, T0, "3M", T0), T0 + HISTORY_RETRY_MS);
});

test("nothing held and nothing failed: fetch now", () => {
  assert.ok(historyNextFetch(undefined, undefined, "1W", T0) <= T0);
});

/* What 1D and 1W draw changes at two moments only: the open, when today
   becomes the session, and the bell, when it gains its official close. The
   04:00 and 20:00 boundaries change nothing drawn, and refetching there would
   only spend a request. */
test("the boundaries that change nothing drawn keep what is held", () => {
  const at2000 = Date.parse("2026-09-24T00:00:00Z");
  const held = { count: 391, at: at2000, lastAt: BELL_23 };
  const at0400 = Date.parse("2026-09-24T08:00:00Z");
  assert.equal(historyNextFetch(held, undefined, "1D", at0400), at2000 + 5 * 60_000, "04:00");
  assert.equal(historyNextFetch(held, undefined, "1W", at0400), at2000 + 5 * 60_000);
});

test("only a 200 is an answer", () => {
  assert.equal(historyAnswered(200), true);
  for (const status of [204, 206, 304, 400, 429, 500, 502]) {
    assert.equal(historyAnswered(status), false, String(status));
  }
});

/* ---------- the caption as parts, and the day that has ended ---------- */

/* Joined, the caption wrapped after a separator on a phone — "…Sep 25, 2026 ·"
   on one line, "India Time" alone on the next — so it is handed over as parts
   the chart can keep whole, each separator travelling with the part after it. */
test("the caption comes apart into the pieces it is joined from", () => {
  const parts = rangeCaptionParts(getRange("1M"), AUG_4, SEP_1, 546, "Asia/Kolkata", SEP_1);
  assert.equal(parts[0], "1M");
  assert.equal(parts[1], "546 prices, every 15 minutes");
  assert.equal(parts.at(-1), zoneLabel("Asia/Kolkata", SEP_1));
  assert.equal(
    rangeCaption(getRange("1M"), AUG_4, SEP_1, 546, "Asia/Kolkata", SEP_1),
    parts.join(" · "),
  );
  assert.ok(parts.every((p) => !p.includes("·")), "no separator inside a part");
});

/* Before the bell the day chart is the last completed session, drawn against
   the close before it, under a header measuring the pre-market price against
   that session's close: AAPL's red line under a green +0.04% on 25 Sep 2026. */
const OPEN_24 = Date.UTC(2026, 8, 24, 13, 30); // 09:30 New York
const BELL_24 = Date.UTC(2026, 8, 24, 20, 0); // 16:00 New York
const PRE_25 = Date.UTC(2026, 8, 25, 8, 45); // 04:45 New York, 14:15 in India

test("a day chart of a session that has ended says it is the last session", () => {
  const parts = rangeCaptionParts(getRange("1D"), OPEN_24, BELL_24, 391, "Asia/Kolkata", PRE_25);
  assert.deepEqual(parts.slice(0, 3), ["1D", "Last session", "391 prices, one a minute"]);
});

test("a day chart of the session still trading does not", () => {
  const midSession = Date.UTC(2026, 8, 24, 17, 0);
  const parts = rangeCaptionParts(getRange("1D"), OPEN_24, midSession, 211, "Asia/Kolkata", midSession);
  assert.ok(!parts.includes("Last session"), parts.join(" | "));
});

test("only the day is labelled so; a year ending yesterday is simply a year", () => {
  const parts = rangeCaptionParts(getRange("1Y"), AUG_4, BELL_24, 252, "Asia/Kolkata", PRE_25);
  assert.ok(!parts.includes("Last session"));
  assert.ok(!rangeCaptionParts(getRange("1D"), null, null, 0, "Asia/Kolkata", PRE_25).includes("Last session"));
});
