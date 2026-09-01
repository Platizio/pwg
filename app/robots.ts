import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/src/siteConfig";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      /* Nothing under /api renders as a page, and several of those handlers
         proxy metered upstreams — a crawl there spends quota for no index. */
      disallow: "/api/",
    },
    sitemap: absoluteUrl("/sitemap.xml"),
  };
}
