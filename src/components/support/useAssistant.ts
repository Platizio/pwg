import { useCallback, useMemo, useState } from 'react'
import { NODE_BY_ID, ROOT_NODES, childrenOf } from '../../content/support'
import type { ResolvedSupportNode } from '../../content/support'

/**
 * The guided assistant's state machine.
 *
 * State is a single `path` of node ids plus a `stage`. Everything else — the
 * current node, the spine, the options, the answer — is derived. That keeps Back
 * to a pop and makes the whole thing safe to render during prerender: no storage,
 * no timers, no crypto.
 *
 * Nothing here touches the network. The tree and its answers ship in the bundle,
 * so the flow is instant and works before hydration finishes. Server calls arrive
 * later for logging, free-text retrieval and escalation.
 */

export type AssistantStage =
  /** Showing a question and its options. */
  | 'browsing'
  /** Showing a leaf's answer, asking whether it helped. */
  | 'answered'
  /** Customer said it helped. Terminal, but restartable. */
  | 'resolved'
  /** Offering the ticket and callback exits. */
  | 'escalate'
  /** Filling in the inline ticket form. */
  | 'ticket'
  /** Filling in the inline call-back form. */
  | 'callback'
  /** Request captured. Terminal, but restartable. */
  | 'submitted'

export interface EscalationContext {
  nodeId: string | null
  categoryId: string | null
  subcategoryId: string | null
  priority: 'LOW' | 'NORMAL' | 'URGENT'
  /** Human-readable trail of what the customer picked, for the handover. */
  breadcrumb: string[]
}

const OPENING_QUESTION = 'What are you trying to do?'

export function useAssistant() {
  const [path, setPath] = useState<string[]>([])
  const [stage, setStage] = useState<AssistantStage>('browsing')
  /** True when the customer arrived here from search rather than by walking. */
  const [jumped, setJumped] = useState(false)

  const currentNode: ResolvedSupportNode | null = useMemo(
    () => (path.length > 0 ? NODE_BY_ID.get(path[path.length - 1]) ?? null : null),
    [path],
  )

  const options = useMemo(
    () => (currentNode ? childrenOf(currentNode.id) : ROOT_NODES),
    [currentNode],
  )

  /** The steps taken so far, resolved for the spine. */
  const spine = useMemo(
    () => path.map((id) => NODE_BY_ID.get(id)).filter((n): n is ResolvedSupportNode => Boolean(n)),
    [path],
  )

  /** The question to put at the head of the current step. */
  const question = currentNode?.prompt ?? (path.length === 0 ? OPENING_QUESTION : null)

  const goTo = useCallback((nodeId: string, viaSearch: boolean) => {
    const node = NODE_BY_ID.get(nodeId)
    if (!node) return

    // A node knows its own ancestors, so a search result can be entered at the
    // right depth with its trail intact rather than as a context-free answer.
    setPath(viaSearch ? [...node.path, node.id] : (prev) => [...prev, nodeId])
    setJumped(viaSearch)

    if (childrenOf(nodeId).length > 0) setStage('browsing')
    else if (node.escalateOnly) setStage('escalate')
    else setStage('answered')
  }, [])

  const select = useCallback((nodeId: string) => goTo(nodeId, false), [goTo])
  const jumpTo = useCallback((nodeId: string) => goTo(nodeId, true), [goTo])

  const back = useCallback(() => {
    setPath((prev) => prev.slice(0, -1))
    setStage('browsing')
    setJumped(false)
  }, [])

  /**
   * Return to an earlier step by clicking it in the spine.
   *
   * At depth three, Back alone means two clicks to reach the top. The spine is
   * already on screen showing exactly where the customer has been, so letting
   * them click it is both cheaper and more obvious than a repeated Back.
   */
  const truncateTo = useCallback((index: number) => {
    setPath((prev) => prev.slice(0, index + 1))
    setStage('browsing')
    setJumped(false)
  }, [])

  const restart = useCallback(() => {
    setPath([])
    setStage('browsing')
    setJumped(false)
  }, [])

  const markResolved = useCallback(() => setStage('resolved'), [])
  const requestEscalation = useCallback(() => setStage('escalate'), [])
  const openTicketForm = useCallback(() => setStage('ticket'), [])
  const openCallbackForm = useCallback(() => setStage('callback'), [])
  const markSubmitted = useCallback(() => setStage('submitted'), [])
  /** Leave a form without losing the path that got here. */
  const cancelForm = useCallback(() => setStage('escalate'), [])

  /**
   * What a ticket or callback raised from here should carry.
   *
   * Taxonomy comes from the node the customer actually reached, which is why a
   * guided flow can prefill a ticket accurately: nothing is inferred.
   */
  const escalationContext = useMemo<EscalationContext>(() => ({
    nodeId: currentNode?.id ?? null,
    categoryId: currentNode?.categoryId ?? null,
    subcategoryId: currentNode?.subcategoryId ?? null,
    priority: currentNode?.priority ?? 'NORMAL',
    breadcrumb: spine.map((node) => node.label),
  }), [currentNode, spine])

  return {
    stage,
    spine,
    question,
    options,
    currentNode,
    answerIds: stage === 'answered' ? currentNode?.answers ?? [] : [],
    escalationContext,
    jumped,
    canGoBack: path.length > 0,
    select,
    jumpTo,
    back,
    truncateTo,
    restart,
    markResolved,
    requestEscalation,
    openTicketForm,
    openCallbackForm,
    markSubmitted,
    cancelForm,
  }
}
