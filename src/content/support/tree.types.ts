/**
 * Types for the support assistant's decision tree.
 *
 * The tree is authored nested (see tree.ts) because that is what a human can
 * read and edit. It is flattened into rows for the `support_nodes` table at
 * build time by scripts/validate-support-content.mjs.
 *
 * Taxonomy is inherited, not repeated: `categoryId` is set once on each level-1
 * root and `subcategoryId` once on each level-2 node, and every descendant
 * resolves to that pair. Repeating it on all 111 nodes would be the obvious way
 * to get them out of sync.
 */

export type TicketPriority = 'LOW' | 'NORMAL' | 'URGENT'

export interface SupportTreeNode {
  /**
   * Stable slug. Referenced by chat_messages.node_id, so renaming one loses the
   * analytics history attached to it. Level-1 and level-2 ids deliberately match
   * the ticket_categories / ticket_subcategories ids they map to.
   */
  id: string

  /** The chip the customer taps. */
  label: string

  /**
   * What the assistant says when the customer arrives here. Required on any node
   * with children — without it the assistant would present options and no
   * question.
   */
  prompt?: string

  /** Extra phrasings used to match free-text input to this node. */
  aliases?: string[]

  /**
   * FAQ item ids from src/content/faqs.tsx (e.g. 'fa-3'). Required on a leaf
   * unless `escalateOnly` is set.
   */
  answers?: string[]

  /**
   * No self-serve answer exists for this problem, so skip straight to the ticket
   * and callback options. "The app is broken" and "my OTP isn't arriving" are
   * real support cases that no FAQ can resolve; pretending otherwise wastes a
   * step and annoys the customer.
   */
  escalateOnly?: boolean

  /** Priority stamped on a ticket raised from here. Defaults to NORMAL. */
  priority?: TicketPriority

  /** Set on level-1 roots only. Must be a real ticket_categories id. */
  categoryId?: string

  /** Set on level-2 nodes only. Must belong to the ancestor's category. */
  subcategoryId?: string

  children?: SupportTreeNode[]
}

/** A node with its inherited taxonomy resolved, as stored in `support_nodes`. */
export interface ResolvedSupportNode {
  id: string
  parentId: string | null
  depth: number
  label: string
  prompt: string | null
  aliases: string[]
  answers: string[]
  escalateOnly: boolean
  priority: TicketPriority
  categoryId: string
  subcategoryId: string
  sortOrder: number
  /** Ancestor ids, root first. Used for breadcrumbs and funnel analytics. */
  path: string[]
}
