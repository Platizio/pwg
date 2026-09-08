"use client"

/*
 * ONE TEMPLATE, THIRTY URLs.
 *
 * Every /articles/<slug> page is this file. The bodies are pre-written HTML
 * strings on `article.bodyHtml`, injected whole, so the reading treatment is
 * won or lost in the `.article-body` prose rules in library.css rather than in
 * thirty content files. What this component owns is the frame around the prose:
 * the masthead, the figures, the contents rail, the questions and the close.
 *
 * THE WORLD. /products by daylight — champagne paper, warm brown-black ink, one
 * gold. Everything here reads from the normalised marketing tokens, so the page
 * follows the palette rather than carrying a private copy of it.
 *
 * The one surface that had to go was the closing band. It was `.regs-cta` from
 * home-market.css: a radial from --ink-700 to --ink-900, which under the warm
 * tokens paints #1a1207 — near-black — with cream body copy and an <h2> that
 * inherited nothing and rendered #4a3f30 on it, measured at 1.43:1. A heading
 * you cannot see, in a black band, on a cream page. It is paper now, and its
 * copy is unchanged.
 *
 * TWO THINGS THE PROSE COULD NOT DO FOR ITSELF, so they are done to the string
 * on the way in rather than across thirty files: <table> gets the scroll
 * container `.article-table-wrap` that library.css has always styled and
 * nothing produced, and every <h2> gets a stable id so the contents rail can
 * link to it. Both are pure transforms of author-controlled markup.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { motion, useReducedMotion, useScroll, useSpring } from 'motion/react'
import { TRADING_PLATFORM_URL } from '../constants'
import { scrollToTarget } from '../lib/smoothScroll'
import SEO, { breadcrumbSchema, faqSchema } from './SEO'
import RelatedArticles from './RelatedArticles'
import NotFound from '../views/NotFound'
import { getArticle } from '../articles/registry'
import { SITE_NAME, SITE_URL, LOGO_URL, absoluteUrl } from '../siteConfig'

/** Rough word count from the article's HTML body, for schema wordCount. */
const countWords = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z]+;/gi, ' ')
    .split(/\s+/)
    .filter(Boolean).length

interface Section {
  id: string
  label: string
}

const slugify = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, ' and ')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)

/*
 * The two transforms described at the head of the file, in one pass so the
 * body string is walked once and memoised once per article.
 *
 * The unwrap step exists because exactly one of the thirty bodies
 * (currency-risk-explained) already hand-wrote the wrapper. Stripping it first
 * means the rule below applies exactly one, rather than that article getting
 * two nested scroll containers while the other twenty-five get theirs. Tables
 * in these bodies contain no <div>, so the non-greedy match to the first
 * closing tag is the wrapper's own.
 */
function prepareBody(html: string): { html: string; sections: Section[] } {
  const sections: Section[] = []
  const taken = new Set<string>()

  const withIds = html.replace(/<h2>([\s\S]*?)<\/h2>/g, (_match, inner: string) => {
    const label = inner.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').trim()
    const base = slugify(inner) || 'section'
    let id = base
    let n = 2
    while (taken.has(id)) id = `${base}-${n++}`
    taken.add(id)
    sections.push({ id, label })
    return `<h2 id="${id}">${inner}</h2>`
  })

  const withTables = withIds
    .replace(/<div class="article-table-wrap">\s*([\s\S]*?)<\/div>/g, '$1')
    .replace(/<table>/g, '<div class="article-table-wrap"><table>')
    .replace(/<\/table>/g, '</table></div>')

  return { html: withTables, sections }
}

/**
 * Entrance motion that server-renders VISIBLE.
 *
 * `initial={{ opacity: 0 }}` is SSR'd into the HTML by motion, which is how
 * this site shipped content at opacity 0 to anyone whose JS did not run. So
 * nothing declares a hidden initial state: the server renders the final state,
 * and the hidden state is applied on the client, after mount, and ONLY to an
 * element that is entirely below the fold — an element already on screen would
 * visibly blink out and back in, which is worse than no animation at all.
 *
 * A reader who asked for less motion gets none of it: the element is never
 * armed, so it is simply already there. `<MotionConfig reducedMotion="user">`
 * would keep the opacity leg, and an element fading in for someone who asked
 * for stillness is still an element that was not there a moment ago.
 */
