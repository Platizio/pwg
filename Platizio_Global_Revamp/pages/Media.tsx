import SEO, { breadcrumbSchema, videoSchema } from '../../src/components/SEO'
import { VIDEOS } from '../../src/videos'
import NewsRail from '../components/NewsRail'
import VideoShowcase from '../components/VideoShowcase'
import MediaPanels from '../components/MediaPanels'
import NewsletterSignup from '../components/NewsletterSignup'

export default function Media() {
  return (
    <>
      <SEO
        title="Media — Videos, Articles &amp; Market Explainers"
        description="Videos, guides and explainers on investing in US Stocks and ETFs from India — routes, taxes, ETFs, currency risk and LRS compliance, from Platizio Global."
        canonical="/media"
        /* VideoObject for every video, restoring what the original page emitted.
           The revamp shipped with breadcrumb schema only, which silently dropped
           eligibility for video rich results — the thumbnails use the same 16:9
           source the page renders, not the letterboxed hqdefault the original
           declared. */
        jsonLd={[
          breadcrumbSchema([['Home', '/'], ['Media', '/media']]),
          ...VIDEOS.map((v) =>
            videoSchema({
              name: v.title,
              description: v.blurb,
              thumbnailUrl: `https://img.youtube.com/vi/${v.id}/maxresdefault.jpg`,
              uploadDate: v.date,
              embedUrl: `https://www.youtube.com/embed/${v.id}`,
            })
          ),
        ]}
      />

      {/* ===== 1. NEWS RAIL — sits directly under the header ===== */}
      <NewsRail />

      {/* ===== 2. VIDEO ===== */}
      <VideoShowcase />

      {/* ===== 3. BLOG + ARTICLES ===== */}
      <MediaPanels />

      {/* ===== 4. NEWSLETTER ===== */}
      <NewsletterSignup />
    </>
  )
}
