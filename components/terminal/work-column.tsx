"use client";

import {
  createContext,
  useCallback,
  useContext,
  useId,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import { IconCollapse } from "@/components/icons";
import { useHydrated } from "@/components/home/use-session";
import { TickerTape } from "./ticker-tape";
import { RAIL_PRE_PAINT, applyFolded, writeFolded } from "./rail-fold";
import { cn } from "./ui";

/**
 * The working column and its reference rail, as a fragment so both land as
 * direct children of the shell's grid.
 *
 * The rail is rendered twice by design: once inside the column for viewports
 * below `xl`, where it reads as the last section of the page, and once as a
 * real column above it. Only one is ever in the accessibility tree, because
 * the other is `display: none`.
 *
 * `bleed` turns off the column's horizontal padding. The dashboard needs it:
 * its hairlines run the full width of the column and pad themselves, which is
 * the whole point of that layout and impossible through a padded parent.
 *
 * FOLDING. At `xl` the rail can be folded to a 56px strip so the working
 * column takes the width — the chart, the ledger and the panels are what a
 * reader studies, and the rail is reference. The choice is per reader and
 * survives reloads (see rail-fold.ts). Below `xl` there is nothing to fold:
 * the rail is already the foot of the page, out of the way until scrolled to.
 *
 * The folded state is drawn entirely by CSS keyed off `data-news-rail` on
 * <html>, never by React state. Both controls — "collapse" in the rail's own
 * header, "expand" on the strip — are always rendered and the attribute shows
 * one. That is what lets an inline script apply a stored choice before first
 * paint without the server and client ever rendering different markup, so a
 * reader who folded the rail never sees it open and then snap shut.
 *
 * Tailwind reads class names as literal text, so every folded-state variant
 * below spells the attribute out as `[:root[data-news-rail=collapsed]_&]:`
 * (tests/rail-fold.test.ts checks they all agree with rail-fold.ts).
 */
export function WorkColumn({
  aside,
  bleed = false,
  children,
}: {
  aside?: ReactNode;
  bleed?: boolean;
  children: ReactNode;
}) {
  /* Transitions exist only once the page is live. A stored fold is applied
     before paint and must land still; the animation is for a reader's click.
     Every transition class below is `motion-safe:` rather than cancelled with
     `motion-reduce:transition-none`: the folded-state variants are more
     specific than that override and would quietly win it back, and a bare
     duration with no property animates `all`. */
  const hydrated = useHydrated();
  const bodyId = useId();
  const stripRef = useRef<HTMLButtonElement>(null);

  /* Writes the attribute and the stored choice, then hands focus to the
     control that has just appeared: the one clicked is about to be hidden,
     and focus left on a hidden element falls back to <body>, which drops a
     keyboard reader at the top of the document. The attribute flips
     visibility synchronously (see the transition notes below), so the new
     control is focusable in the same tick. */
  const setFolded = useCallback((folded: boolean) => {
    applyFolded(document.documentElement, folded);
    let storage: Storage | undefined;
    try {
      storage = window.localStorage;
    } catch {
      /* Reading the accessor itself throws where site data is blocked. */
    }
    writeFolded(storage, folded);
    /* The collapse control is rendered by the rail, not here, so it is found
       by the id this column gave it rather than held by a ref. */
    if (folded) stripRef.current?.focus();
    else document.getElementById(collapseId(bodyId))?.focus();
  }, [bodyId]);

  const fold = useCallback(() => setFolded(true), [setFolded]);
  const ctx = useMemo(() => ({ fold, bodyId }), [fold, bodyId]);

  return (
    /* The work area owns its own split. The shell is two columns now, so a
       route without a reference rail simply fills the space instead of
       leaving an empty third column behind. */
    <div
      className={cn(
        "grid min-w-0 lg:h-full lg:overflow-hidden",
        Boolean(aside) &&
          "xl:grid-cols-[minmax(0,1fr)_358px] xl:[:root[data-news-rail=collapsed]_&]:grid-cols-[minmax(0,1fr)_56px]",
        /* grid-template-columns interpolates when only a length differs, so
           the working column grows in step with the rail shrinking. */
        Boolean(aside) &&
          hydrated &&
          "xl:motion-safe:transition-[grid-template-columns] xl:motion-safe:duration-300 xl:motion-safe:ease-[cubic-bezier(0.22,1,0.36,1)]",
      )}
    >
      {/* The stored fold, applied while the HTML is still parsing — before the
          aside below it exists, so its first layout is already the right one.
          Rendered only by the server and the hydration pass: React never
          executes a script it creates on the client, and on a client-side
          navigation the attribute is already on <html> from the page before. */}
      {aside && !hydrated && <script dangerouslySetInnerHTML={{ __html: RAIL_PRE_PAINT }} />}

      <main
        id="terminal-main"
        className="flex min-w-0 flex-col lg:h-full lg:overflow-hidden"
      >
        <TickerTape />

        <div
          className={cn(
            "flex-1 pb-10 lg:overflow-y-auto",
            bleed ? "pt-0" : "px-4 pt-6 sm:px-6 lg:px-7",
          )}
        >
          {children}

          {aside && (
            <div
              className={cn(
                "mt-10 border-t border-rule-section xl:hidden",
                bleed && "mt-0",
              )}
            >
              {aside}
            </div>
          )}
        </div>
      </main>

      {aside && (
        <aside
          aria-label="News and reference"
          className="relative hidden overflow-hidden border-l border-rule-section rail-lit xl:block"
        >
          {/* The open rail. Held at its full width and clipped by the aside
              while the column narrows, so the headlines fade rather than
              rewrap through every intermediate width. 357px is the 358px
              track less the aside's hairline.

              Visibility, not just opacity: folded, the rail's links and
              buttons leave the tab order and the accessibility tree. It is
              transitioned only on the way OUT, so the rail stays visible
              while it fades; on the way in it flips at once, which is what
              lets the collapse control take focus in the same tick. */}
          <div
            id={bodyId}
            className={cn(
              "absolute inset-y-0 left-0 w-[357px] overflow-y-auto",
              "[:root[data-news-rail=collapsed]_&]:invisible [:root[data-news-rail=collapsed]_&]:opacity-0",
              hydrated &&
                "motion-safe:transition-opacity motion-safe:duration-200 motion-safe:ease-out motion-safe:[:root[data-news-rail=collapsed]_&]:transition-[opacity,visibility]",
            )}
          >
            <RailFoldContext.Provider value={ctx}>{aside}</RailFoldContext.Provider>
          </div>

          {/* The folded rail: one control the height of the column, so the
              whole strip is the target. Its contents fade in once the rail
              has mostly cleared; the button itself is visible at once so it
              can take focus from the collapse control. */}
          <button
            ref={stripRef}
            type="button"
            onClick={() => setFolded(false)}
            aria-controls={bodyId}
            aria-expanded={false}
            title="Expand news and reference"
            className={cn(
              "group absolute inset-y-0 left-0 w-[55px] text-ink-3",
              "invisible [:root[data-news-rail=collapsed]_&]:visible",
              "transition-colors hover:bg-[var(--tint-gold-ghost)] hover:text-gold",
              /* The shared 3px outline offset would fall outside the aside's
                 clip; drawn inside the strip instead. */
              "focus-visible:outline-offset-[-5px]",
            )}
          >
            <span
              className={cn(
                "flex h-full flex-col items-center gap-5 pt-6",
                "opacity-0 [:root[data-news-rail=collapsed]_&]:opacity-100",
                hydrated &&
                  "motion-safe:transition-opacity motion-safe:duration-200 motion-safe:ease-out motion-safe:[:root[data-news-rail=collapsed]_&]:delay-150",
              )}
            >
              {/* The same square as the navigation rail's collapse control,
                  at the same height as the rail's header row, so folding
                  moves the control a few pixels rather than the reader's eye.
                  Its glyph is unmirrored here and mirrored in the header —
                  the same half-turn the navigation rail's glyph makes. */}
              <span className="grid h-9 w-9 place-items-center rounded-[10px] border border-rule-control transition-colors group-hover:border-gold">
                <IconCollapse className="h-4 w-4" />
              </span>
              {/* Named by its own visible words, with the verb added for a
                  screen reader, so a voice user who says what they see
                  ("click News & reference") reaches it. */}
              <span className="eyebrow [writing-mode:vertical-rl] transition-colors group-hover:text-gold">
                <span className="sr-only">Expand </span>
                News &amp; reference
              </span>
            </span>
          </button>
        </aside>
      )}
    </div>
  );
}

type RailFold = {
  fold: () => void;
  /** The open rail's id, for aria-controls; the collapse control's derives from it. */
  bodyId: string;
};

const collapseId = (bodyId: string) => `${bodyId}-collapse`;

/* Present only around the column copy of the rail. The copy appended below
   the working column under `xl` has nothing to fold into, so the toggle in its
   header renders nothing. */
const RailFoldContext = createContext<RailFold | null>(null);

/**
 * The collapse control, for the rail to place in its own header — the rail
 * knows where its first heading is and the column does not. Renders nothing
 * outside the folding column.
 */
export function RailFoldToggle() {
  const rail = useContext(RailFoldContext);
  if (!rail) return null;

  return (
    <button
      id={collapseId(rail.bodyId)}
      type="button"
      onClick={rail.fold}
      aria-label="Collapse news and reference"
      aria-controls={rail.bodyId}
      aria-expanded
      title="Collapse news and reference"
      className={cn(
        "relative grid h-9 w-9 flex-none place-items-center rounded-[10px] border border-rule-control text-ink-3 transition-colors hover:border-gold hover:text-gold",
        /* 36px drawn to match the navigation rail's control, 44px to hit. */
        "before:absolute before:-inset-1 before:content-['']",
      )}
    >
      {/* Mirrored: the navigation rail's glyph is a panel on the left. */}
      <IconCollapse className="h-4 w-4 -scale-x-100" />
    </button>
  );
}
