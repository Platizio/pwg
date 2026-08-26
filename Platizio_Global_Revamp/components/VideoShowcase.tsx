import { VIDEOS } from '../../src/videos'
import { YOUTUBE_CHANNEL_URL } from '../../src/constants'
import { selectVideos, formatNewsDate } from '../lib/mediaSelect'

const PlayIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M8 5.5v13l11-6.5z" />
  </svg>
)

const ArrowIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M5 12h14M13 5l7 7-7 7" />
  </svg>
)

/**
 * YouTube thumbnail URLs. No API key and no embed needed.
 *
 * NOT hqdefault: that is 480x360, i.e. 4:3 with black letterbox bars top and
 * bottom for a 16:9 video. Cropping the bars by scaling the image up also
 * crops the sides, which cut the first and last word off every title card.
 *
 * maxresdefault (1280x720) and mqdefault (320x180) are both natively 16:9, so
 * they need no cropping at all. maxres is not guaranteed to exist for every
 * upload - all nine currently do - so the feature image falls back to mq if it
 * 404s.
 */
const thumbMax = (id: string) => `https://img.youtube.com/vi/${id}/maxresdefault.jpg`
const thumbMq = (id: string) => `https://img.youtube.com/vi/${id}/mqdefault.jpg`

/**
 * Feature video on the left, three more as a thumbnail-and-title list on the
 * right, with "Watch more" beneath the list.
 *
 * Cards link out to YouTube rather than embedding an iframe. An embed loads
 * Google's player and its cookies on page load, for every visitor, whether or
 * not they ever press play — a linked thumbnail avoids that entirely and keeps
 * the page light.
 */
export default function VideoShowcase() {
  const { feature, side } = selectVideos(VIDEOS)
  if (!feature) return null

  return (
    <section className="section video-section" id="videos" aria-labelledby="video-heading">
      <div className="container">
        <div className="section-header reveal">
          <span className="eyebrow">Videos</span>
          <h1 id="video-heading">Global investing, explained</h1>
          <p>Short videos on routes, taxes, ETFs and currency — from the Platizio Global channel.</p>
        </div>

        <div className="video-showcase reveal">
          <a
            className="video-feature"
            href={feature.url}
            target="_blank"
            rel="noopener noreferrer"
          >
            <span className="video-feature-thumb">
              <img
                src={thumbMax(feature.id)}
                alt=""
                width={1280}
                height={720}
                loading="lazy"
                onError={(e) => {
                  // One shot only, or a missing mq would loop forever.
                  const img = e.currentTarget
                  if (img.dataset.fallback) return
                  img.dataset.fallback = "1"
                  img.src = thumbMq(feature.id)
                }}
              />
              <span className="video-play" aria-hidden="true"><PlayIcon /></span>
            </span>
            <span className="video-feature-body">
              <time className="video-date" dateTime={feature.date}>{formatNewsDate(feature.date)}</time>
              <span className="video-feature-title">{feature.title}</span>
              <span className="video-feature-blurb">{feature.blurb}</span>
            </span>
          </a>

          <div className="video-side">
            <ul className="video-list">
              {side.map((v) => (
                <li key={v.id}>
                  <a className="video-row" href={v.url} target="_blank" rel="noopener noreferrer">
                    <span className="video-row-thumb">
                      <img src={thumbMq(v.id)} alt="" width={320} height={180} loading="lazy" />
                      <span className="video-play is-small" aria-hidden="true"><PlayIcon /></span>
                    </span>
                    <span className="video-row-body">
                      <span className="video-row-title">{v.title}</span>
                      <time className="video-date" dateTime={v.date}>{formatNewsDate(v.date)}</time>
                    </span>
                  </a>
                </li>
              ))}
            </ul>

            <a
              className="watch-more"
              href={YOUTUBE_CHANNEL_URL}
              target="_blank"
              rel="noopener noreferrer"
            >
              Watch more <ArrowIcon />
            </a>
          </div>
        </div>
      </div>
    </section>
  )
}
