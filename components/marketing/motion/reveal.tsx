"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ElementType, type ReactNode } from "react";
import { motion, useInView, useReducedMotion } from "motion/react";
import { EASE } from "@/lib/tokens";

/*
 * Entrance motion that server-renders VISIBLE.
 *
 * motion serialises `initial` into the server HTML, so `initial={{ opacity: 0 }}`
 * ships the page invisible to anyone whose JavaScript never runs. The server
 * renders the finished state (`initial={false}`); the hidden state is applied
 * only on the client, in a layout effect, and only to elements that start
 * below the fold, where nobody can watch them being hidden. Hiding is instant
 * and only the reveal is animated, so a fast scroll never catches an element
 * halfway through disappearing.
 *
 * Opacity and transform only. Never wrap an LCP element or an element whose
 * children are position: sticky (a transformed ancestor breaks sticky).
 */
const RISEN = { opacity: 1, y: 0 };
const WAITING = { opacity: 0, y: 22 };

const useMeasureEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

type Props = {
  children: ReactNode;
  className?: string;
  /** Seconds. Siblings stagger by passing `index * 0.06`. */
  delay?: number;
  /** The element to render. Defaults to a div. */
  as?: "div" | "li" | "section" | "article" | "span";
};

export function Reveal({ children, className, delay = 0, as = "div" }: Props) {
  const ref = useRef<HTMLElement>(null);
  const reduce = useReducedMotion();
  const [armed, setArmed] = useState(false);
  const seen = useInView(ref, { once: true, margin: "0px 0px -12% 0px" });

  useMeasureEffect(() => {
    if (reduce) return;
    const el = ref.current;
    if (!el) return;
    if (el.getBoundingClientRect().top > window.innerHeight) setArmed(true);
  }, [reduce]);

  const hidden = armed && !seen;
  const Tag = (motion as unknown as Record<string, ElementType>)[as];

  return (
    <Tag
      ref={ref}
      className={className}
      initial={false}
      animate={hidden ? WAITING : RISEN}
      transition={hidden ? { duration: 0 } : { duration: 0.62, ease: EASE, delay }}
    >
      {children}
    </Tag>
  );
}
