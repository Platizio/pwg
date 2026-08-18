import { ARTICLES } from './articles/registry'
import { TOPICS } from './articles/topics'
import { TERMINAL_UNIVERSE } from '../Platizio_Global_Revamp/data/terminalUniverse'

export interface RouteEntry {
  /** URL path, exactly as react-router matches it */
  path: string
  /** Output file relative to dist/. Defaults to `<path>/index.html`. */
  out?: string
  /** W3C date for <lastmod>. */
  lastmod: string
  changefreq:
    | 'always'
    | 'hourly'
    | 'daily'
    | 'weekly'
    | 'monthly'
    | 'yearly'
    | 'never'
  priority: number
  /** false = prerender the page but keep it out of sitemap.xml */
  sitemap?: boolean
}

/**
 * Hand-maintained dates for the static marketing pages. Bump when the page
 * changes meaningfully.
 *
 * Deliberately not derived from `git log`: Vercel clones shallow, so every
 * file would report the same date. Emitting `new Date()` on every build is
 * worse still — Google discounts sitemaps whose lastmod churns.
 */
const STATIC_LASTMOD = '2026-08-18'

export const STATIC_ROUTES: RouteEntry[] = [
  { path: '/', lastmod: STATIC_LASTMOD, changefreq: 'weekly', priority: 1.0 },
  { path: '/products', lastmod: STATIC_LASTMOD, changefreq: 'monthly', priority: 0.9 },
  { path: '/pricing', lastmod: STATIC_LASTMOD, changefreq: 'monthly', priority: 0.8 },
  { path: '/media', lastmod: STATIC_LASTMOD, changefreq: 'weekly', priority: 0.8 },
  { path: '/about', lastmod: STATIC_LASTMOD, changefreq: 'monthly', priority: 0.8 },
  { path: '/faqs', lastmod: STATIC_LASTMOD, changefreq: 'monthly', priority: 0.9 },
  { path: '/user-guide', lastmod: STATIC_LASTMOD, changefreq: 'monthly', priority: 0.8 },
  { path: '/articles', lastmod: STATIC_LASTMOD, changefreq: 'weekly', priority: 0.8 },
  { path: '/terms', lastmod: STATIC_LASTMOD, changefreq: 'yearly', priority: 0.3 },
  { path: '/privacy', lastmod: STATIC_LASTMOD, changefreq: 'yearly', priority: 0.3 },
  { path: '/disclaimer', lastmod: STATIC_LASTMOD, changefreq: 'yearly', priority: 0.3 },
  // Matches App.tsx's `*` route -> <NotFound/>. Written to dist/404.html, which
  // Vercel serves with a real 404 status for any unmatched path.
  {
    path: '/404',
    out: '404.html',
    lastmod: STATIC_LASTMOD,
    changefreq: 'yearly',
    priority: 0.0,
    sitemap: false,
  },
]

/**
 * One prerendered page per instrument the terminal covers.
 *
 * Generated from the universe rather than hand-listed, exactly as
 * ARTICLE_ROUTES is generated from the registry: adding an instrument must not
 * require remembering to add a route, or the page would exist in the app and
 * be absent from both the build and the sitemap.
 *
 * Only these symbols prerender, so any other /terminal/* path is served
 * Vercel's 404 — which is the correct answer for an instrument we do not
 * cover, and cheaper than shipping a hundred pages nobody links to.
 */
export const TERMINAL_ROUTES: RouteEntry[] = TERMINAL_UNIVERSE.map((i) => ({
  path: `/terminal/${i.symbol.toLowerCase()}`,
  lastmod: STATIC_LASTMOD,
  // The prices change every minute; the page around them does not. Telling
  // Google 'daily' for content that is static would be the kind of churn it
  // discounts sitemaps for.
  changefreq: 'weekly' as const,
  priority: 0.6,
}))

export const TOPIC_ROUTES: RouteEntry[] = TOPICS.map((t) => ({
  path: `/articles/topic/${t.id}`,
  lastmod: STATIC_LASTMOD,
  changefreq: 'weekly' as const,
  priority: 0.8,
}))

export const ARTICLE_ROUTES: RouteEntry[] = ARTICLES.map((a) => ({
  path: `/articles/${a.slug}`,
  lastmod: a.updated ?? a.date,
  changefreq: 'yearly' as const,
  priority: 0.7,
}))

export const ROUTES: RouteEntry[] = [
  ...STATIC_ROUTES,
  ...TERMINAL_ROUTES,
  ...TOPIC_ROUTES,
  ...ARTICLE_ROUTES,
]
