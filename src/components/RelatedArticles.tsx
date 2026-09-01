import Link from 'next/link'
import type { Article } from '../articles/types'
import { getRelatedArticles } from '../articles/registry'
import { getTopic } from '../articles/topics'

const ArrowIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 12h14M13 5l7 7-7 7" />
  </svg>
)

/**
 * Related reading at the foot of an article, plus links up to the topic hubs
 * it belongs to. Articles previously linked nowhere, which left the library as
 * 30 disconnected leaves with no internal link graph for crawlers to follow.
 */
export default function RelatedArticles({ article }: { article: Article }) {
  const related = getRelatedArticles(article, 3)
  const topics = article.topics
    .map(getTopic)
    .filter((t): t is NonNullable<typeof t> => Boolean(t))

  if (!related.length && !topics.length) return null

  return (
    <aside className="related-articles">
      {related.length > 0 && (
        <>
          <h2>Related reading</h2>
          <ul className="related-list">
            {related.map((a) => (
              <li key={a.slug}>
                <Link href={`/articles/${a.slug}`}>
                  <span className="related-tag">{a.category}</span>
                  <span className="related-title">{a.title}</span>
                  <span className="related-excerpt">{a.excerpt}</span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}

      {topics.length > 0 && (
        <p className="related-topics">
          More on{' '}
          {topics.map((t, i) => (
            <span key={t.id}>
              {i > 0 && (i === topics.length - 1 ? ' and ' : ', ')}
              <Link href={`/articles/topic/${t.id}`}>{t.title}</Link>
            </span>
          ))}
          .
        </p>
      )}

      <p className="related-all">
        <Link href="/articles">
          Browse all articles <ArrowIcon />
        </Link>
      </p>
    </aside>
  )
}
