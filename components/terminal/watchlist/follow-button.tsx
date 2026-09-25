"use client";

import { motion } from "motion/react";
import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { IconPlus } from "@/components/icons";
import { MAX_LISTS, listsContaining, nextListName } from "@/lib/market/watchlists";
import { cn } from "@/lib/ui";
import { GlyphCaret, GlyphCheck } from "./glyphs";
import { WATCHLIST_PATH } from "./paths";
import { explain, useWatchlists, watchlists } from "./store";
import { moveMenuFocus, useDismiss } from "./use-dismiss";

/* Wide enough for the longer of the two labels at this size and tracking
   ("Add to watchlist", plus the caret when there is a picker to open), so
   pressing it never shrinks the button out from under the pointer. The group
   is right-aligned, so Trade beside it never moves either way. */
const LABEL_BOX = { single: "min-w-[12rem]", picker: "min-w-[13.25rem]" } as const;

/**
 * The instrument page's watchlist control.
 *
 * It was a Follow button bound to nothing that outlived the tab: a flag in
 * memory, read by no list anywhere. It is now the way a stock gets into a
 * watchlist. With one list it toggles the stock in and out of it directly;
 * with more than one it opens a small picker, one row per list, so a stock can
 * sit in several. The label says where things stand — "Following" when any
 * list holds the stock, "Add to watchlist" when none does.
 */
