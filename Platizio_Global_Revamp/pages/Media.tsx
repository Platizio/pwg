"use client"

/*
 * /media — the channel, the library and the letter.
 *
 * WHY THIS PAGE WAS REBUILT, NOT RESKINNED.
 *
 * The brief was one world with /products: cream paper, warm ink, one gold. This
 * page had the opposite construction. It opened on a `--ink-900` marquee and
 * closed on a navy radial slab, with white and pale-tint type inside both. Once
 * the tokens were re-pointed at the champagne ramp those two bands did not turn
 * to paper — they turned near-black, which is exactly the "black and champagne"
 * reading that was rejected. Colour alone could not fix it: a dark band is dark
 * whatever hex it is given. Both had to stop being bands.
 *
 * The structure was equally wrong. There was no hero and no h1 above the fold —
 * the page's only h1 was "Global investing, explained", buried inside the video
 * section, so the document outline said the page was about videos. Every split
 * on it was 50/50, which is a layout with no reading order.
 *
 * So this is /products' grammar applied to a media page: a hero that states
 * what is here and counts it, the numbered section head (eyebrow + 18ch H2 left,
 * 34ch paragraph right, over one hairline), asymmetric panes throughout, figures
 * in oversized tabular numerals, radial gold washes instead of drop shadows, and
 * the 26px link hairline that grows on hover and on focus.
 *
 * EVERY FACT IS THE ONE THAT WAS ALREADY HERE. The video ids, urls and dates
 * come from src/videos.ts; the articles from the registry; the news seed from
 * data/mediaNews.ts, whose header explains why every fallback headline has to be
 * something that actually happened. The newsletter's copy, its refusal to claim
 * a subscription it cannot honour, and the privacy sentence are unchanged to the
 * word. The counts in the hero are read off those lists at render time so they
 * cannot drift from what the sections below actually show.
 *
 * WHAT USED TO LIVE IN components/. NewsRail, VideoShowcase, MediaPanels and
 * NewsletterSignup were imported by this page and by nothing else in the repo.
 * Their markup is inlined here because the rebuild changes the markup — the
 * section heads, the split ratios and the landmark structure are the change, and
 * they cannot be expressed from a stylesheet. Those four files are now unused.
 *
 * MOTION. Entrance motion SERVER-RENDERS VISIBLE. `motion` writes its `initial`
 * prop into the SSR HTML, so an `initial={{opacity: 0}}` anywhere on this page
 * would ship the content at zero opacity to every crawler and every visitor
 * whose JS has not run — a bug this site shipped for months. Every wrapper here
 * mounts with `initial={false}`, and the hidden state is applied on the client,
 * after mount, and only to elements that are below the fold at that moment. See
 * <Reveal>. Nothing animates but transform and opacity, the hero is never
 * animated at all, and there is no AnimatePresence: it does not resolve its exit
 * in this stack (see lib/use-presence.ts).
 */

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import Link from 'next/link'
import { motion, useReducedMotion } from 'motion/react'

import SEO, { breadcrumbSchema, videoSchema } from '../../src/components/SEO'
import { VIDEOS } from '../../src/videos'
import { ARTICLES } from '../../src/articles/registry'
import { YOUTUBE_CHANNEL_URL } from '../../src/constants'
import { NEWS, type NewsItem } from '../data/mediaNews'
import { sortNews, formatNewsDate, selectVideos, selectTopArticles } from '../lib/mediaSelect'

const SUPPORT_EMAIL = 'supportglobal@platizio.com'

/* The easing every transition on this page and on /products shares. Written as
   the array motion wants rather than read from --ease, which is a CSS string. */
const EASE = [0.22, 1, 0.36, 1] as const

/**
 * YouTube thumbnail URLs. No API key and no embed needed.
 *
 * NOT hqdefault: that is 480x360, i.e. 4:3 with black letterbox bars top and
 * bottom for a 16:9 video. Cropping the bars by scaling the image up also crops
 * the sides, which cut the first and last word off every title card.
 *
 * maxresdefault (1280x720) and mqdefault (320x180) are both natively 16:9, so
 * they need no cropping at all. maxres is not guaranteed to exist for every
 * upload — all nine currently do — so the feature image falls back to mq if it
 * 404s.
 */
