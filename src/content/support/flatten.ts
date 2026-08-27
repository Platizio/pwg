import type { ResolvedSupportNode, SupportTreeNode } from './tree.types'
import type { TicketCategory, TicketSubcategory } from './taxonomy'

/**
 * Resolves the nested tree into flat rows, inheriting taxonomy downward.
 *
 * Lives in src/ rather than scripts/ on purpose: the browser needs these rows to
 * drive the assistant, and scripts/validate-support-content.mjs needs them to
 * check invariants and to build the `support_nodes` upsert. Two copies of the
 * inheritance rules would drift, and the one place they must not disagree is
 * which ticket category a node routes to.
 *
 * Collects problems rather than throwing, so the validator can report every
 * fault in one run instead of only the first.
 */

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/
const PRIORITIES = new Set(['LOW', 'NORMAL', 'URGENT'])

export interface FlattenInput {
  categories: TicketCategory[]
  subcategories: TicketSubcategory[]
}

export interface FlattenResult {
  rows: ResolvedSupportNode[]
  errors: string[]
}

export function flattenTree(tree: SupportTreeNode[], taxonomy: FlattenInput): FlattenResult {
  const errors: string[] = []
  const rows: ResolvedSupportNode[] = []
  const byCategory = new Map(taxonomy.categories.map((c) => [c.id, c]))
  const bySubcategory = new Map(taxonomy.subcategories.map((s) => [s.id, s]))

  const walk = (
    node: SupportTreeNode,
    parentId: string | null,
    depth: number,
    path: string[],
    sortOrder: number,
    inherited: { categoryId: string | null; subcategoryId: string | null },
  ) => {
    const where = `node "${node.id}"`

    if (!SLUG.test(node.id)) errors.push(`${where}: id is not a lowercase slug`)
    if (!node.label?.trim()) errors.push(`${where}: label is empty`)
    if (node.priority && !PRIORITIES.has(node.priority)) {
      errors.push(`${where}: priority "${node.priority}" is not LOW, NORMAL or URGENT`)
    }

    let { categoryId, subcategoryId } = inherited

    if (depth === 1) {
      if (!node.categoryId) {
        errors.push(`${where}: a level-1 node must declare categoryId`)
      } else if (!byCategory.has(node.categoryId)) {
        errors.push(`${where}: categoryId "${node.categoryId}" is not in the taxonomy`)
      } else if (node.id !== node.categoryId) {
        errors.push(`${where}: a level-1 node's id must equal its categoryId ("${node.categoryId}")`)
      }
      if (node.subcategoryId) errors.push(`${where}: a level-1 node must not declare subcategoryId`)
      categoryId = node.categoryId ?? null
    } else if (depth === 2) {
      if (node.categoryId) {
        errors.push(`${where}: only level-1 nodes declare categoryId; it is inherited`)
      }
      if (!node.subcategoryId) {
        errors.push(`${where}: a level-2 node must declare subcategoryId`)
      } else {
        const sub = bySubcategory.get(node.subcategoryId)
        if (!sub) {
          errors.push(`${where}: subcategoryId "${node.subcategoryId}" is not in the taxonomy`)
        } else if (sub.categoryId !== categoryId) {
          // The same rule the database enforces via the composite foreign key on
          // (subcategory_id, category_id). Catching it here turns a constraint
          // violation at ingestion into a readable message at build time.
          errors.push(
            `${where}: subcategory "${node.subcategoryId}" belongs to category ` +
            `"${sub.categoryId}", but this node sits under "${categoryId}"`,
          )
        } else if (node.id !== node.subcategoryId) {
          errors.push(`${where}: a level-2 node's id must equal its subcategoryId ("${node.subcategoryId}")`)
        }
        subcategoryId = node.subcategoryId
      }
    } else if (node.categoryId || node.subcategoryId) {
      errors.push(`${where}: taxonomy is inherited below level 2; remove categoryId/subcategoryId`)
    }

    const children = node.children ?? []
    const isLeaf = children.length === 0
    const answers = node.answers ?? []

    if (!isLeaf && !node.prompt) {
      errors.push(`${where}: has children but no prompt — the assistant would show options with no question`)
    }
    if (isLeaf && answers.length === 0 && !node.escalateOnly) {
      errors.push(`${where}: is a leaf with neither answers nor escalateOnly — it is a dead end`)
    }
    if (answers.length > 0 && node.escalateOnly) {
      errors.push(`${where}: sets both answers and escalateOnly — pick one`)
    }
    if (!isLeaf && answers.length > 0) {
      errors.push(`${where}: has children and answers; answers belong on leaves`)
    }
    if (depth > 4) {
      errors.push(`${where}: nested ${depth} deep — the tree is meant to be at most 3 levels`)
    }

    rows.push({
      id: node.id,
      parentId,
      depth,
      label: node.label,
      prompt: node.prompt ?? null,
      aliases: node.aliases ?? [],
      answers,
      escalateOnly: Boolean(node.escalateOnly),
      priority: node.priority ?? 'NORMAL',
      categoryId: categoryId as string,
      subcategoryId: subcategoryId as string,
      sortOrder,
      path,
    })

    children.forEach((child, i) =>
      walk(child, node.id, depth + 1, [...path, node.id], i, { categoryId, subcategoryId }),
    )
  }

  tree.forEach((root, i) => walk(root, null, 1, [], i, { categoryId: null, subcategoryId: null }))

  return { rows, errors }
}
