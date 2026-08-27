"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { IconFall, IconRise } from "@/components/icons";
import { pct } from "@/lib/market/format";
import { C } from "@/lib/tokens";
import { cn } from "@/lib/ui";

/*
  Platizio Global v2 — the lit-card vocabulary.

  The first system refused cards on principle, and the principle was sound
  about the thing it was refusing: a flat grey box with a border and a radius,
  used as a container because no hierarchy had been decided. These are a
  different object. Each one is lit along a single axis, seated on the page by
  a shadow with negative spread, and edged by a highlight only where the light
  actually lands. The type inside them is unchanged — serif names, mono
  figures, tracked-caps labels — which is what keeps the system recognisable.
*/

export function Card({
  as = "div",
  href,
  interactive = false,
  glow = false,
  lit = false,
  tone,
  className,
  children,
}: {
  as?: "div" | "section" | "article";
  href?: string;
  interactive?: boolean;
  glow?: boolean;
  /* Reserved for the few cards that carry the page. See .card-lit. */
  lit?: boolean;
  /* Only for a card whose subject IS a direction — the gainers and losers
     boards. Anywhere else, a directional colour states something untrue. */
  tone?: "up" | "down";
  className?: string;
  children: ReactNode;
}) {
  const classes = cn(
    glow
      ? "card-glow"
      : tone === "up"
        ? "card-up"
        : tone === "down"
          ? "card-down"
          : lit
            ? "card-lit"
            : "card",
    (interactive || href) && "card-hover",
    /* `edge-lit` is what makes these read as lit rather than filled: a
       hairline along the top that is brightest at the centre, the way a real
       bevel picks up a lamp. */
    "edge-lit relative overflow-hidden",
    className,
  );

  if (href) {
    return (
      <Link href={href} className={cn(classes, "block")}>
        {children}
      </Link>
    );
  }

  const Tag = as;
  return <Tag className={classes}>{children}</Tag>;
}

/** The tracked-caps label that heads every card. */
export function CardLabel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <p className={cn("eyebrow", className)}>{children}</p>;
}

/**
 * A signed percentage as a pill. Direction is carried by a drawn caret and by
 * a tinted border as well as by colour.
 */
export function DeltaPill({
  value,
  digits = 2,
  className,
}: {
  value: number;
  digits?: number;
  className?: string;
}) {
  const up = value >= 0;
  const Caret = up ? IconRise : IconFall;
  return (
    <span
      className={cn(
        "font-mono inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px]",
        className,
      )}
      style={{
        color: up ? C.up : C.down,
        borderColor: up ? "rgba(125,211,160,0.3)" : "rgba(224,121,107,0.3)",
        background: up ? "rgba(125,211,160,0.08)" : "rgba(224,121,107,0.08)",
      }}
    >
      <Caret className="h-3 w-3 flex-none" />
      {pct(value, digits)}
    </span>
  );
}

/** A bare signed figure, for dense rows where a pill would be too much. */
export function Delta({
  value,
  digits = 2,
  size = "text-[13px]",
  className,
}: {
  value: number;
  digits?: number;
  size?: string;
  className?: string;
}) {
  const up = value >= 0;
  const Caret = up ? IconRise : IconFall;
  return (
    <span
      className={cn("font-mono inline-flex items-center gap-1.5", size, className)}
      style={{ color: up ? C.up : C.down }}
    >
      <Caret className="h-3 w-3 flex-none" />
      {pct(value, digits)}
    </span>
  );
}

/** A status badge — filled for the emphatic one, outlined for the rest. */
export function Badge({
  tone = "quiet",
  children,
}: {
  tone?: "gold" | "quiet" | "outline";
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-3 py-1.5 text-[11px] font-bold tracking-[0.14em] uppercase",
        tone === "gold" && "bg-[#f0dcb8] text-on-gold",
        tone === "quiet" && "border border-[rgba(217,189,139,0.22)] bg-[rgba(217,189,139,0.09)] text-gold",
        tone === "outline" && "border border-rule-control text-ink-3",
      )}
    >
      {children}
    </span>
  );
}

/** The cream pill that carries the one primary action on a view. */
export function PillButton({
  children,
  icon,
  onClick,
  href,
  className,
}: {
  children: ReactNode;
  icon?: ReactNode;
  onClick?: () => void;
  href?: string;
  className?: string;
}) {
  const classes = cn(
    "inline-flex min-h-11 flex-none items-center gap-2.5 rounded-full bg-[linear-gradient(140deg,#f6e6c6,#dcbb8a)] pr-4 pl-2 sm:gap-3 sm:pr-6 sm:pl-2.5",
    "text-[12px] font-extrabold tracking-[0.1em] text-on-gold uppercase sm:tracking-[0.12em]",
    "shadow-[0_12px_30px_-10px_rgba(217,189,139,0.55)] transition-all duration-300",
    "hover:shadow-[0_18px_40px_-10px_rgba(217,189,139,0.7)] hover:brightness-[1.04]",
    className,
  );

  const inner = (
    <>
      {icon && (
        <span className="grid h-8 w-8 flex-none place-items-center rounded-full bg-[rgba(26,18,7,0.9)] text-[#f0dcb8]">
          {icon}
        </span>
      )}
      {children}
    </>
  );

  if (href) {
    return (
      <Link href={href} className={classes}>
        {inner}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} className={classes}>
      {inner}
    </button>
  );
}

/** Rounded segmented control — the chart's range switch. */
export function PillGroup({
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
      className={cn("flex items-center gap-1.5", className)}
    >
      {children}
    </div>
  );
}

export function PillOption({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "font-mono min-h-11 rounded-full px-4 text-[12px] tracking-[0.1em] transition-colors md:min-h-0 md:py-2",
        active
          ? "bg-[#f0dcb8] text-on-gold"
          : "border border-rule-control text-ink-3 hover:border-gold hover:text-ink",
      )}
    >
      {children}
    </button>
  );
}

/** A plain rounded progress bar. */
export function Meter({
  value,
  className,
}: {
  /** 0–100. */
  value: number;
  className?: string;
}) {
  return (
    <div
      className={cn("h-1.5 w-full overflow-hidden rounded-full bg-[#221c15]", className)}
      role="progressbar"
      aria-valuenow={Math.round(value)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <span
        className="animate-bar block h-full rounded-full bg-[linear-gradient(90deg,#e8cfa3,#c9a46f)]"
        style={{ width: `${Math.min(100, Math.max(0, value))}%`, transformOrigin: "left center" }}
      />
    </div>
  );
}

/**
 * The tick meter — the ledger idea surviving into the card surface. A solid
 * bar states a proportion; a ruled one states that the proportion was counted.
 */
export function TickMeter({
  value,
  height = 26,
  className,
}: {
  /** 0–100. */
  value: number;
  height?: number;
  className?: string;
}) {
  const pctValue = Math.min(100, Math.max(0, value));
  return (
    <div
      className={cn("relative w-full overflow-hidden", className)}
      style={{ height }}
      role="progressbar"
      aria-valuenow={Math.round(pctValue)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <span className="tick-track absolute inset-0" />
      <span
        className="tick-fill animate-bar absolute inset-y-0 left-0"
        style={{ width: `${pctValue}%`, transformOrigin: "left center" }}
      />
    </div>
  );
}
