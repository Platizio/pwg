import { test } from "node:test";
import assert from "node:assert/strict";
import {
  TERMINAL_PATH,
  WATCHLIST_PATH,
  instrumentPath,
  tickerFromPath,
} from "../lib/market/paths.ts";

test("the watchlist page lives under the terminal", () => {
  assert.equal(WATCHLIST_PATH, `${TERMINAL_PATH}/watchlist`);
});

test("an instrument path reads back as its ticker", () => {
  assert.equal(tickerFromPath(instrumentPath("AAPL")), "AAPL");
  assert.equal(tickerFromPath(instrumentPath("BRK.B")), "BRK.B");
  assert.equal(tickerFromPath(instrumentPath("RDS/A")), "RDS/A");
});

test("the static children of /terminal are routes, not tickers", () => {
  for (const child of ["sector", "calendar", "wire", "watchlist"]) {
    assert.equal(tickerFromPath(`/terminal/${child}`), null, child);
  }
});

test("paths that are not one instrument deep name no ticker", () => {
  assert.equal(tickerFromPath("/terminal"), null);
  assert.equal(tickerFromPath("/terminal/sector/technology"), null);
  assert.equal(tickerFromPath("/products"), null);
});
