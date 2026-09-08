/**
 * The shared motion vocabulary.
 *
 * Both the terminal and the marketing layer name their easing, their variants
 * and their scroll windows here, so a reveal on /products and a reveal on the
 * dashboard are the same gesture rather than two that happen to look alike.
 *
 * THIS MODULE HAS NO RUNTIME IMPORT FROM `motion/react`, and must not grow one.
 * `motion/react` cannot be resolved under `--conditions=react-server`, which is
 * how `npm test` runs, so a single value import here would take every test
 * below with it. Types are fine — they are erased before node sees the file.
 * That constraint is also why the pure logic the marketing components lean on
 * lives here rather than beside them in a `.tsx`: node's type stripping does
 * not do JSX, so a `.tsx` is a file no test can reach.
 */
import type { Transition, Variants } from "motion/react";
/* Extension included deliberately: node resolves these paths literally when
   it runs the test suite, and this import was previously unreachable. */
import { EASE } from "./tokens.ts";

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

/* ============================================================ scroll windows

   Four names, and only four.

   `useScroll`'s `offset` is two edge pairs: where the scene's progress reads 0
   and where it reads 1. Each edge is `"<target> <container>"` — the line on the
   element, then the line on the viewport it has to meet. It is an expressive
   little language and that is exactly the problem: fifteen pages left to invent
   their own offsets produce fifteen vocabularies, and nobody can then say
   whether two sections animate on the same beat.

   So a scene picks a name:

     enter    the arrival. 0 as the top touches the bottom of the viewport,
              1 as the top reaches the middle. Half a viewport of travel — the
              window a fade-and-rise wants.
     through  the whole pass, first pixel in to last pixel out. The widest
              window there is; use it for anything that should track the
              element's presence rather than a moment in it.
     pin      the scrub. For an element at least a viewport tall — 0 when its
              top meets the viewport top, 1 when its bottom meets the bottom.
              Shorter than the viewport and this window inverts; there is no
              pass to track, so `useSceneScroll` says so in development.
     exit     the tail. 0 as the bottom crosses the middle, 1 as it leaves.
*/

export type SceneOffsetName = "enter" | "through" | "pin" | "exit";

/* `"<target edge> <container edge>"` — the only spelling these four windows use.
 *
 * A template union rather than `string` or motion's own type. `string` was too
 * wide: every offset compiled here and then failed at the useScroll call site,
 * so the error surfaced three files from the mistake. Motion's own union was
 * too wide the other way — it admits numeric and object forms that
 * offsetScrollTime's arithmetic cannot parse. This is exactly the set of edges
 * that is both valid to motion and parseable here. */
type Anchor = "start" | "center" | "end";
export type SceneEdge = `${Anchor} ${Anchor}`;

export type SceneOffset = readonly [SceneEdge, SceneEdge];

export const SCENE_OFFSETS: Readonly<Record<SceneOffsetName, SceneOffset>> = Object.freeze({
  enter: Object.freeze(["start end", "start center"] as const),
  through: Object.freeze(["start end", "end start"] as const),
  pin: Object.freeze(["start start", "end end"] as const),
  exit: Object.freeze(["end center", "end start"] as const),
});

/**
 * The named window, by name.
 *
 * Frozen all the way down: a page that mutated the tuple it borrowed would
 * silently re-time every other page on the site.
 */
export function sceneOffset(name: SceneOffsetName): SceneOffset {
  return SCENE_OFFSETS[name];
}

const NAMED_EDGES: Readonly<Record<string, number>> = Object.freeze({
  start: 0,
  center: 0.5,
  end: 1,
});

/**
 * An edge word as a fraction of the thing it names — `start` 0, `end` 1.
 *
 * motion also accepts pixel edges (`"100px"`). Those are refused here rather
 * than parsed, because a pixel is not a fraction of anything: reading "100px"
 * as 100 would place the edge a hundred viewports down and quietly invert every
 * comparison built on it.
 */
export function edgeFraction(word: string): number {
  const w = word.trim().toLowerCase();
  if (Object.hasOwn(NAMED_EDGES, w)) return NAMED_EDGES[w];
  if (w.endsWith("%")) {
    const pct = Number(w.slice(0, -1));
    if (Number.isFinite(pct)) return pct / 100;
  }
  if (w !== "") {
    const n = Number(w);
    if (Number.isFinite(n)) return n;
  }
  throw new Error(
    `Unreadable scroll edge "${word}". Use start, center, end, a number or a percentage.`,
  );
}

/**
 * Where an edge sits on the scroll axis, in viewport heights, for a target
 * `targetHeight` viewports tall. Larger is later.
 *
 * The model: put the container's top at 0 and let `y` be the target's top, both
 * in container heights. An edge `"<a> <b>"` is met when `y + a*h = b`, so
 * `y = b - a*h`. Scrolling down decreases `y`, so `-y = a*h - b` increases with
 * scroll and is the number below.
 *
 * This exists so "the window opens before it closes" is something a test can
 * check rather than something a reviewer has to picture.
 */
