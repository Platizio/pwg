import "server-only";
import { env } from "./env.ts";
import { scrub } from "./errors.ts";

/* The partner-token broker.

   Auth against this gateway is a single hop, not the five the catalogue
   documents: the b2b api-keys login returns an access token that on its own
   unlocks every /aes/api/quotes/* and /mdp/* endpoint the home page needs.
   The user-impersonation and watchmen chain is only required for the
   middleware /insight/* family, which this account is not entitled to.

   Two module-scoped values do the work. `cached` holds the live token;
   `inflight` collapses concurrent renders onto a single login so that a cold
   start with eight parallel sweep chunks performs one authentication, not
   eight. */

export type PartnerToken = {
  accessToken: string;
  refreshToken: string;
  /** Unix seconds, straight from the gateway. */
  expiresAt: number;
};

type LoginBody = {
  api_keys_login?: {
    tokens?: {
      access_token?: string;
      refresh_token?: string;
      access_expires_at?: number;
    };
  };
};

let cached: PartnerToken | null = null;
let inflight: Promise<PartnerToken> | null = null;

/** Refresh this many seconds before the gateway's own expiry. */
const SKEW_SECONDS = 300;

const nowSec = () => Math.floor(Date.now() / 1000);

function fresh(t: PartnerToken | null): t is PartnerToken {
  return Boolean(t && t.expiresAt - SKEW_SECONDS > nowSec());
}

async function login(): Promise<PartnerToken> {
  const { gateway, apiKey, apiSecret } = env();
  const started = Date.now();

  let res: Response;
  try {
    res = await fetch(`${gateway}/uma/api/v1/auth/b2b/login/api-keys`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ api_key: apiKey, api_secret: apiSecret }),
      /* Cacheable, deliberately, and not no-store.

         A no-store fetch anywhere in a render opts the whole route out of
         static generation, and this login sits under every other call — it
         alone was enough to turn the terminal from a revalidating static page
         into a dynamic one. Half an hour is well inside the token's two-hour
         life, and the in-memory broker above means this is reached about once
         per cold start anyway. */
      next: { revalidate: 1800, tags: ["vt:auth"] },
      signal: AbortSignal.timeout(15_000),
    });
  } catch (e) {
    throw new Error(`Auth request failed: ${scrub(String(e))}`);
  }

  if (!res.ok) {
    throw new Error(`Auth rejected with HTTP ${res.status} after ${Date.now() - started}ms`);
  }

  const body = (await res.json()) as LoginBody;
  const tokens = body.api_keys_login?.tokens;
  if (!tokens?.access_token) {
    throw new Error("Auth succeeded but the response carried no access_token");
  }

  return {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token ?? "",
    // Fall back to a conservative hour if the gateway ever omits the claim.
    expiresAt: tokens.access_expires_at ?? nowSec() + 3600,
  };
}

export async function getToken(force = false): Promise<PartnerToken> {
  if (!force && fresh(cached)) return cached;
  if (inflight) return inflight;

  inflight = login()
    .then((t) => {
      cached = t;
      return t;
    })
    .finally(() => {
      inflight = null;
    });

  return inflight;
}

export async function authHeader(): Promise<Record<string, string>> {
  const { accessToken } = await getToken();
  return { Authorization: `Bearer ${accessToken}`, Accept: "application/json" };
}

/** Drop the cached token so the next call re-authenticates. Used by the 401
    retry in http.ts and by the probe. */
export function resetToken(): void {
  cached = null;
}

/** Diagnostics only — never returns the token itself. */
export function tokenStatus(): { present: boolean; expiresAt: number | null; ttl: number | null } {
  if (!cached) return { present: false, expiresAt: null, ttl: null };
  return { present: true, expiresAt: cached.expiresAt, ttl: cached.expiresAt - nowSec() };
}
