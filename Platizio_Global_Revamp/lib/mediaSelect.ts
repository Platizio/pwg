/**
 * Selection rules for /media. Pure functions so they can be checked without
 * rendering anything.
 */

import type { Article } from '../../src/articles/types'
import type { Video } from '../../src/videos'
import type { NewsItem } from '../data/mediaNews'
import { FEATURE_VIDEO_ID, SIDE_VIDEO_IDS } from '../data/mediaVideos'

/** How many articles the panel lists before "View all". */
export const ARTICLE_COUNT = 5

/** Videos in the side list, alongside the feature. */
export const SIDE_VIDEO_COUNT = 3

/**
 * The five articles shown on /media.
 *
 * Featured first, then newest to fill the gap. Only three articles carry
 * `featured: true`, so a featured-only list would render short — and the flag
 * stays meaningful as an editorial promotion rather than becoming a chore to
 * maintain at exactly five.
 *
 * Deterministic: same registry in, same order out, so the prerendered HTML and
 * the client agree.
 */
export function selectTopArticles(all: readonly Article[], count = ARTICLE_COUNT): Article[] {
  const byNewest = [...all].sort((a, b) => b.date.localeCompare(a.date))
  const featured = byNewest.filter((a) => a.featured)
  const rest = byNewest.filter((a) => !a.featured)
  return [...featured, ...rest].slice(0, count)
}

/**
 * Feature video plus the side list, chosen editorially rather than by date.
 *
 * The newest upload is often a 30-second short; a first-time visitor should
 * meet the introduction to Platizio Global instead. See data/mediaVideos.ts.
 *
 * Any configured id that is missing from the catalogue is skipped and the slot
 * refilled from the newest remaining videos, so a deleted upload thins the list
 * rather than blanking the section.
 */
export function selectVideos(all: readonly Video[]): { feature: Video | null; side: Video[] } {
  if (!all.length) return { feature: null, side: [] }

  const byId = new Map(all.map((v) => [v.id, v]))
  const feature = byId.get(FEATURE_VIDEO_ID) ?? all[0]

  const side: Video[] = []
  for (const id of SIDE_VIDEO_IDS) {
    const video = byId.get(id)
    if (video && video.id !== feature.id) side.push(video)
  }

  // Backfill only if a configured id went missing.
  if (side.length < SIDE_VIDEO_COUNT) {
    const used = new Set([feature.id, ...side.map((v) => v.id)])
    for (const v of all) {
      if (side.length >= SIDE_VIDEO_COUNT) break
      if (!used.has(v.id)) { side.push(v); used.add(v.id) }
    }
  }

  return { feature, side: side.slice(0, SIDE_VIDEO_COUNT) }
}

/** Newest first. Guards against a hand-edited file being out of order. */
export function sortNews(items: readonly NewsItem[]): NewsItem[] {
  return [...items].sort((a, b) => b.date.localeCompare(a.date))
}

/**
 * "2026-06-23" -> "23 Jun 2026".
 *
 * Deterministic string work rather than Intl: the prerender runs in Node and
 * hydration in the browser, and a locale difference between them is a
 * hydration mismatch.
 */
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function formatNewsDate(iso: string): string {
  const [y, m, d] = iso.split('-')
  const month = MONTHS[Number(m) - 1]
  if (!y || !month || !d) return iso
  return `${Number(d)} ${month} ${y}`
}
