/* The reader's watchlists, as data.
 *
 * Several named lists of tickers, kept in the reader's own browser under one
 * versioned key. Every function here is pure — old state in, new state out —
 * so the rules that matter (the limits, what a bad write may never do, what a
 * tampered or half-written storage entry turns into) are tested rather than
 * trusted to the components that call them.
 *
 * NO IMPORTS, on purpose. The sidebar, the instrument header and the
 * watchlist page all load this in the browser, and the route that prices the
 * lists loads it on the server; nothing here may drag the 2.4 MB symbol master
 * (lib/market/universe.ts) into a client bundle. Whether a symbol is in the
 * tradable universe is therefore a question the CALLER answers — the route
 * checks the master, and the browser only ever adds symbols it was handed by
 * the universe (a search result, or the instrument page it is standing on).
 *
 * Every operation returns an Outcome. `state` is the SAME object when nothing
 * changed, so a caller can skip a storage write by identity alone, and `error`
 * says why a refused edit was refused in words the UI can turn into a
 * sentence.
 */

export const WATCHLISTS_KEY = "pwg.watchlists.v1";
export const WATCHLISTS_VERSION = 1;

export const MAX_LISTS = 20;
export const MAX_SYMBOLS_PER_LIST = 100;
export const MAX_LIST_NAME = 40;
/** A remembered company name longer than this is not a name. */
const MAX_REMEMBERED_NAME = 80;

export const DEFAULT_LIST_ID = "default";
export const DEFAULT_LIST_NAME = "My watchlist";
/** Used when a stored list has lost its name, so its stocks are not lost too. */
export const UNTITLED_LIST_NAME = "Untitled list";

/* The six names the sidebar has always shown, in the order it shows them
   (lib/market/instruments.ts). The first visit seeds exactly these, so a
   reader who never opens the watchlist page sees nothing change. A test holds
   this list to that file, because it cannot be imported from here without
   shipping the whole authored instrument set to every page. */
export const DEFAULT_SYMBOLS = ["AAPL", "TSLA", "NVDA", "AMZN", "SPOT", "MSFT"] as const;

export type Watchlist = {
  id: string;
  name: string;
  symbols: string[];
};

export type WatchlistState = {
  version: 1;
  /** The list the sidebar shows. Always the id of a list in `lists`. */
  activeId: string;
  /** Never empty: the last list cannot be deleted. */
  lists: Watchlist[];
  /* Display names for listed symbols, so a row can name its company the moment
     the page hydrates instead of waiting on a price request. Only symbols that
     some list still holds are kept. */
  names: Record<string, string>;
};

export type WatchlistError =
  | "invalid-symbol"
  | "invalid-name"
  | "invalid-id"
  | "duplicate-name"
  | "already-listed"
  | "list-full"
  | "too-many-lists"
  | "last-list"
  | "not-found";

export type Outcome = { state: WatchlistState; error: WatchlistError | null };

const ok = (state: WatchlistState): Outcome => ({ state, error: null });
const refuse = (state: WatchlistState, error: WatchlistError): Outcome => ({ state, error });

/* ------------------------------------------------------------------ */
/* Shapes                                                              */
/* ------------------------------------------------------------------ */

/* The tradable master's own alphabet is A-Z plus `. + -` (BRK.B, ABR-D,
   ACHR+), nine characters at most. Digits are allowed for safety; sixteen is
   the store's own column width. This is a SHAPE check — membership of the
   universe is decided by whoever holds the master. */
const SYMBOL = /^[A-Z0-9][A-Z0-9.+-]{0,15}$/;
const LIST_ID = /^[A-Za-z0-9_-]{1,40}$/;

/** A ticker in the one spelling everything compares, or null. */
export function normalizeSymbol(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const symbol = raw.trim().toUpperCase();
  return SYMBOL.test(symbol) ? symbol : null;
}

/** A list name trimmed, collapsed and bounded, or null when nothing is left. */
export function cleanListName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const name = raw.replace(/\s+/g, " ").trim().slice(0, MAX_LIST_NAME).trim();
  return name.length > 0 ? name : null;
}

export const isListId = (raw: unknown): raw is string =>
  typeof raw === "string" && LIST_ID.test(raw);

/* ------------------------------------------------------------------ */
/* The seed                                                            */
/* ------------------------------------------------------------------ */

