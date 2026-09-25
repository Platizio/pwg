"use client";

import { motion } from "motion/react";
import Link from "next/link";
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { useHydrated } from "@/components/home/use-session";
import { IconPlus } from "@/components/icons";
import { MAX_LISTS, listsContaining, nextListName } from "@/lib/market/watchlists";
import { cn } from "@/lib/ui";
import { GlyphCaret, GlyphCheck } from "./glyphs";
import { WATCHLIST_PATH } from "./paths";
import { explain, useWatchlists, watchlists } from "./store";
import { moveMenuFocus, useDismiss } from "./use-dismiss";

/* Wide enough for the longer of the two labels at this size and tracking
   ("Add to watchlist", plus the caret when there is a picker to open), so
   pressing it never shrinks the button out from under the pointer.

   One box for both states, not one per state. The server always renders the
   seeded single list, and a reader with two or more lists gets the picker a
   moment after hydration — which, with a box per state, widened the button by
   20px after first paint and, on a phone where Follow and Trade share the row,
   moved Trade's edge with it. */
const LABEL_BOX = "min-w-[13.25rem]";

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
export function FollowButton({
  symbol,
  name,
  compact = false,
}: {
  symbol: string;
  name?: string | null;
  /* The phone header's version: a short pill, "+ Follow" / "✓ Following",
     instead of the 212px "Add to watchlist" box. A glyph alone read as a
     button with no purpose. */
  compact?: boolean;
}) {
  const state = useWatchlists();
  /* The server knows only the seeded list, so until the reader's own lists are
     in, the label and caret would state the seed's answer — "Following" for a
     stock the reader may never have added. The box is drawn and held at its
     size; what it says waits for the real lists. */
  const hydrated = useHydrated();
  const holding = listsContaining(state, symbol);
  const following = holding.length > 0;
  const single = state.lists.length === 1 ? state.lists[0] : null;

  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState("");
  const [notice, setNotice] = useState<string | null>(null);

  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const inputId = useId();

  const close = useCallback(() => {
    setOpen(false);
    setCreating(false);
  }, []);
  useDismiss(open, close, rootRef, triggerRef);

  /* A guard under the anchoring below, not a replacement for it: if the row
     this button sits in is ever laid out so the panel would cross a 16px
     gutter, it is nudged back on screen before it paints rather than clipped. */
  useLayoutEffect(() => {
    const el = panelRef.current;
    if (!open || !el) return;
    el.style.transform = "";
    const rect = el.getBoundingClientRect();
    const gutter = 16;
    const shift =
      rect.left < gutter
        ? gutter - rect.left
        : rect.right > window.innerWidth - gutter
          ? window.innerWidth - gutter - rect.right
          : 0;
    if (shift !== 0) el.style.transform = `translateX(${shift}px)`;
  }, [open, single]);

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
        title={hydrated ? where : undefined}
        className={cn(
          compact
            ? "inline-flex h-10 items-center gap-1.5 rounded-[10px] border px-3 text-[10.5px] font-bold tracking-[0.12em] uppercase transition-colors"
            : cn(
                "inline-flex min-h-11 w-full items-center justify-center gap-2 border px-4 text-[11px] font-bold tracking-[0.16em] uppercase transition-colors sm:w-auto",
                LABEL_BOX,
              ),
          hydrated && following
            ? "border-[rgba(var(--c-gold-rgb),0.4)] text-gold hover:border-gold"
            : "border-rule-control text-ink-2 hover:border-gold hover:text-ink",
        )}
      >
        {/* Held but invisible until hydration, so the button keeps the height
            and width it will have and nothing beside it moves when the words
            arrive. */}
        <span className={cn("inline-flex items-center gap-2 whitespace-nowrap", !hydrated && "invisible")}>
          {following ? (
            <GlyphCheck className="h-3.5 w-3.5 flex-none" />
          ) : (
            <IconPlus className="h-3.5 w-3.5 flex-none" />
          )}
          {compact ? (following ? "Following" : "Follow") : label}
          {!single && !compact && (
            <GlyphCaret
              className={cn("h-3.5 w-3.5 flex-none transition-transform duration-300", open && "rotate-180")}
            />
          )}
        </span>
      </motion.button>

      {notice && !open && (
        /* The float is on a wrapper: `.edge-lit` declares `position: relative`
           later in the cascade than Tailwind's `absolute`, so on the card
           itself the notice fell back into the flow and pushed the whole
           header down for the four seconds it was up. Anchored like the
           panel below: from the left on a phone, from the right from `sm`. */
        <div className="absolute top-[calc(100%+8px)] right-auto left-0 z-30 w-[min(260px,calc(100vw-32px))] sm:right-0 sm:left-auto">
          <p
            role="status"
            className="card edge-lit px-3.5 py-3 text-[12.5px] leading-[1.55] text-ink-2"
          >
            {notice}
          </p>
        </div>
      )}

      {open && !single && (
        /* Anchored to the button's LEFT edge on a phone. There Follow is the
           first of two controls sharing the row, so it starts on the page's
           left gutter and ends mid-screen; a 300px panel hung from its right
           edge ran 49px off the left of the screen, taking every checkbox and
           the start of every list name with it. From `sm` the pair sits at the
           right of the header and the panel hangs from the right as before. */
        <div
          ref={panelRef}
          className={cn(
            "absolute top-[calc(100%+8px)] z-30 w-[min(300px,calc(100vw-32px))]",
            /* The compact square sits at the right of the phone header, so its
               panel hangs from the right edge like the desktop one. */
            compact ? "right-0 left-auto" : "right-auto left-0 sm:right-0 sm:left-auto",
          )}
        >
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
                    /* 16px below `lg`: iOS zooms the page into any field
                       set smaller the moment it takes focus. */
                    className="min-h-11 w-full min-w-0 rounded-[8px] border border-rule-control bg-transparent px-2.5 text-[16px] text-ink focus:border-[rgba(var(--c-gold-rgb),0.45)] focus:outline-none lg:text-[13px]"
                  />
                  <button
                    type="submit"
                    className="min-h-11 flex-none rounded-[8px] bg-[image:var(--cta-buy)] px-3 text-[12px] font-bold text-on-gold transition-[filter] hover:brightness-[1.04]"
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
