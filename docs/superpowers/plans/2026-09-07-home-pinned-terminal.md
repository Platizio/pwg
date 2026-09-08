# Home page: The Pinned Terminal — implementation plan

> **For agentic workers:** executed inline in this session (Aayush asked for no agents). Steps use checkbox syntax for tracking. No git writes until Aayush asks.

**Goal:** Build the approved home page from `docs/superpowers/specs/2026-09-07-home-pinned-terminal-design.md`.

**Architecture:** Pure logic in `lib/home/` (tested first, no DOM), client components in `components/home/` on `motion/react`, one page sheet `app/(site)/styles/home.css` reading `app/(site)/styles/tokens.css`. `src/views/Home.tsx` re-exports the new page.

**Tech Stack:** Next.js 16 App Router, React 19, motion 12, Lenis, node:test.

---

### Task 1: Pure logic, test first
- [ ] Write `tests/home-cost.test.ts`, `home-spine.test.ts`, `home-roll.test.ts`, `home-route.test.ts`, `home-copy.test.ts` (done).
- [ ] Run `npm test` → the five files fail on missing modules.
- [ ] Write `lib/home/cost.ts`, `spine.ts`, `roll.ts`, `route.ts`, `copy.ts` minimally.
- [ ] Run `npm test` → 703 + new all pass.

### Task 2: Motion primitives (`components/home/motion/`)
- [ ] `use-fine-pointer.ts` — `(hover: hover) and (pointer: fine)` matchMedia hook, false on SSR.
- [ ] `rise.tsx` — block reveal: SSR visible, client arms only below the fold, reveals on intersection OR scroll check.
- [ ] `word-reveal.tsx` — heading split into words in overflow-hidden spans, staggered rise; same arming rule.
- [ ] `rolling-word.tsx` — word slot sized by widest word, y-roll every `ROLL_MS`, static under reduced motion.
- [ ] `magnetic.tsx` — wrapper translating children toward the pointer within a radius via springs; fine pointer only.
- [ ] `tilt.tsx` — rotateX/rotateY springs from pointer position; fine pointer only.
- [ ] `spotlight.tsx` — radial highlight following the pointer via CSS vars; fine pointer only.

### Task 3: Data hooks
- [ ] `components/home/use-session.ts` — `sessionAt(Date.now()/1000)` after mount, 30 s interval.
- [ ] Reuse `useMarketData()` for quotes.

### Task 4: The spine
- [ ] `faces.tsx` — `QuoteFace`, `UseFace`, `PanelFace`, `CostFace` (slider + `tradeCost`).
- [ ] `card-stack.tsx` — three cards; front card stacks the faces; opacity/y from `faceWindow`; rear fade from `rearFade`; tilt + parallax on desktop.
- [ ] `spine.tsx` — grid, sticky right column, four chapters from `COPY`, `useScroll` on the section; mobile renders faces inline.

### Task 5: The rest of the page
- [ ] `session-pill.tsx`, `live-tape.tsx` (Marquee of `trending`).
- [ ] `route-steps.tsx` — SVG line `pathLength` from scroll, stops lit by `stopLit`, three step rows.
- [ ] `trust-bar.tsx`, `checklist.tsx` (spotlight), `closing.tsx`.
- [ ] `home-page.tsx` — composition + `<SEO>`.

### Task 6: Stylesheet and wiring
- [ ] `app/(site)/styles/home.css` — every class above, paper world, responsive at 900px and 600px, reduced-motion.
- [ ] Import in `app/(site)/layout.tsx` after `home-market.css`; `src/views/Home.tsx` re-exports the new page; delete `Platizio_Global_Revamp/Home.tsx` if nothing imports it.

### Task 7: Gates and finish
- [ ] `npm test`, `npx tsc --noEmit`, `npx next lint`, `npx next build`.
- [ ] Browser: desktop 1440 and mobile 390 captures into `.impeccable/review/`, console clean.
- [ ] `detect.mjs --json` on changed targets; fix mechanical findings.
- [ ] Finish reviewer, then documenter.
