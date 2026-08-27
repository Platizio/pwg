import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { FAQ_BY_ID } from '../../content/faqs'
import RequestForm from './RequestForm'
import { searchSupport } from './search'
import { useAssistant } from './useAssistant'
import type { SubmitOutcome } from '../../lib/supportChat'

function SendIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 12h15M13 6l6 6-6 6" />
    </svg>
  )
}

export default function Assistant() {
  const {
    stage,
    spine,
    question,
    options,
    answerIds,
    currentNode,
    escalationContext,
    jumped,
    canGoBack,
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
  } = useAssistant()

  const [draft, setDraft] = useState('')
  const [outcome, setOutcome] = useState<SubmitOutcome | null>(null)
  const [query, setQuery] = useState('')
  const results = useMemo(() => (query.trim().length > 1 ? searchSupport(query) : []), [query])
  const searching = query.trim().length > 1

  const bodyRef = useRef<HTMLDivElement>(null)
  const stepRef = useRef<HTMLDivElement>(null)

  /**
   * Bring the new step's *top* into view.
   *
   * Scrolling to the bottom is right for an append-only chat log, but each step
   * here replaces the view — do that and a long answer arrives with its own
   * heading already scrolled off, which reads as landing mid-sentence.
   *
   * Deliberately not scrollIntoView: that walks up the ancestor chain and drags
   * the whole page. This moves the panel's scrollport and nothing else.
   */
  useEffect(() => {
    const body = bodyRef.current
    const step = stepRef.current
    if (!body || !step) return
    const offset = step.getBoundingClientRect().top - body.getBoundingClientRect().top
    body.scrollTop = Math.max(0, body.scrollTop + offset - 12)
  }, [spine.length, stage, searching, results.length])

  const submit = () => {
    const text = draft.trim()
    if (text.length < 2) return
    setQuery(text)
  }

  const choose = (nodeId: string) => {
    jumpTo(nodeId)
    setQuery('')
    setDraft('')
  }

  const clearSearch = () => {
    setQuery('')
    setDraft('')
  }

  return (
    <section className="assistant" aria-label="Guided help">
      <header className="assistant-bar">
        <span className="assistant-bar-dot" aria-hidden="true" />
        <span className="assistant-bar-title">Platizio Support</span>
        {(canGoBack || searching) && (
          <button
            type="button"
            className="assistant-bar-reset"
            onClick={() => { restart(); clearSearch() }}
          >
            Start over
          </button>
        )}
      </header>

      <div className="assistant-body" ref={bodyRef}>
        {searching ? (
          <div className="assistant-step" aria-live="polite" ref={stepRef}>
            <p className="assistant-echo">You asked: “{query.trim()}”</p>

            {results.length === 0 ? (
              <>
                <h2 className="assistant-question">No match for that yet.</h2>
                <p className="assistant-lede">
                  Try different words, or pick a topic and I’ll narrow it down with you.
                </p>
                <button type="button" className="assistant-option" onClick={clearSearch}>
                  Show me the topics
                </button>
              </>
            ) : (
              <>
                <h2 className="assistant-question">
                  {results.length === 1 ? 'This looks like it:' : 'Any of these?'}
                </h2>
                <ul className="assistant-results-list">
                  {results.map(({ node, headline, trail }) => (
                    <li key={node.id}>
                      <button type="button" className="assistant-result" onClick={() => choose(node.id)}>
                        <span className="assistant-result-headline">{headline}</span>
                        {trail && <span className="assistant-result-trail">{trail}</span>}
                      </button>
                    </li>
                  ))}
                </ul>
                <button type="button" className="assistant-textbtn" onClick={clearSearch}>
                  None of these — show topics
                </button>
              </>
            )}
          </div>
        ) : (
          <>
            {spine.length > 0 && (
              <ol className="assistant-spine" aria-label="Steps so far">
                {spine.map((step, i) => (
                  <li className="assistant-spine-step" key={step.id}>
                    {i === spine.length - 1 ? (
                      <span className="assistant-spine-label is-current" aria-current="step">
                        {step.label}
                      </span>
                    ) : (
                      <button type="button" className="assistant-spine-label" onClick={() => truncateTo(i)}>
                        {step.label}
                      </button>
                    )}
                  </li>
                ))}
              </ol>
            )}

            {jumped && <p className="assistant-echo">Jumped here from your question.</p>}

            {/*
              One live region for the whole step. Announcing the question and its
              options together is how a sighted user reads it; two regions would
              make a screen reader narrate them as unrelated events.
            */}
            <div className="assistant-step" aria-live="polite" ref={stepRef}>
              {stage === 'browsing' && question && (
                <>
                  <h2 className="assistant-question" id="assistant-question">{question}</h2>
                  <div className="assistant-options" role="group" aria-labelledby="assistant-question">
                    {options.map((option) => (
                      <button
                        type="button"
                        className="assistant-option"
                        key={option.id}
                        onClick={() => select(option.id)}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </>
              )}

              {stage === 'answered' && (
                <>
                  {answerIds.map((id) => {
                    const answer = FAQ_BY_ID.get(id)
                    if (!answer) return null
                    return (
                      <article className="assistant-answer" key={id}>
                        <h2 className="assistant-answer-q">{answer.q}</h2>
                        <div className="assistant-answer-a">{answer.a}</div>
                        <Link className="assistant-answer-link" to={`/faqs#${answer.sectionId}`}>
                          Read more in {answer.sectionTitle}
                        </Link>
                      </article>
                    )
                  })}

                  <div className="assistant-verdict">
                    <p className="assistant-verdict-q" id="assistant-verdict">Are you satisfied?</p>
                    <div className="assistant-options" role="group" aria-labelledby="assistant-verdict">
                      <button type="button" className="assistant-option is-affirm" onClick={markResolved}>
                        Yes, satisfied
                      </button>
                      <button type="button" className="assistant-option" onClick={requestEscalation}>
                        No, need further support
                      </button>
                    </div>
                  </div>
                </>
              )}

              {stage === 'escalate' && (
                <>
                  <h2 className="assistant-question">Let’s get you to someone.</h2>
                  <p className="assistant-lede">
                    {escalationContext.priority === 'URGENT'
                      ? 'We’ll treat this as urgent. Both routes reach the same team.'
                      : 'Both routes reach the same team — pick whichever suits you.'}
                  </p>
                  <div className="assistant-options" role="group" aria-label="How would you like to reach us?">
                    <button type="button" className="assistant-option is-primary" onClick={openTicketForm}>
                      Raise a ticket
                    </button>
                    <button type="button" className="assistant-option is-primary" onClick={openCallbackForm}>
                      Request a call back
                    </button>
                  </div>
                </>
              )}

              {(stage === 'ticket' || stage === 'callback') && (
                <RequestForm
                  kind={stage === 'ticket' ? 'TICKET' : 'CALLBACK'}
                  context={escalationContext}
                  suggestedSubject={currentNode?.label ?? ''}
                  onCancel={cancelForm}
                  onDone={(result) => { setOutcome(result); markSubmitted() }}
                />
              )}

              {stage === 'submitted' && (
                <>
                  <h2 className="assistant-question">
                    {outcome?.kind === 'raised' ? 'Ticket raised.' : 'Your request is ready to send.'}
                  </h2>
                  <p className="assistant-lede">
                    {outcome?.kind === 'raised' ? (
                      <>
                        Your reference is <strong>{outcome.reference}</strong>. We’ve emailed it to
                        you, and the team will pick it up from here.
                      </>
                    ) : (
                      <>
                        We’ve opened your email app with everything filled in — send it and
                        we’ll take it from there.
                        {outcome?.kind === 'drafted' && outcome.attachmentsPending ? (
                          <> Please attach your {outcome.attachmentsPending} file
                            {outcome.attachmentsPending > 1 ? 's' : ''} to that email — a mail
                            draft can’t carry them across for you.</>
                        ) : null}
                      </>
                    )}
                  </p>

                  {/* The ticket exists regardless; only the files failed. Saying
                      so plainly beats a silent drop the customer finds out about
                      when an agent asks for the screenshot again. */}
                  {outcome?.kind === 'raised' && (outcome.failedAttachments?.length ?? 0) > 0 && (
                    <p className="assistant-lede">
                      We couldn’t accept {outcome.failedAttachments!.join(', ')}. Reply to the
                      confirmation email with {outcome.failedAttachments!.length > 1 ? 'them' : 'it'} attached.
                    </p>
                  )}
                  <button type="button" className="assistant-option" onClick={() => { setOutcome(null); restart() }}>
                    Ask something else
                  </button>
                </>
              )}

              {stage === 'resolved' && (
                <>
                  <h2 className="assistant-question">Glad that sorted it.</h2>
                  <p className="assistant-lede">
                    Ask something else below, or read the full <Link to="/faqs">FAQs</Link>.
                  </p>
                  <button type="button" className="assistant-option" onClick={restart}>
                    Back to topics
                  </button>
                </>
              )}
            </div>

            {/* Hidden during the form and after sending: the form has its own
                Cancel, and "back a step" after a submission is meaningless. */}
            {canGoBack && !['resolved', 'ticket', 'callback', 'submitted'].includes(stage) && (
              <button type="button" className="assistant-textbtn" onClick={back}>
                Back a step
              </button>
            )}
          </>
        )}
      </div>

      {/* Composer, docked at the bottom where a conversation expects it. */}
      <form
        className="assistant-composer"
        onSubmit={(event) => { event.preventDefault(); submit() }}
      >
        <input
          type="text"
          className="assistant-composer-input"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Type your question…"
          aria-label="Type your question"
          autoComplete="off"
        />
        <button
          type="submit"
          className="assistant-composer-send"
          disabled={draft.trim().length < 2}
          aria-label="Send"
        >
          <SendIcon />
        </button>
      </form>
    </section>
  )
}
