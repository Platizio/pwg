"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { animate, useInView, useReducedMotion } from "motion/react";
import { EASE } from "@/lib/tokens";
import { widestSample } from "@/lib/motion";

type Props = {
  /** The final value. */
  to: number;
  /**
   * Renders a value as text. Runs during the server render too, so no Intl.
   *
   * A function prop cannot cross the RSC boundary, so `<Counter>` has to be
   * rendered from a client component; a server component passing this throws
   * before anything reaches the browser. Put the figure inside whichever
   * client island already owns that part of the page.
   */
  format: (n: number) => string;
  from?: number;
  /** Seconds. */
  duration?: number;
  className?: string;
};

/**
 * A figure that counts up once it is in view, inside a box already as wide as
 * the widest string it will render, so nothing beside it moves while it counts.
 * The server renders the final value; the count is an enhancement.
 *
 * Must be rendered from a client component — see `format`.
 */
export function Counter({ to, format, from = 0, duration = 1.2, className }: Props) {
  const ref = useRef<HTMLSpanElement>(null);
  const reduce = useReducedMotion();
  const seen = useInView(ref, { once: true, margin: "0px 0px -10% 0px" });
  const [text, setText] = useState(() => format(to));
  /* 32 `format` calls for an answer that only `from`, `to` and `format` can
     change — without the memo the count's own ~70 re-renders repeat all of
     them, every frame, for nothing. */
  const widest = useMemo(() => widestSample(from, to, format), [from, to, format]);

  /* `format` is read through a ref rather than depended on: a parent that
     re-renders mid-count with an inline `format={(n) => …}` hands over a fresh
     function, and a dependency on it would stop the animation and restart it
     from `from`, so the figure would visibly count backwards. */
  const formatRef = useRef(format);
  useEffect(() => {
    formatRef.current = format;
  });

  useEffect(() => {
    if (!seen || reduce) return;
    const controls = animate(from, to, {
      duration,
      ease: EASE,
      onUpdate: (v) => setText(formatRef.current(v)),
      onComplete: () => setText(formatRef.current(to)),
    });
    return () => controls.stop();
  }, [seen, reduce, from, to, duration]);

  return (
    <span ref={ref} className={["figure", className].filter(Boolean).join(" ")} style={{ display: "inline-grid" }}>
      <span aria-hidden="true" style={{ gridArea: "1 / 1", visibility: "hidden" }}>{widest}</span>
      <span style={{ gridArea: "1 / 1" }}>{text}</span>
    </span>
  );
}
