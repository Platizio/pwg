import type { Session } from "@/lib/market/session";
import { cn } from "./ui";

/**
 * Whether the US market is trading, and the time it is trading by.
 *
 * It used to live on the dashboard header and therefore stated the session on
 * exactly one route. A reader on /instrument/NVDA or /wire had no way to tell
 * whether the figures in front of them were moving or frozen — which is the
 * first thing any of them needs to know. It now sits in the shell's chrome bar
 * beside the search, on every route, and is rendered here and nowhere else.
 *
 * The anatomy is deliberately shared with the search that sits opposite it:
 * a mark, a label, a hairline divider, a mono tail. Two controls at either end
 * of one bar reading as one family is the whole reason the divider is here
 * rather than a second border.
 */
export function MarketStatus({ session }: { session: Session }) {
  return (
    <div
      className={cn(
        "flex min-h-11 flex-none items-center gap-2.5 rounded-full border px-4",
        session.live
          ? "border-[rgba(217,189,139,0.28)] bg-[rgba(217,189,139,0.08)]"
          : "border-rule-control",
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "h-[7px] w-[7px] flex-none rounded-full",
          session.live ? "animate-gold-pulse bg-gold" : "bg-ink-3",
        )}
      />
      <span
        className={cn(
          "text-[13px] font-medium whitespace-nowrap",
          session.live ? "text-gold" : "text-ink-3",
        )}
      >
        <span className="hidden 2xl:inline">US markets </span>
        {session.live ? "Open" : "Closed"}
      </span>
      <span aria-hidden="true" className="h-3 w-px bg-rule-mono" />
      <span className="font-mono text-[12.5px] tracking-[0.04em] whitespace-nowrap text-ink-3">
        {session.clock}
      </span>
    </div>
  );
}
