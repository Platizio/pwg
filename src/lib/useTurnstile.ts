// Cloudflare Turnstile, rendered only when a site key is configured.
//
// With VITE_TURNSTILE_SITE_KEY unset this hook does nothing at all: no script
// is injected, no widget is mounted, and getToken() returns null. The server
// has the matching switch — with no TURNSTILE_SECRET_KEY it accepts the
// submission and records captcha_verified = false — so the form stays working
// while the captcha account is being set up, and starts being enforced the
// moment both halves are configured. Neither half is any use without the other.
//
// That symmetry is the reason this file exists. Until now only the server half
// was written: create-ticket read `x-turnstile-token` and nothing ever sent it.
// Setting TURNSTILE_SECRET_KEY in that state would have 403'd every submission,
// and leaving it unset left the intake endpoint captcha-free behind rate limits
// alone. Both halves ship together or neither does.
//
// Rendered explicitly rather than by class-name scanning, so the widget is tied
// to a container this component owns and cannot be re-initialised by a stray
// re-render.

import { useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'

const SCRIPT_ID = 'cf-turnstile-script'
const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'

interface TurnstileApi {
  render: (
    container: HTMLElement,
    options: {
      sitekey: string
      callback?: (token: string) => void
      'expired-callback'?: () => void
      'error-callback'?: () => void
      theme?: 'light' | 'dark' | 'auto'
    },
  ) => string
  reset: (widgetId?: string) => void
  remove: (widgetId?: string) => void
}

declare global {
  interface Window {
    turnstile?: TurnstileApi
  }
}

export const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY ?? ''
export const isTurnstileEnabled = (): boolean => Boolean(TURNSTILE_SITE_KEY)

function loadScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve()

  return new Promise((resolve, reject) => {
    const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true })
      existing.addEventListener('error', () => reject(new Error('turnstile failed to load')), { once: true })
      return
    }

    const script = document.createElement('script')
    script.id = SCRIPT_ID
    script.src = SCRIPT_SRC
    script.async = true
    script.defer = true
    script.addEventListener('load', () => resolve(), { once: true })
    script.addEventListener('error', () => reject(new Error('turnstile failed to load')), { once: true })
    document.head.appendChild(script)
  })
}

export interface TurnstileHandle {
  /** Attach to the element the widget should be rendered into. */
  containerRef: RefObject<HTMLDivElement>
  /** The current token, or null when there is none to give. */
  getToken: () => string | null
  /** Clears the solved token so the next submission needs a fresh one. */
  reset: () => void
  /** True once the widget is mounted and has produced a token. */
  ready: boolean
  enabled: boolean
}

export function useTurnstile(): TurnstileHandle {
  const containerRef = useRef<HTMLDivElement>(null)
  const widgetIdRef = useRef<string | null>(null)
  const tokenRef = useRef<string | null>(null)
  const [ready, setReady] = useState(false)

  const enabled = isTurnstileEnabled()

  // Everything that touches `window` lives in here. The effect never runs
  // during renderToString, so this file is safe in the prerender pass.
  useEffect(() => {
    if (!enabled) return
    let cancelled = false

    loadScript()
      .then(() => {
        if (cancelled || !containerRef.current || !window.turnstile) return
        // A second render into the same container would stack widgets; React 18
        // strict mode mounts effects twice in development, which is exactly how
        // that happens.
        if (widgetIdRef.current !== null) return

        widgetIdRef.current = window.turnstile.render(containerRef.current, {
          sitekey: TURNSTILE_SITE_KEY,
          theme: 'light',
          callback: (token: string) => {
            tokenRef.current = token
            setReady(true)
          },
          'expired-callback': () => {
            tokenRef.current = null
            setReady(false)
          },
          'error-callback': () => {
            tokenRef.current = null
            setReady(false)
          },
        })
      })
      .catch((error) => {
        // Left un-ready rather than silently passing: the server decides
        // whether a missing token is fatal, and it should get the truth.
        console.error('Turnstile could not be initialised', error)
      })

    return () => {
      cancelled = true
      if (widgetIdRef.current !== null && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current)
        widgetIdRef.current = null
      }
    }
  }, [enabled])

  return {
    containerRef,
    enabled,
    ready,
    getToken: () => tokenRef.current,
    reset: () => {
      tokenRef.current = null
      setReady(false)
      if (widgetIdRef.current !== null && window.turnstile) {
        window.turnstile.reset(widgetIdRef.current)
      }
    },
  }
}
