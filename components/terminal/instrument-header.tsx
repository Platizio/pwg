"use client";

import { AnimatePresence, motion } from "motion/react";
import type { CompanyProfile } from "@/lib/api/normalize/profile";
import { C, EASE } from "@/lib/tokens";
import { GoldButton, cn } from "./ui";

export function InstrumentHeader({
  profile,
  following,
  onToggleFollow,
  onTrade,
  condensed = false,
}: {
  profile: CompanyProfile;
  following: boolean;
  onToggleFollow: () => void;
  onTrade: () => void;
  /* True once the reader has scrolled past the header. The block stays pinned
     either way; condensed, it gives the tabs back the height the full-size
     title and monogram were holding. */
  condensed?: boolean;
}) {
  return (
    <>
      <div
        className={cn(
          "flex flex-wrap items-end gap-x-5 gap-y-4 border-b border-rule-section transition-all duration-300",
          condensed ? "pb-3" : "pb-5",
        )}
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={profile.id}
            initial={{ opacity: 0, scale: 0.94 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.97 }}
            transition={{ duration: 0.5, ease: EASE }}
            aria-hidden="true"
            className={cn(
              "font-serif grid flex-none place-items-center border border-rule-mono transition-all duration-300",
              condensed ? "h-9 w-9 text-[17px]" : "h-14 w-14 text-[26px]",
            )}
            style={{ color: profile.color }}
          >
            {profile.mark}
          </motion.span>
        </AnimatePresence>

        <div className="min-w-0">
          <h1
            className={cn(
              "font-serif leading-none tracking-[0.005em] transition-all duration-300",
              condensed ? "text-[21px]" : "text-[30px] sm:text-[40px]",
            )}
          >
            {profile.name}
          </h1>
          <div
            className={cn(
              "flex flex-wrap items-center gap-3 overflow-hidden transition-all duration-300",
              condensed ? "mt-0 h-0 opacity-0" : "mt-2.5 h-5 opacity-100",
            )}
          >
            <span className="font-mono text-[12px] tracking-[0.14em] text-ink-3">
              {profile.exchange}
            </span>
            <span aria-hidden="true" className="h-2.5 w-px bg-rule-mono" />
            <span className="eyebrow eyebrow-gold">{profile.sector}</span>
          </div>
        </div>

        {/* On a narrow screen these wrap onto a line of their own, which is
            sixty pixels of pinned chrome for two controls nobody reaches for
            mid-scroll. They come back the moment the reader returns to the
            top. */}
        <div
          className={cn(
            "ms-auto flex flex-wrap items-center gap-3",
            condensed && "hidden sm:flex",
          )}
        >
          <motion.button
            type="button"
            onClick={onToggleFollow}
            whileTap={{ scale: 0.98 }}
            aria-pressed={following}
            className={cn(
              "min-h-11 border border-rule-control px-5 text-[11px] font-bold tracking-[0.16em] uppercase transition-colors hover:border-gold",
            )}
            style={{ color: following ? C.gold : C.ink2 }}
          >
            {following ? "Following" : "Follow"}
          </motion.button>

          <GoldButton onClick={onTrade}>Trade</GoldButton>
        </div>
      </div>
    </>
  );
}
