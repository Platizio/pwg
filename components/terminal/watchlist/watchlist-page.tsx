"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { IconPlus } from "@/components/icons";
import { Card, Delta } from "@/components/ui/surface";
import { money } from "@/lib/market/format";
import { instrumentPath } from "@/lib/market/paths";
import { C } from "@/lib/tokens";
import { cn } from "@/lib/ui";
import {
  MAX_LISTS,
  MAX_SYMBOLS_PER_LIST,
  nextListName,
  type Watchlist,
} from "@/lib/market/watchlists";
import { AddBox, type Candidate } from "./add-box";
import { GlyphDown, GlyphGrip, GlyphPencil, GlyphTrash, GlyphUp } from "./glyphs";
import { lookOf, unpriced, useWatchFigures, type Figure, type SeedQuote } from "./quotes";
import { explain, useWatchlists, watchlists } from "./store";
import { useDismiss } from "./use-dismiss";

/** A search-corpus row, as the page's server render hands it down. */
export type CorpusQuote = Candidate & { price: number; chg: number };

const COUNT_FMT = new Intl.NumberFormat("en-US");

/* Dollars with a true minus, to match `pct` beside it. */
const signedMoney = (n: number) => `${n >= 0 ? "+" : "−"}${money(Math.abs(n))}`;

/**
 * Every watchlist, managed in one place.
 *
 * The lists run across the top as tabs — the one the rail is showing is the one
 * open here, and choosing another here changes the rail too, so there is one
 * idea of "the list I am looking at" rather than two. Under them, the open
 * list: its name and the things done to a whole list (rename, delete), the box
 * that adds to it, and the table of what it holds.
 */
