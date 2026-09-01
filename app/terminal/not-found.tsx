import Link from "next/link";
import { WorkColumn } from "@/components/terminal/work-column";
import { COVERED, presentation } from "@/lib/market/universe";
import sectorMap from "@/lib/market/data/sector-map.json" with { type: "json" };

const SECTORS = (sectorMap as { sectors: Record<string, string> }).sectors ?? {};
import { REGISTER_X, cn } from "@/lib/ui";
import { instrumentPath } from "@/lib/market/paths";

/**
 * An unknown symbol, inside the terminal.
 *
 * Placed in the route group rather than at the app root so it renders through
 * the shell — a reader who mistypes a ticker keeps their rail, their book and
 * their watchlist instead of being dropped onto a bare page with no way back.
 * It is the same ruled sheet as everything else, just very nearly empty.
 */
export default function NotFound() {
  return (
    <WorkColumn bleed>
      <div className={cn("border-b border-rule-section py-3.5", REGISTER_X)}>
        <p className="eyebrow">No such instrument</p>
      </div>

      <div className={cn("py-12", REGISTER_X)}>
        <h1 className="font-serif text-[clamp(1.875rem,3vw,2.5rem)] leading-none tracking-[0.005em]">
          Not in the followed universe
        </h1>
        <p className="mt-4 max-w-[54ch] text-[13.5px] leading-[1.75] text-pretty text-ink-3">
          Platizio Global carries a fixed universe of six instruments. The symbol you
          asked for is not one of them — it has not been delisted, and nothing
          has gone wrong with the feed.
        </p>
      </div>

      <div className="border-t border-rule-section">
        <p className={cn("eyebrow eyebrow-wide pt-6 pb-1", REGISTER_X)}>
          What is covered
        </p>
        <ul className="m-0 list-none p-0">
          {COVERED.map((ticker) => {
            const instrument = {
              id: ticker,
              name: presentation(ticker).name,
              /* The same classification the rest of the terminal uses. This
                 list used to read its sector from the authored file, which
                 called Apple "Consumer electronics" while every other surface
                 called it Information technology. */
              sector: SECTORS[ticker] ?? "",
            };
            return (
            <li key={instrument.id}>
              <Link
                href={instrumentPath(instrument.id)}
                className={cn(
                  "flex min-h-11 items-baseline gap-4 border-t border-rule-table py-3.5 transition-colors hover:bg-[var(--tint-gold-faint)] hover:text-gold",
                  REGISTER_X,
                )}
              >
                <span className="font-mono w-[68px] flex-none text-[11.5px] tracking-[0.06em] text-ink-2">
                  {instrument.id}
                </span>
                <span className="font-serif flex-1 text-[20px]">
                  {instrument.name}
                </span>
                {instrument.sector && (
                  <span className="eyebrow hidden sm:block">{instrument.sector}</span>
                )}
              </Link>
            </li>
            );
          })}
        </ul>
      </div>

      <div className="border-t border-rule-section">
        <Link
          href="/"
          className={cn(
            "eyebrow eyebrow-gold flex min-h-11 items-center py-4 transition-colors hover:text-gold",
            REGISTER_X,
          )}
        >
          Back to the session
        </Link>
      </div>
    </WorkColumn>
  );
}
