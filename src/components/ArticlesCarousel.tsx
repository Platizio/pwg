"use client"

import { useState, useEffect, useRef, useCallback, type CSSProperties } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { ARTICLES } from '../articles/registry'

const INTERVAL = 5000
const N = ARTICLES.length

// shortest signed distance on the ring
function offset(i: number, current: number) {
  let d = i - current
  if (d > N / 2) d -= N
  if (d < -N / 2) d += N
  return d
}

function cardStyle(o: number): CSSProperties {
  const abs = Math.abs(o)
  let x = 0, scale = 1, rotY = 0, z = 0, opacity = 1, blur = 0
  if (o === 0) { x = 0; scale = 1; rotY = 0; z = 5 }
  else if (abs === 1) { x = o * 52; scale = 0.82; rotY = -o * 20; z = 3; opacity = 0.62 }
  else if (abs === 2) { x = o * 44 + (o > 0 ? 44 : -44); scale = 0.66; rotY = -o * 24; z = 1; opacity = 0.3; blur = 1 }
  else { x = o * 40; scale = 0.5; rotY = -o * 26; z = 0; opacity = 0 }
  return {
    transform: `translateY(-50%) translateX(${x}%) scale(${scale}) rotateY(${rotY}deg)`,
    opacity,
    zIndex: z,
    filter: blur ? `saturate(.75) brightness(.9) blur(${blur}px)` : undefined,
    pointerEvents: opacity === 0 ? 'none' : 'auto',
  }
}

export default function ArticlesCarousel() {
  const [current, setCurrent] = useState(0)
  const [playing, setPlaying] = useState(false)
  const reduceRef = useRef(false)
  const draggingRef = useRef(false)
  const movedRef = useRef(false)
  const startXRef = useRef(0)
  const stageRef = useRef<HTMLDivElement>(null)
  const router = useRouter()

  const go = useCallback((i: number) => setCurrent(((i % N) + N) % N), [])
  const next = useCallback(() => setCurrent((c) => (c + 1) % N), [])
  const prev = useCallback(() => setCurrent((c) => (c - 1 + N) % N), [])
  const openArticle = useCallback((slug: string) => router.push(`/articles/${slug}`), [router])

  useEffect(() => {
    reduceRef.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (!reduceRef.current) setPlaying(true)
  }, [])

  useEffect(() => {
    if (!playing || reduceRef.current) return
    const t = setInterval(() => setCurrent((c) => (c + 1) % N), INTERVAL)
    return () => clearInterval(t)
  }, [playing, current])

  useEffect(() => {
    const onVis = () => setPlaying(!document.hidden && !reduceRef.current)
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [])

  const pause = () => setPlaying(false)
  const resume = () => { if (!draggingRef.current && !reduceRef.current) setPlaying(true) }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowRight') { e.preventDefault(); next() }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); prev() }
    else if (e.key === 'Enter') { e.preventDefault(); openArticle(ARTICLES[current].slug) }
  }

  const onPointerDown = (e: React.PointerEvent) => {
    draggingRef.current = true
    movedRef.current = false
    startXRef.current = e.clientX
    setPlaying(false)
    // NB: do NOT capture the pointer here — it would suppress the card's click
    // event and break tap-to-open. Capture only once a real drag begins (below).
  }
  const onPointerMove = (e: React.PointerEvent) => {
    if (!draggingRef.current) return
    if (Math.abs(e.clientX - startXRef.current) > 8 && !movedRef.current) {
      movedRef.current = true
      try { stageRef.current?.setPointerCapture(e.pointerId) } catch { /* noop */ }
    }
  }
  const onPointerUp = (e: React.PointerEvent) => {
    if (!draggingRef.current) return
    draggingRef.current = false
    const dx = e.clientX - startXRef.current
    if (Math.abs(dx) > 45) { if (dx < 0) next(); else prev() }
    else resume()
  }
  const onPointerCancel = () => { draggingRef.current = false; resume() }

  // Tap a side card to focus it; tap the focused card to open the article.
  const onCardClick = (i: number, slug: string) => {
    if (movedRef.current) return // was a swipe, not a tap
    if (i !== current) go(i)
    else openArticle(slug)
  }

  const live = `${ARTICLES[current].title} (${current + 1} of ${N})`

  return (
    <div
      className={`articles-carousel${playing ? ' is-playing' : ''}`}
      style={{ '--interval': `${INTERVAL}ms` } as CSSProperties}
    >
      <div
        className="ac-stage"
        ref={stageRef}
        tabIndex={0}
        aria-roledescription="carousel"
        aria-label="Platizio Global articles"
        onMouseEnter={pause}
        onMouseLeave={resume}
        onFocus={pause}
        onBlur={resume}
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
      >
        <div className="ac-track">
          {ARTICLES.map((a, i) => {
            const o = offset(i, current)
            const isActive = o === 0
            return (
              <article
                key={a.slug}
                className={`ac-card${isActive ? ' is-active' : ''}`}
                style={cardStyle(o)}
                role={isActive ? 'link' : 'group'}
                aria-label={isActive ? `Read article: ${a.title}` : a.title}
                onClick={() => onCardClick(i, a.slug)}
              >
                {/* `fill`, not intrinsic dimensions: the card fixes its own
                    box at 4/3 and .ac-logo crops into it, so the 1200x630 the
                    markup used to declare described no box on the page. The
                    sizes list mirrors the card's clamp(280px, 42vw, 440px) —
                    42vw only bites between roughly 667px and 1047px wide. */}
                <Image
                  className="ac-logo"
                  src={a.logo}
                  alt={a.title}
                  fill
                  sizes="(max-width: 666px) 280px, (max-width: 1047px) 42vw, 440px"
                  draggable={false}
                />
                <div className="ac-scrim" aria-hidden="true" />
                <div className="ac-hint">
                  <span className="ac-tag">{a.category}</span>
                  <span className="ac-read">
                    Read Article
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 5l7 7-7 7" /></svg>
                  </span>
                </div>
              </article>
            )
          })}
        </div>

        <button className="ac-arrow prev" onClick={prev} aria-label="Previous article">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
        </button>
        <button className="ac-arrow next" onClick={next} aria-label="Next article">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6" /></svg>
        </button>
      </div>

      <div className="ac-dots" role="tablist" aria-label="Choose article">
        {ARTICLES.map((a, i) => (
          <button
            key={a.slug}
            className={`ac-dot${i === current ? ' is-active' : ''}`}
            role="tab"
            aria-label={a.title}
            aria-selected={i === current}
            onClick={() => go(i)}
          />
        ))}
      </div>

      <div className="ac-progress" aria-hidden="true">
        <i key={`${current}-${playing}`} />
      </div>
      <p className="sr-only" aria-live="polite">{live}</p>
    </div>
  )
}
