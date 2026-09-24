import test from "node:test";
import assert from "node:assert/strict";

import { tradingDays, windowFor } from "../lib/market/session-window.ts";

/* Instants in New York. 2026-09-23 is a Wednesday, EDT (UTC-4). */
const at = (iso: string) => Date.parse(iso);

test("before the bell, today is not yet a session — the chart shows the previous one", () => {
  // Wed 23 Sep, 02:15 ET
  assert.deepEqual(tradingDays(at("2026-09-23T06:15:00Z"), 1), ["2026-09-22"]);
});

test("once the bell has rung, today is the session", () => {
  // Wed 23 Sep, 09:35 ET
  assert.deepEqual(tradingDays(at("2026-09-23T13:35:00Z"), 1), ["2026-09-23"]);
});

/* Seven TRADING days: the weekend uses no slot. */
test("a week is seven trading days, weekends skipped, oldest first", () => {
  assert.deepEqual(tradingDays(at("2026-09-23T06:15:00Z"), 7), [
    "2026-09-14", "2026-09-15", "2026-09-16", "2026-09-17", "2026-09-18",
    "2026-09-21", "2026-09-22",
  ]);
});

test("on a weekend the last session is Friday's", () => {
  // Sun 20 Sep, midday ET
  assert.deepEqual(tradingDays(at("2026-09-20T16:00:00Z"), 1), ["2026-09-18"]);
});

/* Exchange holidays are not sessions either. 2026-11-26 is Thanksgiving. */
test("an exchange holiday is skipped like a weekend", () => {
  // Fri 27 Nov 2026, 10:00 ET (EST, UTC-5)
  assert.deepEqual(tradingDays(at("2026-11-27T15:00:00Z"), 2), ["2026-11-25", "2026-11-27"]);
});

test("the gateway window runs from the first open to the last close", () => {
  assert.deepEqual(windowFor(["2026-09-14", "2026-09-22"]), {
    from: "2026-09-14 09:30:00",
    to: "2026-09-22 16:00:00",
  });
  assert.equal(windowFor([]), null);
});

/* On a half-day the session ends at 13:00, and so does the window. Fri 27 Nov
   2026 is the day after Thanksgiving. */
test("a window ending on a half-day ends at 13:00", () => {
  assert.deepEqual(windowFor(["2026-11-23", "2026-11-27"]), {
    from: "2026-11-23 09:30:00",
    to: "2026-11-27 13:00:00",
  });
});
