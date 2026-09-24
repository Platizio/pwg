import test from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_LIST_NAME,
  DEFAULT_SYMBOLS,
  MAX_LISTS,
  MAX_SYMBOLS_PER_LIST,
  WATCHLISTS_KEY,
  addSymbol,
  cleanListName,
  createList,
  deleteList,
  listsContaining,
  moveSymbol,
  moveSymbolBy,
  nextListName,
  normalizeSymbol,
  parseSymbolParam,
  readStored,
  rememberNames,
  removeSymbol,
  renameList,
  seedState,
  serializeState,
  setActiveList,
  setSymbolInList,
  type WatchlistState,
} from "../lib/market/watchlists.ts";
import { INSTRUMENTS } from "../lib/market/instruments.ts";

/* The watchlists are the reader's own data, kept in their browser. Everything
 * that changes them is a pure function of the old state, so the rules — the
 * limits, the refusals, what an edit to one list may never do to another — are
 * held here rather than trusted to the components that call them. */

const seeded = (): WatchlistState => seedState();
const listOf = (state: WatchlistState, id = state.activeId) =>
  state.lists.find((l) => l.id === id)!;

/* ---- the seed ---------------------------------------------------------- */

test("the seed is one list named My watchlist holding exactly the sidebar's six stocks", () => {
  const state = seeded();
  assert.equal(state.version, 1);
  assert.equal(state.lists.length, 1);
  assert.equal(state.lists[0].name, DEFAULT_LIST_NAME);
  assert.equal(DEFAULT_LIST_NAME, "My watchlist");
  assert.equal(state.activeId, state.lists[0].id);
  /* Same names, same order: nothing the sidebar showed yesterday may vanish. */
  assert.deepEqual(
    state.lists[0].symbols,
    INSTRUMENTS.map((i) => i.id),
  );
  assert.deepEqual([...DEFAULT_SYMBOLS], INSTRUMENTS.map((i) => i.id));
});

test("each seed is a fresh object, so one caller's edit cannot leak into another's", () => {
  const a = seeded();
  const b = seeded();
  a.lists[0].symbols.push("ZZZ");
  assert.equal(b.lists[0].symbols.includes("ZZZ"), false);
});

test("the storage key is versioned", () => {
  assert.equal(WATCHLISTS_KEY, "pwg.watchlists.v1");
});

/* ---- symbols and names ------------------------------------------------- */

test("symbols are trimmed and upper-cased, and anything that cannot be a ticker is refused", () => {
  assert.equal(normalizeSymbol(" aapl "), "AAPL");
  assert.equal(normalizeSymbol("brk.b"), "BRK.B");
  assert.equal(normalizeSymbol("ABR-D"), "ABR-D");
  assert.equal(normalizeSymbol("ACHR+"), "ACHR+");
  assert.equal(normalizeSymbol(""), null);
  assert.equal(normalizeSymbol("   "), null);
  assert.equal(normalizeSymbol("AAPL MSFT"), null);
  assert.equal(normalizeSymbol("<script>"), null);
  assert.equal(normalizeSymbol("A".repeat(17)), null);
  assert.equal(normalizeSymbol(42), null);
  assert.equal(normalizeSymbol(null), null);
});

test("list names are trimmed, collapsed and bounded; an empty one is refused", () => {
  assert.equal(cleanListName("  Tech   picks "), "Tech picks");
  assert.equal(cleanListName(""), null);
  assert.equal(cleanListName("    "), null);
  assert.equal(cleanListName("x".repeat(80))?.length, 40);
  assert.equal(cleanListName(7 as unknown as string), null);
});

/* ---- lists ------------------------------------------------------------- */

test("creating a list adds it empty and makes it the active one", () => {
  const out = createList(seeded(), "Semis", "l-semis");
  assert.equal(out.error, null);
  assert.equal(out.state.lists.length, 2);
  assert.equal(out.state.activeId, "l-semis");
  assert.deepEqual(listOf(out.state).symbols, []);
  assert.equal(listOf(out.state).name, "Semis");
});

test("a list name already in use is refused, whatever its case", () => {
  const out = createList(seeded(), "my WATCHLIST", "l-2");
  assert.equal(out.error, "duplicate-name");
  assert.equal(out.state.lists.length, 1);
});

