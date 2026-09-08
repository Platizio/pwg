import type { CSSProperties, ReactNode } from "react";
import { assertNoTrackGap } from "@/lib/motion";

type Props = {
  /**
   * The items, rendered twice. Give each a stable key.
   *
   * Each one must contain something focusable — see the note on pausing below.
   */
  children: ReactNode[];
  /** Space after each item, as a CSS length. Becomes margin on the item. */
  spacing?: string;
  /** Seconds for one full pass. */
  duration?: number;
  /** Goes on the overflow wrapper, not on the tape's flex track. */
  className?: string;
  label: string;
};

/**
 * A seamless tape: the list rendered twice and translated -50%. The second
 * pass is aria-hidden so a screen reader hears each item once. Spacing goes on
 * the item, never on the track (see the note above marqueeSeamDrift).
 *
 * PAUSING IS THE CALLER'S RESPONSIBILITY TO ENABLE. The tape stops on
 * `.marquee:hover` and `.marquee:focus-within` (base.css), and stops outright
 * under reduced motion — but hover does not exist on touch, so the only pause
 * a touch or keyboard reader can reach is focus. WCAG 2.2.2 asks for one on
 * anything that moves for more than five seconds, so every item has to contain
 * a focusable element: a tape of links or buttons, never one of bare text.
 */
export function Marquee({ children, spacing = "2rem", duration = 46, className, label }: Props) {
  /* The class list this sees is the wrapper's — the track's is fixed and out of
     a caller's reach — so what it catches is the author who reached for `gap-4`
     to space the items. That class would silently do nothing here, and doing it
     properly, on the track, would break the wrap. Either way the answer is the
     `spacing` prop. */
  if (process.env.NODE_ENV !== "production") assertNoTrackGap({ className });
  const style = { "--marquee-spacing": spacing, "--marquee-duration": `${duration}s` } as CSSProperties;
  return (
    <div className={["marquee", className].filter(Boolean).join(" ")} role="region" aria-label={label} style={style}>
      <div className="marquee-track">
        {children.map((child, i) => (
          <div className="marquee-item" key={`a-${i}`}>{child}</div>
        ))}
        {/* `inert` as well as `aria-hidden`: the items are links and buttons, so
            hiding the clone from the accessibility tree without also taking it
            out of the tab order would leave a keyboard user a second set of
            stops the screen reader never announces. */}
        {children.map((child, i) => (
          <div className="marquee-item" key={`b-${i}`} aria-hidden="true" inert>{child}</div>
        ))}
      </div>
    </div>
  );
}
