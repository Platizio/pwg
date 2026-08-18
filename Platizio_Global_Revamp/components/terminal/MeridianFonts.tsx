import { Helmet } from 'react-helmet-async'

/**
 * Loads the terminal's two extra faces, on the two routes that use them.
 *
 * Instrument Serif and Manrope belong to the terminal's world only. Putting
 * them in index.html would bill all 49 prerendered pages for a download that
 * two of them need, so they mount through Helmet instead — which renders into
 * <!--app-head--> during renderToString exactly as it does during client
 * navigation, so the prerendered page and the hydrated one agree.
 *
 * A separate Helmet rather than a new prop on <SEO/>: helmet-async merges
 * instances and dedupes links by href, so this composes without widening the
 * SEO component's contract for one route's typography.
 *
 * The preconnects already sit in index.html, so this is one request.
 */
export default function MeridianFonts() {
  return (
    <Helmet>
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital,wght@0,400;1,400&family=Manrope:wght@400;500;600;700;800&display=swap"
      />
    </Helmet>
  )
}
