"use client";

import { AnimatePresence, motion } from "motion/react";
import type { CompanyProfile } from "@/lib/api/normalize/profile";
import { EASE } from "@/lib/tokens";
import { GoldButton, cn } from "./ui";
import { FollowButton } from "./watchlist/follow-button";

export function InstrumentHeader({
  profile,
  onTrade,
  condensed = false,
}: {
  profile: CompanyProfile;
  /* Still accepted, and no longer read. Following used to be an in-memory
     flag on the portfolio context that no list anywhere consulted; the button
     is now bound to the reader's watchlists (watchlist/follow-button.tsx) and
     owns its state. Kept optional so the page that renders this compiles
     unchanged until it stops passing them. */
  following?: boolean;
  onToggleFollow?: () => void;
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
          "flex gap-x-3 gap-y-4 border-b border-rule-section transition-all duration-300 sm:flex-wrap sm:gap-x-5",
          /* Condensed it is one bar, so everything in it sits on the centre
             line; the 21px title on the monogram's floor read as dropped. */
          condensed ? "items-center pb-3" : "items-center pb-4 sm:items-end sm:pb-5",
        )}
      >
        {/* The monogram and the name are one unit that never splits. As
            separate items of the wrapping row, a long name ("State Street
            SPDR S&P 500 ETF Trust") wrapped UNDER the monogram and left it
            alone on a line, and pinned, that made the header two rows tall.
            Grouped, the group takes a line of its own and the name wraps
            beside the monogram instead — or, pinned, is cut to one line. */}
        <div
          className={cn(
            "flex min-w-0 flex-1 gap-x-3 sm:flex-none sm:gap-x-5",
            condensed ? "items-center" : "items-end",
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
                condensed ? "h-9 w-9 text-[17px]" : "h-10 w-10 text-[18px] sm:h-14 sm:w-14 sm:text-[26px]",
              )}
              style={{ color: profile.color }}
            >
              {profile.mark}
            </motion.span>
          </AnimatePresence>

          <div className="min-w-0">
            <h1
              title={condensed ? profile.name : undefined}
              className={cn(
                "font-serif leading-none tracking-[0.005em] transition-all duration-300",
                condensed ? "truncate text-[21px]" : "text-balance text-[22px] sm:text-[40px]",
              )}
            >
              {profile.name}
            </h1>
            <div
              className={cn(
                "flex items-center gap-3 overflow-hidden transition-all duration-300 sm:flex-wrap",
                condensed ? "mt-0 h-0 opacity-0" : "mt-1 h-5 opacity-100 sm:mt-2.5",
              )}
            >
              <span className="font-mono text-[11px] tracking-[0.14em] text-ink-3 sm:text-[12px]">
                {profile.exchange}
              </span>
              {/* A fund has no sector, and the rule is a separator: with
                  nothing after it, it dangled ("AMEX |"). */}
              {profile.sector && (
                <>
                  <span aria-hidden="true" className="h-2.5 w-px bg-rule-mono" />
                  <span className="eyebrow eyebrow-gold min-w-0 truncate">{profile.sector}</span>
                </>
              )}
            </div>
          </div>
        </div>

        {!condensed && (
          <div className="flex-none sm:hidden">
            <FollowButton symbol={profile.id} name={profile.short} compact />
          </div>
        )}

        {/* On a narrow screen these wrap onto a line of their own, which is
            sixty pixels of pinned chrome for two controls nobody reaches for
            mid-scroll. They come back the moment the reader returns to the
            top. */}
        <div
          className={cn(
            /* On a phone the pair wraps under the name: there it spans the
               gutters instead of hanging off the right edge with a gap on the
               left that lines up with nothing. Follow, the long label, takes
               the width and Trade keeps its own. As two equal halves the
               split was decided by Follow's minimum width (follow-button.tsx)
               rather than by either label, "Add to watchlist" still wrapped to
               two lines at 375px, and Trade's width followed that minimum as
               it changed after hydration. */
            /* From sm. On a phone Follow is the square beside the name and
               Trade is the bar pinned to the foot of the screen
               (instrument-view.tsx), so the header is one row, not two. */
            "hidden items-center gap-3 sm:ms-auto sm:flex sm:flex-wrap",
          )}
        >
          <div className="sm:flex-none">
            <FollowButton symbol={profile.id} name={profile.short} />
          </div>

          {/* A company with no current price can be read about but not traded.
              That state is newly reachable: the page used to 404 whenever the
              gateway sent no last or closing price, which hid a halted stock
              and a first trading day behind "Stock not found". Now the page
              renders, so the ticket has to refuse instead — it takes
              `price ?? 0`, and a ticket opened at $0.00 is a far worse answer
              than a disabled button. */}
          <GoldButton
            className="flex-none"
            onClick={onTrade}
            disabled={profile.price === null}
            title={
              profile.price === null
                ? "No current price for this stock, so it cannot be traded right now."
                : undefined
            }
          >
            Trade
          </GoldButton>
        </div>
      </div>
    </>
  );
}
