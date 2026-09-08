"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ElementType, type ReactNode, type RefObject } from "react";
import { motion, useReducedMotion } from "motion/react";
import { EASE } from "@/lib/tokens";

/*
 * Entrance motion that can never leave content hidden.
 *
 * The server renders the finished state. On the client, in a layout effect,
 * an element that starts below the fold is hidden — instantly, before paint —
 * and revealed when it comes into view. Two things reveal it, not one: an
 * IntersectionObserver, and a scroll-position check on every scroll and
 * resize. The previous implementation relied on the observer alone and a
 * whole section once stayed at zero opacity; this one cannot, because the
 * scroll listener reads the element's box directly. A document that is not
 * visible when the effect runs (a background tab, a hidden pane) is never
 * armed at all.
 *
 * Opacity and transform only. Never wrap an element whose descendants are
 * position: sticky — a transformed ancestor breaks sticky.
 */
const useMeasureEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

export function useArmedReveal<T extends HTMLElement>(threshold = 0.92): { ref: RefObject<T | null>; hidden: boolean } {
  const ref = useRef<T>(null);
  const reduce = useReducedMotion();
  const [hidden, setHidden] = useState(false);

  useMeasureEffect(() => {
    if (reduce) return;
    const el = ref.current;
    if (!el) return;
    if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
    if (el.getBoundingClientRect().top <= window.innerHeight) return;
    setHidden(true);
  }, [reduce]);

  useEffect(() => {
    if (!hidden) return;
    const el = ref.current;
    if (!el) return;
    let done = false;
    const reveal = () => {
      if (done) return;
      done = true;
      setHidden(false);
    };
    const check = () => {
      if (el.getBoundingClientRect().top < window.innerHeight * threshold) reveal();
    };
    let io: IntersectionObserver | undefined;
    if ("IntersectionObserver" in window) {
      io = new IntersectionObserver(
        (entries) => {
          if (entries.some((e) => e.isIntersecting)) reveal();
        },
        { rootMargin: "0px 0px -8% 0px" },
      );
      io.observe(el);
    }
    window.addEventListener("scroll", check, { passive: true });
    window.addEventListener("resize", check, { passive: true });
    check();
    return () => {
      io?.disconnect();
      window.removeEventListener("scroll", check);
      window.removeEventListener("resize", check);
    };
  }, [hidden, threshold]);

  return { ref, hidden };
}

const RISEN = { opacity: 1, y: 0 };
const WAITING = { opacity: 0, y: 22 };

type Props = {
  children: ReactNode;
  className?: string;
  /** Seconds. Siblings stagger by passing `index * 0.06`. */
  delay?: number;
  as?: "div" | "li" | "section" | "article" | "p" | "figure" | "dl";
};

export function Rise({ children, className, delay = 0, as = "div" }: Props) {
  const { ref, hidden } = useArmedReveal<HTMLDivElement>();
  const Tag = (motion as unknown as Record<string, ElementType>)[as];
  return (
    <Tag
      ref={ref}
      className={className}
      initial={false}
      animate={hidden ? WAITING : RISEN}
      transition={hidden ? { duration: 0 } : { duration: 0.72, ease: EASE, delay }}
    >
      {children}
    </Tag>
  );
}