export function offsetScrollTime(edge: SceneEdge, targetHeight: number): number {
  const parts = edge.trim().split(/\s+/);
  if (parts.length !== 2) {
    throw new Error(`Scroll edge "${edge}" is not "<target> <container>".`);
  }
  return edgeFraction(parts[0]) * targetHeight - edgeFraction(parts[1]);
}

/* ==================================================================== the tape

   A marquee is one list rendered twice, translated by -50% forever. It loops
   invisibly only if half the track is exactly the distance from an item to its
   own duplicate — and spacing is what decides whether it is.

   Spacing as `margin-inline-end` on the ITEM: every cell occupies
   `width + spacing`, N cells occupy `N * (width + spacing)`, and half the track
   lands precisely on the duplicate. Drift zero.

   Spacing as `gap` on the TRACK: N cells have N-1 gaps between them, but the
   seam where the two halves meet picks up a gap of its own. The track is one
   gap narrower than the arithmetic assumes, so -50% lands half a gap short and
   the tape twitches, once per cycle, forever.

   Hence `assertNoTrackGap`, which is a thrown error rather than a comment,
   because a comment does not survive somebody adding `gap-3` in a hurry.
*/

export type MarqueeSpacingMode = "margin" | "gap";

export type MarqueeGeometry = {
  /** Cells in ONE half — the duplicate is not counted. */
  count: number;
  itemWidth: number;
  spacing: number;
  mode: MarqueeSpacingMode;
};

/** Width of the full doubled track. */
export function marqueeTrackWidth({ count, itemWidth, spacing, mode }: MarqueeGeometry): number {
  const cells = count * 2;
  if (cells <= 0) return 0;
  return mode === "margin"
    ? cells * (itemWidth + spacing)
    : cells * itemWidth + (cells - 1) * spacing;
}

/**
 * How far the seam misses by, in px, each time the tape wraps.
 *
 * Zero for `margin`. Half a spacing for `gap` — small enough to survive review,
 * large enough to see.
 */
export function marqueeSeamDrift(geometry: MarqueeGeometry): number {
  if (geometry.count <= 0) return 0;
  const duplicateStart = geometry.count * (geometry.itemWidth + geometry.spacing);
  return duplicateStart - marqueeTrackWidth(geometry) / 2;
}

/* Tailwind's horizontal gap utilities, after variants and `!` are stripped.
   Deliberately anchored to real Tailwind values — a number, `px`, or a bracket
   — so that `gap-analysis-panel` is left alone. `gap-y-*` and `rowGap` are
   fine: the tape is one row, so a row gap can never reach the seam. */
const GAP_UTILITY = /^-?gap(-x)?-(px|\d+(\.\d+)?|\[.+\])$/;
const SPACE_X_UTILITY = /^-?space-x-(px|\d+(\.\d+)?|\[.+\])$/;
const GAP_STYLE_PROPS = new Set(["gap", "columngap", "column-gap"]);

function bareUtility(token: string): string {
  const afterVariants = token.slice(token.lastIndexOf(":") + 1);
  return afterVariants.startsWith("!") ? afterVariants.slice(1) : afterVariants;
}

/**
 * Throws if horizontal spacing is about to be applied to a marquee track.
 *
 * Called from `<Marquee>` in development only — the check costs a regex per
 * class and the failure it catches is a visual one, so it earns its place while
 * a page is being written and nothing in production. What it reads there is the
 * wrapper's class list, since the track's is fixed: an author reaching for
 * `gap-4` to space the items is the mistake that actually happens.
 */
export function assertNoTrackGap({
  className,
  style,
}: {
  className?: string;
  style?: object | null;
} = {}): void {
  for (const token of (className ?? "").split(/\s+/)) {
    if (!token) continue;
    const utility = bareUtility(token);
    if (GAP_UTILITY.test(utility)) {
      throw new Error(
        `<Marquee>: "${token}" is a horizontal gap, and a gap cannot space a tape. ` +
          `On the flex track it breaks the loop — N cells have N-1 gaps, so the -50% ` +
          `wrap lands half a gap short and the tape jumps once per cycle — and on the ` +
          `overflow wrapper it does nothing at all. Pass the \`spacing\` prop instead ` +
          `— it becomes margin-inline-end on the item.`,
      );
    }
    if (SPACE_X_UTILITY.test(utility)) {
      throw new Error(
        `<Marquee>: "${token}" is a space-x, which is a gap by another name, and breaks ` +
          `the wrap the same way. Pass the \`spacing\` prop instead.`,
      );
    }
  }

  if (style) {
    for (const [prop, value] of Object.entries(style)) {
      if (value == null) continue;
      if (GAP_STYLE_PROPS.has(prop.toLowerCase())) {
        throw new Error(
          `<Marquee>: inline \`${prop}\` on the tape track breaks the -50% wrap. ` +
            `Pass the \`spacing\` prop instead.`,
        );
      }
    }
  }
}