const thumbMax = (id: string) => `https://img.youtube.com/vi/${id}/maxresdefault.jpg`
const thumbMq = (id: string) => `https://img.youtube.com/vi/${id}/mqdefault.jpg`

/** `--i` carries the stagger index into CSS. CSSProperties has no index
    signature for custom properties, hence the cast. */
const order = (i: number) => ({ '--i': i } as CSSProperties)

const PlayIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M8 5.5v13l11-6.5z" />
  </svg>
)

const ArrowIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M5 12h14M13 5l7 7-7 7" />
  </svg>
)

/** The signature link: a label and a 26px rule that completes itself. */
/* ------------------------------------------------------------------ reveal */

type Phase = 'ssr' | 'hidden' | 'shown'

/**
 * Scroll entrance that cannot hide content from a reader without JavaScript.
 *
 * The usual `initial={{opacity: 0}} whileInView={...}` is what broke this site:
 * motion serialises `initial` into the server HTML, so the page ships invisible
 * and stays invisible if the bundle fails, is blocked, or is simply slow. The
 * order here is inverted. The server renders the final state (`initial={false}`,
 * `animate` already at rest). After mount, an element that is BELOW THE FOLD is
 * snapped to the hidden state with a zero-duration transition — nobody can see a
 * snap that happens off-screen — and then animated in when it scrolls into view.
 * Anything already on screen at mount, the hero included, is never touched.
 *
 * `data-phase` is what the CSS stagger keys off, so a list can cascade its rows
 * without a motion element per row.
 */