export function WatchlistPage({ corpus }: { corpus: readonly CorpusQuote[] }) {
  const state = useWatchlists();
  const list = state.lists.find((l) => l.id === state.activeId) ?? state.lists[0];

  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const newInputId = useId();
  const newErrorId = useId();

  const bySymbol = useMemo(() => new Map(corpus.map((q) => [q.id, q])), [corpus]);

  /* On a phone the tabs are one row that scrolls sideways (see the strip
     below), so the open list's tab can be out of view — the eighth of eight,
     say, opened from the rail. It is brought in by scrolling the strip alone:
     scrollIntoView would also scroll the page to the strip, from wherever the
     reader was. From `sm` the strip is `display: contents`, has no box, and
     this does nothing. */
  const stripRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const strip = stripRef.current;
    const tab = document.getElementById(`tab-${list.id}`);
    if (!strip || !tab || strip.scrollWidth <= strip.clientWidth) return;
    const box = strip.getBoundingClientRect();
    const at = tab.getBoundingClientRect();
    const inset = 16;
    if (at.left < box.left + inset) strip.scrollLeft -= box.left + inset - at.left;
    else if (at.right > box.right - inset) strip.scrollLeft += at.right - (box.right - inset);
  }, [list.id]);

  const startCreate = () => {
    setDraft(nextListName(state));
    setCreateError(null);
    setCreating(true);
  };

  const submitCreate = (e: React.FormEvent) => {
    e.preventDefault();
    const out = watchlists.create(draft);
    if (out.error) {
      setCreateError(explain(out.error));
      return;
    }
    setCreating(false);
    setAnnouncement(`Created ${out.state.lists.at(-1)?.name ?? "a new list"}.`);
  };

  return (
    <main id="terminal-main" className="flex min-w-0 flex-col overflow-hidden lg:h-full">
      <header className="border-b border-rule-section px-4 py-5 sm:px-6 lg:px-7">
        <h1 className="font-serif text-[clamp(1.75rem,3vw,2.25rem)] leading-none">Watchlists</h1>
        <p className="mt-3 max-w-[62ch] text-[13.5px] leading-[1.7] text-ink-3">
          Keep the stocks you are watching in lists of your own. The list open here is the one in
          the sidebar.
        </p>
      </header>

      <div className="flex-1 px-4 pt-5 pb-12 sm:px-6 lg:overflow-y-auto lg:px-7">
        {/* ---- the lists ----

            Below `sm` the tabs and "New list" are ONE row that scrolls
            sideways, bled to the screen's edges and padded back to the
            gutter. Wrapped, eight lists stood four rows deep, ragged at the
            right, and pushed the list the reader came to see to the bottom of
            the first screen; at the twenty-list limit it would have been
            eleven rows. The vertical padding, cancelled by the margin, is room
            for a tab's focus ring inside the scroller's clip. From `sm` the
            strip is `display: contents` and the tabs wrap as they always
            have. */}
        <div className="flex flex-wrap items-center gap-2">
          <div
            ref={stripRef}
            className="no-scrollbar -mx-4 -my-1.5 flex w-[calc(100%+2rem)] flex-nowrap items-center gap-2 overflow-x-auto px-4 py-1.5 sm:contents"
          >
            <div
              role="tablist"
              aria-label="Your watchlists"
              className="flex flex-none items-center gap-2 sm:flex-initial sm:flex-wrap"
            >
              {state.lists.map((l) => {
                const on = l.id === list.id;
                return (
                  <button
                    key={l.id}
                    type="button"
                    role="tab"
                    id={`tab-${l.id}`}
                    aria-selected={on}
                    aria-controls="watchlist-panel"
                    onClick={() => watchlists.activate(l.id)}
                    onKeyDown={(e) => {
                      const i = state.lists.findIndex((x) => x.id === l.id);
                      const step =
                        e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
                      if (!step) return;
                      e.preventDefault();
                      const next = state.lists[(i + step + state.lists.length) % state.lists.length];
                      watchlists.activate(next.id);
                      document.getElementById(`tab-${next.id}`)?.focus();
                    }}
                    tabIndex={on ? 0 : -1}
                    className={cn(
                      "inline-flex min-h-11 max-w-[260px] flex-none items-center gap-2 rounded-full border px-4 text-[13px] font-medium transition-all duration-300 lg:min-h-10",
                      /* The themed CTA gradient, not the dark theme's champagne
                         written out: on the light page that one measured 1.09:1
                         against the ground and the active pill lost its edge. */
                      on
                        ? "border-transparent bg-[image:var(--cta-buy)] text-on-gold"
                        : "border-rule-control text-ink-2 hover:border-[rgba(var(--c-gold-rgb),0.34)] hover:text-ink",
                    )}
                  >
                    <span className="truncate">{l.name}</span>
                    <span
                      className={cn(
                        "font-mono text-[11.5px] tabular-nums",
                        on ? "text-on-gold/70" : "text-ink-3",
                      )}
                    >
                      {l.symbols.length}
                    </span>
                  </button>
                );
              })}
            </div>

            {!creating && (
              <button
                type="button"
                onClick={startCreate}
                disabled={state.lists.length >= MAX_LISTS}
                title={state.lists.length >= MAX_LISTS ? "You can keep up to 20 lists." : undefined}
                className="inline-flex min-h-11 flex-none items-center gap-2 rounded-full border border-dashed border-rule-control px-4 text-[13px] text-ink-2 transition-colors enabled:hover:border-gold enabled:hover:text-ink disabled:opacity-45 lg:min-h-10"
              >
                <IconPlus className="h-4 w-4 text-gold" />
                New list
              </button>
            )}
          </div>

          {/* A line of its own on a phone, outside the scrolling strip, with
              the field taking whatever Create and Cancel leave it — a fixed
              200px field used to push Cancel onto a row by itself. */}
          {creating && (
            <form
              onSubmit={submitCreate}
              className="flex w-full flex-wrap items-center gap-2 sm:w-auto"
            >
              <label htmlFor={newInputId} className="sr-only">
                New list name
              </label>
              <input
                id={newInputId}
                autoFocus
                value={draft}
                maxLength={40}
                onChange={(e) => {
                  setDraft(e.target.value);
                  setCreateError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Escape") setCreating(false);
                }}
                aria-invalid={createError !== null}
                aria-describedby={createError ? newErrorId : undefined}
                /* 16px below `sm`: iOS zooms the page into any field set
                   smaller the moment it takes focus. */
                className="min-h-11 min-w-0 flex-1 rounded-full border border-[rgba(var(--c-gold-rgb),0.34)] bg-transparent px-4 text-[16px] text-ink focus:border-gold focus:outline-none sm:w-[200px] sm:flex-none sm:text-[13px] lg:min-h-10"
              />
              <button
                type="submit"
                className="min-h-11 flex-none rounded-full bg-[image:var(--cta-buy)] px-4 text-[12.5px] font-bold text-on-gold transition-[filter] hover:brightness-[1.04] lg:min-h-10"
              >
                Create
              </button>
              <button
                type="button"
                onClick={() => setCreating(false)}
                className="min-h-11 flex-none rounded-full px-3 text-[12.5px] text-ink-3 transition-colors hover:text-ink lg:min-h-10"
              >
                Cancel
              </button>
              {createError && (
                <p id={newErrorId} role="alert" className="w-full text-[12.5px] text-down">
                  {createError}
                </p>
              )}
            </form>
          )}
        </div>

        <p className="mt-3 text-[12px] text-ink-3">
          {COUNT_FMT.format(state.lists.length)} of {MAX_LISTS} lists
        </p>

        <ListPanel list={list} lists={state.lists} names={state.names} bySymbol={bySymbol} corpus={corpus} onAnnounce={setAnnouncement} />

        <p className="mt-8 max-w-[70ch] text-[12.5px] leading-[1.75] text-ink-3">
          Your lists are kept in this browser, on this device, and are not tied to an account.
          Clearing site data removes them. Up to {MAX_LISTS} lists of {MAX_SYMBOLS_PER_LIST}{" "}
          stocks each. Nothing here is advice.
        </p>

        <p aria-live="polite" className="sr-only">
          {announcement}
        </p>
      </div>
    </main>
  );
}

