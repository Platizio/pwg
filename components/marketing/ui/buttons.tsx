"use client";

import Link from "next/link";
import type { ComponentPropsWithoutRef, ReactNode } from "react";

/**
 * The three buttons, and only three.
 *
 * `GoldButton` is the one primary action a view may carry. `GlassButton` is the
 * ghost beside it. `QuietButton` is a hairline for tertiary actions. Each
 * renders the element its props imply: an absolute URL becomes an anchor that
 * opens in a new tab with the house affordance, an internal path becomes a
 * next/link, and no href at all becomes a real <button>.
 *
 * Visuals live in app/(site)/styles/glass.css.
 */
type Size = "sm" | "md" | "lg";

type Props = {
  children: ReactNode;
  href?: string;
  size?: Size;
  className?: string;
  /** For the ghost on a night surface. */
  dark?: boolean;
} & Omit<ComponentPropsWithoutRef<"button">, "className" | "children">;

const cx = (...parts: Array<string | false | undefined>) => parts.filter(Boolean).join(" ");

function Button({ base, href, size = "md", className, dark, children, ...rest }: Props & { base: string }) {
  const cls = cx(
    base,
    size === "sm" && "btn--sm",
    size === "lg" && "btn--lg",
    dark && base === "btn-glass" && "btn-glass--dark",
    className,
  );

  if (href && /^https?:\/\//.test(href)) {
    return (
      <a className={cls} href={href} target="_blank" rel="noopener noreferrer">
        {children}
        <span className="sr-only"> (opens in a new tab)</span>
      </a>
    );
  }
  if (href) {
    return (
      <Link className={cls} href={href}>
        {children}
      </Link>
    );
  }
  return (
    <button type="button" className={cls} {...rest}>
      {children}
    </button>
  );
}

export function GoldButton(props: Props) { return <Button base="btn-gold" {...props} />; }
export function GlassButton(props: Props) { return <Button base="btn-glass" {...props} />; }
export function QuietButton(props: Props) { return <Button base="btn-quiet" {...props} />; }

/** The house arrow, for the primary action. */
export function Arrow() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12h14M13 5l7 7-7 7" />
    </svg>
  );
}
