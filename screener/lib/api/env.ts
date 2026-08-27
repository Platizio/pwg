import "server-only";

/* Configuration, read once and validated loudly.

   uma, aes and mdp all resolve to the same host on this account, so there is
   one gateway variable rather than three. None of these may ever carry a
   NEXT_PUBLIC_ prefix — that would inline the secret into the browser bundle. */

export type Env = {
  gateway: string;
  apiKey: string;
  apiSecret: string;
  newsKey: string | null;
  newsEnabled: boolean;
  probeToken: string | null;
  cronSecret: string | null;
};

let memo: Env | null = null;

export function env(): Env {
  if (memo) return memo;

  const missing: string[] = [];
  const need = (name: string) => {
    const v = process.env[name];
    if (!v) missing.push(name);
    return v ?? "";
  };

  const gateway = need("VIEWTRADE_GATEWAY").replace(/\/+$/, "");
  const apiKey = need("VIEWTRADE_API_KEY");
  const apiSecret = need("VIEWTRADE_API_SECRET");

  if (missing.length) {
    throw new Error(
      `Missing required environment variable(s): ${missing.join(", ")}. ` +
        `Add them to .env.local — see the plan's Secrets section.`,
    );
  }

  memo = {
    gateway,
    apiKey,
    apiSecret,
    newsKey: process.env.NEWSAPI_AI_KEY || null,
    newsEnabled: process.env.NEWS_ENABLED !== "0",
    probeToken: process.env.PROBE_TOKEN || null,
    cronSecret: process.env.CRON_SECRET || null,
  };
  return memo;
}

/** News is optional: the rail is served by ViewTrade, so a missing key degrades
    exactly one held-back feature rather than failing the build. */
export function newsAvailable(): boolean {
  const e = env();
  return e.newsEnabled && Boolean(e.newsKey);
}

/** Test seam — lets the probe re-read env after mutating process.env. */
export function resetEnv(): void {
  memo = null;
}
