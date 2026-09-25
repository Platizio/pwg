"use client"

// withRotate — HOC that auto-rotates the globe every animation frame.
//
// Mirrors the Framer override pattern:
//   export function withRotate(Component): ComponentType { ... }
//
// Instead of Framer's `animate={{ rotate: store.rotate }}` this HOC runs its
// own requestAnimationFrame loop that increments globeState.phi directly.
// cobe's onRender callback picks it up each frame — zero React re-renders.

import { forwardRef, useEffect, type ComponentType, type HTMLAttributes } from 'react'
import { globeState } from './globeStore'

export function withRotate<P extends HTMLAttributes<HTMLDivElement>>(
  Component: ComponentType<P>
): ComponentType<P> {
  const WithRotate = forwardRef<HTMLDivElement, P>((props, ref) => {
    useEffect(() => {
      // Respect users who prefer reduced motion — keep the globe static
      if (typeof window !== 'undefined' &&
          window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
        return
      }

      let rafId: number
      let last: number | null = null

      /* Radians per second, not per frame. It was 0.004 a frame, which is
         0.24 rad/s on a 60Hz screen but twice that at 120Hz and more than
         three times at 200Hz: the globe spun faster the better the display.
         The step is now scaled by the time since the last frame, so every
         refresh rate turns it at the 60Hz speed. A long gap (a hidden tab,
         a stalled frame) is capped so the globe never jumps. */
      const RAD_PER_SECOND = 0.24

      const tick = (now: number) => {
        const dt = last === null ? 0 : Math.min((now - last) / 1000, 1 / 15)
        last = now
        // Pause rotation while the user is hovering or dragging
        if (!globeState.isHovering && !globeState.isDragging) {
          globeState.phi += RAD_PER_SECOND * dt
        }
        rafId = requestAnimationFrame(tick)
      }

      rafId = requestAnimationFrame(tick)
      return () => cancelAnimationFrame(rafId)
    }, [])

    return <Component {...(props as P)} ref={ref} />
  })

  WithRotate.displayName = `withRotate(${
    (Component as { displayName?: string; name?: string }).displayName ||
    (Component as { name?: string }).name ||
    'Component'
  })`

  return WithRotate as unknown as ComponentType<P>
}
