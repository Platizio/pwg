# Platizio Global — Frontend Overview, Backend Architecture and Activation Plan

**Date:** 2026-08-14
**Status:** Approved for implementation
**Complements:** `2026-08-13-help-centre-design.md` — that spec designs the help centre; this one covers the whole backend and sequences what ships first
**Supabase project:** `qtjnlkobvnhhgsnyufzv` — "Platizio Support (Mumbai)", `ap-south-1`

---

## Context

The request was to review the frontend, choose a backend suitable for this environment, name the technologies, and design the architecture.

The review turned up something that changes the shape of the answer: **the backend already exists and is live.** Supabase project `qtjnlkobvnhhgsnyufzv` — "Platizio Support (Mumbai)", `ap-south-1`, Postgres 17.6, `ACTIVE_HEALTHY` — holds 27 migrations (~5,100 lines of SQL), 20 tables, ~69 functions and 8 Deno edge functions. The vendored copy in `supabase/` matches production exactly: same 27 migration versions, same 8 functions, zero drift.

Two facts explain why it looks like there is no backend:

1. **Every operational table has 0 rows.** Only reference data is seeded — 8 ticket categories, 26 subcategories, 7 `business_hours` rows, 8 holidays, 5 `enquiry_interests`. `tickets`, `complaints`, `consent_records`, `notifications`, `staff_users` are all empty. Nothing has ever been written.
2. **`main` does not contain it.** `origin/main` is at `329230d`; the entire backend plus the `/help` centre arrived in one commit, `a132fa7` (65 files, +10,686/−599), which sits unmerged on this branch.

So the backend is not missing — it is **disconnected and unshipped**. `src/lib/supportChat.ts:89` gates every call on `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`, neither of which is set, so every support request silently degrades to a `mailto:` draft. The file's own header says so: *"This is the state today."*

**But wiring alone is not sufficient.** Tracing the intake path call by call (§4.3–4.4) turned up a defect on the majority route: the acknowledgement email is queued only inside `finalize_support_ticket`, and the client skips `finalize-ticket` entirely whenever there are no attachments. Set the two environment variables today and most customers would file a ticket, see a reference number, and never hear anything. Nothing in the database is wrong — the hole is in which of the two intake calls the browser makes.

That distinction shapes the sequencing. Phase B fixes the code defects **before** Phase C turns the traffic on, because switching a silent failure into a visible one in front of real customers is worse than waiting two days.

This plan therefore optimises for **activation**: get what exists into production, correctly and safely, before building anything new.

## Progress

| Phase | State | Notes |
|---|---|---|
| **A** — Merge and de-risk | **Built, not on `main`** | CI exists and went green on this branch — `npm run build` plus a job replaying every migration onto a clean Postgres and running pgTAP. It is **not on `main`**, which has no `.github/` at all, so the default branch currently has no CI. Vitest still not added. |
| **B** — Fix the intake defects | **Done** | B1 and B2 both fixed and covered by tests that insert real rows. |
| **C** — Turn the lights on | **Code done, secrets outstanding** | The client half of Turnstile now exists — `src/lib/useTurnstile.ts`, wired into both forms, sending `x-turnstile-token`. What remains is only the secret values, which have to be set by someone who holds them. |
| **D** — Contact form onto `contact_enquiries` | **Done** | RPC, `create-enquiry` function, consent record, modal switched over, and — added `0030` after a recheck on 2026-08-17 — the acknowledgement and internal alert that `0029` left unqueued. Web3Forms kept as a fallback only until C lands. |
| **E** — Staff console | Not started | |
| **F** — Customer status page | Not started | |

### Applied to the live project on 2026-08-17

`0028` and `0029` are on `qtjnlkobvnhhgsnyufzv`; the project is at **29 migrations and 9 edge functions**, `create-ticket` at v4. Verified after the fact: the `tickets_source` constraint now admits `'chatbot'`, `create_support_ticket` reads `payload.source`, and `create_contact_enquiry` is granted to `service_role` only — it does **not** appear in the security advisor's list of functions callable by `authenticated`, which is how you can tell the `revoke … from public` actually bit. Advisors otherwise unchanged from the pre-change baseline.

### Superseded on 2026-08-17: main was rewound

PRs #3 and #4 were merged, and then **deliberately unmerged** — `main` was reset from `844792e6` back to `329230d`, with `backup/main-pre-unmerge` created first to preserve the work. Two unrelated commits (App Store badges, a `.gitignore` update) now sit on top.

So the position today is:

- **`main` has no `supabase/` directory and no `.github/`.** Neither the vendored migration history nor CI is on the default branch.
- **The live project still runs 29 migrations and 9 edge functions.** Production leads git-main by the whole backend.
- Everything is preserved on `backup/main-pre-unmerge` and on this branch.

The drift is benign in behaviour — `0028` and `0029` are additive, nothing on `main` calls them, and `create_support_ticket` still defaults `source` to `'web'`. It is not benign for the claim in `config.toml` that the migration history evidences which behaviour was live on which date. That claim currently holds only if you read the branches, not the default branch.

**Standing constraints for this work:** the live Supabase project is not to be modified, and nothing is to be merged to `main`. Development continues on `claude/frontend-review-backend-plan-4xdi5i`.

