"use client";

import { useEffect } from "react";
import { pointerFraction } from "@/lib/motion";

/**
 * How long the ripple element stays in the DOM.
 *
 * The keyframe in `app/(site)/styles/glass.css` runs `ripple 0.7s`; the extra
 * 100ms is margin, so the node is never pulled out from under the animation on
 * a busy frame. Shorten this below 700ms and the ripple would visibly snap.
 */
const RIPPLE_MS = 800;

/**
 * A press ripple on every `.btn-gold`, delegated from the document so a button
 * rendered later still gets one. Transform and opacity only; the element is
 * removed when the animation is over.
 *
 * The reduced-motion query is subscribed rather than sampled once, so turning
 * the preference on mid-session stops new ripples immediately rather than at
 * the next full page load.
 */
export function useRipple(): void {
  useEffect(() => {
    if (typeof window === "undefined") return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    /* Pending removals, so the effect cleans up after itself: a rapid press
       sequence just before a route change would otherwise leave timers running
       against nodes nobody can see. */
    const timers = new Set<number>();
    let listening = false;

    const onDown = (e: PointerEvent) => {
      /* Only the press that actually activates the button: a right- or
         middle-click opens a menu or a background tab, and the second finger of
         a multi-touch is not a press at all, so neither earns an acknowledgement.
         Touch and pen both report button 0 and are unaffected. */
      if (!e.isPrimary || e.button !== 0) return;
      const target = (e.target as HTMLElement | null)?.closest?.(".btn-gold");
      if (!(target instanceof HTMLElement)) return;
      const r = target.getBoundingClientRect();
      const f = pointerFraction({ left: r.left, top: r.top, width: r.width, height: r.height }, e.clientX, e.clientY);
      const dot = document.createElement("span");
      dot.className = "ripple";
      dot.setAttribute("aria-hidden", "true");
      dot.style.left = `${f.x}%`;
      dot.style.top = `${f.y}%`;
      target.appendChild(dot);
      const timer = window.setTimeout(() => {
        timers.delete(timer);
        dot.remove();
      }, RIPPLE_MS);
      timers.add(timer);
    };

    const sync = () => {
      const wanted = !reduce.matches;
      if (wanted === listening) return;
      listening = wanted;
      if (wanted) document.addEventListener("pointerdown", onDown, { passive: true });
      else document.removeEventListener("pointerdown", onDown);
    };

    sync();
    reduce.addEventListener("change", sync);
    return () => {
      reduce.removeEventListener("change", sync);
      document.removeEventListener("pointerdown", onDown);
      for (const timer of timers) window.clearTimeout(timer);
      timers.clear();
    };
  }, []);
}
