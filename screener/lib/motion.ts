import type { Transition, Variants } from "motion/react";
import { EASE } from "./tokens";

/** The design's reveal ease — every bar, panel and drawer shares it. */
export const reveal: Transition = { duration: 0.45, ease: EASE };

/** Bars and meters grow over a full second, as in the source. */
export const grow: Transition = { duration: 1, ease: EASE };

export const drawerSpring: Transition = {
  type: "spring",
  stiffness: 380,
  damping: 38,
  mass: 0.9,
};

/** The source's `riseIn` — used whenever a tab panel swaps in. */
export const riseIn: Variants = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: reveal },
  exit: { opacity: 0, y: -8, transition: { duration: 0.18, ease: "easeIn" } },
};

/** The source's `popIn` — the instrument monogram and the fill confirmation. */
export const popIn: Variants = {
  hidden: { opacity: 0, scale: 0.9 },
  show: { opacity: 1, scale: 1, transition: { duration: 0.32, ease: "easeOut" } },
  exit: { opacity: 0, scale: 0.96, transition: { duration: 0.15 } },
};

export const fade: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: 0.25 } },
  exit: { opacity: 0, transition: { duration: 0.2 } },
};

/**
 * Staggered list entrance. Kept at 0.03s per item — anything slower and the
 * tail of a long watchlist visibly lags behind the head.
 */
export const listStagger: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.03, delayChildren: 0.04 } },
};

export const listItem: Variants = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3, ease: "easeOut" } },
};
