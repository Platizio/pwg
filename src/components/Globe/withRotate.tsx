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

      const tick = () => {
        // Pause rotation while the user is hovering or dragging
        if (!globeState.isHovering && !globeState.isDragging) {
          globeState.phi += 0.004
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
