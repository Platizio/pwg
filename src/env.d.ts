/**
 * Environment variables read by the browser bundle.
 *
 * All three are optional: with none set, the support assistant falls back to
 * drafting an email instead of posting a ticket, so the site still builds and
 * deploys without any Supabase configuration.
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
  }
}
