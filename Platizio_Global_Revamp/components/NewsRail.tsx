"use client"

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { NEWS, type NewsItem } from '../data/mediaNews'
import { sortNews, formatNewsDate } from '../lib/mediaSelect'

interface RailItem {
  kind: string
  headline: string
  date: string
  href: string
  external?: boolean
}

/** Curated list, newest first. The initial render on both server and client. */
const SEED: RailItem[] = sortNews(NEWS).slice(0, 8).map((n: NewsItem) => ({ ...n }))

/**
 * One headline in the marquee.
 *
 * `aria-hidden` marks the duplicated pass, which exists only so the loop has no
 * visible seam. Without it a screen reader reads every headline twice and the
 * tab order carries sixteen stops for eight stories.
 */
function Headline({ item, clone }: { item: RailItem; clone?: boolean }) {
  const inner = (
    <>
      <span className="nh-text">{item.headline}</span>
      <span className="nh-meta">
        <span className="nh-source">{item.kind}</span>
        <time className="nh-date" dateTime={item.date}>{formatNewsDate(item.date)}</time>
      </span>
    </>
  )

  const props = {
    className: 'news-headline-item',
    ...(clone ? { 'aria-hidden': true, tabIndex: -1 } : {}),
  }

  return item.external ? (
    <a {...props} href={item.href} target="_blank" rel="noopener noreferrer">{inner}</a>
  ) : (
    <Link {...props} href={item.href}>{inner}</Link>
  )
}

/**
 * The news marquee, directly under the header.
 *
 * Headlines set large in the display face, scrolling continuously, with the
 * source beneath in small caps — a front page rather than a widget.
 *
 * Renders the curated list immediately, identically on server and client, so
 * there is no skeleton and nothing to mismatch; live US-market headlines swap
 * in once /api/news answers. If that fails, or the search quota runs out, the
 * curated items simply stay. The band is never empty.
 */
export default function NewsRail() {
  const [items, setItems] = useState<RailItem[]>(SEED)

  useEffect(() => {
    const controller = new AbortController()

    fetch('/api/news', { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((payload: { items?: RailItem[] }) => {
        if (Array.isArray(payload?.items) && payload.items.length >= 4) setItems(payload.items)
      })
      // Failure needs no handling: the curated seed is already on screen, so
      // there is nothing to recover and nothing to tell the reader.
      .catch(() => {})

    return () => controller.abort()
  }, [])

  if (!items.length) return null

  return (
    /* The band is a strip, not a canvas: it starts below the floating pill
       rather than running under it. See the opt-out in chrome.css. */
    <section className="news-band" data-under-bar="off" aria-label="Latest US market news">
      <div className="news-band-inner">
        <p className="news-band-label">
          <span className="news-band-dot" aria-hidden="true" />
          Markets
        </p>

        <div className="news-marquee">
          <div className="news-track">
            {items.map((item) => <Headline item={item} key={item.href} />)}
            {items.map((item) => <Headline item={item} clone key={`dup-${item.href}`} />)}
          </div>
        </div>
      </div>
    </section>
  )
}
