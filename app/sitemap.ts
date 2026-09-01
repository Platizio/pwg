import type { MetadataRoute } from "next";
import { ARTICLE_ROUTES, STATIC_ROUTES, TOPIC_ROUTES, type RouteEntry } from "@/src/routes";
import { absoluteUrl } from "@/src/siteConfig";
import { sectorSlug } from "@/lib/market/session";
import { COVERED, SECTOR_NAMES } from "@/lib/market/universe";

/* Hand-set for the reason routes.ts hand-sets its own dates: a lastmod that
   moves every deploy is churn, and Google discounts sitemaps that churn. The
   terminal's numbers change by the minute; the pages holding them do not. */
const TERMINAL_LASTMOD = "2026-08-18";

const fromRoutes = (entries: RouteEntry[]): MetadataRoute.Sitemap =>
  entries
    .filter((r) => r.sitemap !== false)
    .map((r) => ({
      url: absoluteUrl(r.path),
      lastModified: r.lastmod,
      changeFrequency: r.changefreq,
      priority: r.priority,
    }));

const terminalUrl = (path: string, priority: number): MetadataRoute.Sitemap[number] => ({
  url: absoluteUrl(path),
  lastModified: TERMINAL_LASTMOD,
  changeFrequency: "weekly",
  priority,
});

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    ...fromRoutes([...STATIC_ROUTES, ...TOPIC_ROUTES, ...ARTICLE_ROUTES]),

    /* The terminal is enumerated here rather than taken from routes.ts, whose
       TERMINAL_ROUTES predate the merge: they are the old terminal's universe
       and disagree with the covered names in both directions. Listed instead
       are only the URLs guaranteed to resolve — the three fixed surfaces, the
       six instruments that prerender, and the fixed sector set. The other
       ~13,000 tickers render on demand; a sitemap is not a market dump. */
    terminalUrl("/terminal", 0.9),
    terminalUrl("/terminal/wire", 0.7),
    terminalUrl("/terminal/calendar", 0.7),
    ...COVERED.map((ticker) => terminalUrl(`/terminal/${ticker}`, 0.6)),
    ...SECTOR_NAMES.map((name) => terminalUrl(`/terminal/sector/${sectorSlug(name)}`, 0.5)),
  ];
}
