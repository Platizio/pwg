import { Link, useParams } from 'react-router-dom'
import { TRADING_PLATFORM_URL } from '../constants'
import SEO, { breadcrumbSchema, faqSchema } from './SEO'
import RelatedArticles from './RelatedArticles'
import NotFound from '../pages/NotFound'
import { getArticle } from '../articles/registry'
import { SITE_NAME, SITE_URL, LOGO_URL, absoluteUrl } from '../siteConfig'

/** Rough word count from the article's HTML body, for schema wordCount. */
const countWords = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z]+;/gi, ' ')
    .split(/\s+/)
    .filter(Boolean).length

export default function ArticlePage() {
  const { slug } = useParams<{ slug: string }>()
  const article = slug ? getArticle(slug) : undefined

  if (!article) return <NotFound />

  const path = `/articles/${article.slug}`
  const url = `${SITE_URL}${path}`
  const image = absoluteUrl(article.logo)
  const modified = article.updated ?? article.date

  const articleSchema = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: article.title,
    description: article.description,
    image,
    datePublished: article.date,
    dateModified: modified,
    articleSection: article.category,
    wordCount: countWords(article.bodyHtml),
    inLanguage: 'en-IN',
    author: { '@type': 'Organization', name: SITE_NAME, url: SITE_URL },
    publisher: {
      '@type': 'Organization',
      name: SITE_NAME,
      logo: { '@type': 'ImageObject', url: LOGO_URL },
    },
    mainEntityOfPage: url,
  }

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

      <article className="article">
        <div className="breadcrumb">
          <Link to="/">Home</Link><span className="crumb-sep" aria-hidden="true">/</span>
          <Link to="/media">Media</Link><span className="crumb-sep" aria-hidden="true">/</span>
          <Link to="/articles">Articles</Link><span className="crumb-sep" aria-hidden="true">/</span>
          <span>{article.category}</span>
        </div>

        <p className="article-meta">
          <span className="article-cat">{article.category}</span>
          <span>{article.dateLabel}</span>
          <span>{article.readTime}</span>
          {article.updated && article.updated !== article.date && (
            <span>Updated {article.updated}</span>
          )}
        </p>
        <h1>{article.title}</h1>

        {/*
          * No hero image. `article.logo` is a generated share card for 21 of the
          * 30 entries: navy, with the category and this exact headline drawn
          * into the pixels. Rendering it here printed the title a second time as
          * an unscalable, unselectable picture of itself directly under the live
          * <h1> — images of text, for no reader's benefit (WCAG 1.4.5) — and
          * pushed the first paragraph of a reading page below the fold.
          *
          * It keeps the job it is good at: SEO above still passes it as
          * `ogImage`, which is what a share card is for.
          *
          * The standfirst is `excerpt`, which types.ts defines as the one- or
          * two-sentence summary written to be read. `description` is the SEO
          * meta description and is already emitted in <head>; printing it here
          * as well put the same sentence in the page twice, and three of them
          * end "Updated August 2026." — a line written for a search result,
          * not for a reader.
          */}
        <p className="article-lede">{article.excerpt}</p>

        <div className="article-body" dangerouslySetInnerHTML={{ __html: article.bodyHtml }} />

        {article.faqs?.length ? (
          <section className="article-faq">
            <h2>Frequently asked questions</h2>
            {article.faqs.map((faq) => (
              <div className="article-faq-item" key={faq.q}>
                <h3>{faq.q}</h3>
                <p>{faq.a}</p>
              </div>
            ))}
          </section>
        ) : null}

        <div className="regs-cta article-cta">
          <h2>Put it into practice</h2>
          <p>Open an account and place a first order in the market this article describes.</p>
          <a className="btn btn-gold btn-lg" href={TRADING_PLATFORM_URL} target="_blank" rel="noopener noreferrer">
            Start investing
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14M13 5l7 7-7 7" />
            </svg>
          </a>
        </div>

        <RelatedArticles article={article} />
      </article>
    </>
  )
}
