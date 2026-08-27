"use client";

import { useEffect, useState } from "react";

/**
 * Keeps an element mounted for `exitMs` after `open` goes false, so it can
 * animate out before it leaves the DOM.
 *
 * This exists because Framer Motion's `AnimatePresence` never resolves its exit
 * in this stack (Next 16 / React 19.2 / Turbopack, motion 12.43): the child
 * finishes its exit transition but is not unmounted, leaving an invisible
 * off-screen dialog in the tree that still holds focusable controls. Owning the
 * timing here is deterministic and keeps the enter/exit motion the design asks
 * for.
 *
 * Mounting is derived straight from `open`, never from state, so opening can
 * never miss a frame or depend on an effect having run. State is used only to
 * hold the element in the tree on the way out.
 *
 * Drive the animation itself from `open`, so the element mounts in its closed
 * state and animates open.
 */
export function usePresence(open: boolean, exitMs: number): boolean {
  const [lingering, setLingering] = useState(open);

  useEffect(() => {
    if (open) {
      // Arm the exit window. Converges in one pass and only ever runs on the
      // rising edge, which is the case this rule is not aimed at.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLingering(true);
      return;
    }
    const timer = setTimeout(() => setLingering(false), exitMs);
    return () => clearTimeout(timer);
  }, [open, exitMs]);

  return open || lingering;
}
