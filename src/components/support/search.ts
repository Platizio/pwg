import { ALL_FAQS } from '../../content/faqs'
import {
  CATEGORY_LABEL,
  NODE_BY_ID,
  SUBCATEGORY_LABEL,
  SUPPORT_NODES,
  childrenOf,
} from '../../content/support'
import type { ResolvedSupportNode } from '../../content/support'

/**
 * Client-side search over the support tree.
 *
 * Everything it needs already ships in the bundle, so results are instant and
 * work offline. No index build step, no service, no dependency: 77 leaves against
 * a handful of query tokens is nothing.
 *
 * A result is always a *node*, never a loose answer. Selecting one drops the
 * customer into that point in the guided flow, so search is a shortcut through
 * the tree rather than a separate feature that bypasses it — which also means the
 * ticket taxonomy stays correct if they escalate from there.
 *
 * Phase 3 puts retrieval and a grounded model behind the same input. This stays
 * as the instant first pass and the offline fallback.
 */

const PLAIN_ANSWER = new Map(ALL_FAQS.map((faq) => [faq.id, faq.a.toLowerCase()]))
const PLAIN_QUESTION = new Map(ALL_FAQS.map((faq) => [faq.id, faq.q.toLowerCase()]))

interface IndexEntry {
  node: ResolvedSupportNode
  label: string
  aliases: string
  /** The ticket taxonomy's own wording for this problem. */
  taxonomy: string
  ancestors: string
  questions: string
  answers: string
}

/**
 * Weights, highest first. A customer typing "tcs" means the TCS node, not every
 * answer that mentions TCS in passing — so the node's own label dominates and
 * answer body is a tiebreaker rather than a driver.
 */
const WEIGHT = { label: 12, aliases: 8, questions: 5, taxonomy: 4, ancestors: 3, answers: 1 } as const

/**
 * Words excluded from the all-tokens-must-match rule.
 *
 * They still score when they hit, but they cannot veto a result. Without this,
 * "withdrawal not received" returned nothing: "not" appears nowhere in the
 * corpus (the answer says "hasn't"), so one filler word discarded the very node
 * the customer was describing.
 */
const STOPWORDS = new Set([
  'a', 'an', 'the', 'my', 'me', 'i', 'is', 'are', 'was', 'do', 'does', 'did',
  'how', 'what', 'when', 'where', 'why', 'can', 'could', 'should', 'would',
  'will', 'to', 'of', 'in', 'on', 'for', 'and', 'or', 'not', 'no', 'it',
  'that', 'this', 'with', 'from', 'have', 'has', 'had', 'be', 'been', 'get',
  'got', 'if', 'at', 'as', 'but', 'so', 'you', 'your', 'we', 'our', 'us',
  'any', 'there', 'been', 'am',
])

/**
 * Substring match with light suffix trimming, so "received" finds "receive" and
 * "charges" finds "charge". Cheap, and enough for a corpus this size — a real
 * stemmer would be more machinery than 77 leaves justify.
 */
function fieldMatches(haystack: string, token: string): boolean {
  if (haystack.includes(token)) return true
  if (token.length >= 6) {
    if (haystack.includes(token.slice(0, -1))) return true
    if (haystack.includes(token.slice(0, -2))) return true
  }
  return false
}

const INDEX: IndexEntry[] = SUPPORT_NODES
  // Only leaves are destinations. Landing someone on a branch would just show
  // them another menu, which is what they used search to skip.
  .filter((node) => childrenOf(node.id).length === 0)
  .map((node) => ({
    node,
    label: node.label.toLowerCase(),
    aliases: node.aliases.join(' ').toLowerCase(),
    // The taxonomy names problems the way a customer reports them — "Withdrawal
    // not received", "Funds not credited" — which is often closer to what they
    // type than the tree's own wording.
    taxonomy: [
      CATEGORY_LABEL.get(node.categoryId) ?? '',
      SUBCATEGORY_LABEL.get(node.subcategoryId) ?? '',
    ].join(' ').toLowerCase(),
    // Ancestor labels let "funding tcs" score, and carry the branch's aliases
    // down to the leaves that actually answer for it.
    ancestors: node.path
      .map((id) => {
        const ancestor = NODE_BY_ID.get(id)
        return ancestor ? `${ancestor.label} ${ancestor.aliases.join(' ')}` : ''
      })
      .join(' ')
      .toLowerCase(),
    questions: node.answers.map((id) => PLAIN_QUESTION.get(id) ?? '').join(' '),
    answers: node.answers.map((id) => PLAIN_ANSWER.get(id) ?? '').join(' '),
  }))

function tokenize(query: string): string[] {
  return query
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 1)
}

export interface SearchResult {
  node: ResolvedSupportNode
  score: number
  /** The matched answer's question, when there is one — better result text than the label. */
  headline: string
  /** Where this sits in the tree, for context under the headline. */
  trail: string
}

export function searchSupport(query: string, limit = 6): SearchResult[] {
  const tokens = tokenize(query)
  if (tokens.length === 0) return []

  // Content words carry the query's meaning and must all land. If the customer
  // typed nothing but filler, fall back to treating every word as content so the
  // query still does something.
  const contentTokens = tokens.filter((token) => !STOPWORDS.has(token))
  const required = contentTokens.length > 0 ? contentTokens : tokens

  const scored: SearchResult[] = []

  for (const entry of INDEX) {
    let score = 0
    let matchedAllRequired = true

    for (const token of tokens) {
      let tokenScore = 0
      for (const [field, weight] of Object.entries(WEIGHT) as [keyof typeof WEIGHT, number][]) {
        if (fieldMatches(entry[field], token)) {
          tokenScore = Math.max(tokenScore, weight)
        }
      }
      // Every content word must land somewhere. Without this, a two-word query
      // returns everything matching only its most common word.
      if (tokenScore === 0 && required.includes(token)) matchedAllRequired = false
      score += tokenScore
    }

    if (!matchedAllRequired || score === 0) continue

    const firstAnswerId = entry.node.answers[0]
    const headline = firstAnswerId
      ? ALL_FAQS.find((faq) => faq.id === firstAnswerId)?.q ?? entry.node.label
      : entry.node.label

    scored.push({
      node: entry.node,
      score,
      headline,
      trail: entry.node.path
        .map((id) => NODE_BY_ID.get(id)?.label ?? id)
        .join(' › '),
    })
  }

  return scored
    .sort((a, b) => b.score - a.score || a.headline.length - b.headline.length)
    .slice(0, limit)
}
