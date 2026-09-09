"use client"

import { forwardRef, useEffect, useRef, type HTMLAttributes } from 'react'
import createGlobe from 'cobe'
import { globeState } from './globeStore'

// New Delhi coordinates — kept for centering the globe, no pin overlay
const DELHI_LAT = 28.6139 * (Math.PI / 180)
const DELHI_LON = 77.2090 * (Math.PI / 180)

// GlobeBase renders the cobe WebGL canvas.
// It accepts standard div HTML attributes so the HOC wrappers can pass through
// onMouseEnter / onMouseLeave without additional prop drilling.
const GlobeBase = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  (props, ref) => {
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const dragStartXRef = useRef<number | null>(null)
    const dragPhiStartRef = useRef<number>(0)

    useEffect(() => {
      const canvas = canvasRef.current
      if (!canvas) return

      const dpr = Math.min(2, window.devicePixelRatio || 1)
      let displaySize = 0

      const measure = () => {
        const parent = canvas.parentElement
        displaySize = (parent ? parent.clientWidth : canvas.clientWidth) || 380
      }
      measure()
      window.addEventListener('resize', measure)

      // ---------- drag handlers ----------
      const onPointerDown = (e: PointerEvent) => {
        dragStartXRef.current = e.clientX
        dragPhiStartRef.current = globeState.phi
        globeState.isDragging = true
        canvas.style.cursor = 'grabbing'
      }
      const onPointerUp = () => {
        dragStartXRef.current = null
        globeState.isDragging = false
        canvas.style.cursor = 'grab'
      }
      const onPointerMove = (e: PointerEvent) => {
        if (dragStartXRef.current !== null) {
          const delta = e.clientX - dragStartXRef.current
          globeState.phi = dragPhiStartRef.current + delta / 200
        }
      }

      canvas.addEventListener('pointerdown', onPointerDown)
      canvas.addEventListener('pointerup', onPointerUp)
      canvas.addEventListener('pointerout', onPointerUp)
      canvas.addEventListener('pointermove', onPointerMove)

      // ---------- cobe initialisation ----------
      // Guarded, because a WebGL context is not guaranteed. A phone with WebGL
      // switched off, a low-memory device that refuses another context, or a
      // browser in battery-saver all hand back null, and cobe then throws while
      // enabling attributes on it. Thrown from inside an effect that takes the
      // whole page down with it — the globe is decoration, so a device that
      // cannot draw it must still get the site.
      let globe: ReturnType<typeof createGlobe> | null = null
      try {
        globe = createGlobe(canvas, {
          devicePixelRatio: dpr,
          width: displaySize * dpr,
          height: displaySize * dpr,
          phi: DELHI_LON,
          theta: DELHI_LAT,
          dark: 1,
          diffuse: 3.0,
          // Half the dots on a phone. Every sample is drawn every frame, and a
          // handset paints them into a canvas a third the width of a laptop's,
          // where the missing nine thousand are literally sub-pixel. It reads
          // identically and costs the battery half as much.
          mapSamples: displaySize < 420 ? 9000 : 18000,
          mapBrightness: 6.5,
          baseColor: [0.55, 0.68, 0.82],  // continent dots — light steel-blue
          markerColor: [0.73, 0.29, 0.07],
          glowColor: [0.25, 0.42, 0.7],   // navy-blue atmosphere
          markers: [],
          onRender: (state) => {
            state.phi = globeState.phi
            state.theta = DELHI_LAT
            state.width = displaySize * dpr
            state.height = displaySize * dpr
          },
        })
      } catch {
        canvas.style.display = 'none'
      }

      return () => {
        globe?.destroy()
        canvas.removeEventListener('pointerdown', onPointerDown)
        canvas.removeEventListener('pointerup', onPointerUp)
        canvas.removeEventListener('pointerout', onPointerUp)
        canvas.removeEventListener('pointermove', onPointerMove)
        window.removeEventListener('resize', measure)
      }
    }, [])

    return (
      <div
        ref={ref}
        className="globe"
        aria-label="Interactive globe centred on India"
        {...props}
      >
        <canvas ref={canvasRef} className="globe-canvas" />
      </div>
    )
  }
)

GlobeBase.displayName = 'GlobeBase'
export default GlobeBase
