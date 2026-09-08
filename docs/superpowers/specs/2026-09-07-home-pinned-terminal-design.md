# Home page: The Pinned Terminal — design spec

Date: 7 September 2026. Status: approved by Aayush in the structured interview on 7 September 2026. Not committed (no git writes until asked).

## 1. Goal and scope

Rebuild `/` from scratch as a Persuade surface in the settled paper world, with every word of copy new, the Motion library used as the page's material (scroll-linked scenes, springs, layout-keyed crossfades, masked reveals), and one signature object: a live card stack that pins and morphs as the argument scrolls beside it.

**In scope:** the home page only: its composition, components, copy, motion and stylesheet. New pure-logic modules under `lib/home/` with tests.

**Untouched:** header, footer, contact modal, every other page, `/terminal`, the rate file, the quotes API, the token sheet.

## 2. Decisions from the interview

| Question | Answer |
|---|---|
| Audience | First-timer, switcher and HNI equally |
| Primary action | Open an account (button label: **Start investing**) |
| Story order | Aspiration → Product → Cost → Trust → Act |
| Voice | Plain, confident, human |
| Hero object | Live quote cards, floating; mixed stack (front card night glass, two paper glass behind) |
| Proof blocks | Live market strip; regulator and custody bar |
| Conversion blocks | How it works (3 steps); checklist comparison; final CTA band |
| Motion ceiling | Rich; sticky scrollytelling and parallax; all removable under reduced motion |
| Cost section | Three big figures + a trade-amount slider |
| Copy scope | Home page only |
| Structure | **The Pinned Terminal** (dealt lead, seed e07a1081, candidate 3 of 7) |
| Headline | "Own ‹Apple› from India." with the bracketed word rolling |

Text and cursor effects, unique components and benchmark were left to my judgement: masked word reveals, rolling headline word, magnetic primary buttons and a cursor spotlight on the checklist (desktop only); the route line drawn on scroll; the everyday-products grid; the cost ticket; craft bar Robinhood and Public.

## 3. Facts the page may state

Only what is already published or computed:

- Every rate from `Platizio_Global_Revamp/data/pricingRates.ts` (0.29% brokerage, $1 minimum, 18% IGST on brokerage, IFSCA and SEC per-dollar fees, FINRA per-share on sells, $0 opening and KYC).
- Regulator and custody facts from the About page: IFSCA oversight, account opened in GIFT City with ViewTrade IFSC, funds move under the RBI's LRS, shares held in US custody with DTCC as ultimate custodian, SIPC cover up to USD 500,000. Platizio provides access, onboarding and guidance; brokerage, execution and custody are ViewTrade's.
- Live quotes from `/api/quotes` with `asOf` and `delayed` stated wherever a price appears.

Never: customer counts, returns, an FX rate, an instrument count, fractional shares, competitor rates.

## 4. Composition

One page, seven parts, in scroll order.

### 4.1 The spine (hero + three chapters)

A section four viewports tall on desktop, a two-column grid (1fr / 1.1fr). The right column is `position: sticky; top: var(--bar-h) + inset` and holds the **card stack**. The left column holds four chapters, each `min-height: 100vh`, content vertically centred:

0. **Hero.** Headline "Own ‹Apple› from India." (rolling: Apple, Nvidia, Tesla, Netflix, the S&P 500), lede, gold magnetic "Start investing" (to `TRADING_PLATFORM_URL`), ghost "See what it costs" (anchor to the cost chapter), three facts (brokerage rate, opening cost, regulator) from the rate file and the facts list.
1. **Aspiration.** "The companies you already pay every month." Everyday product → ticker: the phone (AAPL), the search (GOOGL), last night's series (NFLX), the chip in every AI server (NVDA), the cloud at work (MSFT), the parcel at the door (AMZN). Copy on the left; the stack's front card becomes a 3×2 tile grid with live prices.
2. **Product.** "See the market, not a guess." The stack becomes a small instrument panel: session line (phase, IST clock), four movers with change bars, provenance line, link to `/terminal`.
3. **Cost.** "Every rate, published before you trade." Left: three figures counting up (0.29%, $1, $0) with one-line glosses and a link to `/pricing`. The stack becomes the ticket: a trade-amount slider ($100 to $10,000, default $1,000) with brokerage, IGST, IFSCA and SEC lines and the all-in total, computed from the rate file.

**Card stack.** Three cards. Front: night glass (`.night` ground, warm black, gold hairline). Behind: two paper glass cards at offsets and small rotations. Rest state shows Apple, Nvidia, Tesla quoting live. The front card carries four faces stacked absolutely; each face's opacity and y are `useTransform`s of the spine's scroll progress through a window computed by `faceWindow(k, 4)`. The two rear cards fade to 40% during chapters 1–3. On desktop with a fine pointer the stack tilts ±6° toward the cursor through springs; the whole stack drifts 60px of parallax.

