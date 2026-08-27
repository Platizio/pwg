/// <reference types="vite/client" />

/** Build-time constant injected by vite.config.ts `define`. */
declare const __BUILD_YEAR__: number

/**
 * Environment variables. Both are optional: with neither set, the support
 * assistant falls back to drafting an email instead of posting a ticket, so the
 * site still builds and deploys without any Supabase configuration.
 */
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_ANON_KEY?: string
  /**
   * Cloudflare Turnstile. Optional, and paired with TURNSTILE_SECRET_KEY on the
   * edge functions — with neither set the forms work and record
   * captcha_verified = false; with both set the captcha is enforced. Setting
   * only one of the two breaks intake, so they are configured together.
   */
  readonly VITE_TURNSTILE_SITE_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