/* ================================================================== figures

   A counter animating 0 -> 1,000 renders "7", then "438", then "1,000". If the
   element is only as wide as what it currently shows, everything beside it
   slides about for the length of the count. So it reserves the widest thing it
   will ever render, up front, and animates inside that.

   Character count is the wrong measure. The site sets
   `font-variant-numeric: tabular-nums`, which makes every digit exactly one
   width and leaves the separators narrow, so "99999" is wider than "1,000"
   despite both being five characters.
*/

/** Separators that stay narrow under tabular figures. */
const HALF_FIGURES = new Set([".", ",", "'", ":", " ", " "]);

/** Approximate width of a rendered figure, in digit widths. */
export function figureWidth(text: string): number {
  let width = 0;
  for (const ch of text) width += HALF_FIGURES.has(ch) ? 0.5 : 1;
  return width;
}

/**
 * The widest string a counter from `from` to `to` will render.
 *
 * Walks the endpoints plus `samples - 2` evenly spaced points between them and
 * returns the widest rendering it saw — an actual output of `format`, never a
 * synthesised placeholder, because reserving "0000" for a counter that only ever
 * shows "1,000" is a lie the layout pays for on every render.
 *
 * Both endpoints are always measured, whatever `samples` says, since for a
 * monotone formatter the widest value is almost always one of them. Sampling is
 * for the formatters that are not monotone: the ones that abbreviate above a
 * threshold, or gain a sign on the way through zero, where the widest string is
 * somewhere in the middle of the count.
 */
export function widestSample(
  from: number,
  to: number,
  format: (value: number) => string,
  samples = 32,
): string {
  if (from === to) return format(from);
  const steps = Math.max(2, Math.floor(samples));

  let widest = format(from);
  let width = figureWidth(widest);
  for (let i = 1; i < steps; i++) {
    const candidate = format(from + ((to - from) * i) / (steps - 1));
    const candidateWidth = figureWidth(candidate);
    if (candidateWidth > width) {
      widest = candidate;
      width = candidateWidth;
    }
  }
  return widest;
}

/* ================================================================== contents

   41 of the site's 50 URLs are long documents with no in-page navigation at
   all, so the contents list is the highest-value thing this layer ships. It is
   worth nothing unless its links land: every entry needs an id that exists on
   the page, exactly once.

   Duplicate ids are the failure that passes review. Two sections called "Fees"
   both slugify to #fees, the browser jumps to the first for both links, and the
   second entry is dead while still lighting up as you scroll past it.
*/

export type TocSource = {
  /** An id already in the markup. Kept as-is — see `tocItems`. */
  id?: string;
  text: string;
  level: number;
};

export type TocItem = { id: string; text: string; level: number };

/**
 * A heading's text as an anchor.
 *
 * NFKD first so accents decompose into combining marks, which are then dropped
 * with the rest of the punctuation — "café" becomes "cafe" rather than keeping
 * a mark that has to survive a round trip through the URL bar. Letters and
 * digits in any script are kept; both are legal in an HTML id and in a fragment.
 */
export function slugifyHeading(text: string): string {
  return text
    .normalize("NFKD")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Headings to contents entries, with an anchor guaranteed for each.
 *
 * Ids already in the markup are reserved before anything is generated, so when
 * a slug collides with one it is the GENERATED id that moves. That order is the
 * whole point: an id in the markup is a URL someone may have shared, and
 * renaming it to win a collision breaks every existing deep link to the page.
 *
 * Two headings that both arrive carrying the same explicit id are left alone.
 * That is a page with two elements sharing an id, and renaming one here would
 * turn a link that at least reaches the first section into one that reaches
 * nothing.
 */
export function tocItems(
  source: readonly TocSource[],
  options: { levels?: readonly number[] } = {},
): TocItem[] {
  const levels = options.levels ?? [2, 3];
  const kept = source.filter((heading) => levels.includes(heading.level));

  const taken = new Set<string>();
  for (const heading of kept) if (heading.id) taken.add(heading.id);

  return kept.map((heading, index) => {
    if (heading.id) return { id: heading.id, text: heading.text, level: heading.level };

    // An empty slug is an anchor to the top of the page, which reads as a
    // broken link rather than an absent one.
    const base = slugifyHeading(heading.text) || `section-${index + 1}`;
    let id = base;
    let suffix = 2;
    while (taken.has(id)) id = `${base}-${suffix++}`;
    taken.add(id);

    return { id, text: heading.text, level: heading.level };
  });
}

/* ================================================================= pointer

   The press ripple needs the pointer as a fraction of an element's box. One
   pure function, so a test can pin the arithmetic. */

export type Box = { left: number; top: number; width: number; height: number };

/** The pointer as percentages of the box. A degenerate box answers its centre. */
export function pointerFraction(box: Box, x: number, y: number): { x: number; y: number } {
  return {
    x: box.width > 0 ? ((x - box.left) / box.width) * 100 : 50,
    y: box.height > 0 ? ((y - box.top) / box.height) * 100 : 50,
  };
}
