# Help Centre — Guided Support Assistant, Gated Ticketing and Callbacks

**Date:** 2026-08-13
**Status:** Approved for implementation
**Supersedes:** `2026-08-12-support-chatbot-design.md` and `2026-08-12-support-chatbot.md`
**Supabase project:** `qtjnlkobvnhhgsnyufzv` — "Platizio Support (Mumbai)", `ap-south-1`

---

## 1. Goal

A single `/help` page where a customer is met by a guided assistant, not a form. The assistant
narrows the problem by asking successively finer questions drawn from our own FAQ taxonomy, answers
from our own curated content, and only when it has genuinely failed does it offer two exits: raise a
ticket, or request a call back. Neither exit is discoverable any other way.

The FAQ library sits beside the assistant for people who would rather browse than be asked.

## 2. Approved decisions

| Decision | Choice |
|---|---|
| Ticket page reachability | Real page at `/help/raise`, gated by a **single-use server-issued grant**. No grant → no form. `create-ticket` rejects chatbot-source submissions without one. |
| Callback handling | **Queue only.** Agents claim from a dashboard and call from their own phones. No telephony vendor. |
| Decision tree authorship | **First pass derived** from the 8 categories, 26 subcategories and 71 existing FAQ answers; git-tracked and edited by the content/compliance owners. |
| Assistant placement | **`/help` only** for v1. A floating site-wide launcher is a follow-on. |
| Corpus source | Extracted from existing repo content. No hand-authored YAML. |
| Backend source of truth | The live Supabase project, vendored into this repo. |

## 3. Why guided-first changes the risk profile

The superseded design was free-text-first: the model answered *and* chose the ticket category. This
one walks a tree we control, and the model never touches taxonomy.

| | Superseded design | This design |
|---|---|---|
| Majority path | One LLM call per turn | **Zero LLM calls** — deterministic tree walk |
| Ticket category | Model emits `category_id`; can be wrong | **Certain** — it is the node the user stood on |
| Content backlog signal | Cluster Tier-3 transcripts by similarity | **Exact node** where people gave up, ranked by volume |
| Cost | Every message | Only free-text messages |
| Explainability | "why did it say that" | A replayable path |

The model's remaining jobs are both narrow and constrained by schema: pick a node from a shortlist,
and phrase an answer from supplied passages. It cannot invent a node — the shortlist is an enum in
the structured-output schema.

## 4. The customer journey

```
/help
 ├─ Assistant panel  ────────────────────────┐   ├─ FAQ browser (independent, browsable,
 │   "What can we help with?"                │   │   crawlable, no chat required)
 │   [8 category chips]  + free-text input   │   └─ links through to /faqs and /articles
 │        ↓ pick                             │
 │   "What's happening with your funds?"     │
 │   [subcategory chips]  [← Back]           │
 │        ↓ pick                             │
 │   [finer issue chips]                     │
 │        ↓ pick  → LEAF                     │
 │   Answer, verbatim from faq_articles      │
 │   + "Read more" citation                  │
 │        ↓                                  │
 │   "Did that solve it?"  [Yes] [No]        │
 │        ├─ Yes → thanks, optional note, done
 │        └─ No  → [Raise a ticket] [Request a call back]
 └────────────────────────────────────────────┘
                    ↓ grant minted server-side
        /help/raise#g=…            /help/callback#g=…
```

Rules that hold at every step:

- **Free text is always available.** Typed input is classified into a node; the flow jumps there and
  continues guided. This is the escape hatch that keeps a menu from feeling like a phone tree.
- **Guardrails run on every free-text turn.** Advice requests get the fixed refusal and are *not*
  offered escalation — an advice request is not a support ticket. Grievance language **short-circuits
  the tree entirely** and goes straight to escalation at `URGENT`, because statutory clocks start on
  submission and no amount of self-service is appropriate.
- **Back and start-over** at every node. A tree you cannot reverse out of is worse than a form.
- **Out of business hours,** the callback option says so and offers the next working window, or
  suggests a ticket instead. `business_hours`, `business_holidays` and `add_business_time()` already
  exist and are reused.

## 5. Architecture

