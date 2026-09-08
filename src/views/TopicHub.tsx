"use client"

import { useEffect, useRef, useState } from 'react'
import type { MouseEvent, ReactNode } from 'react'
import Link from 'next/link'
import { motion } from 'motion/react'
import { notFound, useParams } from 'next/navigation'
import SEO, { breadcrumbSchema, faqSchema, itemListSchema } from '../components/SEO'
import { articlesByTopic } from '../articles/registry'
import { TOPICS, getTopic } from '../articles/topics'
import { byNewest } from '../../Platizio_Global_Revamp/lib/articleSelect'
import { scrollToTarget } from '../lib/smoothScroll'
import { TRADING_PLATFORM_URL } from '../constants'

/**
 * A topic hub — seven of them, one per subject, all rendered by this file.
 *
 * WHY THIS WAS REBUILT. The page opened on `.page-hero`, which page.css paints
 * as an ink floor carrying white type. Measured in the browser before this
 * change: `background-color: rgb(74, 63, 48)` under `color: rgb(255, 253, 249)`.
 * The benchmark this site is being rebuilt to — /products — has no dark band
 * anywhere; it is cream paper, warm ink and one gold. A band that is dark is
 * dark whatever hex you give it, so the opener is not re-tinted here, it stops
 * being a band: the hub now runs on one continuous paper ground from the nav
 * to the footer, and everything that was coloured for an ink floor — the
 * breadcrumb, the h1, the deck — is coloured for paper instead.
 *
 * WHY THE STYLES LIVE IN THIS FILE. Every stylesheet the hub used to borrow
 * from is shared with eighteen other routes and is owned elsewhere. The page's
 * own world is declared here, scoped under `.th`, from the marketing token
 * layer only — `--surface`, `--white`, `--gray-800/700/600`, `--gold`,
 * `--gold-hi`, `--gold-deep`, `--line`, `--ease`. No literal colour appears
 * below, so the hub follows the palette wherever it is next taken rather than
 * pinning a copy of today's values.
 *
 * WHAT IT BORROWS FROM /products. The devices, not the copy: asymmetric split
 * panes (1fr/0.82fr where copy leads), a section head that is a flex row of
 * numbered eyebrow plus 18ch h2 against a 34ch body over a hairline, oversized
 * figures set in tabular numerals, radial washes in place of drop shadows, and
 * the signature link gesture — a 26px hairline that grows from scaleX(0.62) to
 * full on hover and on focus-visible.
 *
 * WHAT CHANGED IN SUBSTANCE. Two things beyond styling, both kept from the
 * previous build: the intro no longer runs at the full container width, which
 * is a width nothing should be read at (it has a 62ch measure now); and the
 * hub's questions stay open rather than collapsing, because a hub carries five
 * or six and collapsing six saves nothing worth a click. New here is the sixth
 * section — the other six hubs — because a reader who lands on the wrong topic
 * previously had no route to the right one except back through /articles.
 *
 * Every fact, rate, date and regulatory sentence on the page comes verbatim
 * from src/articles/topics.ts and the article registry. Nothing here rewrites
 * copy.
 */

/* The one curve the site uses, as motion wants it. Kept in step with `--ease`
   in marketing-tokens.css; the two must not drift. */
const EASE = [0.22, 1, 0.36, 1] as const

/* The floating nav pill is `--bar-inset` + `--bar-h` tall, so an anchor that
   lands flush with the top of a section lands under it. */
const BAR_CLEARANCE = -108

/* The state an entrance can be in. `as-rendered` is what the server ships and
   what a reader without JavaScript keeps for good. */
type Enter = 'as-rendered' | 'held' | 'entered'

const HELD = { opacity: 0, y: 20 }
const SHOWN = { opacity: 1, y: 0 }

/**
 * The reveal, arranged so it can never hide content.
 *
 * motion serialises `initial` into the server HTML. `initial={{opacity: 0}}`
 * therefore ships the section at zero opacity to every crawler and to every
 * reader whose hydration fails — a bug this site shipped for months and is not
 * getting back. So: `initial={false}`, meaning the server renders the *final*
 * state, and the hidden state is only ever applied on the client, in an effect,
 * and only to an element that is still below the fold at that moment. Anything
 * already on screen when hydration finishes is left exactly as painted —
 * fading out something the reader is looking at is a flash, not an entrance.
 *
 * Transform and opacity only, so the whole thing stays off the layout path.
 */