function useReveal<T extends HTMLElement = HTMLElement>(delay = 0) {
  const reduce = useReducedMotion()
  const ref = useRef<T>(null)
  const [phase, setPhase] = useState<'flat' | 'armed' | 'in'>('flat')

  useEffect(() => {
    if (reduce) return
    const el = ref.current
    if (!el) return
    if (el.getBoundingClientRect().top < window.innerHeight) return

    setPhase('armed')
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return
        setPhase('in')
        io.disconnect()
      },
      { rootMargin: '0px 0px -12% 0px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [reduce])

  return {
    ref,
    initial: false as const,
    animate: phase === 'armed' ? { opacity: 0, y: 22 } : { opacity: 1, y: 0 },
    transition:
      phase === 'in'
        ? { duration: 0.62, ease: [0.22, 1, 0.36, 1] as const, delay }
        : { duration: 0 },
  }
}

/**
 * Which heading the reader is currently under.
 *
 * A thin band near the top of the viewport, below the floating bar: the
 * heading inside it is the one being read. When a section is long enough that
 * no heading is in the band, the last answer stands rather than clearing —
 * a contents rail that empties mid-section reads as broken.
 */
function useActiveSection(sections: Section[]): string | null {
  const [active, setActive] = useState<string | null>(null)
  const key = sections.map((s) => s.id).join('|')

  useEffect(() => {
    if (!key) return
    const els = key
      .split('|')
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => Boolean(el))
    if (!els.length) return

    const io = new IntersectionObserver(
      (entries) => {
        const hit = entries.find((e) => e.isIntersecting)
        if (hit?.target.id) setActive(hit.target.id)
      },
      { rootMargin: '-104px 0px -68% 0px' },
    )
    els.forEach((el) => io.observe(el))
    return () => io.disconnect()
  }, [key])

  return active
}

/** The distance a heading must clear to sit below the floating nav pill. */
function barOffset(): number {
  if (typeof document === 'undefined') return -104
  const bar = document.querySelector('.site-header')
  const h = bar instanceof HTMLElement ? bar.getBoundingClientRect().height : 84
  return -(h + 20)
}

export default function ArticlePage() {
  const { slug } = useParams<{ slug: string }>()
  const article = slug ? getArticle(slug) : undefined

  const readRef = useRef<HTMLDivElement>(null)
  const reduce = useReducedMotion()

  /*
   * The reading rule: a gold hairline across the top of the viewport that
   * tracks progress through the body. Scroll-bound, so it carries its own
   * reduced-motion branch rather than relying on <MotionConfig> — the spring
   * is what is refused. Without it the rule still reports position exactly; it
   * simply stops easing to it and adds no motion the scroll did not.
   *
   * scaleX on a transform, never width: the alternative is a layout on every
   * frame of every scroll.
   */
  const { scrollYProgress } = useScroll({
    target: readRef,
    offset: ['start start', 'end end'],
  })
  const eased = useSpring(scrollYProgress, { stiffness: 240, damping: 38, restDelta: 0.001 })
  const progress = reduce ? scrollYProgress : eased

  const prepared = useMemo(
    () => (article ? prepareBody(article.bodyHtml) : { html: '', sections: [] as Section[] }),
    [article],
  )
  const active = useActiveSection(prepared.sections)

  const faqReveal = useReveal<HTMLElement>()
  const closeReveal = useReveal<HTMLElement>()
  const relatedReveal = useReveal<HTMLDivElement>()

  if (!article) return <NotFound />

  const path = `/articles/${article.slug}`
  const url = `${SITE_URL}${path}`
  const image = absoluteUrl(article.logo)
  const modified = article.updated ?? article.date
  const words = countWords(article.bodyHtml)
  /* "7 min read" is the authored label; the figure panel sets the number on
     its own so it can be typeset as a figure. The label stays the fallback. */
  const minutes = article.readTime.match(/\d+/)?.[0] ?? null

  const articleSchema = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: article.title,
    description: article.description,
    image,
    datePublished: article.date,
    dateModified: modified,
    articleSection: article.category,
    wordCount: words,
    inLanguage: 'en-IN',
    author: { '@type': 'Organization', name: SITE_NAME, url: SITE_URL },
    publisher: {
      '@type': 'Organization',
      name: SITE_NAME,
      logo: { '@type': 'ImageObject', url: LOGO_URL },
    },
    mainEntityOfPage: url,
  }

  /* The closing sections carry the numbered eyebrow /products uses, and the
     count has to survive an article with no FAQ block. */
  let step = 0
  const nextStep = () => String(++step).padStart(2, '0')
  const faqStep = article.faqs?.length ? nextStep() : null
  const closeStep = nextStep()

  return (
    <>
      <SEO
        title={article.title}
        description={article.description}
        canonical={path}
        ogImage={image}
        ogImageAlt={article.title}
        ogType="article"
        article={{
          publishedTime: `${article.date}T00:00:00Z`,
          modifiedTime: `${modified}T00:00:00Z`,
          author: SITE_NAME,
        }}
        jsonLd={[
          articleSchema,
          breadcrumbSchema([
            ['Home', '/'],
            ['Articles', '/articles'],
            [article.title, path],
          ]),
          ...(article.faqs?.length ? [faqSchema(article.faqs)] : []),
        ]}
      />

      <article className="art">
        <motion.div
          className="art-progress"
          style={{ scaleX: progress }}
          aria-hidden="true"
        />

        {/*
          * The masthead. Paper with the champagne wash /products opens on, and
          * because `.art` is the first child of #main-content it takes
          * chrome.css's run-under treatment, so that ground paints to the top
          * of the viewport behind the floating pill instead of leaving a band.
          *
          * No hero image. `article.logo` is a generated share card for 21 of
          * the 30 entries: navy, with the category and this exact headline
          * drawn into the pixels. Rendering it here printed the title a second
          * time as an unscalable, unselectable picture of itself directly
          * under the live <h1> — images of text, for no reader's benefit
          * (WCAG 1.4.5) — and pushed the first paragraph of a reading page
          * below the fold. It keeps the job it is good at: SEO above still
          * passes it as `ogImage`, which is what a share card is for.
          */}
        <header className="art-masthead">
          <div className="art-wrap">
            <nav className="breadcrumb art-crumbs" aria-label="Breadcrumb">
              <Link href="/">Home</Link><span className="crumb-sep" aria-hidden="true">/</span>
              <Link href="/media">Media</Link><span className="crumb-sep" aria-hidden="true">/</span>
              <Link href="/articles">Articles</Link><span className="crumb-sep" aria-hidden="true">/</span>
              <span>{article.category}</span>
            </nav>

            <div className="art-masthead-grid">
              <div className="art-masthead-l">
                <span className="art-label">{article.category}</span>
                <h1 className="art-h1">{article.title}</h1>
                {/*
                  * The standfirst is `excerpt`, which types.ts defines as the
                  * one- or two-sentence summary written to be read.
                  * `description` is the SEO meta description and is already
                  * emitted in <head>; printing it here as well put the same
                  * sentence in the page twice, and three of them end "Updated
                  * August 2026." — a line written for a search result, not for
                  * a reader.
                  */}
                <p className="art-lede">{article.excerpt}</p>
              </div>

              {/* The figures, in tabular numerals, on the sheet /products uses
                  for a raised surface. Every one is measured off this article
                  rather than asserted: the word count is the same number the
                  Article schema above publishes. */}
              <dl className="art-facts">
                <div className="art-fact">
                  <dt>Reading time</dt>
                  <dd>
                    {minutes ? (
                      <><span className="art-fig">{minutes}</span> min</>
                    ) : (
                      article.readTime
                    )}
                  </dd>
                </div>
                <div className="art-fact">
                  <dt>Length</dt>
                  <dd>
                    <span className="art-fig">{words.toLocaleString('en-IN')}</span> words
                  </dd>
                </div>
                <div className="art-fact">
                  <dt>Sections</dt>
                  <dd>
                    <span className="art-fig">{prepared.sections.length}</span>
                  </dd>
                </div>
                <div className="art-fact art-fact--wide">
                  <dt>Published</dt>
                  <dd className="art-fact-line">
                    {article.dateLabel}
                    {article.updated && article.updated !== article.date && (
                      <> · updated {article.updated}</>
                    )}
                  </dd>
                </div>
              </dl>
            </div>
          </div>
        </header>

        {/*
          * The reading section. Prose at its measure on the left, the contents
          * rail on the right.
          *
          * Not one of the brief's two split ratios on purpose: 1fr/0.82fr and
          * 1fr/1.12fr are for two panes that both carry content, and a rail of
          * seven links at 470px would be a second column pretending to be one.
          * A fixed 16rem rail against a fluid prose column is ~1fr/0.29fr —
          * asymmetric by a wider margin than either, which is the point of the
          * rule.
          *
          * The rail is BEFORE the prose in the DOM so that a keyboard or
          * screen-reader user meets the section list before the article rather
          * than after it, and so it stacks above the prose when the grid
          * collapses. Explicit grid placement, not `order`, puts it on the
          * right.
          */}
        <div className="art-wrap art-read">
          <div className="art-read-grid">
            {prepared.sections.length > 2 && (
              <nav className="art-toc" aria-label="On this page">
                <h2 className="art-toc-h">On this page</h2>
                <ol className="art-toc-list">
                  {prepared.sections.map((s) => (
                    <li key={s.id}>
                      <a
                        href={`#${s.id}`}
                        aria-current={active === s.id ? 'true' : undefined}
                        onClick={(e) => {
                          /* Lenis owns the scroll. scrollIntoView() fights it —
                             the native jump and the raf loop both write
                             scrollTop and the page stutters between them. */
                          const target = document.getElementById(s.id)
                          if (!target) return
                          e.preventDefault()
                          history.replaceState(null, '', `#${s.id}`)
                          scrollToTarget(target, barOffset())
                        }}
                      >
                        <span className="art-toc-mark" aria-hidden="true" />
                        {s.label}
                      </a>
                    </li>
                  ))}
                </ol>
              </nav>
            )}

            <div
              ref={readRef}
              className="article-body"
              dangerouslySetInnerHTML={{ __html: prepared.html }}
            />
          </div>
        </div>

        {article.faqs?.length ? (
          <motion.section className="art-section" aria-labelledby="art-faq-h" {...faqReveal}>
            <div className="art-wrap">
              <header className="art-head">
                <div className="art-head-l">
                  <span className="art-label">{faqStep} — the questions</span>
                  <h2 className="art-h2" id="art-faq-h">Frequently asked questions</h2>
                </div>
                <p className="art-head-body">
                  The points readers raise most often on this subject, answered in the
                  same terms as the piece above.
                </p>
              </header>

              {/* Real <h3>s, not a <dl>. A definition list is the tidier
                  markup for a Q&A and it takes every question out of the
                  document outline, which is the list a screen-reader user
                  actually navigates by. */}
              <div className="art-faq">
                {article.faqs.map((faq) => (
                  <div className="art-faq-item" key={faq.q}>
                    <h3>{faq.q}</h3>
                    <p>{faq.a}</p>
                  </div>
                ))}
              </div>
            </div>
          </motion.section>
        ) : null}

        {/* The close. Copy-led, so 1fr/0.82fr — the /products split, and paper
            rather than the ink band this used to be. */}
        <motion.section className="art-section art-close" aria-labelledby="art-close-h" {...closeReveal}>
          <div className="art-wrap">
            <div className="art-close-grid">
              <div>
                <span className="art-label">{closeStep} — next</span>
                <h2 className="art-h2" id="art-close-h">Put it into practice</h2>
              </div>
              <div className="art-close-r">
                <p className="art-close-body">
                  Open an account and place a first order in the market this article
                  describes.
                </p>
                <a
                  className="art-cta"
                  href={TRADING_PLATFORM_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Start investing
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M5 12h14M13 5l7 7-7 7" />
                  </svg>
                </a>
              </div>
            </div>
          </div>
        </motion.section>

        <motion.div className="art-wrap art-related" {...relatedReveal}>
          <RelatedArticles article={article} />
        </motion.div>
      </article>
    </>
  )
}
