"use client";

import Link from "next/link";
import { useCallback, useId, useRef, useState } from "react";
import { IconPlus } from "@/components/icons";
import { MAX_LISTS, nextListName } from "@/lib/market/watchlists";
import { cn } from "@/lib/ui";
import { GlyphCaret, GlyphCheck } from "./glyphs";
import { WATCHLIST_PATH } from "./paths";
import { explain, useWatchlists, watchlists } from "./store";
import { moveMenuFocus, useDismiss } from "./use-dismiss";

/**
 * The rail's list switcher: the active list's name, and a panel of every list
 * under it.
 *
 * Compact on purpose. It sits between the navigation and the stocks, in a
 * column 214px wide that is mostly there for the stocks, so it is one row —
 * the name and a count — until it is asked for more. The panel lists every
 * list, starts a new one in place, and hands everything heavier (rename,
 * delete, reorder) to the watchlist page rather than cramming it in here.
 */
export function ListSwitcher() {
  const state = useWatchlists();
  const active = state.lists.find((l) => l.id === state.activeId) ?? state.lists[0];

  const [open, setOpen] = useState(false);
  /* The panel's height, fixed as it opens (see openPanel). */
  const [maxHeight, setMaxHeight] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const inputId = useId();
  const errorId = useId();

  const close = useCallback(() => {
    setOpen(false);
    setCreating(false);
    setError(null);
  }, []);
  useDismiss(open, close, rootRef, triggerRef);

  const full = state.lists.length >= MAX_LISTS;

  /* Sized to the room under the switcher, measured as it opens.

     A fixed min(60vh, 440px) opened in the phone drawer at y≈392 and ran past
     the bottom of an 812px screen, so "New list" was half off it and "Manage
     lists" wholly off, behind a second scroll. Now the panel stops 16px short
     of the viewport's foot, and only the lists scroll inside it — the two
     actions under them are always on screen. 60vh and 440px stay as the upper
     bound, so a tall desktop window draws what it always did. The floor of
     200px keeps two rows and both actions on a landscape phone, where the
     drawer itself then scrolls. */
  const openPanel = () => {
    const anchor = (rootRef.current?.offsetParent ?? triggerRef.current) as HTMLElement | null;
    const rect = anchor?.getBoundingClientRect();
    if (rect) {
      const room = window.innerHeight - (rect.bottom - 2) - 16;
      setMaxHeight(Math.max(200, Math.min(440, window.innerHeight * 0.6, room)));
    }
    setOpen(true);
  };

  const choose = (id: string) => {
    watchlists.activate(id);
    close();
    triggerRef.current?.focus();
  };

  const create = (e: React.FormEvent) => {
    e.preventDefault();
    const out = watchlists.create(draft);
    if (out.error) {
      setError(explain(out.error));
      return;
    }
    close();
    triggerRef.current?.focus();
  };

  return (
    /* Not `relative`: the panel anchors to the row this sits in (see
       SidebarWatchlist), so it spans the rail's full content width — the
       switcher and the add button — rather than the switcher alone. */
    <div ref={rootRef} className="min-w-0 flex-1">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => (open ? close() : openPanel())}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-label={`Watchlist: ${active.name}, ${active.symbols.length} ${
          active.symbols.length === 1 ? "stock" : "stocks"
        }. Switch list`}
        className={cn(
          "flex min-h-11 w-full items-center gap-2 rounded-[10px] px-2.5 text-left transition-colors lg:min-h-10",
          open ? "bg-[rgba(var(--c-gold-rgb),0.07)]" : "hover:bg-[rgba(var(--c-gold-rgb),0.045)]",
        )}
      >
        {/* Two lines before an ellipsis: a 36-character name truncated on
            one line ("Semiconductors and AI infr…") said nothing the reader
            could pick it out by. */}
        <span className="line-clamp-2 min-w-0 flex-1 text-[14px] break-words text-ink-2">
          {active.name}
        </span>
        <span className="font-mono flex-none text-[11.5px] text-ink-3 tabular-nums">
          {active.symbols.length}
        </span>
        <GlyphCaret
          className={cn(
            "h-3.5 w-3.5 flex-none text-ink-3 transition-transform duration-300",
            open && "rotate-180 text-gold",
          )}
        />
      </button>

      {open && (
        /* The float is on a wrapper with no other opinions: `.edge-lit` sets
           `position: relative` later in the cascade than Tailwind's
           `absolute`, so the two cannot share an element (see search.tsx). */
        <div className="absolute top-[calc(100%-2px)] right-0 left-0 z-30">
          <div
            id={panelId}
            role="dialog"
            aria-label="Switch watchlist"
            onKeyDown={moveMenuFocus}
            style={maxHeight === null ? undefined : { maxHeight }}
            className="card edge-lit flex max-h-[min(60vh,440px)] flex-col p-1.5 shadow-[0_18px_36px_-12px_rgba(var(--c-shadow-rgb),0.85)]"
          >
            {/* The one part that scrolls; it gives up height before anything
                else in the column does. */}
            <ul className="m-0 min-h-0 list-none overflow-y-auto p-0">
              {state.lists.map((list, i) => {
                const on = list.id === active.id;
                return (
                  <li key={list.id}>
                    <button
                      type="button"
                      data-menu-item
                      /* The panel opens on the list you are in, so the next
                         arrow key starts from where you are. */
                      autoFocus={on && !creating}
                      aria-current={on ? "true" : undefined}
                      onClick={() => choose(list.id)}
                      className={cn(
                        "flex min-h-11 w-full items-center gap-2 rounded-[8px] px-2 text-left text-[13.5px] transition-colors lg:min-h-10",
                        on
                          ? "bg-[rgba(var(--c-gold-rgb),0.1)] text-ink"
                          : "text-ink-2 hover:bg-[rgba(var(--c-gold-rgb),0.05)] hover:text-ink",
                      )}
                    >
                      <span className="grid w-4 flex-none place-items-center">
                        {on ? (
                          <GlyphCheck className="h-3.5 w-3.5 text-gold" />
                        ) : (
                          <span className="font-mono text-[10px] text-ink-4 tabular-nums">
                            {i + 1}
                          </span>
                        )}
                      </span>
                      <span className="min-w-0 flex-1 truncate">{list.name}</span>
                      <span className="font-mono flex-none text-[11.5px] text-ink-3 tabular-nums">
                        {list.symbols.length}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>

            <div role="separator" className="mx-1 my-1.5 h-px flex-none bg-rule-list" />

            {creating ? (
              <form onSubmit={create} className="flex-none px-1 pt-1 pb-1.5">
                <label htmlFor={inputId} className="block px-1 pb-1.5 text-[12px] text-ink-3">
                  New list name
                </label>
                <div className="flex gap-1.5">
                  <input
                    id={inputId}
                    autoFocus
                    value={draft}
                    maxLength={40}
                    onChange={(e) => {
                      setDraft(e.target.value);
                      setError(null);
                    }}
                    aria-invalid={error !== null}
                    aria-describedby={error ? errorId : undefined}
                    /* 44px and 16px in the drawer: iOS zooms the page into any
                       field set smaller the moment it takes focus. The desktop
                       rail keeps its compact 40px and 13px. */
                    className="min-h-11 w-full min-w-0 rounded-[8px] border border-rule-control bg-transparent px-2.5 text-[16px] text-ink placeholder:text-ink-3 focus:border-[rgba(var(--c-gold-rgb),0.45)] focus:outline-none lg:min-h-10 lg:text-[13px]"
                  />
                  <button
                    type="submit"
                    className="min-h-11 flex-none rounded-[8px] bg-[image:var(--cta-buy)] px-3 text-[12px] font-bold text-on-gold transition-[filter] hover:brightness-[1.04] lg:min-h-10"
                  >
                    Create
                  </button>
                </div>
                {error && (
                  <p id={errorId} role="alert" className="px-1 pt-1.5 text-[12px] leading-[1.5] text-down">
                    {error}
                  </p>
                )}
              </form>
            ) : (
              <button
                type="button"
                data-menu-item
                disabled={full}
                title={full ? "You can keep up to 20 lists." : undefined}
                onClick={() => {
                  setDraft(nextListName(state));
                  setCreating(true);
                }}
                className="flex min-h-11 w-full flex-none items-center gap-2 rounded-[8px] px-2 text-left text-[13.5px] text-ink-2 transition-colors enabled:hover:bg-[rgba(var(--c-gold-rgb),0.05)] enabled:hover:text-ink disabled:opacity-45 lg:min-h-10"
              >
                <IconPlus className="h-4 w-4 flex-none text-gold" />
                New list
              </button>
            )}

            <Link
              href={WATCHLIST_PATH}
              data-menu-item
              onClick={close}
              className="flex min-h-11 w-full flex-none items-center gap-2 rounded-[8px] px-2 text-[13.5px] text-ink-2 transition-colors hover:bg-[rgba(var(--c-gold-rgb),0.05)] hover:text-ink lg:min-h-10"
            >
              <span aria-hidden="true" className="w-4 flex-none" />
              Manage lists
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