/** The first-visit state. A fresh object every call. */
export function seedState(): WatchlistState {
  return {
    version: WATCHLISTS_VERSION,
    activeId: DEFAULT_LIST_ID,
    lists: [{ id: DEFAULT_LIST_ID, name: DEFAULT_LIST_NAME, symbols: [...DEFAULT_SYMBOLS] }],
    names: {},
  };
}

/* ------------------------------------------------------------------ */
/* Lists                                                               */
/* ------------------------------------------------------------------ */

const nameTaken = (state: WatchlistState, name: string, except?: string) =>
  state.lists.some((l) => l.id !== except && l.name.toLowerCase() === name.toLowerCase());

/** "Watchlist 2", "Watchlist 3"… — the first one nobody has used. */
export function nextListName(state: WatchlistState): string {
  for (let n = state.lists.length + 1; n < state.lists.length + MAX_LISTS + 2; n += 1) {
    const name = `Watchlist ${n}`;
    if (!nameTaken(state, name)) return name;
  }
  return `Watchlist ${Date.now() % 1000}`;
}

/** A new empty list, which becomes the active one. The caller mints the id. */
export function createList(state: WatchlistState, rawName: string, id: string): Outcome {
  if (state.lists.length >= MAX_LISTS) return refuse(state, "too-many-lists");
  if (!isListId(id) || state.lists.some((l) => l.id === id)) return refuse(state, "invalid-id");
  const name = cleanListName(rawName);
  if (name === null) return refuse(state, "invalid-name");
  if (nameTaken(state, name)) return refuse(state, "duplicate-name");
  return ok({
    ...state,
    activeId: id,
    lists: [...state.lists, { id, name, symbols: [] }],
  });
}

export function renameList(state: WatchlistState, id: string, rawName: string): Outcome {
  const list = state.lists.find((l) => l.id === id);
  if (!list) return refuse(state, "not-found");
  const name = cleanListName(rawName);
  if (name === null) return refuse(state, "invalid-name");
  if (nameTaken(state, name, id)) return refuse(state, "duplicate-name");
  if (name === list.name) return ok(state);
  return ok({
    ...state,
    lists: state.lists.map((l) => (l.id === id ? { ...l, name } : l)),
  });
}

/**
 * Remove a list. The last one cannot go — the sidebar always has a list to
 * show, and "empty it" is a clearer thing to offer than "you have no lists".
 *
 * When the active list is the one removed, the list that slides into its place
 * becomes active (or the one before it, at the end): the reader's eye stays
 * where it was rather than being thrown back to the top.
 */
export function deleteList(state: WatchlistState, id: string): Outcome {
  const index = state.lists.findIndex((l) => l.id === id);
  if (index < 0) return refuse(state, "not-found");
  if (state.lists.length <= 1) return refuse(state, "last-list");
  const lists = state.lists.filter((l) => l.id !== id);
  const activeId =
    state.activeId === id ? lists[Math.min(index, lists.length - 1)].id : state.activeId;
  return ok(pruneNames({ ...state, lists, activeId }));
}

export function setActiveList(state: WatchlistState, id: string): Outcome {
  if (!state.lists.some((l) => l.id === id)) return refuse(state, "not-found");
  if (state.activeId === id) return ok(state);
  return ok({ ...state, activeId: id });
}

/* ------------------------------------------------------------------ */
/* Symbols                                                             */
/* ------------------------------------------------------------------ */

function withList(
  state: WatchlistState,
  id: string,
  edit: (symbols: string[]) => string[] | WatchlistError,
): Outcome {
  const list = state.lists.find((l) => l.id === id);
  if (!list) return refuse(state, "not-found");
  const next = edit(list.symbols);
  if (typeof next === "string") return refuse(state, next);
  if (next === list.symbols) return ok(state);
  return ok({
    ...state,
    lists: state.lists.map((l) => (l.id === id ? { ...l, symbols: next } : l)),
  });
}

const cleanRememberedName = (raw: unknown): string | null => {
  if (typeof raw !== "string") return null;
  const name = raw.replace(/\s+/g, " ").trim();
  return name.length > 0 && name.length <= MAX_REMEMBERED_NAME ? name : null;
};

