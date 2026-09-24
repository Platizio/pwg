/**
 * The arithmetic behind the instrument tab strip, kept out of the component so
 * it can be tested without a DOM: which tab a key lands on, how far the strip
 * must scroll to bring a tab clear of its edge fades, and which of those fades
 * should be showing at all.
 */

/**
 * Where a key moves the selection in a horizontal tablist, per the WAI-ARIA
 * tabs pattern: arrows step and wrap, Home and End jump to the ends. `null`
 * means the key is not the strip's, so the caller leaves the event alone.
 */
export function stepTab(key: string, index: number, count: number): number | null {
  if (count <= 0) return null;
  switch (key) {
    case "Home":
      return 0;
    case "End":
      return count - 1;
    case "ArrowRight":
      return index < 0 ? 0 : (index + 1) % count;
    case "ArrowLeft":
      return index < 0 ? count - 1 : (index - 1 + count) % count;
    default:
      return null;
  }
}

/**
 * The scrollLeft that shows [start, end] in full and at least `margin` clear of
 * either edge, so the tab never comes to rest under a fade. `null` when it is
 * already there. The result is clamped to the distance the strip can travel,
 * which is what returns the first tab to a scroll of exactly zero.
 *
 * A tab wider than the clear window aligns its start: the beginning of a label
 * is the part that says which tab it is.
 */
export function revealScrollLeft({
  scrollLeft,
  viewport,
  content,
  start,
  end,
  margin,
}: {
  scrollLeft: number;
  viewport: number;
  content: number;
  start: number;
  end: number;
  margin: number;
}): number | null {
  const max = Math.max(0, content - viewport);
  const clamp = (x: number) => Math.min(max, Math.max(0, Math.round(x)));

  const clearStart = scrollLeft + margin;
  const clearEnd = scrollLeft + viewport - margin;

  let target: number | null = null;
  if (end - start > viewport - margin * 2) target = start - margin;
  else if (start < clearStart) target = start - margin;
  else if (end > clearEnd) target = end + margin - viewport;
  if (target === null) return null;

  const next = clamp(target);
  return next === Math.round(scrollLeft) ? null : next;
}

/**
 * Which directions have more strip to see. A pixel of tolerance on each side
 * because zoomed and high-density displays report fractional scroll positions,
 * and a strip resting at its true end can read 0.5px short of it.
 */
export function overflowEdges(
  scrollLeft: number,
  viewport: number,
  content: number,
): { start: boolean; end: boolean } {
  return {
    start: scrollLeft > 1,
    end: scrollLeft + viewport < content - 1,
  };
}

/**
 * A mask that fades the strip's content out toward any edge that has more
 * beyond it. A mask rather than a painted gradient because the strip sits on
 * the shell's champagne wash, and on a solid ground only once the header pins:
 * no single colour matches both, but fading the content itself needs none.
 */
export function edgeMask(
  edges: { start: boolean; end: boolean },
  fade: number,
): string | undefined {
  if (!edges.start && !edges.end) return undefined;
  const head = edges.start ? `transparent 0, #000 ${fade}px` : "#000 0";
  const tail = edges.end ? `#000 calc(100% - ${fade}px), transparent 100%` : "#000 100%";
  return `linear-gradient(to right, ${head}, ${tail})`;
}
