"use client";

import { useSyncExternalStore } from "react";
import { IconMoon, IconSun } from "@/components/icons";
import { cn } from "@/lib/ui";

/**
 * The lighting control.
 *
 * Dark is the default and stays it: PRODUCT.md fixes the use scene as a dim
 * room and a large display, read for long stretches. Light exists for the
 * other half of that sentence — the phone glance between those stretches,
 * which happens in daylight.
 *
 * Until someone chooses, the page follows the operating system, which is what
 * `prefers-color-scheme` in globals.css does on its own with no JavaScript at
 * all. Choosing pins `data-theme` and persists it; the choice wins in both
 * directions, so a reader who wants the dark terminal on a bright phone keeps
 * it.
 *
 * The theme is read as an external store rather than mirrored into state. It
 * lives in two places this component does not own — the `data-theme` attribute
 * and the system setting — and a `useState` seeded from an effect would have to
 * set state during that effect on every mount, which cascades a second render
 * before the first has painted.
 */
type Theme = "light" | "dark";

/* matchMedia reports a system change and nothing reports our own pin, so the
   click announces itself and the control re-reads the DOM either way. */
const PIN_EVENT = "pg-theme-pinned";

function subscribe(onStoreChange: () => void): () => void {
  const mq = window.matchMedia("(prefers-color-scheme: light)");
  mq.addEventListener("change", onStoreChange);
  window.addEventListener(PIN_EVENT, onStoreChange);
  return () => {
    mq.removeEventListener("change", onStoreChange);
    window.removeEventListener(PIN_EVENT, onStoreChange);
  };
}

/* A pinned choice wins; without one the page is still following the system, so
   the system is what gets read. The snapshot is a string, so React settles its
   identity check on value and nothing needs caching between renders. */
function readTheme(): Theme {
  const pinned = document.documentElement.dataset.theme;
  if (pinned === "light" || pinned === "dark") return pinned;
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

/* The server knows neither the stored choice nor the system setting, so it
   renders the frame without a label and hydration fills it in — identical
   bytes on both sides, so nothing shifts. */
const readThemeOnServer = (): Theme | null => null;

export default function ThemeToggle({ collapsed = false }: { collapsed?: boolean }) {
  const theme = useSyncExternalStore(subscribe, readTheme, readThemeOnServer);

  const toggle = () => {
    const next: Theme = theme === "light" ? "dark" : "light";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("pg-theme", next);
    } catch {
      /* Private browsing refuses storage; the choice still holds for this
         session, which is better than refusing to switch at all. */
    }
    window.dispatchEvent(new Event(PIN_EVENT));
  };

  const isLight = theme === "light";
  const label = theme === null ? "Lighting" : isLight ? "Light" : "Dark";

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={
        theme === null ? "Lighting" : `Lighting: ${label}. Switch to ${isLight ? "dark" : "light"}.`
      }
      title={collapsed ? `Lighting · ${label}` : undefined}
      className={cn(
        "flex min-h-11 items-center gap-2 rounded-full border text-[13px] font-medium transition-colors",
        "border-rule-control text-ink-2 hover:border-gold hover:text-ink",
        /* w-full, not w-fit: the sidebar footer sets this beside the language
           control in two equal grid tracks, so the pair share both edges and
           the rail's own. Sized to its own content they were 102px and 123px
           and never lined up. pl-[9px] rather than 14px: with the 1px
           border the glyph lands on the icon column the nav tiles and
           monograms above share, instead of 5px right of it. */
        collapsed ? "w-11 justify-center px-0" : "w-full min-w-0 pr-3.5 pl-[9px]",
      )}
    >
      {isLight ? (
        <IconSun aria-hidden="true" className="h-4 w-4 flex-none text-gold" />
      ) : (
        <IconMoon aria-hidden="true" className="h-4 w-4 flex-none text-gold" />
      )}
      {/* The button's width is its grid track's, not its label's, so the
          server's "Lighting" giving way to "Light" or "Dark" on hydration moves
          nothing: the label is left-aligned after a fixed icon, and the box
          around it stays put. */}
      {!collapsed && <span className="truncate text-left">{label}</span>}
    </button>
  );
}
