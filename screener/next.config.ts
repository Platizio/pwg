import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

/* A stray package-lock.json in the home directory makes Turbopack infer the
   wrong workspace root. Pin it to this file's directory — `__dirname` is not
   available in the ESM-compiled config, so resolve it from import.meta. */
const projectRoot = path.dirname(fileURLToPath(import.meta.url));

/* The terminal is served from the website's own dev server in development, so
   both apps sit on one port (5173) instead of the reader juggling 5173 and
   3000. vite.config.ts proxies /screener here; this basePath makes Next emit
   every route, asset and HMR URL under that same prefix, which is what makes
   the proxy a one-line rule rather than a pile of rewrites.

   Keyed off NODE_ENV rather than a custom variable so it cannot leak into a
   build: `next build` sets NODE_ENV=production, so the deployed service stays
   at the root where Render expects it. In dev the standalone origin becomes
   http://localhost:3000/screener. */
const basePath = process.env.NODE_ENV === "development" ? "/screener" : "";

const nextConfig: NextConfig = {
  basePath,
  turbopack: {
    root: projectRoot,
  },
};

export default nextConfig;
