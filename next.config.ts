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
