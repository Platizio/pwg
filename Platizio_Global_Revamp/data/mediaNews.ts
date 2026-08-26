/**
 * The news rail on /media.
 *
 * The FALLBACK for the rail. Live US-market headlines come from /api/news
 * (NewsAPI.ai); these show whenever that call fails or the finite search quota
 * runs out, so the rail is never empty. Adding an item is an edit here.
 *
 * ⚠️ Every entry must be something that actually happened, with a real date and
 * a link a reader can follow. This is a regulated intermediary's site: an
 * invented market headline with a plausible date and source is not a
 * placeholder, it is a false statement of fact. The seed items below are drawn
 * from Platizio's own published explainers, which is why each one is checkable.
 *
 * When a real feed arrives, keep this shape and swap the source — the rail
 * component reads nothing else.
 */

export interface NewsItem {
  /** Short label above the headline: what kind of item this is. */
  kind: string
  headline: string
  /** ISO date. Drives both the displayed date and the sort order. */
  date: string
  /** Where the reader goes. Internal route, or an absolute URL. */
  href: string
  /** True when href leaves the site — opens in a new tab. */
  external?: boolean
}

export const NEWS: readonly NewsItem[] = [
  {
    kind: 'Explainer',
    headline: 'TCS on LRS: what the ₹10 lakh threshold actually means',
    date: '2026-06-23',
    href: '/articles/tcs-on-lrs-explained',
  },
  {
    kind: 'Explainer',
    headline: 'How US dividends are taxed, and how to claim the credit back',
    date: '2026-06-25',
    href: '/articles/dividend-tax-us-stocks-india',
  },
  {
    kind: 'Guide',
    headline: 'Schedule FA: reporting foreign assets in your return',
    date: '2026-06-20',
    href: '/articles/schedule-fa-foreign-assets-reporting',
  },
  {
    kind: 'Explainer',
    headline: 'Fractional shares: owning a slice of a $300 stock',
    date: '2026-06-18',
    href: '/articles/fractional-shares-explained',
  },
  {
    kind: 'Guide',
    headline: 'The W-8BEN form, and why your broker asks for it',
    date: '2026-06-15',
    href: '/articles/w8ben-form-explained',
  },
  {
    kind: 'Explainer',
    headline: 'NYSE, Nasdaq and the US indices, explained',
    date: '2026-06-12',
    href: '/articles/nyse-nasdaq-and-us-indices-explained',
  },
]
