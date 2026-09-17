/**
 * Environment variables this app reads, declared so a typo is a type error.
 *
 * Two groups, and the line between them is the NEXT_PUBLIC_ prefix: that prefix
 * is what inlines a value into the browser bundle, so anything carrying it is
 * public by definition and anything without it must never gain one.
 *
 * The public three are all optional: with none set, the support assistant falls
 * back to drafting an email instead of posting a ticket, so the site still
 * builds and deploys without any Supabase configuration.
 *
 * Renamed from VITE_* to NEXT_PUBLIC_* in the Next migration — the prefix is
 * what marks a value as safe to inline into the client bundle, and each
 * framework spells it differently.
 */
declare namespace NodeJS {
  interface ProcessEnv {
    readonly NEXT_PUBLIC_SUPABASE_URL?: string;
    readonly NEXT_PUBLIC_SUPABASE_ANON_KEY?: string;
    /**
     * Cloudflare Turnstile. Paired with TURNSTILE_SECRET_KEY on the edge
     * functions — with neither set the forms work and record
     * captcha_verified = false; with both set the captcha is enforced. Setting
     * only one of the two breaks intake, so they are configured together.
     */
    readonly NEXT_PUBLIC_TURNSTILE_SITE_KEY?: string;
    /** Frozen at build time by next.config.ts. */
    readonly NEXT_PUBLIC_BUILD_YEAR?: string;

    /* ---- server only; never given a NEXT_PUBLIC_ prefix ---------------- */

    /**
     * The market store, read by lib/market/store/client.ts.
     *
     * The URL is separate from NEXT_PUBLIC_SUPABASE_URL — which the client
     * falls back to — so the server can be pointed at the same project through
     * a different host if it ever needs to be.
     */
    readonly SUPABASE_URL?: string;
    /**
     * The service-role key. It reads and writes every row in the project and
     * bypasses RLS, and it is the only way into the `market` schema: market
     * data must not be anonymously scrapeable under the ViewTrade licence, so
     * there are no anon grants to fall back on.
     *
     * A NEXT_PUBLIC_ prefix on this name would publish the database. There is
     * no legitimate reason for one to exist.
     */
    readonly SUPABASE_SERVICE_ROLE_KEY?: string;

    /**
     * "1" runs the refresh loop inside the web service from instrumentation.ts
     * instead of in the Render worker. Default off, and the two must never both
     * be on: they would claim the same leases and double the gateway traffic.
     */
    readonly REFRESH_IN_PROCESS?: string;
    /** How many refresh jobs run at once. Tunable on the host so a gateway
        that starts refusing under load can be backed off without a deploy. */
    readonly REFRESH_CONCURRENCY?: string;
    /** Where the worker POSTs /api/revalidate. The worker is a separate
        process with no idea what host the web service answers on. */
    readonly SITE_URL?: string;
  }
}
