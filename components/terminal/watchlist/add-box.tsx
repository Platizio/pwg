"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { IconClose, IconPlus, IconSearch } from "@/components/icons";
import { cn } from "@/lib/ui";
import { GlyphCheck } from "./glyphs";
import { onAddBoxAsked } from "./paths";

/** A name the box can offer: the search corpus's row, or a remote match. */
export type Candidate = {
  id: string;
  name: string;
  mark: string;
  color: string;
};

const LIMIT = 8;

/**
 * Add a stock to a list by name or ticker.
 *
 * It searches exactly what the terminal's own search does, in the same order:
 * the session's corpus of the most liquid names first — the list the layout
 * already sends for the header search, handed to this page by its server
 * render, so no second universe is invented — and /api/search for the tail
 * when the corpus has nothing. Both only ever yield tradable listings, which
 * is what keeps a list free of anything the terminal cannot quote.
 *
 * The one difference from the header search is what choosing does: it adds
 * rather than navigates, and the box stays open and focused for the next one,
 * because a reader building a list is adding several.
 */
export function AddBox({
  corpus,
  listName,
  listed,
  full,
  onAdd,
}: {
  corpus: readonly Candidate[];
  listName: string;
  /** Symbols already in the list, marked rather than offered twice. */
  listed: ReadonlySet<string>;
  /** At the per-list limit: the box says so instead of offering anything. */
  full: boolean;
  onAdd: (candidate: Candidate) => void;
}) {
  const uid = useId();
  const listId = `${uid}-list`;
  const inputId = `${uid}-input`;

  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState({ list: "", index: 0 });
  const [remote, setRemote] = useState<{ term: string; rows: Candidate[]; failed: boolean }>({
    term: "",
    rows: [],
    failed: false,
  });

  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const term = query.trim().toLowerCase();

  /* The header search's ranking, unchanged: exact ticker, ticker prefix, name
     prefix, name anywhere. */
  const local = useMemo<Candidate[]>(() => {
    if (!term) return [];
    return corpus
      .map((q) => {
        const id = q.id.toLowerCase();
        const name = q.name.toLowerCase();
        const score =
          id === term
            ? 0
            : id.startsWith(term)
              ? 1
              : name.startsWith(term)
                ? 2
                : name.includes(term)
                  ? 3
                  : -1;
        return { q, score };
      })
      .filter((r) => r.score >= 0)
      .sort((a, b) => a.score - b.score || a.q.name.localeCompare(b.q.name))
      .slice(0, LIMIT)
      .map((r) => r.q);
  }, [corpus, term]);

  const searching = local.length === 0 && term.length >= 2 && remote.term !== term;
  const results = useMemo(
    () => (local.length > 0 ? local : remote.term === term ? remote.rows : []),
    [local, remote, term],
  );

  const listKey = results.map((r) => r.id).join("|");
  const active = cursor.list === listKey ? cursor.index : 0;
  const setActive = (index: number) => setCursor({ list: listKey, index });

  useEffect(() => {
    if (local.length > 0 || term.length < 2) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(term)}`, { signal: controller.signal })
        .then((r) => {
          if (!r.ok) throw new Error(`search ${r.status}`);
          return r.json();
        })
        .then((body: { results?: Array<{ id: string; name: string }> }) => {
          setRemote({
            term,
            failed: false,
            rows: (body.results ?? []).map((hit) => ({
              id: hit.id,
              name: hit.name,
              mark: hit.id.slice(0, 1),
              color: "var(--c-mark-4)",
            })),
          });
        })
        .catch((error: unknown) => {
          if (error instanceof DOMException && error.name === "AbortError") return;
          setRemote({ term, rows: [], failed: true });
        });
    }, 220);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [term, local.length]);

  /* Arriving from an "Add stocks" link lands here ready to type.

     Three ways in. From another page, the link navigates and the hash is
     already #add when this mounts. From this page, the link only changes the
     hash, with pushState — no `hashchange` — so the link announces itself
     (askForAddBox) and focus is taken inside that same tap: synchronously, so
     iOS raises the keyboard, and once more a frame later in case the drawer
     the link sat in took focus back as it closed. And a real hash change
     (typed, or back and forward) still arrives as `hashchange`. */
  useEffect(() => {
    const focus = () => inputRef.current?.focus({ preventScroll: true });
    const focusIfHashed = () => {
      if (window.location.hash === "#add") focus();
    };
    const asked = () => {
      focus();
      requestAnimationFrame(() => {
        if (document.activeElement !== inputRef.current) focus();
      });
    };
    focusIfHashed();
    window.addEventListener("hashchange", focusIfHashed);
    const stopAsked = onAddBoxAsked(asked);
    return () => {
      window.removeEventListener("hashchange", focusIfHashed);
      stopAsked();
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  const choose = (candidate: Candidate) => {
    if (listed.has(candidate.id)) return;
    onAdd(candidate);
    setQuery("");
    inputRef.current?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      if (query) setQuery("");
      else setOpen(false);
      return;
    }
    if (results.length === 0) return;
    const move = (next: number) => {
      e.preventDefault();
      setOpen(true);
      setActive(next);
    };
    if (e.key === "ArrowDown") return move((active + 1) % results.length);
    if (e.key === "ArrowUp") return move((active - 1 + results.length) % results.length);
    if (e.key === "Enter") {
      e.preventDefault();
      const pick = results[active] ?? results[0];
      if (pick) choose(pick);
    }
  };

  const showPanel = open && term.length > 0;
  const activeRow = results[active];

  return (
    <div
      ref={rootRef}
      id="add"
      className="relative w-full scroll-mt-24"
      onBlur={(e) => {
        if (!rootRef.current?.contains(e.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      <div
        className={cn(
          "flex min-h-11 items-center rounded-full border transition-colors duration-300",
          full
            ? "border-rule-control opacity-60"
            : showPanel
              ? "border-[rgba(var(--c-gold-rgb),0.34)] bg-[rgba(var(--c-gold-rgb),0.05)]"
              : "border-rule-control hover:border-[rgba(var(--c-gold-rgb),0.24)]",
        )}
      >
        {/* The label is the pill's whole left side, glass and padding
            included, so a tap anywhere on the pill but the clear control puts
            the caret in the field. It used to be a visually hidden label beside
            a plain box, and only the 40px input inside the 44px pill took a
            tap. */}
        <label
          htmlFor={inputId}
          className={cn(
            "flex min-w-0 flex-1 items-center gap-2.5 self-stretch pl-4",
            query && !full ? "pr-1" : "pr-4",
            full ? "cursor-not-allowed" : "cursor-text",
          )}
        >
          <IconSearch
            aria-hidden="true"
            className={cn("h-4 w-4 flex-none", showPanel ? "text-gold-dim" : "text-ink-3")}
          />
          <span className="sr-only">Add a stock to {listName}</span>
          <input
            ref={inputRef}
            id={inputId}
            type="search"
            value={query}
            disabled={full}
            autoComplete="off"
            spellCheck={false}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={onKeyDown}
            role="combobox"
            aria-expanded={showPanel}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={showPanel && activeRow ? `${uid}-${activeRow.id}` : undefined}
            placeholder={full ? "This list is full at 100 stocks" : `Add a stock to ${listName}`}
            /* 16px below `sm`, as the header search: iOS zooms the page into
               any field set smaller the moment it takes focus. The native clear
               glyph is off for the reason search.tsx gives; the pill draws its
               own. */
            className="w-full min-w-0 bg-transparent py-2.5 text-[16px] text-ink placeholder:text-ink-3 focus:outline-none disabled:cursor-not-allowed sm:text-[13.5px] [&::-webkit-search-cancel-button]:hidden [&::-webkit-search-cancel-button]:appearance-none [&::-webkit-search-decoration]:hidden"
          />
        </label>
        {query && !full && (
          /* -my-px keeps the 44px target from growing the 44px pill past its
             border; the glyph sits as far in from the right edge as the glass
             does from the left. */
          <button
            type="button"
            aria-label="Clear"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              setQuery("");
              inputRef.current?.focus();
            }}
            className="-my-px mr-0.5 grid h-11 w-11 flex-none place-items-center rounded-full text-ink-3 transition-colors hover:text-ink"
          >
            <IconClose className="h-4 w-4" />
          </button>
        )}
      </div>

      {showPanel && (
        <div className="absolute top-[calc(100%+8px)] right-0 left-0 z-30">
          <div
            role="listbox"
            id={listId}
            aria-label="Stocks to add"
            className="card edge-lit max-h-[min(60vh,440px)] overflow-y-auto p-1.5 shadow-[0_18px_36px_-12px_rgba(var(--c-shadow-rgb),0.85)]"
          >
            {results.length === 0 ? (
              <p className="px-3.5 py-4 text-[13px] leading-[1.6] text-ink-3">
                {searching
                  ? `Searching for “${query.trim()}”…`
                  : remote.term === term && remote.failed
                    ? "Search is unavailable just now. If you know the ticker, type it in full."
                    : `Nothing matches “${query.trim()}”.`}
              </p>
            ) : (
              results.map((c, i) => {
                const already = listed.has(c.id);
                const on = i === active;
                return (
                  <button
                    key={c.id}
                    id={`${uid}-${c.id}`}
                    type="button"
                    role="option"
                    aria-selected={on}
                    aria-disabled={already}
                    tabIndex={-1}
                    onPointerEnter={() => setActive(i)}
                    onClick={() => choose(c)}
                    className={cn(
                      "flex min-h-12 w-full items-center gap-3 rounded-[10px] px-2.5 text-left transition-colors",
                      on && "bg-[rgba(var(--c-gold-rgb),0.1)]",
                      already && "cursor-default",
                    )}
                  >
                    <span
                      aria-hidden="true"
                      className="font-serif grid h-8 w-8 flex-none place-items-center rounded-[9px] border border-[rgba(var(--c-gold-rgb),0.14)]"
                      style={{ color: c.color, fontSize: 15 }}
                    >
                      {c.mark}
                    </span>
                    <span className="min-w-0 flex-1">
                      {/* Two lines, not an ellipsis, as in the header search: fund
                          names differ at the end ("…Vanguard Dividend
                          Appreciation"), which is where truncation cut them. */}
                      <span className="line-clamp-2 text-[13.5px] font-medium break-words text-ink">
                        {c.name}
                      </span>
                      <span className="font-mono mt-0.5 block text-[11.5px] tracking-[0.05em] text-ink-3">
                        {c.id}
                      </span>
                    </span>
                    {already ? (
                      <span className="flex flex-none items-center gap-1.5 text-[12px] text-gold">
                        <GlyphCheck className="h-3.5 w-3.5" />
                        In list
                      </span>
                    ) : (
                      <span className="flex flex-none items-center gap-1.5 text-[12px] text-ink-3">
                        <IconPlus className="h-3.5 w-3.5" />
                        Add
                      </span>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
