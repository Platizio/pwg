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
  const groups = topics
    .map((topic) => ({
      topic,
      articles: articles
        .filter((a) => primaryTopic(a) === topic.id)
        .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)),
    }))
    .filter((group) => group.articles.length > 0)

  /*
   * The index claims to hold everything. `topics[0]` is a plain string with no
   * union type behind it, so a typo in the registry — or a new hub added to
   * an article before it is declared in topics.ts — would drop that article
   * from the page silently, with nothing failing. It fails loudly instead: the
   * build prerenders this component, so a mismatch stops the build rather than
   * shipping a library that is quietly missing a piece.
   */
  const filed = groups.reduce((n, g) => n + g.articles.length, 0)
  if (filed !== articles.length) {
    const missing = articles
      .filter((a) => !topics.some((t) => t.id === primaryTopic(a)))
      .map((a) => `${a.slug} -> ${primaryTopic(a) ?? '(no topic)'}`)
    throw new Error(
      `groupByPrimaryTopic filed ${filed} of ${articles.length} articles. ` +
        `Unrecognised primary topic on: ${missing.join(', ')}`,
    )
  }

  return groups
}

/** Newest first, without mutating the caller's array. */
export function byNewest(articles: Article[]): Article[] {
  return [...articles].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
}