/**
 * The open list: its title and whole-list actions, the add box, the table.
 */
function ListPanel({
  list,
  lists,
  names,
  bySymbol,
  corpus,
  onAnnounce,
}: {
  list: Watchlist;
  lists: readonly Watchlist[];
  names: Readonly<Record<string, string>>;
  bySymbol: ReadonlyMap<string, CorpusQuote>;
  corpus: readonly CorpusQuote[];
  onAnnounce: (text: string) => void;
}) {
  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState(list.name);
  const [renameError, setRenameError] = useState<string | null>(null);
  const [reorder, setReorder] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const renameId = useId();
  const renameErrorId = useId();

  /* A different list opened: whatever was half-done to the last one ends. */
  const [shownId, setShownId] = useState(list.id);
  if (shownId !== list.id) {
    setShownId(list.id);
    setRenaming(false);
    setRenameError(null);
    setAddError(null);
  }

  const seed = useMemo(() => {
    const out = new Map<string, SeedQuote>();
    for (const s of list.symbols) {
      const q = bySymbol.get(s);
      if (q) out.set(s, { price: q.price, chg: q.chg });
    }
    return out;
  }, [list.symbols, bySymbol]);
  const named = useCallback(
    (symbol: string) => symbol in names || bySymbol.has(symbol),
    [names, bySymbol],
  );
  const { figures } = useWatchFigures(list.symbols, seed, { seedCoversPrice: true, named });

  /* Names the corpus knows for this list's stocks are remembered in the list,
     so the rail can name them too without asking. Written only when one is
     actually new (rememberNames returns the same state otherwise). */
  useEffect(() => {
    const learned: Record<string, string> = {};
    for (const s of list.symbols) {
      const q = bySymbol.get(s);
      if (q && names[s] !== q.name) learned[s] = q.name;
    }
    if (Object.keys(learned).length > 0) watchlists.learn(learned);
  }, [list.symbols, bySymbol, names]);

  const listed = useMemo(() => new Set(list.symbols), [list.symbols]);
  const full = list.symbols.length >= MAX_SYMBOLS_PER_LIST;

  const saveName = (e: React.FormEvent) => {
    e.preventDefault();
    const out = watchlists.rename(list.id, nameDraft);
    if (out.error) {
      setRenameError(explain(out.error));
      return;
    }
    setRenaming(false);
    onAnnounce(`Renamed to ${nameDraft.trim()}.`);
  };

  const add = (c: Candidate) => {
    const out = watchlists.add(list.id, c.id, c.name);
    setAddError(explain(out.error));
    if (!out.error) onAnnounce(`Added ${c.id} to ${list.name}.`);
  };

  return (
    <Card as="section" className="mt-5 px-4 py-5 sm:px-6 sm:py-6">
      <div
        id="watchlist-panel"
        role="tabpanel"
        aria-labelledby={`tab-${list.id}`}
      >
        {/* `relative`: on a phone the delete confirmation anchors to this row,
            so it spans the card's content edges (see DeleteList). */}
        <div className="relative flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
          {renaming ? (
            <form onSubmit={saveName} className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
              <label htmlFor={renameId} className="sr-only">
                List name
              </label>
              <input
                id={renameId}
                autoFocus
                value={nameDraft}
                maxLength={40}
                onChange={(e) => {
                  setNameDraft(e.target.value);
                  setRenameError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Escape") setRenaming(false);
                }}
                aria-invalid={renameError !== null}
                aria-describedby={renameError ? renameErrorId : undefined}
                className="font-serif min-h-11 w-full max-w-[360px] min-w-0 rounded-[10px] border border-[rgba(var(--c-gold-rgb),0.34)] bg-transparent px-3 text-[22px] text-ink focus:border-gold focus:outline-none"
              />
              <button
                type="submit"
                className="min-h-11 rounded-full bg-[image:var(--cta-buy)] px-4 text-[12.5px] font-bold text-on-gold transition-[filter] hover:brightness-[1.04]"
              >
                Save
              </button>
              <button
                type="button"
                onClick={() => setRenaming(false)}
                className="min-h-11 rounded-full px-3 text-[12.5px] text-ink-3 transition-colors hover:text-ink"
              >
                Cancel
              </button>
              {renameError && (
                <p id={renameErrorId} role="alert" className="w-full text-[12.5px] text-down">
                  {renameError}
                </p>
              )}
            </form>
          ) : (
            <div className="min-w-0">
              {/* Wraps rather than truncating: this is the one page that
                  exists to manage lists, and a long name cut to "…infr…" left
                  the full name nowhere on screen. Names stop at 40
                  characters, so it is two lines at most. */}
              <h2 className="font-serif text-[26px] leading-tight [overflow-wrap:anywhere] text-ink">
                {list.name}
              </h2>
              <p className="mt-1 text-[12.5px] text-ink-3">
                {list.symbols.length} of {MAX_SYMBOLS_PER_LIST} stocks
              </p>
            </div>
          )}

          {!renaming && (
            /* The quiet actions carry 12px of padding each side. Wrapped
               under the title on a phone, that stood the first icon 12px in
               from the title's edge, so the row is pulled back by it; on one
               line with the title from `sm`, it is pulled out to the right so
               the last label ends on the content edge instead. */
            <div className="flex flex-wrap items-center gap-1 max-sm:-ml-3 sm:-mr-3">
              <QuietAction
                onClick={() => {
                  setNameDraft(list.name);
                  setRenameError(null);
                  setRenaming(true);
                }}
                icon={<GlyphPencil className="h-4 w-4" />}
              >
                Rename
              </QuietAction>
              {list.symbols.length > 1 && (
                <QuietAction
                  onClick={() => setReorder((v) => !v)}
                  pressed={reorder}
                  icon={<GlyphGrip className="h-4 w-4" />}
                  /* Held at the wider label's width, so "Reorder" giving way
                     to "Done" does not slide "Delete list" sideways. */
                  className="min-w-[5.875rem] justify-center md:hidden"
                >
                  {reorder ? "Done" : "Reorder"}
                </QuietAction>
              )}
              <DeleteList list={list} only={lists.length <= 1} onAnnounce={onAnnounce} />
            </div>
          )}
        </div>

        <div className="mt-5 max-w-[520px]">
          <AddBox
            corpus={corpus}
            listName={list.name}
            listed={listed}
            full={full}
            onAdd={add}
          />
          {addError && (
            <p role="alert" className="mt-2 px-1 text-[12.5px] text-down">
              {addError}
            </p>
          )}
        </div>

        {list.symbols.length === 0 ? (
          <EmptyList name={list.name} />
        ) : (
          <SymbolTable
            list={list}
            names={names}
            bySymbol={bySymbol}
            figures={figures}
            reorder={reorder}
            onAnnounce={onAnnounce}
          />
        )}
      </div>
    </Card>
  );
}

