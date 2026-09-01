import {
  SITE_NAME,
  SITE_URL,
  SITE_LOCALE,
  DEFAULT_OG_IMAGE,
  DEFAULT_OG_IMAGE_ALT,
  TWITTER_HANDLE,
} from '../siteConfig'

/* React 19 hoists <title>, <meta> and <link> into <head> from anywhere in the
   tree, server render included, which is the whole of what Helmet was doing
   here. Dropping the provider keeps all fourteen call sites and their
   server-rendered tags exactly as they were. */
interface SEOProps {
  title: string
  description: string
  canonical: string
  ogImage?: string
  ogImageAlt?: string
  ogType?: 'website' | 'article'
  noindex?: boolean
  article?: {
    publishedTime: string
    modifiedTime?: string
    author: string
  }
  /** JSON-LD emitted into <head>. Pass one object or several. */
  jsonLd?: object | object[]
}

export default function SEO({
  title,
  description,
  canonical,
  ogImage = DEFAULT_OG_IMAGE,
  ogImageAlt = DEFAULT_OG_IMAGE_ALT,
  ogType = 'website',
  noindex = false,
  article,
  jsonLd,
}: SEOProps) {
  const fullTitle = `${title} | ${SITE_NAME}`
  const canonicalUrl = `${SITE_URL}${canonical}`
  const schemas = jsonLd ? (Array.isArray(jsonLd) ? jsonLd : [jsonLd]) : []

  return (
    <>
      {/* Primary */}
      <title>{fullTitle}</title>
      <meta name="description" content={description} />
      <link rel="canonical" href={canonicalUrl} />
      {noindex && <meta name="robots" content="noindex, follow" />}

      {/* Open Graph */}
      <meta property="og:type" content={ogType} />
      <meta property="og:site_name" content={SITE_NAME} />
      <meta property="og:locale" content={SITE_LOCALE} />
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={canonicalUrl} />
      <meta property="og:image" content={ogImage} />
      <meta property="og:image:alt" content={ogImageAlt} />
      <meta property="og:image:width" content="1200" />
      <meta property="og:image:height" content="630" />

      {/* Twitter Card */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:site" content={TWITTER_HANDLE} />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={ogImage} />
      <meta name="twitter:image:alt" content={ogImageAlt} />

      {/* Article-specific */}
      {article && (
        <meta property="article:published_time" content={article.publishedTime} />
      )}
      {article?.modifiedTime && (
        <meta property="article:modified_time" content={article.modifiedTime} />
      )}
      {article && <meta property="article:author" content={article.author} />}

      {/* Structured data */}
      {schemas.map((schema, i) => (
        <script key={i} type="application/ld+json">
          {JSON.stringify(schema)}
        </script>
      ))}
    </>
  )
}

/** BreadcrumbList JSON-LD from an ordered [name, path] trail. */
export const breadcrumbSchema = (trail: [string, string][]) => ({
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: trail.map(([name, path], i) => ({
    '@type': 'ListItem',
    position: i + 1,
    name,
    item: `${SITE_URL}${path}`,
  })),
})

/** FAQPage JSON-LD from plain-text Q&A pairs. */
export const faqSchema = (faqs: { q: string; a: string }[]) => ({
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: faqs.map(({ q, a }) => ({
    '@type': 'Question',
    name: q,
    acceptedAnswer: { '@type': 'Answer', text: a },
  })),
})

/** VideoObject JSON-LD. `embedUrl` makes it eligible for video rich results. */
export const videoSchema = (v: {
  name: string
  description: string
  thumbnailUrl: string
  uploadDate: string
  contentUrl?: string
  embedUrl?: string
}) => ({
  '@context': 'https://schema.org',
  '@type': 'VideoObject',
  name: v.name,
  description: v.description,
  thumbnailUrl: v.thumbnailUrl,
  uploadDate: v.uploadDate,
  publisher: {
    '@type': 'Organization',
    name: SITE_NAME,
    logo: { '@type': 'ImageObject', url: `${SITE_URL}/logo.png` },
  },
  ...(v.contentUrl ? { contentUrl: v.contentUrl } : {}),
  ...(v.embedUrl ? { embedUrl: v.embedUrl } : {}),
})

/** ItemList JSON-LD for an ordered set of article URLs. */
export const itemListSchema = (items: { name: string; path: string }[]) => ({
  '@context': 'https://schema.org',
  '@type': 'ItemList',
  itemListElement: items.map(({ name, path }, i) => ({
    '@type': 'ListItem',
    position: i + 1,
    name,
    url: `${SITE_URL}${path}`,
  })),
})