test("an empty list name is refused", () => {
  const out = createList(seeded(), "   ", "l-2");
  assert.equal(out.error, "invalid-name");
});

test("no more than twenty lists", () => {
  let state = seeded();
  for (let i = 2; i <= MAX_LISTS; i += 1) {
    const out = createList(state, `List ${i}`, `l-${i}`);
    assert.equal(out.error, null);
    state = out.state;
  }
  assert.equal(state.lists.length, MAX_LISTS);
  const refused = createList(state, "One too many", "l-over");
  assert.equal(refused.error, "too-many-lists");
  assert.equal(refused.state, state);
});

test("a duplicate id is refused rather than silently shadowing a list", () => {
  const first = createList(seeded(), "A", "l-a").state;
  const out = createList(first, "B", "l-a");
  assert.equal(out.error, "invalid-id");
});

test("renaming changes only the name", () => {
  const state = seeded();
  const id = state.lists[0].id;
  const out = renameList(state, id, "Core");
  assert.equal(out.error, null);
  assert.equal(listOf(out.state, id).name, "Core");
  assert.deepEqual(listOf(out.state, id).symbols, state.lists[0].symbols);
});

test("renaming a list to its own name in a different case is allowed", () => {
  const state = seeded();
  const out = renameList(state, state.lists[0].id, "MY WATCHLIST");
  assert.equal(out.error, null);
  assert.equal(out.state.lists[0].name, "MY WATCHLIST");
});

test("renaming to another list's name is refused", () => {
  const two = createList(seeded(), "Semis", "l-semis").state;
  const out = renameList(two, "l-semis", "My watchlist");
  assert.equal(out.error, "duplicate-name");
});

test("renaming a list that does not exist says so", () => {
  assert.equal(renameList(seeded(), "nope", "X").error, "not-found");
});

test("deleting a list removes it and moves the active list to a neighbour", () => {
  let state = createList(seeded(), "B", "l-b").state;
  state = createList(state, "C", "l-c").state;
  state = setActiveList(state, "l-b").state;
  const out = deleteList(state, "l-b");
  assert.equal(out.error, null);
  assert.deepEqual(
    out.state.lists.map((l) => l.id),
    [state.lists[0].id, "l-c"],
  );
  /* The one that took its place, not a jump back to the top. */
  assert.equal(out.state.activeId, "l-c");
});

test("deleting the last list in the order hands the active list to the one before it", () => {
  let state = createList(seeded(), "B", "l-b").state;
  const out = deleteList(state, "l-b");
  assert.equal(out.state.activeId, state.lists[0].id);
  state = out.state;
  assert.equal(state.lists.length, 1);
});

test("deleting an inactive list leaves the active one alone", () => {
  let state = createList(seeded(), "B", "l-b").state;
  const home = state.lists[0].id;
  state = setActiveList(state, home).state;
  const out = deleteList(state, "l-b");
  assert.equal(out.state.activeId, home);
});

test("the only list cannot be deleted", () => {
  const state = seeded();
  const out = deleteList(state, state.lists[0].id);
  assert.equal(out.error, "last-list");
  assert.equal(out.state, state);
});

test("switching to a list that does not exist is refused", () => {
  const state = seeded();
  const out = setActiveList(state, "ghost");
  assert.equal(out.error, "not-found");
  assert.equal(out.state.activeId, state.activeId);
});

test("the next default name skips names already taken", () => {
  let state = seeded();
  assert.equal(nextListName(state), "Watchlist 2");
  state = createList(state, "Watchlist 2", "l-2").state;
  assert.equal(nextListName(state), "Watchlist 3");
});

/* ---- symbols in a list ------------------------------------------------- */

test("adding a symbol appends it, normalised, and remembers its name", () => {
  const state = seeded();
  const out = addSymbol(state, state.activeId, " goog ", "Alphabet");
  assert.equal(out.error, null);
  assert.equal(listOf(out.state).symbols.at(-1), "GOOG");
  assert.equal(out.state.names.GOOG, "Alphabet");
});

test("adding a symbol already in the list is a no-op, not a duplicate", () => {
  const state = seeded();
  const out = addSymbol(state, state.activeId, "aapl");
  assert.equal(out.error, "already-listed");
  assert.equal(out.state, state);
  assert.equal(listOf(out.state).symbols.filter((s) => s === "AAPL").length, 1);
});

