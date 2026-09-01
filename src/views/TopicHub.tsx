"use client"

import Link from 'next/link'
import { notFound, useParams } from 'next/navigation'
import SEO, { breadcrumbSchema, faqSchema, itemListSchema } from '../components/SEO'
import { articlesByTopic } from '../articles/registry'
import { getTopic } from '../articles/topics'
import { byNewest } from '../../Platizio_Global_Revamp/lib/articleSelect'
import { TRADING_PLATFORM_URL } from '../constants'

const ArrowIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 12h14M13 5l7 7-7 7" />
  </svg>
)

/**
 * A topic hub — seven of them, one per subject.
 *
 * Two things changed beyond the styling. The intro ran through `.article-body`
 * at the full 1200px container, which is a reading treatment set at a width
 * nothing should be read at; it has the site's prose measure now. And the hub's
 * own questions were static heading/paragraph pairs while /faqs used a
 * collapsing accordion for the identical job — two instruments for one idea on
 * one site. A hub carries five or six questions and collapsing six saves
 * nothing worth a click, so the hub stays open and /faqs collapses only at the
 * question level; both are hairline rows now, the same thing at two densities.
 */
export default function TopicHub() {
  const { topic: topicId } = useParams<{ topic: string }>()
  const topic = topicId ? getTopic(topicId) : undefined

  if (!topic) notFound()

  const articles = byNewest(articlesByTopic(topic.id))
  const path = `/articles/topic/${topic.id}`

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

      <section className="page-hero">
        <div className="container">
          <div className="breadcrumb">
            <Link href="/">Home</Link><span className="crumb-sep" aria-hidden="true">/</span>
            <Link href="/articles">Articles</Link><span className="crumb-sep" aria-hidden="true">/</span>
            <span>{topic.title}</span>
          </div>
          <h1>{topic.title}</h1>
          <p>{topic.blurb}</p>
        </div>
      </section>

      <section className="section" aria-labelledby="hub-intro">
        <div className="container">
          <h2 id="hub-intro" className="visually-hidden">About this topic</h2>
          <div className="topic-intro" dangerouslySetInnerHTML={{ __html: topic.introHtml }} />
        </div>
      </section>

      <section className="section section--sunken" aria-labelledby="hub-articles">
        <div className="container">
          <div className="section-header">
            <p className="eyebrow">Reading</p>
            <h2 id="hub-articles">
              {articles.length} {articles.length === 1 ? 'article' : 'articles'} in this topic
            </h2>
          </div>
          <ul className="lib-rows">
            {articles.map((a) => (
              <li className="lib-row" key={a.slug}>
                <h3 className="lib-row-title">
                  <Link href={`/articles/${a.slug}`}>{a.title}</Link>
                </h3>
                <span className="lib-row-meta">{a.dateLabel} · {a.readTime}</span>
                <p className="lib-row-excerpt">{a.excerpt}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="section" aria-labelledby="hub-faq">
        <div className="container">
          <div className="section-header">
            <p className="eyebrow">Common questions</p>
            <h2 id="hub-faq">Asked most often about {topic.title}</h2>
          </div>
          <div className="topic-faq">
            {topic.faqs.map((faq) => (
              <div className="topic-faq-item" key={faq.q}>
                <h3>{faq.q}</h3>
                <p>{faq.a}</p>
              </div>
            ))}
          </div>

          {/* The hub used to end on a lone outline button in a section of its
              own — the only thing on the page and no way from here to an
              account. */}
          <div className="regs-cta article-cta">
            <h3>Read on, or start</h3>
            <p>Every article here is free. So is opening the account they describe.</p>
            <div className="notfound-actions">
              <a className="btn btn-gold btn-lg" href={TRADING_PLATFORM_URL} target="_blank" rel="noopener noreferrer">
                Start investing <ArrowIcon />
              </a>
              <Link className="btn btn-light btn-lg" href="/articles">
                Browse all articles
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  )
}