function QuietAction({
  onClick,
  icon,
  pressed,
  className,
  children,
}: {
  onClick: () => void;
  icon: React.ReactNode;
  pressed?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={pressed}
      className={cn(
        "inline-flex min-h-11 items-center gap-2 rounded-full px-3 text-[12.5px] transition-colors lg:min-h-9",
        pressed
          ? "bg-[rgba(var(--c-gold-rgb),0.1)] text-ink"
          : "text-ink-3 hover:bg-[rgba(var(--c-gold-rgb),0.06)] hover:text-ink",
        className,
      )}
    >
      <span className="text-gold">{icon}</span>
      {children}
    </button>
  );
}

/**
 * Delete, behind a confirmation that names what goes with it.
 *
 * Inline rather than a modal: nothing else on the page needs to stop, and the
 * question sits beside the button that asked it.
 */
function DeleteList({
  list,
  only,
  onAnnounce,
}: {
  list: Watchlist;
  only: boolean;
  onAnnounce: (text: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const close = useCallback(() => setOpen(false), []);
  useDismiss(open, close, rootRef, triggerRef);

  const count = list.symbols.length;

  return (
    /* Positioned only from `sm`. On a phone the confirmation anchors to the
       card's header row instead (the nearest positioned box above this), so
       it runs edge to edge of the card's content; hung from this button's
       right edge it floated at 30–330, on neither the card's edges nor the
       page's. */
    <div ref={rootRef} className="sm:relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={only}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        title={only ? "You need at least one list. Rename it or empty it instead." : undefined}
        className="inline-flex min-h-11 items-center gap-2 rounded-full px-3 text-[12.5px] text-ink-3 transition-colors enabled:hover:bg-[rgba(var(--c-down-rgb),0.08)] enabled:hover:text-down disabled:cursor-not-allowed disabled:opacity-45 lg:min-h-9"
      >
        <GlyphTrash className="h-4 w-4" />
        Delete list
      </button>

      {open && (
        <div className="absolute inset-x-0 top-[calc(100%+8px)] z-30 sm:left-auto sm:w-[min(300px,calc(100vw-48px))]">
          <div
            id={panelId}
            role="alertdialog"
            aria-labelledby={`${panelId}-title`}
            aria-describedby={`${panelId}-body`}
            className="card edge-lit p-4 shadow-[0_18px_36px_-12px_rgba(var(--c-shadow-rgb),0.85)]"
          >
            <p id={`${panelId}-title`} className="text-[14px] font-medium text-ink">
              Delete “{list.name}”?
            </p>
            <p id={`${panelId}-body`} className="mt-1.5 text-[12.5px] leading-[1.6] text-ink-3">
              {count === 0
                ? "The list is empty. This cannot be undone."
                : `Its ${count} ${count === 1 ? "stock goes" : "stocks go"} with it. This cannot be undone.`}
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                autoFocus
                onClick={() => {
                  setOpen(false);
                  triggerRef.current?.focus();
                }}
                className="min-h-11 rounded-full px-4 text-[12.5px] text-ink-2 transition-colors hover:text-ink lg:min-h-10"
              >
                Keep it
              </button>
              <button
                type="button"
                onClick={() => {
                  const out = watchlists.remove(list.id);
                  setOpen(false);
                  if (out.error) return;
                  onAnnounce(`Deleted ${list.name}.`);
                  /* This button goes with the list, and focus left on a
                     removed element falls to <body> — the top of the
                     document for a keyboard or switch user. It goes to the
                     tab of the list that is open now. */
                  const next = out.state.activeId;
                  requestAnimationFrame(() => document.getElementById(`tab-${next}`)?.focus());
                }}
                className="min-h-11 rounded-full px-4 text-[12.5px] font-bold text-on-down transition-[filter] hover:brightness-110 lg:min-h-10"
                style={{ background: C.down }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function EmptyList({ name }: { name: string }) {
  return (
    <div className="mt-6 rounded-[14px] border border-dashed border-rule-control px-5 py-8 text-center">
      <p className="font-serif text-[21px] text-ink-2">{name} is empty</p>
      <p className="mx-auto mt-2 max-w-[44ch] text-[13px] leading-[1.65] text-ink-3">
        Search above for a company or ticker to add it, or use &ldquo;Add to watchlist&rdquo;
        on any stock&rsquo;s page.
      </p>
      <button
        type="button"
        onClick={() => document.getElementById("add")?.querySelector("input")?.focus()}
        className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-full bg-[image:var(--cta-buy)] px-5 text-[12px] font-extrabold tracking-[0.1em] text-on-gold uppercase transition-[filter] hover:brightness-[1.04]"
      >
        <IconPlus className="h-4 w-4" />
        Add stocks
      </button>
    </div>
  );
}

/**
 * What a list holds, in the reader's own order.
 *
 * Reordered by dragging a row on a desktop, or with the up and down buttons —
 * always there on a wide screen, behind "Reorder" on a phone, where three
 * 44px buttons a row would leave no room for the price.
 */
function SymbolTable({
  list,
  names,
  bySymbol,
  figures,
  reorder,
  onAnnounce,
}: {
  list: Watchlist;
  names: Readonly<Record<string, string>>;
  bySymbol: ReadonlyMap<string, CorpusQuote>;
  figures: ReadonlyMap<string, Figure>;
  reorder: boolean;
  onAnnounce: (text: string) => void;
}) {
  const [dragState, setDrag] = useState<{
    from: number;
    over: number;
    after: boolean;
    /** The list as it was when the drag began. */
    of: readonly string[];
  } | null>(null);
  const n = list.symbols.length;

  /* A drag is by index, so one that began on a list that has since changed —
     an edit in another tab, say — is abandoned rather than dropped somewhere
     the reader did not point. */
  const drag = dragState && dragState.of === list.symbols ? dragState : null;

  const moveBy = (symbol: string, delta: number) => {
    const from = list.symbols.indexOf(symbol);
    const out = watchlists.moveBy(list.id, symbol, delta);
    if (!out.error && from >= 0) {
      const to = Math.max(0, Math.min(n - 1, from + delta));
      onAnnounce(`${symbol} moved to position ${to + 1} of ${n}.`);
      /* Keep the keyboard on the same stock's same button as it moves. */
      requestAnimationFrame(() =>
        document
          .getElementById(`move-${delta < 0 ? "up" : "down"}-${symbol}`)
          ?.focus({ preventScroll: false }),
      );
    }
  };

  const remove = (symbol: string) => {
    const at = list.symbols.indexOf(symbol);
    watchlists.drop(list.id, symbol);
    onAnnounce(`Removed ${symbol} from ${list.name}.`);
    /* Focus goes to the row that took its place, or the one above at the end. */
    const next = list.symbols[at + 1] ?? list.symbols[at - 1];
    requestAnimationFrame(() => {
      const target = next ? document.getElementById(`remove-${next}`) : null;
      (target ?? document.getElementById("add")?.querySelector("input"))?.focus();
    });
  };

  const drop = () => {
    if (!drag) return;
    let to = drag.over + (drag.after ? 1 : 0);
    if (drag.from < to) to -= 1;
    const symbol = list.symbols[drag.from];
    watchlists.move(list.id, drag.from, to);
    if (to !== drag.from) onAnnounce(`${symbol} moved to position ${to + 1} of ${n}.`);
    setDrag(null);
  };

  const head = "px-2 py-2.5 text-[12px] font-medium tracking-[0.04em] text-ink-3";

  return (
    <div className="mt-5 -mx-1 overflow-x-auto px-1">
      <table className="w-full border-collapse text-left">
        <caption className="sr-only">
          Stocks in {list.name}, in your order. Drag a row, or use the move buttons, to reorder.
        </caption>
        <thead>
          <tr className="border-b border-rule">
            <th scope="col" className="hidden w-7 md:table-cell">
              <span className="sr-only">Drag to reorder</span>
            </th>
            {/* The Stock column takes the width the figures leave and its
                names truncate inside it (w-full with max-w-0 on the cells is
                what lets a table cell shrink below its content). Without it one
                long fund name set the column's floor, and the table grew past
                the card — every row's Remove button off a phone's screen. Not
                needed from `xl`, where the natural widths fit with room over,
                so a wide screen keeps its proportions. No left padding below
                `md`, where the grip column is hidden and this is the first:
                the header and monograms stand on the card's content edge with
                the title and the add box. */}
            <th scope="col" className={cn(head, "max-md:pl-0 max-xl:w-full")}>
              Stock
            </th>
            <th scope="col" className={cn(head, "text-right", reorder && "hidden md:table-cell")}>
              Last
            </th>
            <th scope="col" className={cn(head, "hidden text-right sm:table-cell")}>
              Change
            </th>
            <th scope="col" className={cn(head, "hidden text-right sm:table-cell")}>
              % Change
            </th>
            <th scope="col" className={cn(head, "w-px text-right")}>
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {list.symbols.map((symbol, i) => {
            const look = lookOf(symbol, names, bySymbol.get(symbol));
            const f = figures.get(symbol);
            const noQuote = f?.price == null && unpriced(symbol);
            const dragging = drag?.from === i;
            const lineBefore = drag && drag.over === i && !drag.after && drag.from !== i;
            const lineAfter = drag && drag.over === i && drag.after && drag.from !== i;
            return (
              <tr
                key={symbol}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.effectAllowed = "move";
                  e.dataTransfer.setData("text/plain", symbol);
                  setDrag({ from: i, over: i, after: false, of: list.symbols });
                }}
                onDragOver={(e) => {
                  if (!drag) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  const rect = e.currentTarget.getBoundingClientRect();
                  const after = e.clientY > rect.top + rect.height / 2;
                  if (drag.over !== i || drag.after !== after) setDrag({ ...drag, over: i, after });
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  drop();
                }}
                onDragEnd={() => setDrag(null)}
                className={cn(
                  /* The last row gives up its rule: the card's own border is
                     20px below it, and the two read as a doubled line. */
                  "group border-b border-rule/60 transition-colors last:border-b-0 hover:bg-[rgba(var(--c-gold-rgb),0.035)]",
                  dragging && "opacity-40",
                  lineBefore && "shadow-[inset_0_2px_0_var(--color-gold)]",
                  lineAfter && "shadow-[inset_0_-2px_0_var(--color-gold)]",
                )}
              >
                <td className="hidden w-7 pl-1 align-middle md:table-cell">
                  <span
                    aria-hidden="true"
                    className="grid h-8 w-5 cursor-grab place-items-center text-ink-4 transition-colors group-hover:text-ink-3 active:cursor-grabbing"
                  >
                    <GlyphGrip className="h-4 w-4" />
                  </span>
                </td>
                <td className="py-2.5 pr-2 pl-0 max-xl:w-full max-xl:max-w-0 md:pl-2">
                  <Link
                    href={instrumentPath(symbol)}
                    draggable={false}
                    className="flex min-h-11 min-w-0 items-center gap-3 rounded-[8px]"
                  >
                    <span
                      aria-hidden="true"
                      className="font-serif grid h-8 w-8 flex-none place-items-center rounded-[9px] border border-[rgba(var(--c-gold-rgb),0.14)]"
                      style={{ color: look.color, fontSize: 15 }}
                    >
                      {look.mark}
                    </span>
                    <span className="min-w-0">
                      <span className="font-mono block text-[13px] font-medium tracking-[0.05em] text-ink">
                        {symbol}
                      </span>
                      <span className="mt-0.5 block truncate text-[12.5px] text-ink-3 sm:max-w-[34ch]">
                        {look.name ?? " "}
                      </span>
                    </span>
                  </Link>
                </td>
                <td
                  className={cn(
                    "px-2 py-2.5 text-right font-mono text-[13.5px] text-ink tabular-nums",
                    reorder && "hidden md:table-cell",
                  )}
                >
                  {f?.price == null ? (
                    <span className="text-ink-3" title={noQuote ? "No quote for this stock right now" : undefined}>
                      —
                    </span>
                  ) : (
                    money(f.price)
                  )}
                  {/* The phone has no room for the two change columns, so the
                      percentage rides under the price there. */}
                  <span className="mt-0.5 flex justify-end sm:hidden">
                    {f?.chg == null ? null : <Delta value={f.chg} size="text-[11.5px]" />}
                  </span>
                </td>
                <td
                  className="hidden px-2 py-2.5 text-right font-mono text-[13px] tabular-nums sm:table-cell"
                  style={f?.change == null ? undefined : { color: f.change >= 0 ? C.up : C.down }}
                >
                  {f?.change == null ? <span className="text-ink-3">—</span> : signedMoney(f.change)}
                </td>
                <td className="hidden px-2 py-2.5 text-right sm:table-cell">
                  {f?.chg == null ? (
                    <span className="font-mono text-[13px] text-ink-3">—</span>
                  ) : (
                    <Delta value={f.chg} size="text-[13px]" />
                  )}
                </td>
                <td className="py-2.5 pr-0 pl-2">
                  <div className="flex items-center justify-end gap-0.5">
                    <div className={cn("items-center gap-0.5", reorder ? "flex" : "hidden md:flex")}>
                      <RowButton
                        id={`move-up-${symbol}`}
                        label={`Move ${symbol} up`}
                        disabled={i === 0}
                        onClick={() => moveBy(symbol, -1)}
                      >
                        <GlyphUp className="h-4 w-4" />
                      </RowButton>
                      <RowButton
                        id={`move-down-${symbol}`}
                        label={`Move ${symbol} down`}
                        disabled={i === n - 1}
                        onClick={() => moveBy(symbol, 1)}
                      >
                        <GlyphDown className="h-4 w-4" />
                      </RowButton>
                    </div>
                    <RowButton
                      id={`remove-${symbol}`}
                      label={`Remove ${symbol} from ${list.name}`}
                      tone="down"
                      onClick={() => remove(symbol)}
                    >
                      <GlyphTrash className="h-4 w-4" />
                    </RowButton>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function RowButton({
  id,
  label,
  disabled,
  tone,
  onClick,
  children,
}: {
  id: string;
  label: string;
  disabled?: boolean;
  tone?: "down";
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      id={id}
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "grid h-11 w-11 place-items-center rounded-[10px] text-ink-3 transition-colors disabled:opacity-30 md:h-9 md:w-9",
        tone === "down"
          ? "enabled:hover:bg-[rgba(var(--c-down-rgb),0.08)] enabled:hover:text-down"
          : "enabled:hover:bg-[rgba(var(--c-gold-rgb),0.07)] enabled:hover:text-gold",
      )}
    >
      {children}
    </button>
  );
}
