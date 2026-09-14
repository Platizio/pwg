import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

/* A stray package-lock.json in the home directory makes Turbopack infer the
   wrong workspace root. Pin it to this file's directory. */
const projectRoot = path.dirname(fileURLToPath(import.meta.url));

/* One app, one origin.
 *
 * The terminal used to be a second Next service proxied in during development
 * under a basePath, which meant two ports locally and two deployments in
 * production. It now lives at app/terminal, so the prefix is a directory rather
 * than a build-time flag and the site and the terminal are the same origin
 * everywhere — dev, preview and production alike.
 */
const nextConfig: NextConfig = {
  /* vite.config.ts injected __BUILD_YEAR__ as a define. Next has no define, so
     the same build-time constant arrives as an env value instead — still frozen
     at build rather than read from the visitor's clock. */
  env: { NEXT_PUBLIC_BUILD_YEAR: String(new Date().getFullYear()) },
  turbopack: { root: projectRoot },

  /* How hard the build is allowed to hit the market-data gateway.
   *
   * Left unset, Next spawns one static-generation worker per CPU and lets each
   * one build eight pages at once. That number is whatever the build machine
   * happens to have, and it decides the fan-out to ViewTrade: every instrument
   * page opens about thirteen upstream calls concurrently, so
   *
   *   pages in flight = workers x 8, upstream calls ~= that x 13.
   *
   * On a nine-core laptop that is 72 pages and ~900 calls, and it builds. On
   * Render's build machine it was 34 workers - 272 pages and ~3,500 calls at
   * once - and the gateway simply stopped answering. Every one of the 500
   * instrument pages then exceeded its sixty-second budget, retried, and timed
   * out again. Nothing was wrong with the pages; the machine was too big.
   *
   * Pinning both numbers makes the build behave identically everywhere, which
   * is the only way a local build can vouch for a deploy. Eight workers times
   * four pages is 32 in flight, ~400 upstream calls: comfortably under the
   * ~900 that is proven to work, and an order of magnitude under what failed.
   * Build time barely moves - the gateway, not the CPU, is the bottleneck. */
  experimental: {
    cpus: 8,
    staticGenerationMaxConcurrency: 4,
  },
  headers: async () => [
    {
      /* Previously set by the site's vercel.json, which covered only the static
         marketing build. Moving them here applies them to the terminal too,
         which was serving none of them. */
      source: "/(.*)",
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "SAMEORIGIN" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        {
          key: "Permissions-Policy",
          value: "camera=(), microphone=(), geolocation=()",
        },
      ],
    },
  ],
};

export default nextConfig;
