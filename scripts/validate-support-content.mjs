/**
 * Validates the support assistant's decision tree.
 *
 * The tree-walking and taxonomy-inheritance rules live in
 * src/content/support/flatten.ts, not here, because the browser needs exactly
 * the same rules to drive the assistant. This file adds the checks that need the
 * filesystem — cross-referencing FAQ ids and answer reachability — plus the CLI.
 *
 * The .ts content modules are imported natively: Node 22.6+ strips types on
 * import and this repo runs Node 24. src/content/faqs.tsx is NOT imported,
 * because type stripping does not handle JSX; its item ids are read from source
 * instead, with a structural check that the read did not go wrong.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

/**
 * FAQ item ids, read from src/content/faqs.tsx.
 *
 * Items are indented eight spaces and sections four, which is what separates
 * them here. That is a load-bearing assumption about the file's shape, so the
 * id count is cross-checked against the `q:` count — if the shape ever changes,
 * this throws rather than silently returning a short list and reporting every
 * tree reference as broken.
 */
function readFaqItemIds() {
  const src = readFileSync(join(ROOT, 'src/content/faqs.tsx'), 'utf8')
  const ids = [...src.matchAll(/^ {8}id: '([^']+)',$/gm)].map((m) => m[1])
  const questionCount = [...src.matchAll(/^ {8}q: /gm)].length

  if (ids.length !== questionCount) {
    throw new Error(
      `Could not read FAQ ids reliably: found ${ids.length} item ids but ` +
      `${questionCount} questions in src/content/faqs.tsx. The file's shape ` +
      'changed — fix the pattern in readFaqItemIds() rather than trusting this run.'
    )
  }
  if (ids.length === 0) throw new Error('No FAQ items found in src/content/faqs.tsx')

  return ids
}

export async function validateSupportContent() {
  const { flattenTree } = await import('../src/content/support/flatten.ts')
  const { SUPPORT_TREE } = await import('../src/content/support/tree.ts')
  const { TICKET_CATEGORIES, TICKET_SUBCATEGORIES } = await import('../src/content/support/taxonomy.ts')

  const faqIds = readFaqItemIds()
  const { rows, errors } = flattenTree(SUPPORT_TREE, {
    categories: TICKET_CATEGORIES,
    subcategories: TICKET_SUBCATEGORIES,
  })

  // Duplicate ids. Checked here rather than during the walk so the message can
  // name every offender at once.
  const seen = new Map()
  for (const row of rows) {
    seen.set(row.id, (seen.get(row.id) ?? 0) + 1)
  }
  for (const [id, count] of seen) {
    if (count > 1) errors.push(`node id "${id}" is used ${count} times; ids must be unique`)
  }

  // Every referenced answer must exist.
  const faqSet = new Set(faqIds)
  const referenced = new Set()
  for (const row of rows) {
    for (const answerId of row.answers) {
      referenced.add(answerId)
      if (!faqSet.has(answerId)) {
        errors.push(`node "${row.id}": answer "${answerId}" is not an item in src/content/faqs.tsx`)
      }
    }
  }

  // Every FAQ answer must be reachable. The assistant is the front door now, so
  // an answer no node points at is content the customer cannot get to.
  const orphanedFaqs = faqIds.filter((id) => !referenced.has(id))
  for (const id of orphanedFaqs) {
    errors.push(`FAQ item "${id}" is not reachable from any tree node`)
  }

  // Every category needs an entry point.
  const rootCategories = new Set(rows.filter((r) => r.depth === 1).map((r) => r.categoryId))
  for (const category of TICKET_CATEGORIES) {
    if (!rootCategories.has(category.id)) {
      errors.push(`category "${category.id}" has no level-1 node — customers cannot reach it`)
    }
  }

  // Uncovered subcategories are reported, not failed: the taxonomy may
  // legitimately hold values only staff use when re-filing a ticket.
  const covered = new Set(rows.filter((r) => r.depth === 2).map((r) => r.subcategoryId))
  const uncovered = TICKET_SUBCATEGORIES.filter((s) => !covered.has(s.id))

  const escalateOnly = rows.filter((r) => r.escalateOnly)
  const leaves = rows.filter((r) => r.depth >= 3)

  return { rows, errors, warnings: { uncovered }, stats: {
    total: rows.length,
    roots: rows.filter((r) => r.depth === 1).length,
    subcategories: rows.filter((r) => r.depth === 2).length,
    leaves: leaves.length,
    escalateOnly: escalateOnly.length,
    faqItems: faqIds.length,
    faqReferenced: referenced.size,
  } }
}

// CLI
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  const { errors, warnings, stats } = await validateSupportContent()

  console.log('support content')
  console.log(`  nodes        ${stats.total} (${stats.roots} categories, ${stats.subcategories} subcategories, ${stats.leaves} issues)`)
  console.log(`  escalate-only ${stats.escalateOnly} leaves with no self-serve answer`)
  console.log(`  FAQ coverage ${stats.faqReferenced}/${stats.faqItems} answers reachable`)

  if (warnings.uncovered.length > 0) {
    console.log(`\n  note: ${warnings.uncovered.length} subcategor${warnings.uncovered.length === 1 ? 'y has' : 'ies have'} no node:`)
    for (const s of warnings.uncovered) console.log(`    - ${s.categoryId}/${s.id} (${s.label})`)
  }

  if (errors.length > 0) {
    console.error(`\n${errors.length} problem${errors.length === 1 ? '' : 's'}:`)
    for (const e of errors) console.error(`  ✗ ${e}`)
    process.exit(1)
  }

  console.log('\n  ✓ all invariants hold')
}