/** Append a symbol to a list. `name`, when given, is remembered for display. */
export function addSymbol(
  state: WatchlistState,
  listId: string,
  rawSymbol: string,
  name?: string | null,
): Outcome {
  const symbol = normalizeSymbol(rawSymbol);
  if (symbol === null) return refuse(state, "invalid-symbol");
  const out = withList(state, listId, (symbols) => {
    if (symbols.includes(symbol)) return "already-listed";
    if (symbols.length >= MAX_SYMBOLS_PER_LIST) return "list-full";
    return [...symbols, symbol];
  });
  if (out.error !== null) return out;
  const clean = cleanRememberedName(name);
  if (clean === null || out.state.names[symbol] === clean) return out;
  return ok({ ...out.state, names: { ...out.state.names, [symbol]: clean } });
}

export function removeSymbol(state: WatchlistState, listId: string, rawSymbol: string): Outcome {
  const symbol = normalizeSymbol(rawSymbol);
  if (symbol === null) return refuse(state, "invalid-symbol");
  const out = withList(state, listId, (symbols) =>
    symbols.includes(symbol) ? symbols.filter((s) => s !== symbol) : symbols,
  );
  return out.state === state ? out : ok(pruneNames(out.state));
}

/** In or out, whichever `on` says. Idempotent, for a toggle. */
export function setSymbolInList(
  state: WatchlistState,
  listId: string,
  rawSymbol: string,
  on: boolean,
  name?: string | null,
): Outcome {
  if (!on) return removeSymbol(state, listId, rawSymbol);
  const out = addSymbol(state, listId, rawSymbol, name);
  return out.error === "already-listed" ? ok(state) : out;
}

/** Move the symbol at `from` to `to`, clamped to the ends of the list. */
export function moveSymbol(
  state: WatchlistState,
  listId: string,
  from: number,
  to: number,
): Outcome {
  return withList(state, listId, (symbols) => {
    if (!Number.isInteger(from) || from < 0 || from >= symbols.length) return symbols;
    const target = Math.max(0, Math.min(symbols.length - 1, Math.trunc(to)));
    if (target === from) return symbols;
    const next = [...symbols];
    const [moved] = next.splice(from, 1);
    next.splice(target, 0, moved);
    return next;
  });
}

/** Up (-1) or down (+1) by one — the keyboard's reorder. */
export function moveSymbolBy(
  state: WatchlistState,
  listId: string,
  rawSymbol: string,
  delta: number,
): Outcome {
  const symbol = normalizeSymbol(rawSymbol);
  const list = state.lists.find((l) => l.id === listId);
  if (!list) return refuse(state, "not-found");
  if (symbol === null) return refuse(state, "invalid-symbol");
  const from = list.symbols.indexOf(symbol);
  if (from < 0) return ok(state);
  return moveSymbol(state, listId, from, from + delta);
}

/** The ids of every list holding a symbol, in list order. */
export function listsContaining(state: WatchlistState, rawSymbol: string): string[] {
  const symbol = normalizeSymbol(rawSymbol);
  if (symbol === null) return [];
  return state.lists.filter((l) => l.symbols.includes(symbol)).map((l) => l.id);
}

/** Every symbol in any list, first appearance first. */
export function allSymbols(state: WatchlistState): string[] {
  const seen = new Set<string>();
  for (const list of state.lists) for (const s of list.symbols) seen.add(s);
  return [...seen];
}

/* ------------------------------------------------------------------ */
/* Remembered names                                                    */
/* ------------------------------------------------------------------ */

function pruneNames(state: WatchlistState): WatchlistState {
  const listed = new Set(allSymbols(state));
  const keys = Object.keys(state.names);
  if (keys.every((k) => listed.has(k))) return state;
  const names: Record<string, string> = {};
  for (const k of keys) if (listed.has(k)) names[k] = state.names[k];
  return { ...state, names };
}

/**
 * Fold freshly learned company names in — from a price response, say. Only
 * symbols some list holds are kept, and the same object comes back when
 * nothing actually changed, so a caller can skip the storage write.
 */
export function rememberNames(
  state: WatchlistState,
  learned: Readonly<Record<string, string>>,
): WatchlistState {
  const listed = new Set(allSymbols(state));
  let names: Record<string, string> | null = null;
  for (const [rawSymbol, rawName] of Object.entries(learned)) {
    const symbol = normalizeSymbol(rawSymbol);
    const name = cleanRememberedName(rawName);
    if (symbol === null || name === null || !listed.has(symbol)) continue;
    if (state.names[symbol] === name) continue;
    names ??= { ...state.names };
    names[symbol] = name;
  }
  return names === null ? state : { ...state, names };
}

