"use client";

import { motion } from "motion/react";
import Link from "next/link";
import type { ReactNode } from "react";
import { EASE } from "@/lib/tokens";
import { cn } from "@/lib/ui";

/* Re-exported so the many client components that import `cn` from here keep
   working; the definition lives outside the client boundary. See lib/ui.ts. */
export { cn } from "@/lib/ui";

/**
 * Lux has no cards. A section is a serif heading, an optional tracked eyebrow,
 * and whatever rules the content draws for itself.
 */
export function Section({
  title,
  eyebrow,
  action,
  className,
  headingClassName,
  children,
}: {
  title?: string;
  eyebrow?: ReactNode;
  action?: ReactNode;
  className?: string;
  headingClassName?: string;
  children: ReactNode;
}) {
  return (
    <section className={className}>
      {(title || action) && (
        <header className="mb-4 flex items-baseline justify-between gap-4">
          <div>
            {title && (
              <h3 className={cn("font-serif text-[24px] leading-tight", headingClassName)}>
                {title}
              </h3>
            )}
            {eyebrow && <p className="eyebrow mt-1.5">{eyebrow}</p>}
          </div>
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

/**
 * 2px hairline meter — the only bar Lux draws. Grows from zero, keyed by
 * instrument so it replays when the terminal switches symbol.
 *
 * The fill is laid out once at its final width and animated with scaleX, not
 * by animating width itself. Width is a layout property: animating it makes
 * the browser re-run layout on every frame, and the Performance tab puts seven
 * of these inside the cells of a `border-collapse`, `table-layout: auto`
 * table — where each frame re-resolves column widths and borders for every
 * row. Seven cells doing that at 60fps for 1.1s is roughly 460 full table
 * relayouts, which is why that tab felt slow while its actual data cost was
 * 0.075ms. scaleX is composited: no layout, no reflow, same 1.1s growth.
 *
 * transformOrigin is pinned left so the bar still grows from its start edge
 * rather than opening outward from the middle.
 */
export function Meter({
  width,
  color,
  delay = 0,
  height = 2,
}: {
  width: string;
  color: string;
  delay?: number;
  height?: number;
}) {
  return (
    <div className="w-full bg-rule-list" style={{ height }}>
      <motion.div
        initial={{ scaleX: 0 }}
        animate={{ scaleX: 1 }}
        transition={{ duration: 1.1, ease: EASE, delay }}
        style={{
          width,
          height,
          background: color,
          transformOrigin: "left center",
          willChange: "transform",
        }}
      />
    </div>
  );
}

/**
 * Bordered square holding a serif monogram. In Lux the tile is a hairline —
 * the instrument's colour lives in the letter, not the fill.
 */
export function Monogram({
  mark,
  color,
  size = 26,
  className,
}: {
  mark: string;
  color: string;
  size?: number;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "font-serif grid flex-none place-items-center border border-rule-mono",
        className,
      )}
      style={{ width: size, height: size, color, fontSize: Math.round(size * 0.48) }}
    >
      {mark}
    </span>
  );
}

/** Segmented strip: ranges, chart type, order side. Square, hairline-divided. */
export function Segmented({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className={cn("flex border border-rule", className)}
    >
      {children}
    </div>
  );
}

/* A control that is set once and then left alone — chart type, the volume
   pane. It carries no border and no fill: the state is the label warming to
   gold over a 1px gold rule, which is the same "a bar appears" vocabulary the
   nav rail and the live tab already use.

   Boxing these the way the range strip is boxed was what turned the chart's
   control row into nine bordered cells in a line. Three groups of equal weight
   told the reader they were equally important, when the range is reached for
   constantly and these two almost never. */
export function QuietToggle({
  active,
  onClick,
  title,
  children,
}: {
  active: boolean;
  onClick: () => void;
  title?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={title}
      className={cn(
        "font-mono relative flex min-h-11 items-center gap-2 text-[11px] tracking-[0.1em] transition-colors md:min-h-0 md:py-2.5",
        active ? "text-gold" : "text-ink-3 hover:text-ink",
      )}
    >
      {children}
      <span
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute inset-x-0 bottom-0 h-px transition-opacity duration-300",
          active ? "bg-gold opacity-100" : "opacity-0",
        )}
      />
    </button>
  );
}

export function SegmentedItem({
  active,
  onClick,
  title,
  className,
  children,
}: {
  active: boolean;
  onClick: () => void;
  title?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={title}
      className={cn(
        "font-mono min-h-11 px-4 text-[11px] tracking-[0.1em] transition-colors",
        "border-r border-rule last:border-r-0 md:min-h-0 md:py-2.5",
        active
          ? "bg-[var(--tint-gold)] text-gold"
          : "text-ink-3 hover:bg-[var(--tint-gold-ghost)] hover:text-ink",
        className,
      )}
    >
      {children}
    </button>
  );
}

/** Label ·········· value, the Lux ratio row. Renders a `dt`/`dd` pair. */
export function LeaderRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rule-t flex items-baseline gap-3 py-3">
      <dt className="text-[12px] font-semibold tracking-[0.1em] text-ink-3">{label}</dt>
      <span aria-hidden="true" className="leader" />
      <dd className="font-mono m-0 text-[12px] text-ink">{value}</dd>
    </div>
  );
}

/** Text link in the design's tracked-caps voice. */
export function CapsLink({
  children,
  onClick,
  href,
  external = false,
  className,
}: {
  children: ReactNode;
  onClick?: () => void;
  /** Where it goes. Without this and without `onClick`, it is a dead control. */
  href?: string;
  /** Leaves Platizio Global: opens in a new tab, and says so to a screen reader. */
  external?: boolean;
  className?: string;
}) {
  const classes = cn(
    "eyebrow eyebrow-gold transition-colors hover:text-gold",
    className,
  );

  /* An external destination cannot go through next/link — it would be a
     client-side route transition to a URL this app does not serve. */
  if (href && external) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={classes}>
        {children}
        <span className="sr-only"> (opens in a new tab)</span>
      </a>
    );
  }

  if (href) {
    return (
      <Link href={href} className={classes}>
        {children}
      </Link>
    );
  }

  return (
    <button type="button" onClick={onClick} className={classes}>
      {children}
    </button>
  );
}

/** Gold gradient primary action. Dark ink, square, lifts on hover. */
export function GoldButton({
  children,
  onClick,
  className,
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  className?: string;
  type?: "button" | "submit";
}) {
  return (
    <motion.button
      type={type}
      onClick={onClick}
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.985 }}
      transition={{ duration: 0.2 }}
      className={cn(
        "cta-buy min-h-11 px-6 text-[11px] font-extrabold tracking-[0.16em] uppercase",
        "shadow-[0_10px_34px_rgba(217,189,139,0.22)] transition-shadow",
        "hover:shadow-[0_16px_44px_rgba(217,189,139,0.36)]",
        className,
      )}
    >
      {children}
    </motion.button>
  );
}