```
Browser — /help (prerendered, hydrates)
  │  tree shipped in the bundle → navigation costs zero network round trips
  │  every node selection is logged async (fire-and-forget, never blocks the UI)
  ▼
Supabase Edge Function: support-chat   (Deno, ap-south-1, verify_jwt: true)
  ├─ navigate    → append chat_messages row; server tracks the authoritative current node
  ├─ ask         → guardrails → RRF retrieval → Haiku 4.5 (structured outputs) → node + answer
  ├─ feedback    → chat_feedback
  └─ escalate    → mint single-use grant  (TICKET | CALLBACK)
  ▼
Postgres
  support_nodes · support_node_articles · faq_articles · faq_chunks
  chat_sessions · chat_messages · chat_feedback · chat_escalation_grants
  callback_requests                                            [new]
  tickets · ticket_categories · ticket_subcategories · complaints · consent_records
  notifications · business_hours · staff_users                 [existing]
```

**Navigation is logged server-side and the grant is minted from the server's record of the current
node — never from a value the client sends.** That single rule is what makes the taxonomy on a
chatbot-sourced ticket trustworthy.

### 5.1 The escalation grant

One mechanism doing four jobs: it gates the page, carries the taxonomy so the client cannot lie about
it, carries the transcript so it never rides in a URL, and links the ticket back to the session.

| Step | Where | What happens |
|---|---|---|
| Mint | `support-chat` action `escalate` | 32 random bytes → token. Store **SHA-256 only**, plus kind, node, category, subcategory, priority, 30-minute expiry. Raw token returned once. |
| Hand off | Browser | Navigate to `/help/raise#g=<token>`. A **fragment, not a query** — fragments are never sent to the server, so the token stays out of Vercel logs and `Referer` headers. |
| Read | `/help/raise` on mount | POST the token → `{kind, category, subcategory, priority, transcript, labels}`. Does **not** consume. Invalid or expired → the page renders "this link has expired, start a chat" and a route back to `/help`. It never renders a bare form. |
| Consume | `create-ticket` | Requires the grant when `source='chatbot'`. Verifies hash, unexpired, unconsumed; marks consumed; **takes category, subcategory and priority from the grant, ignoring the client**; stamps `chat_sessions.escalated_ticket_ref`. |

Storing the hash and never the token is the pattern this project already uses for
`ticket_access_tokens` — we are following house convention, not inventing one.

**Known and accepted limit:** on a statically prerendered site the URL `/help/raise` exists and will
resolve. What it will not do is render a usable form or produce a ticket. The page is `noindex`,
excluded from `sitemap.xml` via the `sitemap: false` flag `RouteEntry` already supports, and
disallowed in `robots.txt`.

## 6. Data model

### 6.1 `support_nodes` — the tree

```sql
create table public.support_nodes (
  id               text primary key check (id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  parent_id        text references public.support_nodes(id) on delete restrict,
  label            text not null,          -- the chip the customer taps
  prompt           text,                   -- what the assistant says on arrival (branch nodes)
  aliases          text[] not null default '{}',
  category_id      text not null,
  subcategory_id   text not null,
  default_priority public.ticket_priority not null default 'NORMAL',
  allows_callback  boolean not null default true,
  depth            int  not null,
  sort_order       int  not null,
  is_active        boolean not null default true,
  check (id <> parent_id),
  -- Composite FK: a node cannot claim a subcategory that belongs to another category.
  -- Requires `unique (id, category_id)` on ticket_subcategories.
  foreign key (subcategory_id, category_id)
    references public.ticket_subcategories (id, category_id)
);

create table public.support_node_articles (
  node_id    text not null references public.support_nodes(id) on delete cascade,
  article_id text not null references public.faq_articles(id) on delete restrict,
  sort_order int  not null default 0,
  primary key (node_id, article_id)
);
```

The composite foreign key is the important line. It makes "every node maps to a *coherent*
category/subcategory pair" a database invariant rather than a CI hope — a mismatched pair cannot be
inserted at all.

Invariants CI enforces on top: branch nodes have a `prompt`, leaf nodes have at least one article,
no cycles, no orphans, level-1 nodes map 1:1 to `ticket_categories`, and ids never change once
shipped (`chat_messages.node_id` references them).

