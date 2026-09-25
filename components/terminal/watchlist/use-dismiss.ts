import { useEffect, type RefObject } from "react";

/**
 * Close a floating panel on a press outside it or on Escape, and hand focus
 * back to whatever opened it when Escape was the reason.
 *
 * The three watchlist popovers (the rail's list switcher, the instrument
 * header's list picker, the page's delete confirmation) all need exactly this,
 * and the language picker beside them already does it the same way — one
 * behaviour, so a reader learns it once.
 */
export function useDismiss(
  open: boolean,
  close: () => void,
  root: RefObject<HTMLElement | null>,
  trigger?: RefObject<HTMLElement | null>,
) {
  useEffect(() => {
    if (!open) return;

    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) close();
    };
    /* Capture phase, and marked handled. Inside the mobile drawer the
       drawer's own Escape listener sits on the same document and was
       registered first, so in the bubble phase it ran first and one Escape
       closed the popover AND the drawer. Heard on the way down, the popover
       answers first and the drawer sees `defaultPrevented` and stays. */
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      close();
      trigger?.current?.focus();
    };

    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [open, close, root, trigger]);
}

/**
 * Arrow-key movement among a menu's items: Up and Down wrap, Home and End jump.
 * Attached to the menu element's onKeyDown.
 */
export function moveMenuFocus(e: React.KeyboardEvent<HTMLElement>) {
  const keys = ["ArrowDown", "ArrowUp", "Home", "End"];
  if (!keys.includes(e.key)) return;
  const items = Array.from(
    e.currentTarget.querySelectorAll<HTMLElement>("[data-menu-item]:not([disabled])"),
  );
  if (items.length === 0) return;
  e.preventDefault();
  const at = items.indexOf(document.activeElement as HTMLElement);
  const next =
    e.key === "Home"
      ? 0
      : e.key === "End"
        ? items.length - 1
        : e.key === "ArrowDown"
          ? (at + 1) % items.length
          : (at - 1 + items.length) % items.length;
  items[next]?.focus();
}
