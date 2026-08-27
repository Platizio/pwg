import { flattenTree } from './flatten'
import { SUPPORT_TREE } from './tree'
import { TICKET_CATEGORIES, TICKET_SUBCATEGORIES } from './taxonomy'
import type { ResolvedSupportNode } from './tree.types'

/**
 * The resolved tree, ready for the assistant.
 *
 * Flattened once at module load — 111 nodes, so the cost is nil, and it happens
 * during prerender too. Correctness is guaranteed upstream: `npm run build` runs
 * `validate:support` before `tsc`, so a tree with broken taxonomy or dead-end
 * leaves cannot reach a deploy. Nothing throws here on purpose; a runtime throw
 * in a module this deep would blank the page rather than degrade.
 */
const { rows } = flattenTree(SUPPORT_TREE, {
  categories: TICKET_CATEGORIES,
  subcategories: TICKET_SUBCATEGORIES,
})

export const SUPPORT_NODES: ResolvedSupportNode[] = rows

export const NODE_BY_ID = new Map(rows.map((node) => [node.id, node]))

const CHILDREN = new Map<string | null, ResolvedSupportNode[]>()
for (const node of rows) {
  const siblings = CHILDREN.get(node.parentId) ?? []
  siblings.push(node)
  CHILDREN.set(node.parentId, siblings)
}
for (const siblings of CHILDREN.values()) {
  siblings.sort((a, b) => a.sortOrder - b.sortOrder)
}

/** Level-1 category nodes, in authored order. These are the opening options. */
export const ROOT_NODES: ResolvedSupportNode[] = CHILDREN.get(null) ?? []

export function childrenOf(nodeId: string): ResolvedSupportNode[] {
  return CHILDREN.get(nodeId) ?? []
}

export function isLeaf(node: ResolvedSupportNode): boolean {
  return childrenOf(node.id).length === 0
}

export const CATEGORY_LABEL = new Map(TICKET_CATEGORIES.map((c) => [c.id, c.label]))
export const SUBCATEGORY_LABEL = new Map(TICKET_SUBCATEGORIES.map((s) => [s.id, s.label]))

export type { ResolvedSupportNode }