function useEnter() {
  const node = useRef<HTMLElement | null>(null)
  const [state, setState] = useState<Enter>('as-rendered')

  useEffect(() => {
    const el = node.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    if (el.getBoundingClientRect().top < window.innerHeight * 0.92) return

    setState('held')
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return
        setState('entered')
        io.disconnect()
      },
      { rootMargin: '0px 0px -10% 0px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  return {
    /* A callback ref rather than a forwarded one: motion's element type differs
       per tag and this hook is shared by a <div> and an <li>. */
    setNode: (el: HTMLElement | null) => {
      node.current = el
    },
    /* Going *into* the held state must be instant — it happens off screen, and
       animating to it would burn 550ms doing nothing anyone can see. */
    animate: state === 'held' ? HELD : SHOWN,
    instant: state === 'held',
  }
}

function Reveal({
  children,
  className,
  delay = 0,
}: {
  children: ReactNode
  className?: string
  delay?: number
}) {
  const { setNode, animate, instant } = useEnter()
  return (
    <motion.div
      ref={setNode}
      className={className}
      initial={false}
      animate={animate}
      transition={instant ? { duration: 0 } : { duration: 0.55, delay, ease: EASE }}
    >
      {children}
    </motion.div>
  )
}

function RevealRow({
  children,
  className,
  delay = 0,
}: {
  children: ReactNode
  className?: string
  delay?: number
}) {
  const { setNode, animate, instant } = useEnter()
  return (
    <motion.li
      ref={setNode}
      className={className}
      initial={false}
      animate={animate}
      transition={instant ? { duration: 0 } : { duration: 0.5, delay, ease: EASE }}
    >
      {children}
    </motion.li>
  )
}

/** The hairline that grows. Decorative — the link is already named by its text. */
const Rule = () => <span className="th-rule" aria-hidden="true" />

const pad = (n: number) => String(n).padStart(2, '0')

export default function TopicHub() {
  const { topic: topicId } = useParams<{ topic: string }>()
  const topic = topicId ? getTopic(topicId) : undefined

  if (!topic) notFound()

  const articles = byNewest(articlesByTopic(topic.id))
  const others = TOPICS.filter((t) => t.id !== topic.id)
  const path = `/articles/topic/${topic.id}`
  const newest = articles[0]

  /*
   * Lenis owns the scroll position, and `scrollIntoView` fights it — the two
   * animate the same number from different loops and the page stutters between
   * them. `scrollToTarget` hands the job to Lenis when it is running and falls
   * back to a native jump when it is not, which is also the reduced-motion
   * path. The href stays real so the link works with no JavaScript at all.
   */
  const jump = (e: MouseEvent<HTMLAnchorElement>, id: string) => {
    const el = document.getElementById(id)
    if (!el) return
    e.preventDefault()
    scrollToTarget(el, BAR_CLEARANCE)
    /* Moving the viewport is not moving focus. Without this the next Tab
       resumes from the rail, not from the section the reader jumped to. */
    el.focus({ preventScroll: true })
    window.history.replaceState(null, '', `#${id}`)
  }

  const contents: [string, string][] = [
    ['reading', articles.length === 1 ? 'The one article' : `All ${articles.length} articles`],
    ['questions', 'Common questions'],
    ['hubs', 'The other hubs'],
  ]

  return (
    <>
      <SEO
        title={topic.seoTitle}
        description={topic.description}
        canonical={path}
        jsonLd={[
          breadcrumbSchema([
            ['Home', '/'],
            ['Articles', '/articles'],
            [topic.title, path],
          ]),
          itemListSchema(
            articles.map((a) => ({ name: a.title, path: `/articles/${a.slug}` }))
          ),
          faqSchema(topic.faqs),
        ]}
      />

      <div className="th">
        {/* Hoisted into <head> by React and deduplicated by href, so the seven
            hubs share one copy of the sheet. Every selector is scoped under
            `.th` and carries at least a class, which keeps it above the shared
            element-level rules in base.css whichever order the two land in. */}
        <style href="pwg-topic-hub" precedence="high">{SHEET}</style>

        {/* ------------------------------------------------------------ hero */}
        <section className="th-hero" aria-labelledby="th-title">
          <div className="th-wrap th-hero-inner">
            <div className="th-hero-copy">
              <nav className="th-crumbs" aria-label="Breadcrumb">
                <ol>
                  <li><Link href="/">Home</Link></li>
                  <li aria-hidden="true" className="th-crumb-sep">/</li>
                  <li><Link href="/articles">Articles</Link></li>
                  <li aria-hidden="true" className="th-crumb-sep">/</li>
                  <li><span aria-current="page">{topic.title}</span></li>
                </ol>
              </nav>

              <p className="th-label">Topic hub</p>
              {/* The page's largest paint. Nothing animates it. */}
              <h1 className="th-h1" id="th-title">{topic.title}</h1>
              <p className="th-deck">{topic.blurb}</p>

              <div className="th-actions">
                <a
                  className="th-cta"
                  href={TRADING_PLATFORM_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Start investing
                </a>
                <Link className="th-ghost" href="/articles">
                  Browse all articles
                </Link>
              </div>
            </div>

            {/* The figures, oversized and in tabular numerals — the /products
                device. Two counts and a date, all read off the registry rather
                than typed in, so a new article changes them by itself. */}
            <aside className="th-dossier" aria-label="This hub at a glance">
              <p className="th-label">At a glance</p>
              <div className="th-figs">
                <p className="th-fig">
                  <span className="th-fig-n">{articles.length}</span>
                  <span className="th-fig-l">
                    {articles.length === 1 ? 'Article' : 'Articles'}
                  </span>
                </p>
                <p className="th-fig">
                  <span className="th-fig-n">{topic.faqs.length}</span>
                  <span className="th-fig-l">Questions answered</span>
                </p>
              </div>
              {newest && (
                <p className="th-dossier-foot">
                  Newest piece filed <strong>{newest.dateLabel}</strong>. Free to read,
                  no account needed.
                </p>
              )}
            </aside>
          </div>
        </section>

        {/* -------------------------------------------------------- 01 ground */}
        <section className="th-band" aria-labelledby="th-ground-h">
          <div className="th-wrap">
            <header className="th-head">
              <div className="th-head-l">
                <h2 className="th-h2" id="th-ground-h">Start here.</h2>
              </div>
              <p className="th-body">{topic.description}</p>
            </header>

            <div className="th-open">
              {/* Author-controlled HTML from topics.ts. Given a reading measure
                  rather than the full container width, which is what it used to
                  run at. */}
              <Reveal className="th-prose">
                <div dangerouslySetInnerHTML={{ __html: topic.introHtml }} />
              </Reveal>

              <Reveal className="th-rail-holder" delay={0.08}>
                <nav className="th-rail" aria-label="On this page">
                  <p className="th-label">On this page</p>
                  <ol>
                    {contents.map(([id, label], i) => (
                      <li key={id}>
                        <a href={`#${id}`} onClick={(e) => jump(e, id)}>
                          <span className="th-rail-n">{pad(i + 1)}</span>
                          <span>{label}</span>
                        </a>
                      </li>
                    ))}
                  </ol>
                </nav>
              </Reveal>
            </div>
          </div>
        </section>

        {/* ------------------------------------------------------- 02 reading */}
        <section className="th-band" id="reading" tabIndex={-1} aria-labelledby="th-reading-h">
          <div className="th-wrap">
            <header className="th-head">
              <div className="th-head-l">
                <h2 className="th-h2" id="th-reading-h">
                  {articles.length} {articles.length === 1 ? 'article' : 'articles'} in this topic
                </h2>
              </div>
              <p className="th-body">
                In order of publication, newest first. An article can sit in more than
                one hub, so a piece here may appear under another subject too.
              </p>
            </header>

            {articles.length === 0 ? (
              <p className="th-empty">
                Nothing is filed under this hub yet.{' '}
                <Link className="th-inline" href="/articles">The full library</Link> has
                everything we have published.
              </p>
            ) : (
              <ol className="th-index">
                {articles.map((a, i) => (
                  <RevealRow
                    className="th-row"
                    key={a.slug}
                    delay={Math.min(i, 5) * 0.05}
                  >
                    <span className="th-row-n" aria-hidden="true">{pad(i + 1)}</span>
                    <div className="th-row-main">
                      <h3 className="th-row-t">
                        <Link href={`/articles/${a.slug}`}>{a.title}</Link>
                      </h3>
                      <p className="th-row-m">
                        <span className="th-row-cat">{a.category}</span>
                        <span aria-hidden="true">·</span>
                        <span>{a.dateLabel}</span>
                        <span aria-hidden="true">·</span>
                        <span>{a.readTime}</span>
                      </p>
                      <p className="th-row-x">{a.excerpt}</p>
                    </div>
                    <span className="th-row-go" aria-hidden="true">
                      <Rule />
                    </span>
                  </RevealRow>
                ))}
              </ol>
            )}
          </div>
        </section>

        {/* ----------------------------------------------------- 03 questions */}
        <section className="th-band" id="questions" tabIndex={-1} aria-labelledby="th-questions-h">
          <div className="th-wrap">
            <header className="th-head">
              <div className="th-head-l">
                <h2 className="th-h2" id="th-questions-h">
                  Asked most often about {topic.title}
                </h2>
              </div>
              <p className="th-body">
                Answered here word for word as they are published to search engines as
                structured data. Nothing is summarised for the page.
              </p>
            </header>

            <ul className="th-faq">
              {topic.faqs.map((faq, i) => (
                <RevealRow key={faq.q} delay={Math.min(i, 5) * 0.05}>
                  <h3>{faq.q}</h3>
                  <p>{faq.a}</p>
                </RevealRow>
              ))}
            </ul>
          </div>
        </section>

        {/* ---------------------------------------------------------- 04 hubs */}
        <section className="th-band" id="hubs" tabIndex={-1} aria-labelledby="th-hubs-h">
          <div className="th-wrap">
            <header className="th-head">
              <div className="th-head-l">
                <h2 className="th-h2" id="th-hubs-h">The other hubs.</h2>
              </div>
              <p className="th-body">
                {others.length} more subjects cover the rest of the ground, from the
                remittance route to what is owed at the far end of it.
              </p>
            </header>

            <ul className="th-hubs">
              {others.map((t, i) => (
                <RevealRow className="th-hub" key={t.id} delay={Math.min(i, 5) * 0.05}>
                  <h3>
                    <Link href={`/articles/topic/${t.id}`}>{t.title}</Link>
                  </h3>
                  <p>{t.blurb}</p>
                  {/* Decorative, and deliberately not a second link: two links
                      to one destination in one card is two tab stops for one
                      idea. The card's whole face is the heading link. */}
                  <span className="th-link" aria-hidden="true">
                    Open the hub <Rule />
                  </span>
                </RevealRow>
              ))}
            </ul>
          </div>
        </section>

        {/* --------------------------------------------------------- 05 close */}
        {/* The hub used to end on a lone outline button in a section of its
            own — the only thing on the page and no way from here to an
            account. */}
        <section className="th-close" aria-labelledby="th-close-h">
          <div className="th-wrap">
            <div className="th-close-inner">
              <h2 className="th-h2" id="th-close-h">Read on, or start</h2>
              <p className="th-body">
                Every article here is free. So is opening the account they describe.
              </p>
              <div className="th-actions">
                <a
                  className="th-cta"
                  href={TRADING_PLATFORM_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Start investing
                </a>
                <Link className="th-ghost" href="/articles">
                  Browse all articles
                </Link>
              </div>
              <div className="th-close-rule" aria-hidden="true" />
            </div>
          </div>
        </section>
      </div>
    </>
  )
}

/*
 * The hub's world.
 *
 * Read from the marketing token layer and nothing else — there is no literal
 * colour in this sheet, so when the palette moves the page moves with it.
 * Where a tone the tokens do not name is needed (a 4%-ink shadow, a 42%-gold
 * hover edge) it is mixed out of a token rather than typed as a hex, and each
 * one is declared twice: a plain token fallback first for a browser without
 * `color-mix`, the mix second for one with it. That two-declaration idiom is
 * used in place of `@supports`, which this build's CSS minifier silently
 * empties whenever the tested declaration contains a `var()`.
 */
const SHEET = `
.th {
  --th-wash: var(--m-tint-shared);
  --th-wash-soft: var(--m-tint-shared);
  --th-wash-soft: color-mix(in srgb, var(--gold) 8%, transparent);
  --th-edge-hover: var(--line-strong);
  --th-edge-hover: color-mix(in srgb, var(--gold) 42%, transparent);
  --th-shade: var(--line);
  --th-shade: color-mix(in srgb, var(--gray-800) 5%, transparent);
  --th-shade-deep: var(--line-strong);
  --th-shade-deep: color-mix(in srgb, var(--gray-800) 9%, transparent);
  --th-card: 0 1px 2px var(--th-shade), 0 2px 6px var(--th-shade);
  --th-card-lg: 0 4px 10px var(--th-shade), 0 22px 46px var(--th-shade-deep);
  --th-r: 16px;

  position: relative;
  background-color: var(--surface);
  color: var(--gray-800);
  font-family: 'Outfit', ui-sans-serif, system-ui, sans-serif;
}

.th ::selection { background: var(--th-wash); color: var(--gray-800); }
.th :focus-visible { outline: 2px solid var(--gold); outline-offset: 3px; }
/* The section landmarks take focus when the contents rail jumps to them; that
   is a programmatic focus and must not draw a ring. */
.th [tabindex="-1"]:focus { outline: none; }

.th-wrap {
  max-width: 1360px;
  width: 100%;
  margin-inline: auto;
  padding-inline: clamp(1.25rem, 4vw, 3rem);
}

/* ---- type ------------------------------------------------------------- */

.th-label {
  display: block;
  margin: 0;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.16em;
  line-height: 1.45;
  color: var(--gold);
  text-transform: uppercase;
}

.th-h1 {
  margin: 14px 0 0;
  font-weight: 500;
  font-size: clamp(2.25rem, 4.6vw, 4rem);
  line-height: 1.02;
  letter-spacing: -0.028em;
  color: var(--gray-800);
  max-width: 15ch;
  text-wrap: balance;
}

.th-h2 {
  margin: 0;
  font-weight: 500;
  font-size: clamp(1.6rem, 3vw, 2.6rem);
  line-height: 1.08;
  letter-spacing: -0.022em;
  color: var(--gray-800);
  text-wrap: balance;
}

.th-deck {
  margin: 22px 0 0;
  padding-top: 20px;
  border-top: 1px solid var(--gold-deep);
  font-size: 15.5px;
  line-height: 1.72;
  color: var(--gray-700);
  max-width: 48ch;
  text-wrap: pretty;
}

.th-body {
  margin: 18px 0 0;
  font-size: 14.5px;
  line-height: 1.8;
  color: var(--gray-600);
  max-width: 60ch;
  text-wrap: pretty;
}

.th-inline { color: var(--gold-hi); text-underline-offset: 3px; }

/* ---- the link gesture -------------------------------------------------- */

.th-link {
  display: inline-flex;
  align-items: center;
  gap: 12px;
  min-height: 44px;
  font-size: 9.5px;
  letter-spacing: 0.24em;
  font-weight: 800;
  text-transform: uppercase;
  color: var(--gold);
  text-decoration: none;
  white-space: nowrap;
}
.th-rule {
  display: block;
  width: 26px;
  height: 1px;
  background-color: currentColor;
  transform: scaleX(0.62);
  transform-origin: left center;
  transition: transform 0.28s var(--ease);
}
a.th-link:hover { color: var(--gold-hi); }
a.th-link:hover .th-rule,
a.th-link:focus-visible .th-rule { transform: scaleX(1); }

/* ---- actions ----------------------------------------------------------- */

.th-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 14px;
  margin-top: 32px;
}

.th-cta,
.th-ghost {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 52px;
  padding: 16px 30px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  text-decoration: none;
}
.th-cta {
  background-image: linear-gradient(135deg, var(--accent-300), var(--accent-400));
  color: var(--gray-800);
  border: 1px solid transparent;
  transition: transform 0.2s var(--ease), box-shadow 0.25s var(--ease);
}
.th-cta:hover { transform: translateY(-2px); box-shadow: var(--th-card-lg); }
.th-ghost {
  border: 1px solid var(--line-strong);
  color: var(--gray-700);
  transition: border-color 0.25s var(--ease), color 0.25s var(--ease);
}
.th-ghost:hover { border-color: var(--gold); color: var(--gray-800); }

/* ---- hero -------------------------------------------------------------- */

.th-hero {
  padding: clamp(2.75rem, 5vw, 5rem) 0 clamp(2rem, 3.5vw, 3rem);
  background-color: var(--surface);
  background-image: radial-gradient(880px 440px at 14% 0%, var(--th-wash), transparent 64%);
}
/* Copy-led, so the copy takes the wider pane. Never 50/50. */
.th-hero-inner {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 0.82fr);
  gap: clamp(2.5rem, 5vw, 4.5rem);
  align-items: center;
}
.th-hero-copy { min-width: 0; }

.th-crumbs ol {
  list-style: none;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  margin: 0 0 10px;
  padding: 0;
  font-size: 12.5px;
}
.th-crumbs li { display: flex; align-items: center; }
.th-crumbs a {
  display: inline-flex;
  align-items: center;
  min-height: 44px;
  color: var(--gray-700);
  text-decoration: underline;
  text-decoration-color: var(--line-strong);
  text-underline-offset: 4px;
  transition: color 0.25s var(--ease);
}
.th-crumbs a:hover { color: var(--gold-hi); text-decoration-color: currentColor; }
.th-crumbs [aria-current] { color: var(--gray-800); }
.th-crumb-sep { color: var(--gray-400); }

.th-dossier {
  margin: 0;
  padding: clamp(1.5rem, 2.4vw, 2.1rem);
  border: 1px solid var(--line);
  border-radius: var(--th-r);
  background-color: var(--white);
  background-image: radial-gradient(74% 86% at 6% 0%, var(--th-wash) 0%, var(--th-wash-soft) 34%, transparent 72%);
  box-shadow: var(--th-card-lg);
}
.th-figs {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 20px;
  margin-top: 24px;
}
.th-fig { margin: 0; }
.th-fig-n {
  display: block;
  font-variant-numeric: tabular-nums;
  font-feature-settings: 'tnum' 1;
  font-size: clamp(2.6rem, 5vw, 3.6rem);
  font-weight: 500;
  line-height: 0.94;
  letter-spacing: -0.045em;
  color: var(--gold);
}
.th-fig-l {
  display: block;
  margin-top: 12px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--gray-600);
}
.th-dossier-foot {
  margin: 24px 0 0;
  padding-top: 16px;
  border-top: 1px solid var(--rule-hair);
  font-size: 12.5px;
  line-height: 1.7;
  color: var(--gray-600);
  text-wrap: pretty;
}
.th-dossier-foot strong { color: var(--gray-700); font-weight: 600; }

/* ---- section heads ----------------------------------------------------- */

.th-band { padding: clamp(2.75rem, 5vw, 5rem) 0 0; }
.th-head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: clamp(2rem, 5vw, 3.75rem);
  padding-bottom: 20px;
  border-bottom: 1px solid var(--rule-hair-2);
}
.th-head-l { min-width: 0; }
.th-head .th-h2 { margin-top: 16px; max-width: 18ch; }
.th-head .th-body { margin: 0; max-width: 34ch; font-size: 13.5px; flex: none; }

/* ---- 01 the ground ----------------------------------------------------- */

.th-open {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 0.82fr);
  gap: clamp(2rem, 4vw, 3.5rem);
  padding-top: clamp(1.75rem, 3vw, 2.5rem);
  align-items: start;
}
.th-prose p {
  margin: 0 0 18px;
  font-size: 15.5px;
  line-height: 1.82;
  color: var(--gray-700);
  max-width: 62ch;
  text-wrap: pretty;
}
.th-prose p:last-child { margin-bottom: 0; }
.th-prose strong { color: var(--gray-800); font-weight: 600; }
.th-prose a { color: var(--gold-hi); text-underline-offset: 3px; }

.th-rail {
  position: sticky;
  top: calc(var(--bar-inset) + var(--bar-h) + 24px);
  padding: clamp(1.25rem, 2vw, 1.6rem);
  border: 1px solid var(--line);
  border-radius: var(--th-r);
  background-color: var(--white);
  background-image: radial-gradient(80% 90% at 100% 0%, var(--th-wash-soft), transparent 70%);
  box-shadow: var(--th-card);
}
.th-rail ol { list-style: none; margin: 12px 0 0; padding: 0; }
.th-rail li + li { border-top: 1px solid var(--rule-hair); }
.th-rail a {
  display: flex;
  align-items: center;
  gap: 14px;
  min-height: 48px;
  font-size: 13.5px;
  color: var(--gray-700);
  text-decoration: none;
  transition: color 0.25s var(--ease);
}
.th-rail a:hover { color: var(--gold-hi); }
.th-rail-n {
  font-variant-numeric: tabular-nums;
  font-feature-settings: 'tnum' 1;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.16em;
  color: var(--gold);
}

/* ---- 02 the reading ---------------------------------------------------- */

.th-empty {
  margin: clamp(1.5rem, 2.5vw, 2.25rem) 0 0;
  font-size: 14.5px;
  line-height: 1.8;
  color: var(--gray-600);
  max-width: 60ch;
}

.th-index {
  list-style: none;
  margin: clamp(1.5rem, 2.5vw, 2.25rem) 0 0;
  padding: 0;
  border: 1px solid var(--line);
  border-radius: var(--th-r);
  overflow: hidden;
  background-color: var(--white);
  box-shadow: var(--th-card);
}
.th-row {
  position: relative;
  display: grid;
  grid-template-columns: 4rem minmax(0, 1fr) auto;
  gap: 18px;
  align-items: start;
  padding: clamp(1.15rem, 1.8vw, 1.6rem) clamp(1.25rem, 2vw, 1.85rem);
  border-bottom: 1px solid var(--rule-hair-2);
  transition: background-color 0.3s var(--ease);
}
.th-row:last-child { border-bottom: 0; }
.th-row:hover,
.th-row:focus-within { background-color: var(--th-wash-soft); }
.th-row:hover .th-rule { transform: scaleX(1); }
.th-row-n {
  font-variant-numeric: tabular-nums;
  font-feature-settings: 'tnum' 1;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.16em;
  color: var(--gold);
  padding-top: 6px;
}
.th-row-main { min-width: 0; }
.th-row-t {
  margin: 0;
  font-size: clamp(1.02rem, 1.45vw, 1.3rem);
  font-weight: 500;
  letter-spacing: -0.02em;
  line-height: 1.3;
  text-wrap: balance;
}
.th-row-t a { color: var(--gray-800); text-decoration: none; }
.th-row-t a:hover { color: var(--gold-hi); }
/* The title link answers for the whole row, so the row is one target of well
   over 44px rather than a line of text a thumb has to find. */
.th-row-t a::after { content: ''; position: absolute; inset: 0; }
.th-row-m {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  margin: 10px 0 0;
  font-size: 11.5px;
  font-variant-numeric: tabular-nums;
  color: var(--gray-600);
}
.th-row-cat {
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--gold-deep);
}
.th-row-x {
  margin: 10px 0 0;
  font-size: 13.5px;
  line-height: 1.72;
  color: var(--gray-600);
  max-width: 62ch;
  text-wrap: pretty;
}
.th-row-go { align-self: center; color: var(--gold); }

/* ---- 03 the questions -------------------------------------------------- */

.th-faq {
  list-style: none;
  margin: clamp(1.5rem, 2.5vw, 2.25rem) 0 0;
  padding: 0;
  border-top: 1px solid var(--rule-hair-2);
}
/* Image-led proportions inverted: the question is the narrow column and the
   answer, which is what the reader came for, takes the wider one. */
.th-faq > li {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1.12fr);
  gap: clamp(1.5rem, 3vw, 3rem);
  padding: clamp(1.4rem, 2.2vw, 2rem) 0;
  border-bottom: 1px solid var(--rule-hair-2);
}
.th-faq h3 {
  margin: 0;
  font-size: clamp(1rem, 1.35vw, 1.2rem);
  font-weight: 500;
  letter-spacing: -0.018em;
  line-height: 1.34;
  color: var(--gray-800);
  max-width: 30ch;
  text-wrap: balance;
}
.th-faq p {
  margin: 0;
  font-size: 14px;
  line-height: 1.78;
  color: var(--gray-700);
  max-width: 62ch;
  text-wrap: pretty;
}

/* ---- 04 the other hubs ------------------------------------------------- */

.th-hubs {
  list-style: none;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  margin: clamp(1.5rem, 2.5vw, 2.25rem) 0 0;
  padding: 0;
}
.th-hub {
  position: relative;
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: clamp(1.4rem, 2.1vw, 1.9rem);
  border: 1px solid var(--line);
  border-radius: var(--th-r);
  background-color: var(--white);
  box-shadow: var(--th-card);
  transition: border-color 0.32s var(--ease), box-shadow 0.32s var(--ease), transform 0.32s var(--ease);
}
.th-hub:hover,
.th-hub:focus-within {
  border-color: var(--th-edge-hover);
  box-shadow: var(--th-card-lg);
  transform: translateY(-2px);
}
.th-hub:hover .th-rule { transform: scaleX(1); }
.th-hub h3 {
  margin: 0;
  font-size: 17px;
  font-weight: 500;
  letter-spacing: -0.018em;
  line-height: 1.28;
  text-wrap: balance;
}
.th-hub h3 a { color: var(--gray-800); text-decoration: none; }
.th-hub h3 a:hover { color: var(--gold-hi); }
.th-hub h3 a::after { content: ''; position: absolute; inset: 0; }
.th-hub p {
  margin: 12px 0 20px;
  font-size: 12.5px;
  line-height: 1.7;
  color: var(--gray-600);
  text-wrap: pretty;
}
.th-hub .th-link { margin-top: auto; }

/* ---- 05 the close ------------------------------------------------------ */

.th-close { padding: clamp(3rem, 5.5vw, 6rem) 0 clamp(2.75rem, 4.5vw, 4.5rem); }
.th-close-inner {
  padding-top: clamp(2.25rem, 4vw, 3.5rem);
  border-top: 1px solid var(--rule-hair-2);
  text-align: center;
  background-image: radial-gradient(700px 300px at 50% 30%, var(--th-wash), transparent 65%);
}
.th-close .th-h2 {
  margin: 20px auto 0;
  max-width: 18ch;
  font-size: clamp(1.9rem, 4vw, 3.2rem);
}
.th-close .th-body { margin: 20px auto 0; max-width: 46ch; color: var(--gray-700); }
.th-close .th-actions { justify-content: center; margin-top: 30px; }
.th-close-rule {
  height: 1px;
  max-width: 190px;
  margin: 28px auto 0;
  background-image: linear-gradient(90deg, transparent, var(--gold), transparent);
}

/* ---- responsive -------------------------------------------------------- */

@media (max-width: 1100px) {
  .th-hero-inner,
  .th-open { grid-template-columns: minmax(0, 1fr); }
  .th-hero .th-h1 { max-width: 18ch; }
  .th-rail { position: static; }
  .th-head { flex-direction: column; align-items: flex-start; gap: 16px; }
  .th-head .th-body { max-width: 62ch; }
  .th-hubs { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

@media (max-width: 760px) {
  .th-faq > li { grid-template-columns: minmax(0, 1fr); gap: 12px; }
  .th-faq h3 { max-width: 44ch; }
  .th-hubs { grid-template-columns: minmax(0, 1fr); }
  .th-row { grid-template-columns: 2.5rem minmax(0, 1fr); gap: 14px; }
  .th-row-go { display: none; }
}

@media (max-width: 480px) {
  .th-cta,
  .th-ghost { flex: 1 1 100%; }
  .th-figs { gap: 14px; }
}

/* ---- reduced motion ----------------------------------------------------
   MotionConfig covers the JS entrances site-wide; these are the CSS ones it
   cannot reach. The hairline rests at full width rather than at 0.62, because
   a gesture that never plays should not leave a link looking half-drawn. */

@media (prefers-reduced-motion: reduce) {
  .th-rule { transform: scaleX(1); transition: none; }
  .th-cta,
  .th-ghost,
  .th-hub,
  .th-row,
  .th-rail a,
  .th-crumbs a { transition: none; }
  .th-cta:hover,
  .th-hub:hover,
  .th-hub:focus-within { transform: none; }
}
`