/* ------------------------------------------------------------------ */
/* Storage                                                             */
/* ------------------------------------------------------------------ */

export function serializeState(state: WatchlistState): string {
  return JSON.stringify(state);
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

function cleanSymbols(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  for (const item of raw) {
    const symbol = normalizeSymbol(item);
    if (symbol !== null) seen.add(symbol);
    if (seen.size >= MAX_SYMBOLS_PER_LIST) break;
  }
  return [...seen];
}

/**
 * A stored v1 document, validated field by field.
 *
 * Storage is untrusted: another tab mid-write, a browser extension, a reader
 * poking at devtools. Whatever can be repaired is (bad symbols dropped,
 * duplicates folded, over-long lists cut, a lost name replaced); a list that
 * cannot be addressed — no usable id, or one already taken — is dropped; and a
 * document with no usable list at all is not a state.
 */
function fromV1(raw: Record<string, unknown>): WatchlistState | null {
  if (!Array.isArray(raw.lists)) return null;

  const lists: Watchlist[] = [];
  const ids = new Set<string>();
  for (const item of raw.lists) {
    if (lists.length >= MAX_LISTS) break;
    if (!isRecord(item) || !isListId(item.id) || ids.has(item.id)) continue;
    ids.add(item.id);
    lists.push({
      id: item.id,
      name: cleanListName(item.name) ?? UNTITLED_LIST_NAME,
      symbols: cleanSymbols(item.symbols),
    });
  }
  if (lists.length === 0) return null;

  const activeId =
    typeof raw.activeId === "string" && ids.has(raw.activeId) ? raw.activeId : lists[0].id;

  const listed = new Set(lists.flatMap((l) => l.symbols));
  const names: Record<string, string> = {};
  if (isRecord(raw.names)) {
    for (const [key, value] of Object.entries(raw.names)) {
      const symbol = normalizeSymbol(key);
      const name = cleanRememberedName(value);
      if (symbol !== null && name !== null && listed.has(symbol)) names[symbol] = name;
    }
  }

  return { version: WATCHLISTS_VERSION, activeId, lists, names };
}

/**
 * Whatever was under the key, as a state — or null for "nothing usable",
 * which the caller answers with the seed.
 *
 * Null for a version this code does not know, too. A newer build may have
 * written it, and a reader that does not understand it must not rewrite it:
 * the store only writes on an edit, so an older tab leaves it alone.
 */
export function readStored(json: string | null | undefined): WatchlistState | null {
  if (!json) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return null;
  }
  /* A bare array of tickers — the shape a hand edit or an earlier sketch of
     this feature would leave — becomes the default list. */
  if (Array.isArray(raw)) {
    const symbols = cleanSymbols(raw);
    if (symbols.length === 0) return null;
    return {
      version: WATCHLISTS_VERSION,
      activeId: DEFAULT_LIST_ID,
      lists: [{ id: DEFAULT_LIST_ID, name: DEFAULT_LIST_NAME, symbols }],
      names: {},
    };
  }
  if (!isRecord(raw)) return null;
  if (raw.version === 1) return fromV1(raw);
  return null;
}

/* ------------------------------------------------------------------ */
/* The pricing route's parameter                                       */
/* ------------------------------------------------------------------ */

/** The most symbols one price request may name. One gateway call's worth. */
export const MAX_QUOTE_SYMBOLS = 50;

/**
 * `?symbols=` for the watchlist pricing route: normalised, de-duplicated, held
 * to the tradable universe and capped. What the universe refused is returned
 * rather than dropped in silence, so the page can say a name is not quotable
 * instead of printing a dash that looks like a quiet market.
 */
export function parseSymbolParam(
  raw: string | null,
  isTradable: (symbol: string) => boolean,
  max: number = MAX_QUOTE_SYMBOLS,
): { symbols: string[]; refused: string[] } {
  if (!raw) return { symbols: [], refused: [] };
  const symbols: string[] = [];
  const refused: string[] = [];
  const seen = new Set<string>();
  for (const part of raw.split(",")) {
    const symbol = normalizeSymbol(part);
    if (symbol === null || seen.has(symbol)) continue;
    seen.add(symbol);
    if (!isTradable(symbol)) {
      refused.push(symbol);
      continue;
    }
    if (symbols.length < max) symbols.push(symbol);
  }
  return { symbols, refused };
}
