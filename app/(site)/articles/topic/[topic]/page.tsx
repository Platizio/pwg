import type { Metadata } from "next";
import TopicHub from "@/src/views/TopicHub";
import { TOPICS, getTopic } from "@/src/articles/topics";
import {
  DEFAULT_OG_IMAGE,
  DEFAULT_OG_IMAGE_ALT,
  SITE_LOCALE,
  SITE_NAME,
  SITE_URL,
  TWITTER_HANDLE,
} from "@/src/siteConfig";

type Params = { params: Promise<{ topic: string }> };

/** Seven hubs, fixed in topics.ts — the same build-time enumeration the sector
 *  routes use. */
export function generateStaticParams() {
  return TOPICS.map((topic) => ({ topic: topic.id }));
}

/* A hub outside the seven is a dead link. TopicHub already answers one with
   notFound(), but from a client component, so the 404 was decided after the
   response had started; deciding it here keeps it a routing fact. */
export const dynamicParams = false;

/**
 * NOTE — duplicate head tags, pending a follow-up this route cannot make.
 *
 * TopicHub.tsx still renders <SEO>, which emits its own <title>, meta
 * description, canonical, Open Graph and Twitter tags through React 19's head
 * hoisting. Until that call is reduced to its JSON-LD, every hub page carries
 * both sets. The values below are written to be byte-identical to SEO.tsx's so
 * the pair agrees rather than conflicts.
 *
 * The follow-up, once TopicHub.tsx is free: delete the <SEO> element and emit
 * its `jsonLd` array as <script type="application/ld+json"> instead. Nothing
 * else needs porting.
 */
export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { topic: id } = await params;
  const topic = getTopic(id);

  // Unreachable while dynamicParams is false; kept so the type is honest.
  if (!topic) return { title: `Page not found | ${SITE_NAME}` };

  const url = `${SITE_URL}/articles/topic/${topic.id}`;
  const title = `${topic.seoTitle} | ${SITE_NAME}`;
  const image = {
    url: DEFAULT_OG_IMAGE,
    alt: DEFAULT_OG_IMAGE_ALT,
    width: 1200,
    height: 630,
  };

  return {
    title,
    description: topic.description,
    alternates: { canonical: url },
    openGraph: {
      type: "website",
      siteName: SITE_NAME,
      locale: SITE_LOCALE,
      title,
      description: topic.description,
      url,
      images: [image],
    },
    twitter: {
      card: "summary_large_image",
      site: TWITTER_HANDLE,
      title,
      description: topic.description,
      images: [{ url: DEFAULT_OG_IMAGE, alt: DEFAULT_OG_IMAGE_ALT }],
    },
  };
}

export default function Page() {
  return <TopicHub />;
}