export function FollowButton({ symbol, name }: { symbol: string; name?: string | null }) {
  const state = useWatchlists();
  const holding = listsContaining(state, symbol);
  const following = holding.length > 0;
  const single = state.lists.length === 1 ? state.lists[0] : null;

  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState("");
  const [notice, setNotice] = useState<string | null>(null);

  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const inputId = useId();

  const close = useCallback(() => {
    setOpen(false);
    setCreating(false);
  }, []);
  useDismiss(open, close, rootRef, triggerRef);

  /* A refusal is said once and then gets out of the way. */
  useEffect(() => {
    if (notice === null) return;
    const timer = setTimeout(() => setNotice(null), 4200);
    return () => clearTimeout(timer);
  }, [notice]);

  const toggleIn = (listId: string, on: boolean) => {
    const out = watchlists.set(listId, symbol, on, name);
    setNotice(explain(out.error));
  };

  const press = () => {
    if (single) {
      toggleIn(single.id, !single.symbols.includes(symbol.toUpperCase()));
      return;
    }
    if (open) close();
    else setOpen(true);
  };

  const create = (e: React.FormEvent) => {
    e.preventDefault();
    const made = watchlists.create(draft);
    if (made.error) {
      setNotice(explain(made.error));
      return;
    }
    /* A list made from here is made FOR this stock. */
    watchlists.add(made.state.activeId, symbol, name);
    setCreating(false);
    setNotice(null);
  };

  const label = following ? "Following" : "Add to watchlist";
  const where =
    holding.length === 0
      ? "Not in any watchlist"
      : holding.length === 1
        ? `In ${state.lists.find((l) => l.id === holding[0])?.name ?? "a watchlist"}`
        : `In ${holding.length} watchlists`;

  return (
    <div ref={rootRef} className="relative">
      <motion.button
        ref={triggerRef}
        type="button"
        onClick={press}
        whileTap={{ scale: 0.98 }}
        aria-pressed={single ? following : undefined}
        aria-expanded={single ? undefined : open}
        aria-controls={!single && open ? panelId : undefined}
        aria-label={
          /* A toggle's name stays put and aria-pressed carries the state:
             "AAPL in My watchlist, toggle button, pressed". */
          single ? `${symbol} in ${single.name}` : `${label}. ${where}. Choose watchlists`
        }
        title={where}
        className={cn(
          "inline-flex min-h-11 w-full items-center justify-center gap-2 border px-4 text-[11px] font-bold tracking-[0.16em] uppercase transition-colors sm:w-auto",
          single ? LABEL_BOX.single : LABEL_BOX.picker,
          following
            ? "border-[rgba(var(--c-gold-rgb),0.4)] text-gold hover:border-gold"
            : "border-rule-control text-ink-2 hover:border-gold hover:text-ink",
        )}
      >
        {following ? (
          <GlyphCheck className="h-3.5 w-3.5 flex-none" />
        ) : (
          <IconPlus className="h-3.5 w-3.5 flex-none" />
        )}
        {label}
        {!single && (
          <GlyphCaret
            className={cn("h-3.5 w-3.5 flex-none transition-transform duration-300", open && "rotate-180")}
          />
        )}
      </motion.button>

      {notice && !open && (
        <p
          role="status"
          className="card edge-lit absolute top-[calc(100%+8px)] right-0 z-30 w-[260px] px-3.5 py-3 text-[12.5px] leading-[1.55] text-ink-2"
        >
          {notice}
        </p>
      )}

      {open && !single && (
        <div className="absolute top-[calc(100%+8px)] right-0 z-30 w-[min(300px,calc(100vw-32px))]">
          <div
            id={panelId}
            role="dialog"
            aria-label={`Watchlists for ${symbol}`}
            onKeyDown={moveMenuFocus}
            className="card edge-lit max-h-[min(60vh,440px)] overflow-y-auto p-1.5 shadow-[0_18px_36px_-12px_rgba(var(--c-shadow-rgb),0.85)]"
          >
            <p className="px-2.5 pt-2 pb-2 text-[12px] text-ink-3">
              Keep <span className="font-mono text-ink-2">{symbol}</span> in
            </p>
            <ul className="m-0 list-none p-0">
              {state.lists.map((list, i) => {
                const on = holding.includes(list.id);
                return (
                  <li key={list.id}>
                    <button
                      type="button"
                      data-menu-item
                      autoFocus={i === 0 && !creating}
                      aria-pressed={on}
                      onClick={() => toggleIn(list.id, !on)}
                      className={cn(
                        "flex min-h-11 w-full items-center gap-2.5 rounded-[8px] px-2.5 text-left text-[13.5px] transition-colors",
                        on
                          ? "text-ink hover:bg-[rgba(var(--c-gold-rgb),0.06)]"
                          : "text-ink-2 hover:bg-[rgba(var(--c-gold-rgb),0.05)] hover:text-ink",
                      )}
                    >
                      <span
                        aria-hidden="true"
                        className={cn(
                          "grid h-[18px] w-[18px] flex-none place-items-center rounded-[5px] border transition-colors",
                          on
                            ? "border-gold bg-[rgba(var(--c-gold-rgb),0.16)] text-gold"
                            : "border-rule-control",
                        )}
                      >
                        {on && <GlyphCheck className="h-3 w-3" />}
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

            {notice && (
              <p role="status" className="px-2.5 pt-1.5 pb-1 text-[12px] leading-[1.5] text-down">
                {notice}
              </p>
            )}

            <div role="separator" className="mx-1 my-1.5 h-px bg-rule-list" />

            {creating ? (
              <form onSubmit={create} className="px-1 pt-1 pb-1.5">
                <label htmlFor={inputId} className="block px-1.5 pb-1.5 text-[12px] text-ink-3">
                  New list, starting with {symbol}
                </label>
                <div className="flex gap-1.5">
                  <input
                    id={inputId}
                    autoFocus
                    value={draft}
                    maxLength={40}
                    onChange={(e) => setDraft(e.target.value)}
                    className="min-h-10 w-full min-w-0 rounded-[8px] border border-rule-control bg-transparent px-2.5 text-[13px] text-ink focus:border-[rgba(var(--c-gold-rgb),0.45)] focus:outline-none"
                  />
                  <button
                    type="submit"
                    className="min-h-10 flex-none rounded-[8px] bg-[linear-gradient(140deg,#f6e6c6,#dcbb8a)] px-3 text-[12px] font-bold text-on-gold transition-[filter] hover:brightness-[1.04]"
                  >
                    Create
                  </button>
                </div>
              </form>
            ) : (
              <button
                type="button"
                data-menu-item
                disabled={state.lists.length >= MAX_LISTS}
                title={state.lists.length >= MAX_LISTS ? "You can keep up to 20 lists." : undefined}
                onClick={() => {
                  setDraft(nextListName(state));
                  setCreating(true);
                }}
                className="flex min-h-11 w-full items-center gap-2.5 rounded-[8px] px-2.5 text-left text-[13.5px] text-ink-2 transition-colors enabled:hover:bg-[rgba(var(--c-gold-rgb),0.05)] enabled:hover:text-ink disabled:opacity-45"
              >
                <IconPlus className="h-4 w-4 flex-none text-gold" />
                New list
              </button>
            )}
            <Link
              href={WATCHLIST_PATH}
              data-menu-item
              onClick={close}
              className="flex min-h-11 w-full items-center gap-2.5 rounded-[8px] px-2.5 text-[13.5px] text-ink-2 transition-colors hover:bg-[rgba(var(--c-gold-rgb),0.05)] hover:text-ink"
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
