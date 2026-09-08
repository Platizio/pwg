import { TRADING_PLATFORM_URL } from "@/src/constants";

/**
 * The way out of the terminal and into the real platform.
 *
 * The terminal reads and never transacts — a regulated introducer must not put
 * a working trade button on a public page — so the moment a reader has decided
 * on a name, the honest next step is somewhere else entirely. Until now the
 * chrome bar offered no way to take it: a reader had to leave for the marketing
 * site and find the same link in its header.
 *
 * The destination is TRADING_PLATFORM_URL rather than a route of our own. That
 * constant is what every "Start Investing" on the site already points at — the
 * site header, the pricing page, the article footers, the FAQ — and account
 * opening should have exactly one address, so that when it moves it moves once.
 * It leaves Platizio Global, which is why it cannot go through next/link or
 * lib/market/paths (both describe URLs this app serves) and why it opens in a
 * new tab and says so to a screen reader: a half-read terminal is not worth
 * trading for a login screen.
 *
 * The anatomy is the chrome bar's own — min-h-11, rounded-full, one hairline
 * border, a label, a divider, a mono tail — so it sits beside the session pill
 * and opposite the search as a third member of the same family rather than a
 * button dropped onto their bar. What separates it from the other two is that
 * it is warm at rest. Both of them are neutral until something happens (the box
 * is in use, the market is trading); this one is gold from the moment the bar
 * renders, and being the only warm thing on a bar of hairlines is the whole of
 * its claim to being the primary action. It needs no fill and no shadow on top
 * of that, and the ↗ tail keeps it from ever being misread as a status.
 *
 * No focus styling of its own: the global `:focus-visible` rule already draws a
 * gold outline at 3px offset on every control in the frame, and the pill's own
 * radius carries it.
 */
export function InvestButton() {
  return (
    <a
      href={TRADING_PLATFORM_URL}
      target="_blank"
      rel="noopener noreferrer"
      title="Open the Platizio Global trading platform"
      className="flex min-h-11 flex-none items-center gap-2.5 rounded-full border border-gold-deep bg-[var(--tint-gold)] px-4 text-gold transition-colors hover:border-gold hover:text-gold-hi"
    >
      <span className="text-[13px] font-semibold whitespace-nowrap">Invest</span>
      <span aria-hidden="true" className="h-3 w-px flex-none bg-rule-mono" />
      <span
        aria-hidden="true"
        className="font-mono text-[12.5px] leading-none tracking-[0.04em]"
      >
        &#8599;
      </span>
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  );
}
