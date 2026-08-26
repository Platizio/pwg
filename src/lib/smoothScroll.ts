import Lenis from 'lenis'

/*
 * The site's smooth scroll.
 *
 * One instance for the whole document, held here rather than in context so the
 * route handler and any in-page anchor can reach it without threading a
 * provider through every page.
 *
 * Three things this deliberately does not do:
 *
 *   It does not run under `prefers-reduced-motion`. Smoothing is exactly the
 *   kind of motion that setting exists to refuse, and hijacking the wheel for
 *   a reader who asked for stillness is worse than not shipping it at all.
 *
 *   It does not smooth touch. Native momentum on a phone is tuned by the OS
 *   and feels better than anything a raf loop reproduces; overriding it is the
 *   single most common way a smooth-scroll library makes a site feel worse.
 *
 *   It does not touch scroll on the server. Nothing here runs during
 *   renderToString — the instance is created by an effect.
 */

let lenis: Lenis | null = null
let frame = 0

export function getLenis(): Lenis | null {
  return lenis
}

/** True when the reader has asked for less motion, or the API is unavailable. */
function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

export function startSmoothScroll(): () => void {
  if (typeof window === 'undefined') return () => {}
  if (prefersReducedMotion()) return () => {}
  if (lenis) return () => {}

  lenis = new Lenis({
    /* Long enough to read as eased rather than as lag. Past about 1.4s the
       page stops answering the wheel and starts arguing with it. */
    duration: 1.05,
    easing: (t: number) => 1 - Math.pow(1 - t, 3),
    smoothWheel: true,
    /* The OS already does this better on a touchscreen. */
    syncTouch: false,
    touchMultiplier: 1,
  })

  const raf = (time: number) => {
    lenis?.raf(time)
    frame = requestAnimationFrame(raf)
  }
  frame = requestAnimationFrame(raf)

  return () => {
    cancelAnimationFrame(frame)
    lenis?.destroy()
    lenis = null
  }
}

/**
 * Scroll to a target, through Lenis when it is running and natively when it is
 * not — so the same call works for a reduced-motion reader, and so nothing has
 * to know which mode the page is in.
 */
export function scrollToTarget(
  target: string | HTMLElement | number,
  offset = 0,
): void {
  const l = getLenis()
  if (l) {
    l.scrollTo(target, { offset, duration: 1.05 })
    return
  }
  if (typeof target === 'number') {
    window.scrollTo({ top: target })
    return
  }
  const el = typeof target === 'string' ? document.querySelector(target) : target
  if (el instanceof HTMLElement) {
    window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY + offset })
  }
}