function Reveal({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [phase, setPhase] = useState<Phase>('ssr')
  const reduce = useReducedMotion()

  useEffect(() => {
    /* MotionConfig reducedMotion="user" suppresses transform but keeps opacity,
       which is not enough here: this is a scroll-bound effect, so it needs the
       explicit branch. Nothing is hidden and no observer is created. */
    if (reduce) return

    const el = ref.current
    if (!el) return
    if (typeof IntersectionObserver === 'undefined') return

    // A tenth of a viewport of slack, so an element straddling the fold is
    // treated as visible rather than blinking out from under the reader.
    if (el.getBoundingClientRect().top < window.innerHeight * 0.9) return

    setPhase('hidden')

    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return
        setPhase('shown')
        io.disconnect()
      },
      { rootMargin: '0px 0px -10% 0px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [reduce])

  return (
    <motion.div
      ref={ref}
      className={className ? `mw-reveal ${className}` : 'mw-reveal'}
      data-phase={phase}
      initial={false}
      animate={phase === 'hidden' ? { opacity: 0, y: 22 } : { opacity: 1, y: 0 }}
      /* Going INTO the hidden state must be instant; it happens off-screen and
         an animated hide would be a visible fade-out for anyone who scrolled
         fast. Coming out of it is the entrance. */
      transition={{ duration: phase === 'hidden' ? 0 : 0.6, ease: EASE }}
    >
      {children}
    </motion.div>
  )
}

/* -------------------------------------------------------------------- rail */

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
      <span className="mw-item-text">{item.headline}</span>
      <span className="mw-item-meta">
        <span className="mw-item-kind">{item.kind}</span>
        <time className="mw-item-date" dateTime={item.date}>{formatNewsDate(item.date)}</time>
      </span>
    </>
  )

  const props = {
    className: 'mw-item',
    ...(clone ? { 'aria-hidden': true, tabIndex: -1 } : {}),
  }

  return item.external ? (
    <a {...props} href={item.href} target="_blank" rel="noopener noreferrer">{inner}</a>
  ) : (
    <Link {...props} href={item.href}>{inner}</Link>
  )
}

/**
 * The news strip.
 *
 * Renders the curated list immediately, identically on server and client, so
 * there is no skeleton and nothing to mismatch; live US-market headlines swap in
 * once /api/news answers. If that fails, or the finite search quota runs out,
 * the curated items simply stay. The strip is never empty.
 */
function NewsRail() {
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
    <section className="mw-rail" aria-label="Latest US market news">
      <div className="mw-rail-inner">
        <p className="mw-rail-label">
          <span className="mw-rail-dot" aria-hidden="true" />
          Markets
        </p>

        <div className="mw-marquee">
          <div className="mw-track">
            {items.map((item) => <Headline item={item} key={item.href} />)}
            {items.map((item) => <Headline item={item} clone key={`dup-${item.href}`} />)}
          </div>
        </div>
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------ letter */

type Status = 'idle' | 'sending' | 'done' | 'error'

/**
 * Newsletter signup.
 *
 * Posts to /api/subscribe, which forwards to whatever mailing provider is
 * configured. No provider is connected yet, so that endpoint answers 503 and
 * this form says so plainly and offers an email address instead.
 *
 * It deliberately does NOT show a success message it cannot honour. A form that
 * says "Subscribed!" while storing nothing is worse than one that admits it is
 * not live: the visitor walks away believing they will hear from you.
 */
function Letter() {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [message, setMessage] = useState('')

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (status === 'sending') return

    setStatus('sending')
    setMessage('')

    try {
      const res = await fetch('/api/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const body = await res.json().catch(() => ({}))

      if (res.ok) {
        setStatus('done')
        setMessage('You are on the list. Look out for the first issue.')
        setEmail('')
      } else {
        setStatus('error')
        setMessage(body?.error || 'Could not sign you up just now.')
      }
    } catch {
      setStatus('error')
      setMessage('Could not reach the server. Check your connection and try again.')
    }
  }

  return (
    <section className="mw-letter" aria-labelledby="mw-letter-h">
      <div className="container">
        {/* Copy and form in one panel, at Aayush's request. This section is
            deliberately not shaped like 01 and 02: it is a single object a
            reader acts on, not a heading with a list under it, and splitting
            the words away from the field it introduces made it two things. */}
        <Reveal>
          <div className="mw-letter-panel">
            <div className="mw-letter-copy">
              <h2 className="mw-h2" id="mw-letter-h">What we are reading, monthly</h2>
              <p className="mw-body">
                One email a month on global markets, tax changes that affect Indian
                investors, and what we have published. No trade calls, no daily noise.
              </p>
            </div>

            <form className="mw-form" onSubmit={onSubmit} noValidate>
              <label className="visually-hidden" htmlFor="newsletter-email">Email address</label>
              <div className="mw-controls">
                <input
                  id="newsletter-email"
                  className="mw-input"
                  type="email"
                  name="email"
                  inputMode="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  required
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); if (status !== 'idle') setStatus('idle') }}
                  aria-describedby="newsletter-status"
                />
                <button className="mw-cta mw-submit" type="submit" disabled={status === 'sending'}>
                  {status === 'sending' ? 'Signing up…' : 'Subscribe'}
                </button>
              </div>

              {/* Announced to screen readers when it changes, not just shown. The
                  outcome also carries a word, never colour alone (WCAG 1.4.1). */}
              <p
                className={`mw-status is-${status}`}
                id="newsletter-status"
                role="status"
                aria-live="polite"
              >
                {status === 'error' && (
                  <>
                    <span className="mw-status-flag">Not sent — </span>
                    {message}{' '}
                    <a href={`mailto:${SUPPORT_EMAIL}?subject=Newsletter%20signup`}>
                      Email us instead
                    </a>
                  </>
                )}
                {status === 'done' && (
                  <>
                    <span className="mw-status-flag">Subscribed — </span>
                    {message}
                  </>
                )}
                {status === 'idle' && (
                  <>
                    We will not share your address. See our{' '}
                    <Link href="/privacy">privacy policy</Link>.
                  </>
                )}
              </p>
            </form>
          </div>
        </Reveal>
      </div>
    </section>
  )
}

/* -------------------------------------------------------------------- page */

