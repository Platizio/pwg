"use client"

import Link from 'next/link'
import Image from 'next/image'
import SEO, { breadcrumbSchema, itemListSchema } from '../components/SEO'
import { ARTICLES, articlesByTopic, featuredArticles } from '../articles/registry'
import { TOPICS } from '../articles/topics'
import { groupByPrimaryTopic } from '../../Platizio_Global_Revamp/lib/articleSelect'
import type { Article } from '../articles/types'

const ArrowIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 12h14M13 5l7 7-7 7" />
  </svg>
)

/**
 * A lead card — the three pieces the library opens with.
 *
 * `alt=""` is deliberate rather than an omission: the headline sits beside the
 * image as live text, so describing the picture would make a screen reader
 * read the same thing twice. The two secondary cards keep next/image's lazy
 * default; the first is the largest contentful paint and takes `priority`, so
 * it is both undeferred and preloaded.
 *
 * `fill` because .lib-thumb already reserves the box at 16/9 and the picture
 * crops into it — there is no intrinsic size worth declaring. The two shapes
 * are far apart (a near-full-width lead against a 132px strip), so `sizes`
 * follows the same branch the layout does.
 */
function LeadCard({ article, row }: { article: Article; row?: boolean }) {
  return (
    <article className={`lib-card${row ? ' lib-row-card' : ''}`}>
      <span className="lib-thumb">
        <Image
          src={article.logo}
          alt=""
          fill
          sizes={row ? '(max-width: 640px) 96px, 132px' : '(max-width: 900px) 92vw, 580px'}
          priority={!row}
          decoding="async"
        />
      </span>
      <div className="lib-body">
        <span className="eyebrow">{article.category}</span>
        <h3 className="lib-title">
          <Link href={`/articles/${article.slug}`}>{article.title}</Link>
        </h3>
        <p className="lib-excerpt">{article.excerpt}</p>
        <span className="lib-meta">{article.dateLabel} · {article.readTime}</span>
      </div>
    </article>
  )
}

/**
 * /articles — the library index.
 *
 * It used to be thirty identical picture cards. Twenty-one of those pictures
 * were generated share cards with the headline drawn into them, so the page
 * printed most titles twice and shipped roughly 1.2MB of eagerly-fetched
 * background images to do it — none of which could be lazy-loaded, because a
 * CSS background is not an image element. Thirty equal cards is also a list
 * rather than a library: nothing on the page said which of them to read first.
 *
 * Now: the three pieces the registry actually marks `featured` lead, and the
 * rest are a text index grouped under the hub each one names first. Both
 * orderings come from fields that already exist — nothing is invented, and
 * nothing is ranked by a signal the data does not carry.
 */
export default function Articles() {
  const groups = groupByPrimaryTopic(ARTICLES, TOPICS)
  const [lead, ...rest] = featuredArticles

  return (
    <>
      <SEO
        title="Articles — Global Investing Insights"
        description="Browse every Platizio Global article — education-first reads on US Stocks, ETFs, the LRS, taxation, GIFT City, RSUs, currency risk, and global investing for Indian investors."
        canonical="/articles"
        jsonLd={[
          breadcrumbSchema([['Home', '/'], ['Articles', '/articles']]),
          itemListSchema(
            ARTICLES.map((a) => ({ name: a.title, path: `/articles/${a.slug}` }))
          ),
        ]}
      />

      <section className="page-hero">
        <div className="container">
          <div className="breadcrumb">
            <Link href="/">Home</Link><span className="crumb-sep" aria-hidden="true">/</span>
            <Link href="/media">Media</Link><span className="crumb-sep" aria-hidden="true">/</span>
            <span>Articles</span>
          </div>
          <h1>Articles</h1>
          <p>
            {ARTICLES.length} education-first reads across {TOPICS.length} subjects —
            US stocks, ETFs, the LRS, taxation and GIFT City, written for Indian
            investors.
          </p>
        </div>
      </section>

      {lead && (
        <section className="section" aria-labelledby="lib-start">
          <div className="container">
            <div className="section-header">
              <p className="eyebrow">Start here</p>
              <h2 id="lib-start">If you are reading one thing</h2>
            </div>
            <div className="lib-lead">
              <LeadCard article={lead} />
              <div className="lib-side">
                {rest.map((a) => <LeadCard key={a.slug} article={a} row />)}
              </div>
            </div>
          </div>
        </section>
      )}

      <section className="section section--sunken" aria-labelledby="lib-topics">
        <div className="container">
          <div className="section-header">
            <p className="eyebrow">By subject</p>
            <h2 id="lib-topics">Browse by topic</h2>
            <p>
              A topic collects every article that touches it, so a piece can appear
              under more than one.
            </p>
          </div>
          <div className="topic-grid">
            {TOPICS.map((topic) => {
              const count = articlesByTopic(topic.id).length
              return (
                <Link className="topic-card" href={`/articles/topic/${topic.id}`} key={topic.id}>
                  <h3>{topic.title}</h3>
                  <p>{topic.blurb}</p>
                  <span className="topic-count">
                    {count} {count === 1 ? 'article' : 'articles'} <ArrowIcon />
                  </span>
                </Link>
              )
            })}
          </div>
        </div>
      </section>

      <section className="section" aria-labelledby="lib-all">
        <div className="container">
          <div className="section-header">
            <p className="eyebrow">The library</p>
            <h2 id="lib-all">Everything, by primary subject</h2>
            <p>
              Each article is filed once, under the subject it is mainly about.
              Newest first within each group.
            </p>
          </div>

          {groups.map(({ topic, articles }) => {
            /* Two different true numbers under one heading: this group holds
               the articles filed HERE, while the hub above collects everything
               that touches the subject. Printing only one of them made the
               topic card say "14 articles" above a group listing one row. */
            const inHub = articlesByTopic(topic.id).length
            return (
            <div className="lib-group" key={topic.id}>
              <div className="lib-group-head">
                <h3>{topic.title}</h3>
                <Link href={`/articles/topic/${topic.id}`}>
                  {articles.length === inHub
                    ? `All ${inHub} in the hub`
                    : `${articles.length} filed here · ${inHub} in the hub`}
                </Link>
              </div>
              <ul className="lib-rows">
                {articles.map((a) => (
                  <li className="lib-row" key={a.slug}>
                    <h4 className="lib-row-title">
                      <Link href={`/articles/${a.slug}`}>{a.title}</Link>
                    </h4>
                    <span className="lib-row-meta">{a.dateLabel} · {a.readTime}</span>
                    <p className="lib-row-excerpt">{a.excerpt}</p>
                  </li>
                ))}
              </ul>
            </div>
            )
          })}
        </div>
      </section>
    </>
  )
}
