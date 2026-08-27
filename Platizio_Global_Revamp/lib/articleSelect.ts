import type { Article } from '../../src/articles/types'
import type { Topic } from '../../src/articles/topics'

/*
 * Ordering and grouping for the article library.
 *
 * Pure functions, alongside mediaSelect.ts and for the same reason: the
 * decisions about what a reader sees first are checkable here without
 * rendering anything.
 */

/**
 * The article's primary subject — the first hub it declares.
 *
 * `topics` is an unordered set as far as the type is concerned, but every entry
 * in the registry declares the hub the piece is really about first and its
 * secondary homes after. Reading the first entry as primary partitions all 30
 * articles into exactly one group each, which is what an index needs; grouping
 * by membership instead would print several articles two or three times.
 *
 * This is an interpretation of the data, not a contract the type enforces — so
 * it lives in one named function rather than being inlined at the call site,
 * and types.ts now records the expectation.
 */
export const primaryTopic = (article: Article): string | undefined => article.topics[0]

export interface TopicGroup {
  topic: Topic
  articles: Article[]
}

/**
 * Group articles under their primary hub, in the order topics.ts declares.
 *
 * A hub with no article that names it first is dropped rather than rendered
 * empty: the topic cards above already carry its full membership count, so an
 * empty heading here would read as a gap rather than as a distinction between
 * "belongs to" and "is mainly about".
 *
 * Within a group, newest first. `date` is an ISO string on every entry, so a
 * string compare is the date compare, and it stays prerender-safe — no `Date`
 * is constructed, which would differ between the build machine and the client.
 */
export function groupByPrimaryTopic(articles: Article[], topics: Topic[]): TopicGroup[] {
  return topics
    .map((topic) => ({
      topic,
      articles: articles
        .filter((a) => primaryTopic(a) === topic.id)
        .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)),
    }))
    .filter((group) => group.articles.length > 0)
}

/** Newest first, without mutating the caller's array. */
export function byNewest(articles: Article[]): Article[] {
  return [...articles].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
}
