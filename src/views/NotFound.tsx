import Link from 'next/link'
import SEO from '../components/SEO'

const ArrowIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 12h14M13 5l7 7-7 7" />
  </svg>
)

/**
 * 404 — and the fallback for an unknown /articles/:slug, which ArticlePage
 * renders directly. That second job is why /articles is the first recovery
 * link: someone who mistyped an article URL wants the library, not the
 * homepage.
 *
 * It opens on the shared `.page-hero` rather than a bare section. That is not
 * decoration: this page previously declared no background at all, and
 * chrome.css pulls the first child up behind the floating white pill expecting
 * it to paint something. On white the pill's own edge measures 1.16:1, so the
 * header vanished on this one route.
 */
export default function NotFound() {
  return (
    <>
      <SEO
        title="Page Not Found (404)"
        description="The page you are looking for doesn't exist or has moved. Explore Platizio Global to invest in US Stocks and ETFs from India."
        canonical="/404"
        noindex
      />

      <section className="page-hero page-hero--compact notfound">
        <div className="container">
          <span className="notfound-code">404 — Not found</span>
          <h1>This page can&apos;t be found</h1>
          <p>
            The link may be mistyped, or the page may have moved. Everything below
            still works.
          </p>
        </div>
      </section>

      <section className="notfound-body" aria-labelledby="notfound-next">
        <div className="container">
          <h2 id="notfound-next" className="visually-hidden">Where to go next</h2>
          <p>
            If you were reading something in particular, the article library is the
            most likely place to find it again.
          </p>
          <div className="notfound-actions">
            <Link className="btn btn-gold btn-lg" href="/articles">
              Browse articles <ArrowIcon />
            </Link>
            <Link className="btn btn-ghost btn-lg" href="/">
              Back to home
            </Link>
          </div>

          <div className="notfound-links">
            <span>Or go straight to:</span>
            <Link href="/products">Products</Link>
            <Link href="/pricing">Pricing</Link>
            <Link href="/faqs">FAQs</Link>
            <Link href="/user-guide">User Guide</Link>
            <Link href="/about">About Us</Link>
          </div>
        </div>
      </section>
    </>
  )
}