export default function Media() {
  const { feature, side } = selectVideos(VIDEOS)
  const top = selectTopArticles(ARTICLES)

  return (
    <div className="mw">
      <SEO
        title="Media — Videos, Articles &amp; Market Explainers"
        description="Videos, guides and explainers on investing in US Stocks and ETFs from India — routes, taxes, ETFs, currency risk and LRS compliance, from Platizio Global."
        canonical="/media"
        /* VideoObject for every video, restoring what the original page emitted.
           The revamp shipped with breadcrumb schema only, which silently dropped
           eligibility for video rich results — the thumbnails use the same 16:9
           source the page renders, not the letterboxed hqdefault the original
           declared. */
        jsonLd={[
          breadcrumbSchema([['Home', '/'], ['Media', '/media']]),
          ...VIDEOS.map((v) =>
            videoSchema({
              name: v.title,
              description: v.blurb,
              thumbnailUrl: `https://img.youtube.com/vi/${v.id}/maxresdefault.jpg`,
              uploadDate: v.date,
              embedUrl: `https://www.youtube.com/embed/${v.id}`,
            })
          ),
        ]}
      />

      {/* ============================================================== hero
          Never wrapped in <Reveal>: it is the first paint and almost certainly
          the LCP element, and an LCP element must not be animated. */}
      <section className="mw-hero" aria-labelledby="mw-hero-h">
        <div className="container mw-hero-inner">
          <div className="mw-hero-copy">
            <p className="mw-mark">
              <span className="mw-mark-dot" aria-hidden="true" />
              <span className="mw-label">Media — videos, guides &amp; explainers</span>
            </p>

            <h1 className="mw-h1" id="mw-hero-h">Everything we publish, in one place.</h1>

            <p className="mw-lede">
              Videos, guides and explainers on investing in US Stocks and ETFs from
              India — routes, taxes, ETFs, currency risk and LRS compliance.
            </p>

            <div className="mw-actions">
              <a className="mw-cta" href={YOUTUBE_CHANNEL_URL} target="_blank" rel="noopener noreferrer">
                Watch the channel
              </a>
              <Link className="mw-ghost" href="/articles">Read the guides</Link>
            </div>
          </div>

          {/* The three counts are read off the same lists the sections below
              render, so the page cannot claim a number it does not show. */}
          <div className="mw-figures">
            <p className="mw-figure">
              <span className="mw-figure-n">{VIDEOS.length}</span>
              <span className="mw-figure-t">
                <b>Videos</b>
                Short explainers on the channel, newest first.
              </span>
            </p>
            <p className="mw-figure">
              <span className="mw-figure-n">{ARTICLES.length}</span>
              <span className="mw-figure-t">
                <b>Articles</b>
                Long-form guides on the route, the tax and the paperwork.
              </span>
            </p>
            <p className="mw-figure">
              <span className="mw-figure-n">01</span>
              <span className="mw-figure-t">
                <b>The letter</b>
                One email a month. No trade calls, no daily noise.
              </span>
            </p>
          </div>
        </div>
      </section>

      {/* ============================================================== rail */}
      <NewsRail />

      {/* ========================================================= 01 · watch */}
      {feature && (
        <section className="mw-section" id="videos" aria-labelledby="mw-watch-h">
          <div className="container">
            <Reveal>
              <header className="mw-head">
                <div className="mw-head-l">
                  <h2 className="mw-h2" id="mw-watch-h">Global investing, explained</h2>
                </div>
                <p className="mw-body">
                  Short videos on routes, taxes, ETFs and currency — from the Platizio
                  Global channel.
                </p>
              </header>
            </Reveal>

            <Reveal>
              <div className="mw-watch">
                {/*
                  * Linked thumbnails, not iframes. An embed loads Google's player
                  * and its cookies on page load for every visitor, whether or not
                  * they ever press play; a linked still avoids that entirely and
                  * keeps the page light.
                  */}
                <a className="mw-feature" href={feature.url} target="_blank" rel="noopener noreferrer">
                  <span className="mw-thumb">
                    {/* eslint-disable-next-line @next/next/no-img-element -- next/image owns src and srcset, so the maxres->mq fallback below would silently stop firing. */}
                    <img
                      src={thumbMax(feature.id)}
                      alt=""
                      width={1280}
                      height={720}
                      loading="lazy"
                      onError={(e) => {
                        // One shot only, or a missing mq would loop forever.
                        const img = e.currentTarget
                        if (img.dataset.fallback) return
                        img.dataset.fallback = '1'
                        img.src = thumbMq(feature.id)
                      }}
                    />
                    <span className="mw-play" aria-hidden="true"><PlayIcon /></span>
                  </span>
                  <span className="mw-feature-body">
                    <time className="mw-date" dateTime={feature.date}>{formatNewsDate(feature.date)}</time>
                    <span className="mw-feature-title">{feature.title}</span>
                    <span className="mw-feature-blurb">{feature.blurb}</span>
                  </span>
                </a>

                <div className="mw-side">
                  <ul className="mw-list mw-stagger">
                    {side.map((v, i) => (
                      <li key={v.id} style={order(i)}>
                        <a className="mw-row" href={v.url} target="_blank" rel="noopener noreferrer">
                          <span className="mw-row-thumb">
                            {/* eslint-disable-next-line @next/next/no-img-element -- img.youtube.com is remote and unlisted in next.config remotePatterns, which we are not widening for a thumbnail. */}
                            <img src={thumbMq(v.id)} alt="" width={320} height={180} loading="lazy" />
                            <span className="mw-play is-small" aria-hidden="true"><PlayIcon /></span>
                          </span>
                          <span className="mw-row-body">
                            <span className="mw-row-title">{v.title}</span>
                            <time className="mw-date" dateTime={v.date}>{formatNewsDate(v.date)}</time>
                          </span>
                        </a>
                      </li>
                    ))}
                  </ul>

                  <a className="mw-ghost mw-more" href={YOUTUBE_CHANNEL_URL} target="_blank" rel="noopener noreferrer">
                    Watch more on YouTube
                  </a>
                </div>
              </div>
            </Reveal>
          </div>
        </section>
      )}

      {/* ========================================================== 02 · read */}
      <section className="mw-section" id="articles" aria-labelledby="mw-read-h">
        <div className="container">
          <Reveal>
            <header className="mw-head">
              <div className="mw-head-l">
                <h2 className="mw-h2" id="mw-read-h">The long-form explainers</h2>
              </div>
              <p className="mw-body">
                {ARTICLES.length} guides on routes, taxes, ETFs, currency risk and LRS
                compliance, written end to end rather than answered piecemeal.
              </p>
            </header>
          </Reveal>

          <Reveal>
            <div className="mw-read">
              <div className="mw-articles">
                <div className="mw-panel-head">
                  <h3 className="mw-h3">Articles</h3>
                  <span className="mw-count">{ARTICLES.length} published</span>
                </div>

                <ol className="mw-article-list mw-stagger">
                  {top.map((a, i) => (
                    <li key={a.slug} style={order(i)}>
                      <Link className="mw-article" href={`/articles/${a.slug}`}>
                        <span className="mw-article-i" aria-hidden="true">{String(i + 1).padStart(2, '0')}</span>
                        <span className="mw-article-body">
                          <span className="mw-article-title">{a.title}</span>
                          <span className="mw-article-meta">{a.category} · {a.readTime}</span>
                        </span>
                        <span className="mw-article-go" aria-hidden="true"><ArrowIcon /></span>
                      </Link>
                    </li>
                  ))}
                </ol>

                <Link className="mw-ghost mw-more" href="/articles">View all articles</Link>
              </div>

              {/*
                * The blog is deliberately empty for now. An empty state is a
                * place to say what is coming and offer somewhere to go
                * meanwhile — not a shrug. It points at the articles beside it
                * rather than dead-ending.
                */}
              <aside className="mw-aside" aria-labelledby="mw-blog-h">
                <div className="mw-panel-head">
                  <h3 className="mw-h3" id="mw-blog-h">Blog</h3>
                  <span className="mw-badge">Coming soon</span>
                </div>

                <div className="mw-aside-empty">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                  </svg>
                  <p className="mw-aside-title">Shorter, more frequent writing</p>
                  <p className="mw-aside-body">
                    Market notes, product updates and answers to questions we get asked
                    often. In the meantime, the long-form explainers are next door.
                  </p>
                </div>
              </aside>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ==================================================== 03 · the letter */}
      <Letter />
    </div>
  )
}
