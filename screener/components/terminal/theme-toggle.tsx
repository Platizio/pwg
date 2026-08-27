"use client";

import { useEffect, useState } from "react";
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
 * `mounted` exists because the server cannot know the reader's system setting
 * or their stored choice. Rendering the resolved label before hydration would
 * mean emitting one theme's name on the server and possibly the other's on the
 * client — a mismatch. The control renders its frame immediately and fills in
 * the label on mount, so nothing shifts.
 */
type Theme = "light" | "dark";

export default function ThemeToggle({ collapsed = false }: { collapsed?: boolean }) {
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    const root = document.documentElement;
    const pinned = root.dataset.theme as Theme | undefined;
    if (pinned === "light" || pinned === "dark") {
      setTheme(pinned);
      return;
    }
    setTheme(
      window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark",
    );
  }, []);

  /* While no explicit choice is stored, the page is still following the system
     — so keep following it if the reader changes that setting mid-session. */
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    const onChange = (e: MediaQueryListEvent) => {
      if (document.documentElement.dataset.theme) return;
      setTheme(e.matches ? "light" : "dark");
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const toggle = () => {
    const next: Theme = theme === "light" ? "dark" : "light";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("pg-theme", next);
    } catch {
      /* Private browsing refuses storage; the choice still holds for this
         session, which is better than refusing to switch at all. */
    }
    setTheme(next);
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
        "flex min-h-11 items-center gap-2.5 rounded-full border text-[13px] font-medium transition-colors",
        "border-rule-control text-ink-2 hover:border-gold hover:text-ink",
        collapsed ? "w-11 justify-center px-0" : "w-fit px-4",
      )}
    >
      {isLight ? (
        <IconSun aria-hidden="true" className="h-4 w-4 flex-none text-gold" />
      ) : (
        <IconMoon aria-hidden="true" className="h-4 w-4 flex-none text-gold" />
      )}
      {!collapsed && <span className="min-w-[2.6rem] text-left">{label}</span>}
    </button>
  );
}
