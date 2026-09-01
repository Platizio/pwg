"use client"

// withHover — HOC that pauses rotation while the user hovers the globe.
//
// Mirrors the Framer override pattern:
//   export function withHover(Component): ComponentType { ... }
//
// Sets globeState.isHovering so withRotate's RAF loop knows to pause.

import { forwardRef, type ComponentType, type HTMLAttributes, type MouseEvent } from 'react'
import { globeState } from './globeStore'

export function withHover<P extends HTMLAttributes<HTMLDivElement>>(
  Component: ComponentType<P>
): ComponentType<P> {
  const WithHover = forwardRef<HTMLDivElement, P>((props, ref) => {
    const handleMouseEnter = (e: MouseEvent<HTMLDivElement>) => {
      globeState.isHovering = true
      props.onMouseEnter?.(e)
    }

    const handleMouseLeave = (e: MouseEvent<HTMLDivElement>) => {
      globeState.isHovering = false
      props.onMouseLeave?.(e)
    }

    return (
      <Component
        {...(props as P)}
        ref={ref}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      />
    )
  })

  WithHover.displayName = `withHover(${
    (Component as { displayName?: string; name?: string }).displayName ||
    (Component as { name?: string }).name ||
    'Component'
  })`

  return WithHover as unknown as ComponentType<P>
}
