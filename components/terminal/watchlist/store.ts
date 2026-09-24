import { useSyncExternalStore } from "react";
import {
  WATCHLISTS_KEY,
  addSymbol,
  createList,
  deleteList,
  moveSymbol,
  moveSymbolBy,
  readStored,
  rememberNames,
  removeSymbol,
  renameList,
  seedState,
  serializeState,
  setActiveList,
  setSymbolInList,
  type Outcome,
  type WatchlistState,
} from "@/lib/market/watchlists";

/* The reader's watchlists, held once for the whole tab.
 *
 * An external store rather than React state or a context, for three reasons.
 * The sidebar is mounted twice (the rail and, below `lg`, the drawer), the
 * instrument header and the watchlist page read the same lists, and none of
 * them share a parent this feature owns — so the state lives beside them and
 * each subscribes. `useSyncExternalStore` also gives hydration its answer for
 * free: the server snapshot is the seed, React uses it for the first client
 * render too, and the saved lists are swapped in straight after — identical
 * markup on both sides, no mismatch, no effect-and-setState cascade.
 *
 * And the storage event arrives here once per tab, so an edit in one tab
 * shows in every other without anyone polling.
 *
 * Every read and write of localStorage is wrapped: private windows, blocked
 * site data and full quotas all throw, and the feature has to keep working for
 * the session in memory when they do.
 */

/* One object for the server render and hydration. Never mutated — every
   operation in lib/market/watchlists.ts returns a new state. */
const SEED: WatchlistState = seedState();

let current: WatchlistState | null = null;
const listeners = new Set<() => void>();

function load(): WatchlistState {
  try {
    return readStored(window.localStorage.getItem(WATCHLISTS_KEY)) ?? SEED;
  } catch {
    return SEED;
  }
}

function read(): WatchlistState {
  if (current === null) current = load();
  return current;
}

function emit() {
  for (const listener of listeners) listener();
}

/* Another tab wrote. `key === null` is localStorage.clear(). A value this
   build cannot read (a newer version) leaves the lists as they are rather
   than resetting them to the seed on a technicality. */
function onStorage(event: StorageEvent) {
  if (event.key !== null && event.key !== WATCHLISTS_KEY) return;
  if (event.key === null || event.newValue === null) current = SEED;
  else current = readStored(event.newValue) ?? current;
  emit();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (listeners.size === 1) window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) window.removeEventListener("storage", onStorage);
  };
}

function commit(next: WatchlistState) {
  if (next === current) return;
  current = next;
  try {
    window.localStorage.setItem(WATCHLISTS_KEY, serializeState(next));
  } catch {
    /* Storage refused (private mode, quota). The edit still holds for this
       tab, which beats refusing to make it. */
  }
  emit();
}

function apply(outcome: Outcome): Outcome {
  if (outcome.error === null) commit(outcome.state);
  return outcome;
}

/* Ids are minted here rather than in the pure module so its functions stay
   deterministic under test. Time plus randomness is ample for twenty lists in
   one browser; createList refuses a collision anyway. */
function mintId(): string {
  const random = Math.random().toString(36).slice(2, 8);
  return `l-${Date.now().toString(36)}-${random}`;
}

/** The lists. The seed on the server and during hydration, then the saved ones. */
export function useWatchlists(): WatchlistState {
  return useSyncExternalStore(subscribe, read, () => SEED);
}

/** Every edit, applied and persisted. Each returns why it was refused, if it was. */
export const watchlists = {
  create: (name: string) => apply(createList(read(), name, mintId())),
  rename: (id: string, name: string) => apply(renameList(read(), id, name)),
  remove: (id: string) => apply(deleteList(read(), id)),
  activate: (id: string) => apply(setActiveList(read(), id)),
  add: (listId: string, symbol: string, name?: string | null) =>
    apply(addSymbol(read(), listId, symbol, name)),
  drop: (listId: string, symbol: string) => apply(removeSymbol(read(), listId, symbol)),
  set: (listId: string, symbol: string, on: boolean, name?: string | null) =>
    apply(setSymbolInList(read(), listId, symbol, on, name)),
  move: (listId: string, from: number, to: number) => apply(moveSymbol(read(), listId, from, to)),
  moveBy: (listId: string, symbol: string, delta: number) =>
    apply(moveSymbolBy(read(), listId, symbol, delta)),
  /** Company names learned from a price answer; written only if any changed. */
  learn: (names: Record<string, string>) => commit(rememberNames(read(), names)),
};

/** A refusal, in a sentence a reader can act on. */
export function explain(error: Outcome["error"]): string | null {
  switch (error) {
    case null:
      return null;
    case "too-many-lists":
      return "You can keep up to 20 lists. Delete one to make room.";
    case "list-full":
      return "This list is full at 100 stocks. Remove one, or start another list.";
    case "duplicate-name":
      return "You already have a list with that name.";
    case "invalid-name":
      return "Give the list a name.";
    case "last-list":
      return "You need at least one list. Rename it or empty it instead.";
    case "already-listed":
      return "Already in this list.";
    case "invalid-symbol":
      return "That is not a ticker this terminal can list.";
    case "not-found":
      return "That list no longer exists. It may have been deleted in another tab.";
    case "invalid-id":
      return "Something went wrong creating the list. Try again.";
  }
}