### 6.2 Chat tables

`chat_sessions`, `chat_messages`, `chat_feedback` broadly as previously designed, with `node_id` on
`chat_messages` and these fixes to the superseded plan:

- `message_count` is actually written (it was declared and never updated).
- `retention_expires_at` extends on activity, so a session live on day 91 is not purged mid-conversation.
- `escalated_ticket_ref` is actually written, and an escalated session's transcript moves under the
  ticket's five-year retention as §11 of the old design promised but never implemented.

### 6.3 `chat_escalation_grants`

`id`, `session_id`, `token_hash` (unique), `kind` (`TICKET`|`CALLBACK`), `node_id`, `category_id`,
`subcategory_id`, `priority`, `created_at`, `expires_at` (30 min), `consumed_at`,
`consumed_ticket_id`, `consumed_callback_id`.

### 6.4 `callback_requests`

`callback_ref` (`PG-CB-YYYY-NNNNNN`, matching the existing `PG-` ref convention), `session_id`,
`node_id`, `category_id`, `subcategory_id`, `requester_name`, `requester_phone_raw` +
`requester_phone_digits`, `preferred_window`, `status` (`NEW`|`CLAIMED`|`COMPLETED`|`UNREACHABLE`|
`CANCELLED`), `claimed_by`, `claimed_at`, `attempts`, `outcome_notes`, `ticket_id`,
`callback_due_at`, `submitted_ip`, `submitted_user_agent`, `captcha_verified`, `consent_id`,
`retention_expires_at`.

**This table holds personal data** — a name and a phone number. It therefore gets the same treatment
as `tickets`: a `consent_records` row with verbatim consent text and policy version, RLS denying anon
entirely, service-role-only access, and a retention clock enforced by the existing purge job.
`callback_due_at` comes from `add_business_time(now(), interval '4 hours')`, so the SLA respects the
weekly window and the holiday calendar already in the database.

## 7. Callbacks and agent-raised tickets

The customer's problem may not be solved on the call. The agent must be able to raise a ticket for
them without asking them to go back to the website and start over.

```
callback_requests (NEW)
   ↓ staff_claim_callback()
CLAIMED → agent calls
   ├─ resolved on the call        → staff_complete_callback()
   ├─ needs follow-up             → staff_create_ticket_for_callback()  → source = 'staff'
   │                                  ├─ links callback_requests.ticket_id
   │                                  ├─ records agent-attested consent
   │                                  └─ queues the magic-link status email
   ├─ it is a grievance           → staff_raise_complaint()   [existing — statutory clock starts]
   └─ unreachable after N tries   → staff_log_callback_attempt() → UNREACHABLE
```

Three details that matter:

- **`source = 'staff'` needs no migration** — `tickets_source` already allows `web`, `email`, `phone`
  and `staff`. Only `'chatbot'` is new.
- **Consent for an agent-raised ticket is attested, not clicked.** The `consent_records` row carries
  verbatim text naming the agent and the call, its policy version, and the agent's actor label from
  the existing `current_actor_label()`. A regulator asking "who consented, when, to what" gets an
  answer.
- **The customer gets a tracking link.** The existing `request-status-link` / `lookup-status` pair
  already does magic-link status lookup; an agent-raised ticket queues that email so the customer is
  not left in the dark about a ticket they never filled in.

New staff RPCs mirror the existing `staff_*` conventions: `staff_callback_queue(payload jsonb)`,
`staff_claim_callback`, `staff_log_callback_attempt`, `staff_complete_callback`,
`staff_create_ticket_for_callback`, plus callback counts added to `staff_dashboard()`.

## 8. Free-text handling

1. `redactPii` → `classify` (advice / grievance / normal).
2. `search_faq` — Reciprocal Rank Fusion (k=60) over a pgvector arm and a `websearch_to_tsquery`
   arm. Fusing ranks rather than blending cosine distance with `ts_rank` avoids tuning a magic weight.
