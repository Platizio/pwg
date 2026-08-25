import { Helmet } from 'react-helmet-async'

/**
 * Outfit, on the two product routes only.
 *
 * The design source sets display, body and figures in one geometric sans
 * rather than the serif/sans/mono trio the first system used — so this is one
 * family, not three, and the whole terminal loads a single extra face.
 *
 * Loaded through Helmet rather than index.html so the other 47 prerendered
 * pages do not pay for it. Helmet renders into <!--app-head--> during
 * renderToString exactly as it does during client navigation, so the
 * prerendered page and the hydrated one agree. The preconnects already sit in
 * index.html, so this is one request.
 */
export default function MeridianFonts() {
  return (
    <Helmet>
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&display=swap"
      />
    </Helmet>
  )
}