test("adding a malformed symbol is refused", () => {
  const state = seeded();
  assert.equal(addSymbol(state, state.activeId, "not a ticker").error, "invalid-symbol");
});

test("a list holds at most a hundred symbols", () => {
  let state = createList(seeded(), "Big", "l-big").state;
  for (let i = 0; i < MAX_SYMBOLS_PER_LIST; i += 1) {
    const out = addSymbol(state, "l-big", `S${i}`);
    assert.equal(out.error, null, `symbol ${i}`);
    state = out.state;
  }
  const out = addSymbol(state, "l-big", "ONEMORE");
  assert.equal(out.error, "list-full");
  assert.equal(listOf(out.state, "l-big").symbols.length, MAX_SYMBOLS_PER_LIST);
});

test("an edit to one list never touches another", () => {
  let state = createList(seeded(), "B", "l-b").state;
  const home = state.lists[0].id;
  state = addSymbol(state, "l-b", "AAPL").state;
  state = removeSymbol(state, "l-b", "AAPL").state;
  assert.equal(listOf(state, home).symbols.includes("AAPL"), true);
});

test("removing a symbol takes it out of that list only", () => {
  const state = seeded();
  const out = removeSymbol(state, state.activeId, "tsla");
  assert.equal(out.error, null);
  assert.equal(listOf(out.state).symbols.includes("TSLA"), false);
  assert.equal(listOf(out.state).symbols.length, 5);
});

test("removing a symbol that is not there changes nothing", () => {
  const state = seeded();
  const out = removeSymbol(state, state.activeId, "ZZZ");
  assert.equal(out.state, state);
});

test("a name is forgotten once no list holds its symbol", () => {
  let state = addSymbol(seeded(), seeded().activeId, "GOOG", "Alphabet").state;
  state = removeSymbol(state, state.activeId, "GOOG").state;
  assert.equal("GOOG" in state.names, false);
});

test("moving by index reorders, clamped to the ends", () => {
  const state = seeded();
  const moved = moveSymbol(state, state.activeId, 0, 2).state;
  assert.deepEqual(listOf(moved).symbols.slice(0, 3), ["TSLA", "NVDA", "AAPL"]);
  const clamped = moveSymbol(state, state.activeId, 5, 99).state;
  assert.equal(clamped, state, "already last: nothing to do");
  const toTop = moveSymbol(state, state.activeId, 5, -4).state;
  assert.equal(listOf(toTop).symbols[0], "MSFT");
});

test("moving up and down by one, for the keyboard", () => {
  const state = seeded();
  const down = moveSymbolBy(state, state.activeId, "AAPL", 1).state;
  assert.deepEqual(listOf(down).symbols.slice(0, 2), ["TSLA", "AAPL"]);
  const up = moveSymbolBy(down, down.activeId, "AAPL", -1).state;
  assert.deepEqual(listOf(up).symbols, listOf(state).symbols);
  /* The first cannot go higher. */
  assert.equal(moveSymbolBy(state, state.activeId, "AAPL", -1).state, state);
});

test("setting a symbol in or out of a list is idempotent", () => {
  const state = seeded();
  const id = state.activeId;
  assert.equal(setSymbolInList(state, id, "AAPL", true).state, state);
  const out = setSymbolInList(state, id, "AAPL", false).state;
  assert.equal(listOf(out).symbols.includes("AAPL"), false);
  assert.equal(setSymbolInList(out, id, "AAPL", false).state, out);
});

test("which lists hold a symbol", () => {
  let state = createList(seeded(), "B", "l-b").state;
  const home = state.lists[0].id;
  state = addSymbol(state, "l-b", "AAPL").state;
  assert.deepEqual(listsContaining(state, "aapl"), [home, "l-b"]);
  assert.deepEqual(listsContaining(state, "ZZZ"), []);
});

test("remembering names only writes names for listed symbols, and only when they change", () => {
  const state = seeded();
  const same = rememberNames(state, {});
  assert.equal(same, state);
  const named = rememberNames(state, { AAPL: "Apple", NOTLISTED: "Nope" });
  assert.equal(named.names.AAPL, "Apple");
  assert.equal("NOTLISTED" in named.names, false);
  assert.equal(rememberNames(named, { AAPL: "Apple" }), named);
});