3. Haiku 4.5 with **structured outputs**, returning `{ target_node_id, answer, cited_article_ids,
   confidence }`. `target_node_id` is an **enum of the shortlisted node ids** — the model cannot
   name a node that was not offered to it.
4. High confidence with real citations → answer, then continue guided from `target_node_id`.
5. Otherwise → "let me help you narrow this down" and drop the user at the best-guess branch. **A
   failed free-text answer never escalates directly.** The tree is far cheaper than a ticket, and it
   is usually the thing that actually resolves the question.

## 9. Analytics — the part that makes the content improve itself

Because every step is a node, the funnel is exact rather than inferred:

- **Escalation rate per node.** High traffic plus high escalation means the answer at that leaf is
  wrong or missing. This is the content backlog, ranked, with no clustering heuristics.
- **Drop-off per node.** Where people abandon without answering or escalating — usually a confusing
  `label`, not a missing answer.
- **Depth to resolution.** If most resolutions happen at depth 2, levels 3+ are noise; if at depth 4,
  the top of the tree is too vague.
- **Dead ends.** Leaves with no article, or with a "did this help?" no-rate above threshold.
- **Deflection.** Sessions ending satisfied ÷ total, and tickets by `source = 'chatbot'`.

Exposed as a `support_content_gaps` view and reviewed weekly.

## 10. Accessibility

A decision tree rendered as chat is easy to get wrong for keyboard and screen-reader users.

- Options are real `<button>`s inside `role="group"` labelled by the assistant's question — not
  clickable `<div>`s.
- The transcript is an `aria-live="polite"` region so new turns are announced without stealing focus.
- Focus moves to the option group after the assistant responds; the free-text input is always
  reachable.
- A visible **Back** control at every node, plus start-over.
- Reuses the repo's `:focus-visible { outline: 3px solid var(--gold) }` and its
  `prefers-reduced-motion` convention.
- **The FAQ browser is fully usable without the assistant.** Someone who cannot or will not use a
  chat interface must still be able to find every answer.

## 11. Privacy and retention

- The assistant collects **no personal data**. PII typed into it is redacted before storage, and the
  assistant tells the user not to share it — a line the superseded plan specified in §6.3 and never
  implemented, because `redactPii` returned a bare string with no signal that anything had been
  redacted.
- Transcripts are business records, kept 90 days, purged by folding into the existing
  `platizio-retention-purge` job rather than scheduling a competing one.
- Sessions that became a ticket keep their transcript inside the ticket, under its five-year rule.
- `callback_requests` holds real PII and is governed accordingly: consent record, RLS, retention.
- The `/help` page shows a one-line notice on first open: what is logged, for how long, and a link to
  the privacy policy. Nothing is collected that needs a consent checkbox — until the callback form,
  which has one.

## 12. Defects carried over from the superseded plan

These are fixed wherever the old code is reused. Each ships broken otherwise.

| # | Defect |
|---|---|
| 1 | Constraint is named `tickets_source`, not `tickets_source_check`. The old `drop … if exists` silently no-ops and the original keeps rejecting `'chatbot'`. Its test passes vacuously — `WHERE false` never evaluates a CHECK. |
| 2 | `create_support_ticket` **hardcodes `'web'`**. Widening the constraint alone can never produce a chatbot-sourced ticket. |
| 3 | `revoke execute … from anon, authenticated` revokes nothing — Postgres grants EXECUTE to `PUBLIC` by default. Must revoke from `PUBLIC`. |
| 4 | `security definer … set search_path = public` contradicts every function in this project (`''` + fully-qualified) and is the documented Supabase footgun. |
| 5 | `/\bunauthoris?zed\b/` matches "unauthorized" but **not "unauthorised"** — the spelling Indian customers write. The old plan's own test fails against its own implementation. |
| 6 | `cache_control` on the system prompt is a **no-op**: Haiku 4.5's minimum cacheable prefix is 4096 tokens; the prompt is ~250. |
| 7 | pgvector embeddings cannot be passed as a JS array through PostgREST — parameter must be `text` and cast inside. |
| 8 | Tier-1 answers discarded the article's taxonomy, so a subsequent escalation prefilled the wrong category. Moot here — the node carries it — but the same trap exists in the retrieval path. |
| 9 | Widget markup was entirely Tailwind classes; this repo has no Tailwind. |
| 10 | `sessionStorage` / `crypto.randomUUID()` inside `useMemo` run during `renderToString` and break `npm run build`. |
| 11 | Citations pointed at `/faq#…`; the route is `/faqs`, and its accordion is closed by default so a hash landed on a collapsed section. |
| 12 | `cron.schedule` was not idempotent and ignored the `platizio-*` / `private`-schema convention. |

