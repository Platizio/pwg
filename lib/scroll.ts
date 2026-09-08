"use client";

/**
 * Scroll-linked motion for the marketing pages.
 *
 * ── the performance contract ────────────────────────────────────────────────
 *
 * 1. ONLY `transform` AND `opacity` MAY BIND TO A SCROLL VALUE.
 *    Both are composited: the browser hands them to the GPU and never re-runs
 *    layout or paint. Anything else — `width`, `top`, `height`, `margin` — puts
 *    a full layout pass on every scroll frame. `components/terminal/ui.tsx`
 *    documents the measured version of this on its `Meter`: seven bars animating
 *    `width` inside a `border-collapse` table re-resolved every column on every
 *    frame, roughly 460 whole-table relayouts over 1.1s, for a tab whose actual
 *    data cost was 0.075ms. The same bar on `scaleX` is free. A scroll handler
 *    runs for as long as the reader scrolls, so the multiplier is worse here.
 *
 * 2. `will-change` GOES ON WHILE THE SCENE IS IN VIEW, AND COMES OFF ON EXIT.
 *    It promotes the element to its own compositor layer, which is the point —
 *    and each layer costs memory and a composite step whether or not anything
 *    is moving. Left on permanently across the forty scenes of a long page, it
 *    is forty permanent layers: reliably worse than the jank it was added to
 *    fix. `ScrollScene` binds it to `useInView` for exactly this reason.
 *
 * 3. UNDER REDUCED MOTION THE SCENE IS NOT WRAPPED AT ALL.
 *    A listener that computes nothing is still a listener, and a scene that
 *    animates nothing still subscribes, still measures, still allocates. So the
 *    branch is at the COMPONENT boundary, not inside the hook: `<ScrollScene>`
 *    and `<Parallax>` return their children unwrapped, and the inner component
 *    that owns these hooks never mounts. Hooks cannot be called conditionally;
 *    components can be rendered conditionally. That is why the wrappers are
 *    split in two.
 *
 * ── lenis ──────────────────────────────────────────────────────────────────
 *
 * Lenis writes NATIVE scroll — `lenis.mjs` drives the page with
 * `scrollTo({ behavior: 'instant' })` — so `useScroll` reads the real scroll
 * position and needs no proxy, no `ScrollTrigger.scrollerProxy`, nothing.
 *
 * What it can do is trail by a frame: Lenis sets the position inside its own
 * rAF, and the browser's `scroll` event lands after. For most things that is
 * invisible. For anything pixel-locked to another moving element — a sticky
 * header meeting a rule, two layers that must stay registered — one frame of
 * slip is visible as a shimmer. Those use `useLenisProgress()`, which reads
 * Lenis's own `scroll` event and is therefore exactly in step. Everything else
 * uses `useScroll`, which is cheaper and needs no instance to exist.
 */

import { useEffect } from "react";
import {
  useMotionValue,
  useReducedMotion,
  useScroll,
  useTransform,
} from "motion/react";
import type { MotionValue } from "motion/react";
import type { RefObject } from "react";
import { getLenis } from "@/src/lib/smoothScroll";
import { SCENE_OFFSETS, type SceneOffset, type SceneOffsetName } from "@/lib/motion";

/** A scene's window: one of the four names, or an explicit pair for the rare case. */
export type SceneWindow = SceneOffsetName | SceneOffset;

function resolveWindow(offset: SceneWindow): SceneOffset {
  return typeof offset === "string" ? SCENE_OFFSETS[offset] : offset;
}

/**
 * Document scroll progress, 0 to 1, in step with Lenis.
 *
 * Reach for this only when something is pixel-locked to another moving element.
 * `useSceneScroll` is cheaper, is scoped to one element, and works whether or
 * not Lenis is running — which it is not under reduced motion, and not on
 * touch.
 *
 * Falls back to the native scroll position when there is no Lenis instance, so
 * a caller never has to ask which mode the page is in.
 */
