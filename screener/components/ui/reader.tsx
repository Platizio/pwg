"use client";

import { motion } from "motion/react";
import { useEffect, useRef, type ReactNode } from "react";
import { IconClose } from "@/components/icons";
import { EASE } from "@/lib/tokens";
import { usePresence } from "@/lib/use-presence";
import { cn } from "@/lib/ui";

const EXIT_MS = 260;

/**
 * The reader — a small centred panel for reading one thing in full.
 *
 * Deliberately opened by click rather than by hover. A hover panel cannot be
 * opened at all on a phone or tablet, it disappears the moment the pointer
 * drifts while you are still reading it, and it gives the reader no way to
 * dismiss it deliberately. Everything this shows is prose, which is the worst
 * possible content for a surface that vanishes.
 *
 * It behaves like a real dialog: focus moves in, Tab is trapped, Escape and
 * the backdrop both close it, the page behind cannot scroll, and focus returns
 * to whatever opened it.
 */
export function Reader({
  open,
  onClose,
  eyebrow,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  eyebrow?: ReactNode;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  /* Held in a ref so the key handler never depends on the caller keeping
     `onClose` referentially stable. */
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  const mounted = usePresence(open, EXIT_MS);

  useEffect(() => {
    if (!open) return;

    const opener = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();

    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab") return;

      const focusable = panelRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable?.length) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = overflow;
      opener?.focus?.();
    };
  }, [open]);

  if (!mounted) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: open ? 1 : 0 }}
      transition={{ duration: 0.2 }}
      style={{ pointerEvents: open ? "auto" : "none" }}
      className="fixed inset-0 z-50 grid place-items-center p-4 sm:p-6"
    >
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 h-full w-full cursor-default bg-[rgba(6,5,4,0.78)] backdrop-blur-[6px]"
      />

      <motion.div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        initial={{ opacity: 0, y: 14, scale: 0.985 }}
        animate={{
          opacity: open ? 1 : 0,
          y: open ? 0 : 10,
          scale: open ? 1 : 0.99,
        }}
        transition={{ duration: EXIT_MS / 1000, ease: EASE }}
        className={cn(
          "card edge-lit relative z-10 flex max-h-[min(560px,86vh)] w-full max-w-[520px] flex-col",
          "shadow-[0_40px_90px_-30px_rgba(0,0,0,0.9)]",
        )}
      >
        <header className="flex items-start justify-between gap-4 px-6 pt-6 pb-4">
          <div className="min-w-0">
            {eyebrow && (
              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
                {eyebrow}
              </div>
            )}
            <h2 className="font-serif mt-3 text-[24px] leading-[1.3] text-pretty">
              {title}
            </h2>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid h-10 w-10 flex-none place-items-center rounded-full border border-rule-control text-ink-3 transition-colors hover:border-gold hover:text-gold"
          >
            <IconClose className="h-4 w-4" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-2">{children}</div>

        {footer && (
          <footer className="flex flex-wrap items-center gap-3 border-t border-rule-section px-6 py-4">
            {footer}
          </footer>
        )}
      </motion.div>
    </motion.div>
  );
}