### Recheck on 2026-08-17

A pass over the whole backend against this plan, to close it out rather than trust the notes above.

**One real defect found, and fixed in `0030`.** Every notification template declared in the `notifications_template` whitelist was queued by something — except the two `0027` added for enquiries. `0027` built `notifications.enquiry_id`, the `notifications_one_subject` constraint, the partial index and both template names, then stopped. `0029` added the write path and queued nothing. A contact enquiry therefore committed in silence: no acknowledgement to the enquirer, no alert to the team. It is the same shape of defect as B1 on the ticket path — a row that lands with nobody told — and Web3Forms was masking it, so it would have surfaced only when that fallback was retired. `0030` queues both inside the intake transaction, with 11 pgTAP assertions that all write real rows.

The acknowledgement states office hours and **no response time**. That is load-bearing, not stylistic: enquiries are kept out of the ticket queue precisely because they carry no published SLA, and `0027` says `internal_follow_up_target_at` must never be quoted to an enquirer. A test asserts no `within N hours` phrasing reappears, because that regression would be invisible — the mail still sends and everything still passes.

**Checked and found sound, no change needed:**

- Every `staff_*` RPC carries an authorisation guard. Five appeared unguarded on a first pass; all five use `private.require_admin()`, which is stricter than `require_staff()`. `staff_whoami` guards on `auth.uid()` alone, which is correct — it has to be callable by any signed-in user to tell them who they are.
- All nine edge functions are declared in `config.toml`, `create-enquiry` included.
- `create_contact_enquiry` is still `service_role` only, with the revoke written `from public, anon, authenticated` — revoking only from the two named roles would leave Postgres's default `PUBLIC` grant in place and the function reachable by both.
- `npm run build` passes: 50 pages prerendered, 49 in the sitemap, both prerender guards intact.

**Known and deliberately not addressed here:**

- No notification fires when a ticket is *created* — the first internal signal is `sla_internal_alert`, two hours before breach. A ticket can therefore sit unseen for most of its SLA window. This is what the plan has always described, not a regression, but it is worth a decision before real traffic arrives.
- The Web3Forms key at `ContactModal.tsx:13` is in git history and in every shipped bundle. It needs rotating regardless of when the fallback is retired.

### The remaining secrets

Earlier revisions of this section named two destinations. There are **three**, and the third is the one that decides whether any email is ever sent.

| Where | Name | Required? |
|---|---|---|
| Vercel | `VITE_SUPABASE_URL` | yes — **set 2026-08-17** |
| Vercel | `VITE_SUPABASE_ANON_KEY` | yes — **set 2026-08-17** |
| Vercel | `VITE_TURNSTILE_SITE_KEY` | only if the captcha is enforced |
| Supabase → function secrets | `TURNSTILE_SECRET_KEY` | only if the captcha is enforced |
| Supabase → function secrets | `RESEND_API_KEY` | yes, for any email at all |
| Supabase → function secrets | `MAIL_FROM` | yes, on a Resend-verified domain |
| Supabase → function secrets | `ALLOWED_ORIGINS` | **no** — defaults cover the two live hosts, localhost and `*.vercel.app` by shape |
| Supabase → function secrets | `SITE_URL` | **no** — defaults to `https://platizioglobal.com` |
| Supabase → **Vault** | `project_url` | **yes — nothing sends without it** |
| Supabase → **Vault** | `service_role_key` | **yes — nothing sends without it** |
| Supabase → **Vault** | `sla_alert_email` | only for SLA warnings and enquiry alerts |
| Supabase → **Vault** | `enquiry_alert_email` | optional; falls back to `sla_alert_email` |

`SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are injected into every edge function by the platform and must not be set by hand.

**Why Vault is not optional.** Email is drained by `pg_cron`, which calls `private.invoke_edge_function('drain-outbox')`, which reads `project_url` and `service_role_key` **from Vault** to authenticate its own `pg_net` call (`0011_cron.sql:31-35`). Missing either and it logs `skipping drain-outbox — Vault secrets are not set` and returns. The result is a valid Resend key, a verified domain, and a queue that never drains — a failure that looks like Resend being broken and is not.

The two Turnstile values are a pair. With neither set, both forms work and record `captcha_verified = false`. With both set, the captcha is enforced. **Setting only one breaks intake** — site key alone renders a widget the server ignores; secret alone 403s every submission, because verification demands a token the client would not be sending. Since the Turnstile client lives on this branch and not on `main`, the secret must be set **last**, after the code carrying the widget is deployed.

---

## Part 1 — Frontend overview

### What it is

A marketing, education and lead-generation site for Platizio Global — a service that lets Indian retail investors buy US stocks and ETFs under the RBI's Liberalised Remittance Scheme, through a GIFT City / IFSCA-regulated structure, with execution and custody by ViewTrade. The site does **not** host trading; every "Start Investing" CTA points off-site to `TRADING_PLATFORM_URL` (`src/constants.ts:1`).

Revenue line, from `src/pages/Pricing.tsx`: brokerage at 0.29% per transaction (USD 1 minimum). Account opening, KYC and charting are free.

### Stack

| Layer | Choice |
|---|---|
| Framework | React 18.3, no Next.js |
| Language | TypeScript 5.9, `strict: true`, `noEmit` (tsc is a typecheck gate) |
| Build | Vite 5.4 + `@vitejs/plugin-react` |
| Router | react-router-dom 6.30 |
| Head/SEO | react-helmet-async 3 |
| Styling | One hand-written stylesheet — `css/styles.css`, 4,687 lines, CSS custom properties. **No Tailwind, no CSS Modules, no UI kit.** |
| 3D | `cobe` (WebGL globe) |
| Images | `sharp`, build-time only |
| Hosting | Vercel, static output |
| Tests / lint / CI | **None.** No ESLint, no Prettier, no Vitest, no test file, no `.github/` directory. |

Five runtime dependencies total. This is a deliberately small surface and worth keeping that way.

### The defining architectural feature: build-time prerendering

`npm run build` = `validate:support && tsc && node scripts/prerender.mjs`. That script runs a Vite client build, builds an SSR bundle from `src/entry-server.tsx`, `renderToString`s **every route in `src/routes.ts`**, and writes real HTML to `dist/<route>/index.html`. 49 pages are prerendered; 48 go in the sitemap.

It carries two hard build guards that are genuinely load-bearing:

```js
if (!head.includes('<title')) throw new Error(`${route.path} produced no <title> …`)
if (route.path !== '/404' && html.includes('notfound-code')) throw new Error(`${route.path} fell through to <NotFound/> …`)
```

With no tests and no CI, `npm run build` is the *entire* quality gate. Anything that weakens it costs more than it looks.

**Consequence for the backend:** there is no server runtime on the public site. Vercel serves static files. Any dynamic behaviour must come from a separately hosted API — which is exactly why a BaaS fits here.

### Structure

```
src/
├── entry-client.tsx / entry-server.tsx   hydrate-or-mount; render(url) → {html, head}
├── App.tsx · routes.ts                   14 route elements; RouteEntry[] prerender manifest
├── pages/          (14)                  Home, Products, Pricing, Media, About, FAQs, Help, …
├── components/     (11 + Globe/ + support/)
├── articles/       registry.ts (30 articles) · topics.ts (7 hubs) · content/*.ts
├── content/        faqs.tsx (71 answers) · support/tree.ts (111 nodes) · taxonomy.ts
├── context/        AppContext.tsx — the only context (contact-modal state)
└── lib/            supportChat.ts — the only network layer
```

No `hooks/`, no `utils/`, no state library, no data-fetching library. Helpers live beside their consumers.

Content is all git-tracked TypeScript. `src/content/faqs.tsx` and `src/content/support/tree.ts` share the same 71-answer corpus by id reference with no duplication, validated at build time by `scripts/validate-support-content.mjs`. That is a well-built content architecture and should be preserved as-is.

### The three forms, and where they go today

| Form | File | Today |
|---|---|---|
| Contact / enquiry modal | `src/components/ContactModal.tsx` | POSTs to **Web3Forms**, access key hardcoded at line 13. Emails the team; nothing is persisted. |
| Support ticket | `src/components/support/RequestForm.tsx` (`kind='TICKET'`) | `submitTicket()` → **`mailto:` draft**, because env is unset |
| Callback request | same file (`kind='CALLBACK'`) | `submitCallback()` → **`mailto:` draft**, no endpoint exists at all |

No login, no protected routes, no admin UI, no analytics of any kind.

---

## Part 2 — The backend that already exists

Live in `qtjnlkobvnhhgsnyufzv`, vendored to `supabase/`, drift-free.

**20 tables** — `tickets`, `ticket_messages`, `ticket_categories`/`ticket_subcategories`, `ticket_attachments`, `ticket_status_history`, `ticket_access_tokens`, `complaints`, `consent_records`, `notifications`, `staff_users`, `user_roles`, `staff_role_audit`, `attachment_access_log`, `business_hours`, `business_holidays`, `contact_enquiries`, `enquiry_interests`, `enquiry_notes`, plus `private.rate_limit_hits`. RLS on all of them.

**~69 functions**, including a complete staff API: `staff_ticket_queue`, `staff_ticket_detail`, `staff_dashboard`, `staff_directory`, `staff_assign_ticket`, `staff_set_status`, `staff_post_reply`, `staff_raise_complaint`, `staff_set_complaint_stage`, `staff_close_complaint`, `staff_open_attachment`, `staff_attachment_access_history`, `staff_list_accounts`, `staff_set_roles`, `staff_set_active`, `staff_set_holidays`, `staff_holiday_calendar`, `staff_whoami`, `provision_staff_user`.

**8 edge functions** (Deno, all `verify_jwt = true`) — `create-ticket`, `finalize-ticket`, `request-status-link`, `lookup-status`, `staff-attachment`, `invite-staff`, `drain-outbox`, `sweep-storage`, over `_shared/{cors,supabase,tokens,turnstile,validation}.ts`.

**Compliance machinery already built** — append-only `ticket_status_history` and `attachment_access_log`; versioned, IP/UA-stamped `consent_records`; a SEBI-style grievance flow gated on `GRIEVANCE_OFFICER`; SLA clocks via `add_business_time()` respecting the weekly window and holiday calendar; retention purge and SLA sweep on `pg_cron`; `custom_access_token_hook` injecting `platizio_roles` into the JWT.

The `private` schema is deliberately excluded from PostgREST so internal helpers cannot be reached over the API. `enable_signup = false`. Storage is a private bucket with a 5 MiB limit and magic-number verification of uploaded bytes.

`supabase/config.toml` states the intent plainly: *"For an IFSCA-regulated entity that history is the point: it is how you establish which behaviour was live on which date."*

### What is genuinely not built

- No staff UI whatsoever — 21 RPCs with no client
- No customer status page — `request-status-link` and `lookup-status` are live but unreachable
- No write path to `contact_enquiries` — migration 0027 built the table, enum, ref generator and seeds, but there is no RPC and no edge function that inserts
- `callback_requests`, `support_nodes`, `faq_articles`/`faq_chunks`, `chat_*`, `chat_escalation_grants`, `support-chat` — all designed in `docs/superpowers/specs/2026-08-13-help-centre-design.md`, none built
- No tests at any layer, no CI

### And one thing that is built but broken

- **Acknowledgement on the no-attachment path.** Not a missing feature — a hole between two working
  functions. `finalize_support_ticket` queues the email; `create_support_ticket` never does; the
  client calls the first and skips the second whenever there is nothing to upload. Covered in §4.4
  and fixed in Phase B1.

---

## Part 3 — Platform decision

**Stay on Supabase.** Confirmed, not defaulted to.

1. **The public site has no server runtime.** It is static prerendered HTML on Vercel. A BaaS with edge functions is the natural complement; standing up a VM or container API means new ops surface for a small team.
2. **`ap-south-1` keeps customer PII in India** — material for an IFSCA-regulated entity.
3. **RLS is the authorisation model.** ~40 policies plus `custom_access_token_hook` already encode who may read what, enforced by the database. Moving to a separate API tier relocates that into application code and loses the guarantee.
4. **The migration history is the compliance artefact**, by explicit design.
5. ~5,100 lines of SQL already deployed. Rewriting is pure cost with no user-visible gain.

Rejected: a dedicated Node/NestJS or Python API (loses RLS, adds ops, duplicates working code); Vercel serverless functions (fragments the security model across two vendors, and there is no existing server context to extend).

---

## Part 4 — Target architecture, in depth

Nothing in the function tier has been redesigned. `create-ticket` and `finalize-ticket` are live,
deployed, and stay exactly as they are. This section documents what is already there rather than
proposing a replacement — the only addition is `create-enquiry`, which follows the same shape.

### 4.1 The function tier

Nine Deno functions sit between the browser and Postgres. All are `verify_jwt = true`, so the
gateway rejects an unsigned request before any of this code runs.

| Function | Called by | Acts as | Does |
|---|---|---|---|
| `create-ticket` | browser, anon key | `adminClient` (service) | Validate → Turnstile → rate limit → `create_support_ticket` → mint signed upload URLs |
| `finalize-ticket` | browser, anon key | `adminClient` | Read the uploaded bytes back, sniff magic numbers, delete fakes, `finalize_support_ticket` |
| `request-status-link` | browser, anon key | `adminClient` | Turnstile → rate limit → mint 32-byte token, store **SHA-256 only** → queue magic-link email |
| `lookup-status` | browser, anon key | `adminClient` | Hash the presented token → `lookup_tickets_by_token` |
| `staff-attachment` | staff SPA | **`userClient`** (the caller) | Log the access **first**, then mint a 60-second signed URL |
| `invite-staff` | staff SPA | `userClient` + admin | Provision a staff account against `auth.users` |
| `drain-outbox` | `pg_cron` via `pg_net` | `adminClient` | Claim ≤10 notifications, POST to Resend, mark each complete |
| `sweep-storage` | `pg_cron` via `pg_net` | `adminClient` | Delete storage objects whose rows are gone |
| `create-enquiry` **[new]** | browser, anon key | `adminClient` | Same shape as `create-ticket`, writing `contact_enquiries` |

The `adminClient` / `userClient` split is the load-bearing detail. `_shared/supabase.ts` documents it
directly: reaching for `adminClient()` in a staff function would *"silently hand a support agent
service-role reach — the RPC would still run, it would just stop being able to tell who ran it."*
So `staff-attachment` acts as the caller, and `auth.uid()` inside the RPC is the actual person.

`drain-outbox` and `sweep-storage` additionally call `isServiceRoleCaller()`, which reads the `role`
claim out of the already-verified JWT. Without it the anon key would be enough to trigger the outbox
drain — and the anon key ships in the site bundle.

### 4.2 Why the tier exists at all

Five things it does that PostgREST structurally cannot:

1. **Verify Turnstile** — needs a server-held secret.
2. **Mint signed upload and download URLs** — needs the service key, which cannot be in a browser.
3. **Read uploaded bytes back and sniff magic numbers** — a `.pdf` containing a shell script is
   rejected here, because the browser's extension check never opened the file.
4. **Rate-limit before the database is touched** — `private.rate_limit_hits` is deliberately outside
   the PostgREST schema list.
5. **Call outward to Resend.**

Everything else — authorisation, audit, SLA arithmetic, retention — stays in Postgres, where RLS
enforces it rather than application code remembering to.

### 4.3 Flow — raising a ticket

Three browser calls, two of them into the function tier.

```
Browser                    create-ticket              Postgres                 Storage
   │                            │                        │                        │
   │─ POST create-ticket ──────▶│                        │                        │
   │  anon key                  │                        │                        │
   │  x-turnstile-token         │                        │                        │
   │  idempotencyKey, name,     │                        │                        │
   │  email, mobile, category,  │                        │                        │
   │  subcategory, priority,    │                        │                        │
   │  subject, description,     │                        │                        │
   │  consent{text,version,url} │                        │                        │
   │  attachments[{name,mime,bytes}]                     │                        │
   │                            │                        │                        │
   │              1. preflight — CORS origin allowlist    │                        │
   │              2. parseTicketIntent — shape, lengths,  │                        │
   │                 email regex, mobile digits, safeName │                        │
   │              3. verifyTurnstile(token, ip)           │                        │
   │              4. rate_limit_consume ─────────────────▶│ intake:ip     10/hr    │
   │                                   ─────────────────▶│ intake:email   5/hr    │
   │              5. rpc create_support_ticket ──────────▶│                        │
   │                                                      │ ── ONE TRANSACTION ──  │
   │                                                      │  consent or reject     │
   │                                                      │  idempotency dedup     │
   │                                                      │  insert tickets        │
   │                                                      │   ↳ set_ticket_ref     │
   │                                                      │     → PG-YYYY-NNNNNN   │
   │                                                      │   ↳ set_ticket_due_dates
   │                                                      │     → add_business_time
   │                                                      │  insert consent_records│
   │                                                      │  insert ticket_attachments
   │                                                      │     state = PENDING    │
   │              6. createSignedUploadUrl per file ──────────────────────────────▶│
   │◀─ 200 {ticketId, ticketRef, uploads[{index,signedUrl}], unavailable[]}        │
   │                                                                               │
   │─ PUT signedUrl — raw bytes, one per file ────────────────────────────────────▶│
   │                                                                               │
   │                       finalize-ticket                                         │
   │─ POST finalize-ticket ────▶│                        │                        │
   │  {ticketId, idempotencyKey}│                        │                        │
   │              1. load ticket, compare idempotency_key │                        │
   │                 mismatch → 403. This is what stops   │                        │
   │                 anyone finalising someone else's     │                        │
   │                 ticket by guessing a uuid.           │                        │
   │              2. select attachments where PENDING ───▶│                        │
   │              3. per file: list → size → sign 60s →   │                        │
   │                 GET Range: bytes=0-15 → sniffMime ──────────────────────────▶│
   │                 verdict: VERIFIED | REJECTED | MISSING                        │
   │              4. delete REJECTED objects ────────────────────────────────────▶│
   │              5. rpc finalize_support_ticket ────────▶│ update attachments     │
   │                                                      │ tickets.finalized_at   │
   │                                                      │ insert notifications   │
   │                                                      │  'ticket_acknowledgement'
   │                                                      │  dedupe 'ack:<uuid>'   │
   │◀─ 200 {ticketRef, acknowledgementQueued, failedAttachments}                   │
```

Three properties worth stating plainly, because they are what the two-call split buys:

- **The ticket exists after call one.** A failed upload or a failed finalize degrades attachments,
  never the request itself.
- **The bytes are never trusted.** `declared_mime` comes from the browser; `verified_mime` is read
  from the first 16 bytes of the stored object. They are stored separately and a mismatch is logged.
- **Finalize is idempotent.** `finalized_at` uses `coalesce`, and the notification insert is
  `on conflict (dedupe_key) do nothing`. Calling it twice is harmless.

### 4.4 The hole in that flow

`create_support_ticket` (migration `0012`, lines 156–277) contains **no reference to
`notifications`, `render_ticket_acknowledgement`, or any acknowledgement at all.** The
acknowledgement email is queued in exactly one place: `finalize_support_ticket`, line 324.

And the client skips finalize entirely when there is nothing to upload —
`src/lib/supportChat.ts:176-178`:

```ts
// No files: the ticket is complete as it stands.
if (draft.files.length === 0) {
  return { kind: 'raised', reference: body.ticketRef }
}
```

So a ticket raised **without attachments is never finalized**: `finalized_at` stays null and the
customer never receives an acknowledgement. That is the majority of support tickets. The comment
asserts the ticket "is complete as it stands" — it is recorded, but it is not acknowledged.

**Fix: always call `finalize-ticket`.** It is already idempotent, it is a sub-second call on a form
submit, and it keeps one invariant — a ticket is complete when finalize says so — rather than
splitting acknowledgement across two functions. This is Phase B alongside the `source` fix, because
both are one-line-ish changes on the same path and both need the same end-to-end test.

### 4.5 Flow — customer checks status (no account)

```
Browser ── POST request-status-link {email} ──▶ Turnstile → rate limit (3/hr email, 10/hr ip)
                                              → newAccessToken(): 32 random bytes, base64url
                                              → store sha256(token) in ticket_access_tokens
                                              → queue magic-link email, 30-minute TTL
        ◀─ always the same answer, whether or not that email has tickets ─
                 "If we have any requests from that email address, a link is on its way."

Browser ── POST lookup-status {token} ───────▶ rate limit 60/hr per ip
                                              → sha256(token) → lookup_tickets_by_token
        ◀─ the customer's tickets ─
```

Two deliberate choices: the response never reveals whether an address is known, and the raw token is
never stored — only its SHA-256, the same pattern the escalation grants will reuse.

### 4.6 Flow — staff opens an attachment

The ordering here is the whole design.

```
Staff SPA ── POST staff-attachment {attachmentId, reason} ──▶ userClient, caller's JWT
                                                              │
                                        rpc staff_open_attachment  ← as auth.uid(), not service
                                                              │
                                        writes attachment_access_log  ← BEFORE any URL exists
                                                              │
                                        adminClient.createSignedUrl(60s, download: filename)
          ◀─ {url, filename, expiresInSeconds: 60} ─
```

Migration `0020` narrowed the storage policy to ADMIN break-glass precisely so this path is the only
one. As the function's own header puts it: the enforcement is *"not a rule asking clients to log
their reads, but the removal of any way to read without logging."* If signing then fails, the log
records an access that produced no bytes — the right way round.

### 4.7 Flow — email, and the background jobs

Email is a transactional outbox, never sent inline. Every workflow that needs to notify someone
inserts a `notifications` row inside its own transaction; nothing blocks on SMTP.

```
any workflow ──▶ insert notifications (dedupe_key)      [inside the business transaction]

pg_cron 'platizio-outbox-drain'  every minute
   └─▶ private.invoke_edge_function('drain-outbox')
         └─▶ pg_net.http_post with the Vault-held service key
               └─▶ drain-outbox: isServiceRoleCaller → claim_notifications(10)
                     └─▶ POST api.resend.com → complete_notification(ok | error)
```

Four distinct cron jobs (registered by five `cron.schedule` calls — `platizio-retention-purge` is
re-registered in `0015` to add token purging):

| Job | Schedule | Work |
|---|---|---|
| `platizio-outbox-drain` | every minute | invoke `drain-outbox` |
| `platizio-sla-sweep` | every 15 min | `sweep_sla()` + `requeue_stuck_notifications()` |
| `platizio-storage-sweep` | hourly at :17 | invoke `sweep-storage` |
| `platizio-retention-purge` | daily 21:00 UTC | `purge_expired_records()` + `purge_expired_access_tokens()` |

`drain-outbox` holds rather than fails when `RESEND_API_KEY` is unset — queued mail waits for
configuration instead of being marked undeliverable.

### 4.8 The two trust zones

```
 ANONYMOUS                                    AUTHENTICATED
 ─────────                                    ─────────────
 Browser, anon key                            Staff SPA, user JWT
   │  + x-turnstile-token                       │  app_metadata.platizio_roles
   │  CORS origin allowlist                     │
   ▼                                            ▼
 Edge functions  ── captcha, rate limits,     PostgREST  ── no intermediary
                    signed URLs, byte sniffing              /rest/v1/rpc/staff_*
   │  service_role                              │  authenticated role
   ▼                                            ▼
 ══════════════════ Postgres 17 · RLS on every table ══════════════════
   intake RPCs · staff_* RPCs (require_staff) · append-only audit
   consent · SLA clocks · retention
   │                    │                     │
   │ pg_cron            │ pg_net              │ Storage
   ▼                    ▼                     ▼
 sla sweep          drain-outbox          ticket-attachments
 purge · requeue    → Resend              private, ADMIN break-glass only
```

Staff traffic skips the function tier because every `staff_*` RPC already calls `require_staff()`
and RLS backs it; an intermediary would add latency and a second place for authorisation to drift.
The two exceptions are `staff-attachment` and `invite-staff`, which are functions precisely because
they need the service key for work the database cannot do alone — signing a storage URL, and
touching `auth.users`.

---

## Part 5 — Technologies

### Public site — no change

React 18.3 · TypeScript 5.9 · Vite 5.4 · react-router-dom 6.30 · react-helmet-async 3 · plain CSS (`css/styles.css`) · cobe · sharp · custom prerender → Vercel static.

### Staff console — new

Same React 18 / TypeScript / Vite baseline, so there is one toolchain and no new learning curve. Reuse the design tokens already in `css/styles.css`; no UI kit.

**Add `@supabase/supabase-js`, for the staff app only.** It is needed for session management — token refresh, PKCE, storage — which is easy to get subtly wrong by hand. The public site keeps raw `fetch` and stays dependency-light, because it must survive `renderToString` during prerender.

### Backend

Supabase on `ap-south-1`: Postgres 17.6 · PostgREST · Deno edge functions · Supabase Auth (email/password, signup disabled, `custom_access_token_hook`) · Supabase Storage (private bucket, 5 MiB, signed URLs) · `pg_cron` (4 jobs) · `pg_net`.

### Third-party

Resend (transactional email via `drain-outbox`) · Cloudflare Turnstile (captcha) · Vercel (two projects).

### Tooling to add

Vitest + jsdom + `@testing-library/react` (frontend) · pgTAP via `supabase test db` (database) · `deno test` (edge functions) · GitHub Actions CI.

---

## Part 6 — Plan

### Phase A — Merge and de-risk

Nothing user-visible; this closes the gap between the repo and reality.

- Open the PR for `a132fa7` onto `main`. Note `origin/main` is 1 commit behind and that commit is the whole backend.
- Add `.github/workflows/ci.yml` running `npm run build` — it already chains `validate:support`, `tsc` and the two prerender guards, so it is the strongest gate available today.
- Confirm no drift before adding anything: `npx supabase db reset`, then `npx supabase db diff --linked` reports empty.
- Add Vitest + jsdom + testing-library; one smoke test per new module thereafter.

### Phase B — Fix the two intake defects (blocking)

Both sit on the same code path and need the same end-to-end test, so they ship together.

#### B1 — Tickets without attachments are never acknowledged

The more damaging of the two, because it hits the majority case. See §4.4: the acknowledgement email
is queued only inside `finalize_support_ticket`, and the client skips `finalize-ticket` whenever
there are no files. A customer with nothing to upload gets a reference number on screen and then
silence, and `tickets.finalized_at` stays null.

- Drop the early return at `src/lib/supportChat.ts:176-178` and always call `finalize-ticket`.
  It is already idempotent — `coalesce(finalized_at, now())` plus
  `on conflict (dedupe_key) do nothing` on the `ack:<uuid>` key.
- Test: raise a ticket with **no** attachment, assert a `notifications` row with template
  `ticket_acknowledgement` exists and `finalized_at` is set.

#### B2 — `source='chatbot'` is silently dropped

Verified, not inferred:

- `supabase/migrations/20260811054159_0003_tickets.sql:65` — `constraint tickets_source check (source in ('web','email','phone','staff'))`. `'chatbot'` is absent. The constraint is named **`tickets_source`**, not `tickets_source_check`; a `drop constraint if exists tickets_source_check` silently no-ops.
- `supabase/migrations/20260811092715_0012_intake_api.sql:211` — `create_support_ticket` inserts the literal `'web'`.
- `supabase/functions/_shared/validation.ts` — `parseTicketIntent` never parses `source` at all, so the frontend's `source: 'chatbot'` (`src/lib/supportChat.ts:151`) is discarded before it reaches the database.

Net effect: every ticket raised from the assistant would be recorded as `'web'`, and any deflection metric built on `source` would be quietly false.

New migration `0028_ticket_source_chatbot.sql`:
- Drop and recreate `tickets_source` including `'chatbot'`, using the correct constraint name.
- Change `create_support_ticket` to read `payload->>'source'`, whitelist against the same four-plus-one set, default `'web'`.
- Add `source` to `parseTicketIntent` with a whitelist, rejecting anything else.
- pgTAP test that **inserts a real `source='chatbot'` row**. A `WHERE false` test never evaluates a CHECK and passes vacuously.

### Phase C — Turn the lights on

Vercel env (public site): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.

Supabase function secrets: `TURNSTILE_SECRET_KEY`, `RESEND_API_KEY`, `MAIL_FROM`, `ALLOWED_ORIGINS`, `SITE_URL`.

`TURNSTILE_SECRET_KEY` matters more than it looks. `supabase/functions/_shared/turnstile.ts:12-17` returns `{ok: true, verified: false}` when the secret is unset — it **fails open**. Setting the frontend env vars without also setting the secret and sending the token leaves a public intake endpoint protected by rate limits alone (10/hr per IP, 5/hr per email). Conversely, setting the secret without wiring the client makes every submission 403, because `create-ticket/index.ts:30` reads `x-turnstile-token` and the client never sends one. **Both halves ship together or neither does.**

- Port `src/help/useTurnstile.ts` (143 lines) from branch `claude/support-ticketing-supabase-tg5akd`; render the widget in `RequestForm.tsx` and pass the token through `submitTicket`.
- Verify end-to-end: a real submission produces a real `PG-` reference, a row in `tickets`, a `consent_records` row, and a queued acknowledgement email that `drain-outbox` actually sends.

### Phase D — Contact form onto `contact_enquiries`

The table is ready and unused: `enquiry_ref` (`PG-ENQ-YYYY-NNNNNN`), an `enquiry_status` enum, `enquiry_notes`, 3-year retention, and `enquiry_interests` pre-seeded with the exact five options the modal offers. Only the write path is missing — `20260813083647_0027_contact_enquiries.sql` grants `select` and nothing else.

- New migration: `create_contact_enquiry(payload jsonb)`, service-role only, following the `create_support_ticket` conventions (`security definer`, `set search_path = ''`, fully-qualified names, revoke from `PUBLIC` — not from `anon, authenticated`, which revokes nothing).
- New edge function `create-enquiry`, mirroring `create-ticket`: preflight → validate → Turnstile → `rate_limit_consume` → RPC.
- Point `ContactModal.tsx` at it. Retire Web3Forms and **rotate the key committed at `ContactModal.tsx:13`** — it is in git history and in every shipped bundle.

Enquiries stay separate from tickets by design: they carry no published SLA and must never enter the queue the SLA is measured on.

### Phase E — Staff console

A Vite SPA at `staff/`, built and deployed as its own Vercel project on `staff.platizioglobal.com`, sharing this repo and its CI but not the static marketing build. It is excluded from `src/routes.ts`, from prerendering, and disallowed in `robots.txt`.

Salvage from `claude/support-ticketing-supabase-tg5akd`:
- `src/admin/api/desk.ts` (285 lines) — typed wrappers over every `staff_*` RPC, passing the database's own refusals through verbatim ("This action requires one of these roles: GRIEVANCE_OFFICER" is written for the reader and leaks nothing about the schema)
- `src/admin/api/types.ts` (429 lines) — the RPC payload and response types

Replace `src/admin/api/session.ts` (263 hand-rolled lines against `/auth/v1`) with `@supabase/supabase-js` auth.

Screens: sign-in · dashboard (`staff_dashboard`) · queue with filters (`staff_ticket_queue`) · ticket detail with reply, status and assignment · complaints with stage and close · attachment viewer via the `staff-attachment` function · staff admin (invite, roles, deactivate) for `ADMIN` only.

Two things to respect: signed attachment URLs live about a minute and are logged against the caller's name **before** issue, so never store or re-log them; and status-history notes are append-only and go into a regulatory file, so the UI should say so at the point of writing.

### Phase F — Customer status page

`request-status-link` and `lookup-status` are already live and unreachable. Add `/help/status`, salvaging `src/help/api/status.ts` (163 lines) from the same branch. Magic-link only — `ticket_access_tokens` stores `sha256(token)`, never the token. Prerendered with `sitemap: false`.

### Out of scope, named for sequencing

The `2026-08-13-help-centre-design.md` extension phases: `support-chat` edge function, `support_nodes`, the pgvector/RRF FAQ knowledge base, escalation grants, `callback_requests` and the staff callback queue, and the `support_content_gaps` analytics view. Worth doing, but only once real tickets are flowing — Phase 4 of that spec is explicitly the honest milestone, and it needs traffic data this system has never produced.

---

## Verification

1. **No drift** — `npx supabase db reset` rebuilds clean; `npx supabase db diff --linked` is empty. Run before and after Phase B.
2. **Content invariants** — `node scripts/validate-support-content.mjs` still passes. It regex-scrapes `src/content/faqs.tsx` at exact 8-space indentation, so reformatting that file breaks the build.
3. **Frontend build** — `npm run build`, then `npm run preview` (the Vercel-accurate static server; `vite preview` lies because it applies SPA fallback).
4. **Database** — `npx supabase test db`, including the `source='chatbot'` test that inserts a real row.
5. **Edge functions** — `deno test` on validation and Turnstile paths.
6. **Ticket round trip, in a browser** — walk the assistant to a leaf, raise a ticket with one PDF attachment. Confirm via MCP: a `tickets` row with `source='chatbot'` and a `PG-` ref; a `consent_records` row with verbatim text and version; a `ticket_attachments` row whose `verified_mime` was read from the bytes; a `notifications` row that `drain-outbox` moved to sent.
7. **Ticket round trip with no attachment** — the majority case, and the one B1 fixes. Raise a
   ticket with zero files and confirm `tickets.finalized_at` is set and a
   `ticket_acknowledgement` notification exists. Before the fix this produces neither.
8. **Finalize is safe twice** — call `finalize-ticket` a second time with the same
   `ticketId` and `idempotencyKey`; confirm exactly one acknowledgement row, and that a
   mismatched key returns 403.
9. **Bad bytes are rejected** — upload a file named `.pdf` whose contents are not a PDF. Confirm
   the attachment lands `REJECTED`, the storage object is deleted, and the ticket still stands.
10. **Turnstile bites** — submit with the widget bypassed and confirm a 403, not a silent accept.
11. **Enquiry round trip** — submit the contact modal, confirm a `contact_enquiries` row with a `PG-ENQ-` ref and no corresponding `tickets` row.
12. **Staff round trip** — sign in, claim from the queue, post a customer-visible reply, confirm the email is queued and the first-response SLA clock stops; open an attachment and confirm the `attachment_access_log` row was written before the URL was issued.
13. **Authorisation** — confirm a non-`GRIEVANCE_OFFICER` cannot close a complaint, and that the refusal text is the database's own.
14. **Rate limits** — 11 submissions from one IP inside an hour; the 11th returns 429.

---

## Open items for you

- **Second Supabase project.** `volmpsvzrbzialnrrqjk` — "Platizio's Project" — sits in `ap-southeast-1` (Singapore) with two empty tables, `net_worth_submissions` and `accreditation_submissions`. For an IFSCA entity that is a data-residency question. It holds no data today, so deleting it is cheap; leaving it is a decision someone should make on purpose.
- **`PRD.pdf` and `FAQs.pdf`** at the repo root have never been read into the codebase. The help-centre spec flags them as possibly holding requirements the extracted content misses. No PDF text extraction is available in this environment, so someone should read them before the support tree is frozen.
- **Compliance sign-off** on the consent string currently hardcoded at `src/lib/supportChat.ts:156-161`, version `2026-08-13`. It is stored verbatim on every ticket, so changing it later means a new version, not an edit.
- **Three stale remote branches** — `claude/seo-stock-content-qqlk8m`, `claude/support-ticketing-supabase-tg5akd`, `feature/help-and-support`. Delete after Phase E salvages what it needs.
