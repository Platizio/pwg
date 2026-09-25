/**
 * Class helpers shared by every surface.
 *
 * Deliberately NOT inside a `"use client"` module. `cn` is a pure string join
 * and `REGISTER_X` is a constant, but everything exported across a client
 * boundary becomes a client reference — so a server component that imported
 * either from `components/terminal/ui.tsx` would be handed a proxy and throw
 * "attempted to call cn() from the server". Keeping them here lets both sides
 * use them.
 */
export function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

/**
 * Standard horizontal inset for anything inside a register.
 *
 * The dashboard's rules run the full width of the working column and pad
 * themselves; this is that padding, and it belongs on cells, never on a
 * parent.
 */
export const REGISTER_X = "px-4 sm:px-5 lg:px-[26px]";

/**
 * The backdrop behind a modal layer: the drawer, the order ticket, the news
 * reader. Near-black on the dark theme; on the light theme the theme's own
 * shadow colour at a third, because the dark one dropped a black slab over
 * the cream page. Both of the light theme's entry points — a pinned choice and
 * an unpinned light system — are spelled out the way globals.css spells them,
 * and written here in full because Tailwind reads class names as literal text.
 */
export const SCRIM =
  "bg-[rgba(6,5,4,0.78)] [:root[data-theme=light]_&]:bg-[rgba(var(--c-shadow-rgb),0.34)] [@media(prefers-color-scheme:light)]:[:root:not([data-theme=dark])_&]:bg-[rgba(var(--c-shadow-rgb),0.34)]";