## 13. File plan

### Create

**Content**
- `src/content/faqs.ts` — the 71-item `sections` array, moved out of the page component
- `src/content/support/tree.ts` — the decision tree, typed and git-tracked
- `src/content/support/tree.types.ts`
- `scripts/validate-support-content.mjs` — tree and taxonomy invariants, run in CI
- `scripts/extract-faq-corpus.mjs` — corpus → JSON for ingestion
- `scripts/ingest-faq.mjs` — chunk, embed, upsert (skips unchanged via `content_hash`)

**Supabase**
- `supabase/migrations/<ts>_faq_knowledge_base.sql` — `faq_articles`, `faq_chunks`, extensions in the `extensions` schema
- `supabase/migrations/<ts>_support_nodes.sql` — the tree + composite FK + the `unique (id, category_id)` it needs
- `supabase/migrations/<ts>_search_faq_rpc.sql` — RRF hybrid search, `strict_word_similarity` trigram match
- `supabase/migrations/<ts>_chat_sessions.sql` — sessions, messages, feedback
- `supabase/migrations/<ts>_escalation_grants.sql`
- `supabase/migrations/<ts>_ticket_source_chatbot.sql` — **all four** changes from §12 items 1–2
- `supabase/migrations/<ts>_callback_requests.sql`
- `supabase/migrations/<ts>_staff_callback_api.sql`
- `supabase/migrations/<ts>_support_analytics.sql` — `support_content_gaps`
- `supabase/migrations/<ts>_chat_retention.sql` — folded into `platizio-retention-purge`
- `supabase/functions/_shared/{guardrails,faq,claude,embed,grants}.ts`
- `supabase/functions/support-chat/index.ts`
- `supabase/tests/*.sql` — pgTAP, including a `source='chatbot'` test that **actually inserts a row**

**Frontend**
- `src/pages/Help.tsx` — assistant + FAQ browser
- `src/pages/HelpRaise.tsx` — grant-gated ticket form
- `src/pages/HelpCallback.tsx` — grant-gated callback form
- `src/components/support/{Assistant,NodeOptions,Transcript,AnswerCard,EscalateChoice,FaqBrowser}.tsx`
- `src/components/support/useAssistant.ts`
- `src/lib/supportChat.ts` — the edge-function client
- CSS appended to `css/styles.css`, using existing tokens

### Modify

- `src/pages/FAQs.tsx` — consume `src/content/faqs.ts`; open the accordion section from `useLocation().hash`
- `src/App.tsx`, `src/routes.ts` — three new routes; `sitemap: false` on the two gated ones
- `src/components/SEO.tsx` — `noindex` support
- `src/components/Header.tsx` — "Help" nav points at `/help`
- `src/entry-server.tsx` — re-export tree and FAQ data for the build scripts
- `src/vite-env.d.ts` — `ImportMetaEnv` typings (this repo has zero `VITE_*` vars today)
- `public/robots.txt` — disallow the two gated routes
- `_shared/validation.ts` — parse and whitelist `source`; grant token
- `create-ticket/index.ts` — grant enforcement
- `.gitignore` — `.env.production` is currently **not** ignored

## 14. Phases

Sequenced so each phase is independently releasable.