/* ---- storage ----------------------------------------------------------- */

test("a state survives a round trip through storage", () => {
  let state = createList(seeded(), "Semis", "l-semis").state;
  state = addSymbol(state, "l-semis", "AMD", "AMD").state;
  const back = readStored(serializeState(state));
  assert.deepEqual(back, state);
});

test("nothing stored, or garbage stored, reads as nothing — never a throw", () => {
  assert.equal(readStored(null), null);
  assert.equal(readStored(""), null);
  assert.equal(readStored("{not json"), null);
  assert.equal(readStored("42"), null);
  assert.equal(readStored("null"), null);
  assert.equal(readStored(JSON.stringify({ version: 1, lists: [] })), null);
  assert.equal(readStored(JSON.stringify({ version: 1, lists: "x" })), null);
});

test("a version from the future is not read (and so is never overwritten by a reader)", () => {
  assert.equal(
    readStored(JSON.stringify({ version: 2, lists: [{ id: "a", name: "A", symbols: [] }] })),
    null,
  );
});

test("reading repairs what it can: bad symbols, duplicates, over-long lists, a missing active id", () => {
  const raw = {
    version: 1,
    activeId: "gone",
    lists: [
      {
        id: "a",
        name: "  Alpha  ",
        symbols: ["aapl", "AAPL", "not a ticker", 7, "msft", ...Array.from({ length: 120 }, (_, i) => `X${i}`)],
      },
      { id: "bad id!", name: "Broken", symbols: [] },
      { id: "b", name: "", symbols: [] },
      { id: "a", name: "Duplicate id", symbols: [] },
      "not a list",
    ],
    names: { AAPL: "Apple", ZZZ: "Not listed", MSFT: 12 },
  };
  const state = readStored(JSON.stringify(raw))!;
  assert.ok(state);
  /* A list with no usable name keeps its stocks under a stand-in name; one
     whose id is unusable or already taken cannot be addressed, so it goes. */
  assert.deepEqual(
    state.lists.map((l) => l.id),
    ["a", "b"],
  );
  assert.equal(state.lists[1].name, "Untitled list");
  assert.equal(state.lists[0].name, "Alpha");
  assert.deepEqual(state.lists[0].symbols.slice(0, 3), ["AAPL", "MSFT", "X0"]);
  assert.equal(state.lists[0].symbols.length, MAX_SYMBOLS_PER_LIST);
  assert.equal(state.activeId, "a");
  assert.deepEqual(state.names, { AAPL: "Apple" });
});

test("more than twenty stored lists are cut to twenty", () => {
  const raw = {
    version: 1,
    activeId: "l0",
    lists: Array.from({ length: 30 }, (_, i) => ({ id: `l${i}`, name: `L${i}`, symbols: [] })),
    names: {},
  };
  assert.equal(readStored(JSON.stringify(raw))!.lists.length, MAX_LISTS);
});

test("a bare array of tickers, the shape a hand edit would leave, migrates into the default list", () => {
  const state = readStored(JSON.stringify(["aapl", "nvda"]))!;
  assert.equal(state.lists.length, 1);
  assert.equal(state.lists[0].name, DEFAULT_LIST_NAME);
  assert.deepEqual(state.lists[0].symbols, ["AAPL", "NVDA"]);
});

/* ---- the quotes route's symbol parameter ------------------------------ */

test("the route's symbol list is normalised, de-duplicated, universe-checked and capped", () => {
  const tradable = new Set(["AAPL", "MSFT", "NVDA"]);
  const isTradable = (s: string) => tradable.has(s);
  assert.deepEqual(parseSymbolParam("aapl, msft,AAPL,,zzzz,<x>", isTradable), {
    symbols: ["AAPL", "MSFT"],
    refused: ["ZZZZ"],
  });
  assert.deepEqual(parseSymbolParam(null, isTradable), { symbols: [], refused: [] });
  const many = Array.from({ length: 80 }, (_, i) => `S${i}`).join(",");
  assert.equal(parseSymbolParam(many, () => true).symbols.length, 50);
  assert.equal(parseSymbolParam(many, () => true, 10).symbols.length, 10);
});