**Mobile (< 900px) and reduced motion.** The right column is not sticky. The hero shows the stack once at rest; chapters 1–3 each render their face inline beneath their copy. No tilt, no parallax, no crossfade.

### 4.2 Live tape

Full-bleed marquee of today's movers from `trending`: ticker, price, change chip. Left cap: the session pill (rotating between "US Pre-market · 7:31 pm IST" and "US market opens 7:00 pm" as the terminal's pill does), delay stated. Hidden entirely when the feed fails.

### 4.3 How it works: the route

Heading "Three steps, one legal route." A vertical SVG line drawn by scroll progress (`pathLength`), with four stops that light in order: your bank → LRS → GIFT City → US custody. Beside it, three steps as rows: open your account online, fund it under the LRS, place your first US order. Each row rises when in view.

### 4.4 Trust bar

Five cells across on desktop, two-up on mobile: IFSCA regulated, opened in GIFT City, funded under the LRS, held in US custody (DTCC), SIPC cover. One plain-English gloss each; no icons, a hairline grid.

### 4.5 The checklist

"Five questions to ask any platform." A two-column table: the question, our answer. A third column "Elsewhere" reads "Ask them" on every row. Rows: is every rate published before you trade; what does opening cost; where is the account opened; who holds your shares; is there a real terminal. A cursor spotlight follows the pointer across the table on desktop.

### 4.6 Closing band

"Your first US share is one account away." Gold "Start investing" and quiet "Talk to us" (opens the contact modal). The footer follows.

## 5. Motion grammar

- **Entrance.** Headings reveal word by word out of a clipping mask; blocks rise 22px. Server HTML is the finished state; hiding is applied only on the client, only to elements below the fold at mount, and reveals on intersection **or** on a scroll-position check, so nothing can stay hidden.
- **Scroll.** `useScroll` on the spine (`start start` → `end end`) drives every face crossfade, the rear cards' fade, the route line's `pathLength`, and parallax. Only `transform` and `opacity` bind to scroll, plus `pathLength` on one SVG path.
- **Pointer.** Magnetic primary buttons (translate toward the cursor within 80px, spring back), stack tilt, checklist spotlight. All gated on `(hover: hover) and (pointer: fine)`.
- **Time.** Rolling headline word every 3.2 s; session pill rotation; count-ups once in view.
- **Reduced motion.** `<MotionConfig reducedMotion="user">` already covers motion elements; the page additionally does not mount scroll or pointer scenes, renders the spine as stacked chapters, and stops the tape.

## 6. Data and states

- `useMarketData()` supplies `popular` (8 names incl. AAPL, NVDA, TSLA, GOOGL, NFLX, MSFT, AMZN, META), `trending`, `asOf`, `delayed`.
- **Loading:** cards render names and a shimmer where the figure goes; the tape renders nothing until data arrives.
- **Failure:** cards render names with "Quote unavailable"; tape and panel hide; the page stays complete.
- **Session:** computed client-side after mount from `sessionAt(now)`, refreshed every 30 s; SSR renders a neutral pill.
- Every price carries "delayed · as of {time} IST" from `asOf`.

## 7. Files

- `lib/home/copy.ts` — every string on the page.
- `lib/home/cost.ts` — `tradeCost(usd)`; `lib/home/spine.ts` — `faceWindow`, `chapterAt`; `lib/home/roll.ts` — `ROLL_WORDS`, `nextIndex`; `lib/home/route.ts` — stops and `stopLit`.
- `tests/home-*.test.ts` — one file per module, written first.
- `components/home/` — `home-page.tsx`, `spine.tsx`, `card-stack.tsx`, `faces.tsx`, `live-tape.tsx`, `session-pill.tsx`, `route-steps.tsx`, `trust-bar.tsx`, `checklist.tsx`, `closing.tsx`, `motion/` (`word-reveal`, `rise`, `rolling-word`, `magnetic`, `tilt`, `spotlight`, `use-fine-pointer`), `use-session.ts`.
- `app/(site)/styles/home.css` — the page sheet, replacing `Platizio_Global_Revamp/styles/home-market.css` in the layout import chain.
- `src/views/Home.tsx` re-exports `components/home/home-page.tsx`; `Platizio_Global_Revamp/Home.tsx`, `components/TrendingBanner.tsx`, `FeesTable.tsx`, `Regulations.tsx` and `styles/home-market.css` are deleted if nothing else imports them.

## 8. Gates

`npm test` (703 baseline, plus the new files), `tsc --noEmit`, `next lint`, `next build`, the design detector on the changed targets, desktop and mobile screenshots, the finish reviewer, the documenter.