| Phase | Delivers | Releasable on its own? |
|---|---|---|
| **0** | Vendor the live backend into git (`supabase link` → `db pull` → `functions download`); add Vitest, jsdom, testing-library, CI — **none of which exist today** | — |
| **1** | Extract FAQs to `src/content/faqs.ts`; author the tree; validation in CI | Yes — `/faqs` refactor alone is a safe win |
| **2** | Knowledge base schema, corpus ingestion, hybrid search | — |
| **3** | `support-chat` function: navigation logging, guardrails, free-text, feedback | — |
| **4** | `/help` — assistant + FAQ browser, **no escalation yet** | **Yes — a working guided FAQ assistant.** Real deflection, zero ticket risk |
| **5** | Grants, gated `/help/raise`, `source='chatbot'` end to end | Yes |
| **6** | Callbacks: request form, queue, staff RPCs, agent-raised tickets | Yes |
| **7** | Analytics views, eval gate, retention, launch checklist | Yes |

Phase 4 is the honest milestone: it puts a genuinely useful thing in front of customers while the
escalation machinery is still being built, and it generates the traffic data that tells you which
tree nodes are wrong before a single ticket depends on them.

## 15. Verification

1. **Backend fidelity** — `npx supabase db reset` rebuilds clean and `npx supabase db diff --linked`
   reports no drift, proving the vendored migrations match production before anything is added.
2. **Content invariants** — `node scripts/validate-support-content.mjs`: every node resolves to a
   coherent category/subcategory pair, every leaf has an article, no cycles, no orphans, no id churn
   against the previous commit.
3. **Database** — `npx supabase test db`. Includes a `source='chatbot'` test that **inserts a real
   row**, a composite-FK test proving a mismatched subcategory is rejected, and a `search_faq` test
   passing the embedding as a JSON string.
4. **Guardrails** — `deno test`, including **"unauthorised"** (British spelling) as a standing
   regression test.
5. **Grant security** — expired token rejected; consumed token rejected on second use; a
   `create-ticket` call with `source='chatbot'` and no grant rejected; a call whose body claims a
   different category than the grant gets **the grant's** category on the stored row.
6. **Frontend** — `npm run build`. The strongest gate in this repo: `tsc` passes, every route emits a
   `<title>`, no route falls through to `NotFound`, and the assistant survives `renderToString`.
   Then `npm run preview` — the Vercel-accurate static server; `vite preview` lies because it applies
   SPA fallback.
7. **Journey, in a browser** — walk category → subcategory → leaf; confirm the answer and its
   citation open the right FAQ section; answer "No"; confirm both exits appear; confirm `/help/raise`
   opened directly in a fresh tab shows the expired state and no form.
8. **End-to-end deflection** — submit a ticket from an escalation, then confirm the row has
   `source = 'chatbot'`, the grant is consumed, and `chat_sessions.escalated_ticket_ref` is set. This
   one check catches defects 1, 2 and the retention gap together.
9. **Callback round trip** — request a callback, claim it as staff, raise a ticket on the customer's
   behalf, confirm `source='staff'`, the consent record names the agent, `callback_requests.ticket_id`
   is linked, and the status email is queued.
10. **Accessibility** — full keyboard walk of the tree, screen-reader pass on the live region and
    option groups, and the FAQ browser operated with the assistant ignored entirely.
11. **Eval** — golden set: retrieval recall@3 ≥ 0.90, zero advice-guardrail leaks, and free-text →
    node classification accuracy measured and recorded. Confirm the gate bites by weakening a rule.

Commit style: imperative, sentence case, no scope prefix, matching this repo's existing history.

## 16. Open items

- **Compliance sign-off** on four fixed strings: the advice refusal, the grievance routing message,
  the chat privacy notice, and the callback consent text. Blocks launch, not development.
- **Callback abuse** — a phone field is an abuse and cost surface. v1 uses Turnstile plus IP and
  session rate limits. No OTP verification; revisit if abuse appears.
- **Embedding provider** — start with OpenAI `text-embedding-3-small`; queries are non-PII by design.
  Revisit if compliance objects to query text leaving India.
- **`FAQs.pdf` and `PRD.pdf`** at the repo root may hold content or requirements the extracted
  sources miss. Worth reading before the tree is frozen.
- **Floating site-wide launcher** — deferred. Note it will need a shared rail so it does not collide
  with `WhatsAppFloat`, which currently owns `bottom: 1.5rem; right: 1.5rem; z-index: 900`.
- **Unrelated, worth its own ticket:** the Web3Forms access key is committed in
  `src/components/ContactModal.tsx`.
