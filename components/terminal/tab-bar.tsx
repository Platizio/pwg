"use client";

import { motion } from "motion/react";
import { useRef } from "react";
import type { TabId } from "@/lib/market/types";
import { cn } from "./ui";

export const TABS: Array<{ id: TabId; label: string }> = [
  { id: "overview", label: "OVERVIEW" },
  { id: "performance", label: "PERFORMANCE" },
  { id: "fundamentals", label: "FUNDAMENTALS" },
  { id: "technicals", label: "TECHNICALS" },
  { id: "competitors", label: "COMPETITORS" },
  { id: "holdings", label: "HOLDINGS" },
];

/**
 * Roving-tabindex tablist. The source rendered plain divs, leaving all five
 * views unreachable without a mouse; here only the active tab sits in the tab
 * order and arrows move between them, per the WAI-ARIA tabs pattern.
 */
export function TabBar({
  active,
  onChange,
}: {
  active: TabId;
  onChange: (id: TabId) => void;
}) {
  const listRef = useRef<HTMLDivElement>(null);

  function onKeyDown(e: React.KeyboardEvent) {
    const keys = ["ArrowRight", "ArrowLeft", "Home", "End"];
    if (!keys.includes(e.key)) return;
    e.preventDefault();

    const index = TABS.findIndex((t) => t.id === active);
    const next =
      e.key === "Home"
        ? 0
        : e.key === "End"
          ? TABS.length - 1
          : e.key === "ArrowRight"
            ? (index + 1) % TABS.length
            : (index - 1 + TABS.length) % TABS.length;

    onChange(TABS[next].id);
    listRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
  }

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label="Stock detail"
      onKeyDown={onKeyDown}
      className="no-scrollbar flex gap-8 overflow-x-auto border-b border-rule-section"
    >
      {TABS.map((tab) => {
        const selected = tab.id === active;
        return (
          <button
            key={tab.id}
            role="tab"
            id={`tab-${tab.id}`}
            aria-selected={selected}
            aria-controls={`panel-${tab.id}`}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(tab.id)}
            className={cn(
              "relative flex-none py-4 text-[11px] font-bold tracking-[0.18em] whitespace-nowrap transition-colors",
              selected ? "text-ink" : "text-ink-3 hover:text-ink",
            )}
          >
            {tab.label}
            {selected && (
              <motion.span
                layoutId="tab-underline"
                transition={{ type: "spring", stiffness: 460, damping: 42 }}
                className="absolute inset-x-0 -bottom-px h-px bg-gold"
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
