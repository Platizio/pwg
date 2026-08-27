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