export function useLenisProgress(): MotionValue<number> {
  const progress = useMotionValue(0);

  useEffect(() => {
    let detach: (() => void) | undefined;

    const readNative = () => {
      const limit = document.documentElement.scrollHeight - window.innerHeight;
      progress.set(limit > 0 ? window.scrollY / limit : 0);
    };

    const attach = () => {
      const lenis = getLenis();
      if (!lenis || detach) return;
      detach = lenis.on("scroll", () => progress.set(lenis.progress));
    };

    const onScroll = () => {
      /* Lenis is created by an effect in the site chrome, which is not
         guaranteed to have run when this one does. The first scroll is the
         latest we can afford to find out. */
      if (!detach) attach();
      if (!detach) readNative();
    };

    attach();
    readNative();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", readNative, { passive: true });

    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", readNative);
      detach?.();
    };
  }, [progress]);

  return progress;
}

/**
 * Progress through one element's scroll window, 0 to 1.
 *
 * The window is named rather than spelled out — see `SCENE_OFFSETS` in
 * lib/motion.ts for what the four names mean and why there are only four.
 */
export function useSceneScroll(
  ref: RefObject<HTMLElement | null>,
  offset: SceneWindow = "through",
): MotionValue<number> {
  const resolved = resolveWindow(offset);
  /* Spread to a mutable tuple. SCENE_OFFSETS is frozen and typed readonly on
     purpose — four named windows that nobody may edit in place — but motion's
     `offset` parameter is declared mutable, so a readonly tuple will not
     assign. Copying at the boundary keeps the constant immutable without
     widening its type for every other caller. */
  const { scrollYProgress } = useScroll({ target: ref, offset: [...resolved] });

  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    if (offset !== "pin") return;
    const el = ref.current;
    if (el && el.offsetHeight < window.innerHeight) {
      console.warn(
        "useSceneScroll: the `pin` window needs an element at least a viewport tall. " +
          `This one is ${el.offsetHeight}px against a ${window.innerHeight}px viewport, ` +
          "so its window is inverted and progress will never advance. Use `through`.",
      );
    }
  }, [ref, offset]);

  return scrollYProgress;
}

/**
 * Vertical parallax, in pixels of TOTAL travel.
 *
 * `distance` is the whole journey, not the amplitude: 80 means the layer moves
 * 80px across its window, from +40 to -40. Bind the result to `y` and nothing
 * else — see contract point 1.
 *
 * Call this only from a component that is not mounted under reduced motion.
 * `<Parallax>` handles that; a page reaching for the hook directly has to.
 */
export function useParallax(
  ref: RefObject<HTMLElement | null>,
  distance: number,
  offset: SceneWindow = "through",
): MotionValue<number> {
  const progress = useSceneScroll(ref, offset);
  return useTransform(progress, [0, 1], [distance / 2, -distance / 2]);
}

export type ZoomRevealOptions = {
  /** Scale at the opening of the window. Below 1 the element grows into place. */
  from?: number;
  /** Scale at the close. */
  to?: number;
  /** Fade in alongside the zoom. */
  fade?: boolean;
  offset?: SceneWindow;
};

/**
 * The house "settles into place" scene: a figure grows the last few percent and
 * fades up as it arrives.
 *
 * Returns motion values for `scale` and `opacity` — both composited, both safe
 * to bind to scroll. It deliberately does not return a `y`: a scene that scales
 * AND translates AND fades reads as three effects fighting, and the one that
 * loses is the content.
 *
 * `from` defaults to 0.94 rather than something more dramatic because the
 * element is real content at its destination size; anything under about 0.9
 * makes the text inside it visibly resample on the way.
 */
export function useZoomReveal(
  ref: RefObject<HTMLElement | null>,
  { from = 0.94, to = 1, fade = true, offset = "enter" }: ZoomRevealOptions = {},
): { scale: MotionValue<number>; opacity: MotionValue<number> } {
  const progress = useSceneScroll(ref, offset);
  const scale = useTransform(progress, [0, 1], [from, to]);
  /* Finishes at 0.6 so the content is fully legible for the last 40% of the
     window rather than still arriving when it reaches the middle of the screen. */
  const opacity = useTransform(progress, [0, 0.6], fade ? [0, 1] : [1, 1]);
  return { scale, opacity };
}

/**
 * Whether this reader has asked for less motion.
 *
 * Re-exported so a marketing component can branch without importing
 * `motion/react` directly and, in doing so, quietly reaching for something else
 * from it. `<MotionConfig reducedMotion="user">` at app/(site)/motion-provider.tsx
 * already handles every `motion` element; this is for the cases where the right
 * answer is not to render the thing at all.
 */
export function useLessMotion(): boolean {
  return useReducedMotion() ?? false;
}
