import { Link } from 'react-router-dom'
import { ARTICLES } from '../../src/articles/registry'
import { selectTopArticles } from '../lib/mediaSelect'

const ArrowIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M5 12h14M13 5l7 7-7 7" />
  </svg>
)

/**
 * Blog and Articles, side by side.
 *
 * Blog is deliberately empty for now. An empty state is a place to say what is
 * coming and offer somewhere to go meanwhile — not a shrug. It points at the
 * articles beside it rather than dead-ending.
 */
export default function MediaPanels() {
  const top = selectTopArticles(ARTICLES)

  return (
    <section className="section panels-section" aria-labelledby="panels-heading">
      <div className="container">
        <h2 className="visually-hidden" id="panels-heading">Blog and articles</h2>

        <div className="media-panels">
          {/* ---------------------------------------------------- blog */}
          <section className="media-panel panel-blog reveal" aria-labelledby="blog-heading">
            <div className="panel-head">
              <h3 id="blog-heading">Blog</h3>
              <span className="panel-badge">Coming soon</span>
            </div>

            <div className="blog-empty">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
              </svg>
              <p className="blog-empty-title">Shorter, more frequent writing</p>
              <p className="blog-empty-body">
                Market notes, product updates and answers to questions we get asked often.
                In the meantime, the long-form explainers are next door.
              </p>
            </div>
          </section>

          {/* ------------------------------------------------ articles */}
          <section className="media-panel panel-articles reveal" id="articles" aria-labelledby="articles-heading">
            <div className="panel-head">
              <h3 id="articles-heading">Articles</h3>
              <span className="panel-count">{ARTICLES.length} published</span>
            </div>

            <ol className="article-list">
              {top.map((a, i) => (
                <li key={a.slug}>
                  <Link className="article-row" to={`/articles/${a.slug}`}>
                    <span className="article-idx" aria-hidden="true">{String(i + 1).padStart(2, '0')}</span>
                    <span className="article-body">
                      <span className="article-title">{a.title}</span>
                      <span className="article-meta">
                        {a.category} · {a.readTime}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ol>

            <Link className="view-all" to="/articles">
              View all articles <ArrowIcon />
            </Link>
          </section>
        </div>
      </div>
    </section>
  )
}
