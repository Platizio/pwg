import type { Metadata } from "next";
import ArticlePage from "@/src/components/ArticlePage";
import { ARTICLES, getArticle } from "@/src/articles/registry";
import {
  SITE_LOCALE,
  SITE_NAME,
  SITE_URL,
  TWITTER_HANDLE,
  absoluteUrl,
} from "@/src/siteConfig";

type Params = { params: Promise<{ slug: string }> };

/** The library is a hand-maintained registry, so every article URL is known at
 *  build time — the same contract as app/terminal/sector/[slug]. Without this
 *  the thirty of them were server-rendered per request, which put the whole of
 *  an article's first paint behind a render that could have happened once. */
export function generateStaticParams() {
  return ARTICLES.map((article) => ({ slug: article.slug }));
}

/* Thirty slugs and no thirty-first. A slug outside the registry is a typo or a
   dead inbound link, and this is what makes it a real 404 from the server
   rather than the soft 200 it used to be — ArticlePage answers an unknown slug
   by rendering the NotFound *view*, which looks right to a reader and reads to
   a crawler as a page that exists. */
export const dynamicParams = false;

/**
 * NOTE — duplicate head tags, pending a follow-up this route cannot make.
 *
 * ArticlePage.tsx still renders <SEO>, which emits its own <title>, meta
 * description, canonical, Open Graph and Twitter tags through React 19's head
 * hoisting. Until that call is reduced to its JSON-LD, every article page
 * carries both sets. The values below are written to be byte-identical to
 * SEO.tsx's so the pair agrees rather than conflicts.
 *
 * The follow-up, once ArticlePage.tsx is free: delete the <SEO> element and
 * emit its `jsonLd` array as <script type="application/ld+json"> instead.
 * Nothing else needs porting — the whole of what <SEO> puts in <head> for this
 * route is reproduced here.
 */
export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const article = getArticle(slug);

  // Unreachable while dynamicParams is false; kept so the type is honest.
  if (!article) return { title: `Page not found | ${SITE_NAME}` };

  const path = `/articles/${article.slug}`;
  const url = `${SITE_URL}${path}`;
  const image = absoluteUrl(article.logo);
  const modified = article.updated ?? article.date;
  const title = `${article.title} | ${SITE_NAME}`;

  return {
    title,
    description: article.description,
    alternates: { canonical: url },
    openGraph: {
      type: "article",
      siteName: SITE_NAME,
      locale: SITE_LOCALE,
      title,
      description: article.description,
      url,
      images: [{ url: image, alt: article.title, width: 1200, height: 630 }],
      publishedTime: `${article.date}T00:00:00Z`,
      modifiedTime: `${modified}T00:00:00Z`,
      authors: [SITE_NAME],
    },
    twitter: {
      card: "summary_large_image",
      site: TWITTER_HANDLE,
      title,
      description: article.description,
      images: [{ url: image, alt: article.title }],
    },
  };
}

export default function Page() {
  return <ArticlePage />;
}
