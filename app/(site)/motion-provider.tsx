"use client";

import { MotionConfig } from "motion/react";
import type { ReactNode } from "react";

/**
 * One reduced-motion contract for the whole marketing site.
 *
 * Before this, "respect reduced motion" was three disconnected things: a blanket
 * `*{animation-duration:.01ms}` rule in css/styles.css that cannot touch motion's
 * per-frame inline styles or its WAAPI animations, Lenis declining to start, and
 * a `useReducedMotion()` call in exactly one file. Nothing joined them, so any
 * JS-driven animation added to this site would have ignored the user's setting
 * entirely.
 *
 * `reducedMotion="user"` makes every `motion` element below suppress transform
 * and layout animation while keeping opacity — the right default, and the same
 * one the terminal already uses at components/terminal/shell.tsx.
 *
 * Scroll scenes still need their own branch: a listener that computes nothing is
 * still a listener. See the contract at the head of lib/scroll.ts.
 */
export function MotionProvider({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
