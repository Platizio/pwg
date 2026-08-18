# Spec — Products Page Revamp and the Platizio Terminal

**Branch:** `Platizio_Global_Revamp`
**Date:** 2026-08-18
**Status:** Specified. Implementation in progress.

## Goal

`/products` is the last primary page still in the legacy `src/pages/` tree. Its
failures are structural, not cosmetic:

1. **It is a mirror image of itself.** Sections 2–4 (What are US Stocks / Why /
   Popular) and sections 5–7 (What are US ETFs / Why / Popular) are the same
   four shapes with the nouns swapped. A reader who has read the first half has
   read the second.
2. **Two sections are a 5rem band holding one paragraph.** `#us-stocks` and
   `#us-etfs` each contain a single `<p>` and nothing else.
3. **It shows five tickers with no prices.** `AAPL, MSFT, NVDA, TSLA, AMZN` are
   hardcoded strings in a static table, while Home shows those exact five
   symbols live through `/api/quotes`.
4. **It has no interactive element.** Home has the ticker band, Pricing has two
   calculators, About has the team grid. Both of those specs name the signature
   element as the reason the page earns its place. Products has nothing.
5. **It has a different vertical rhythm from every revamped page.** It uses
   `.subsection { padding: 5rem 0 }` rather than `.section { padding: var(--section-y) }`,
   and it fights its own left-aligned `.subsection-header` with four inline
   `style` objects.
6. **It uses the five-across `.feature-grid`.** `home-market.css` rejected that
   pattern in writing: *"The old grid was five across, which left cards too
   narrow to hold a real sentence. Four gives each one room to make its point."*
7. **It ships a typo.** Line 15: `"build a resilient global zportfolio."`

## What this adds

A second route: `/terminal/:symbol`, a per-instrument page in a scoped dark
visual world, prerendered and indexed, linked from every instrument row on
`/products`.

### The thesis

> **Meridian for the tape. Platizio for the truth.**

The obvious build is a copy of a stock-terminal demo: price, P/E, market cap,
institutional holders, analyst targets, newswire. ViewTrade exposes **none** of
those (see [`03-viewtrade-api.md`](03-viewtrade-api.md) — there is no
fundamentals, ranking, ownership or news endpoint on our plan). Building that
page means inventing every figure on it.

So the terminal shows the one number that is real — the live delayed quote and
where its move sits among the whole Nasdaq-100 today — and then answers the
questions an Indian investor actually has about that number:

- **What does this cost me all-in?** Computed by `lib/pricing.ts`'s
  `calculateTradeCost` against `data/pricingRates.ts`. Real.
- **What tax applies?** Stated from the existing articles, linked not restated.
- **How does the money get there?** LRS, TCS, W-8BEN — linked.

Every figure on the page traces to `/api/quotes`, `pricingRates.ts`, or
`calculateTradeCost`. **Nothing is invented.**

## Visual world

One world across both routes, not two. The Meridian design system the user
pinned — its structure, its rigour, its type — rendered in Platizio's own
light rather than against it.

| | Meridian source | As shipped here |
|---|---|---|
| Ground | warm near-black `#080706` | white `#ffffff`, rail `#fbfaf8` |
| Accent | champagne gilt `#d9bd8b` | burnt orange `#b94b12` — the brand accent, unchanged in hue |
| Structure | warm hairlines | navy-tinted hairlines, `rgba(10,37,64,…)` |
| Ink | four warm greys | four blue-blacks, `#0a2540` down to `#607488` |
| Display | Instrument Serif | Instrument Serif |
| Figures | IBM Plex Mono | IBM Plex Mono — already the site's data face |
| Labels | Manrope | Inter — already the site's body face, so one extra family loads, not two |
| Radius | 0 | 0 |
| Depth | flat, no resting shadow | flat, one soft seat under the hero plate |

### The scope rule (load-bearing)

`styles/tokens.css` is a global override layer — it redefines `--navy`,
`--gold`, `--radius` on `:root` so all seven un-revamped pages inherit the
revamp for free. `styles/meridian.css` therefore declares **every** token on
`.meridian` and touches `:root` **never**. The universal `border-radius: 0`
reset stays behind the `.meridian` selector. A leak here repaints the live
site.

### Laws carried over from `screener/DESIGN.md`

- **Rule-not-box.** Sections separate with a 1px rule and vertical space. No
  panel gets a background fill; if a grouping needs one to be legible, the
  hierarchy is wrong.
- **Square by law.** `0px` everywhere. Only true circles are exempt.
- **One filled accent per view.** Exactly one filled orange element.
  Everything else orange is a line, a dot, or type.
- **No resting shadow.** Shadow marks the one CTA and the hero plate.
- **Grain is material.** A cached SVG-noise data-URI tile — never a live
  `feTurbulence`, which re-rasterises on every paint.
- **Drop, don't squeeze.** A column leaves the grid at a breakpoint; it never
  narrows past its design width.
- **The row indent is the signature interaction.** Hover or focus moves a
  row's identity block 8px — as a `transform`, not as `padding-left`, so it
  composites instead of animating layout.

## Page structure — `/products`

| # | Section | Origin | Notes |
|---|---|---|---|
The old page is **deleted, not refactored**. Its section order, its mirrored
halves, its `.subsection` rhythm and its two five-across grids are gone. The
replacement follows `Meridian Home.dc.html` section for section, with
Platizio's own facts in every slot.

| # | Section | Source-design counterpart | Content |
|---|---|---|---|
| 0 | Ticker tape | tape | the thirteen instruments, delayed quotes |
| 1 | Hero | hero + terminal preview | serif headline with an italic orange clause, lede, two actions, and the live instrument plate on the right — the product doing its job before a word about it |
| 2 | Markets this morning | four index cards | advancing, declining, median move, widest move, computed from the constituents we receive |
| 3 | Leaders / Laggards | movers columns | the index's largest moves today, split by direction |
| 4 | Where would you like to begin? | rooms grid | the flagship terminal card with a coverage selector, plus Markets, Research and The Desk |
| 5 | From the desk | this week's notes | three guides |
| 6 | The firm | firm stats | what Platizio charges, published |
| 7 | Close | closing CTA | one filled action |

**The Products dropdown is removed.** `Header.tsx` linked `#us-stocks` and
`#us-etfs`; those anchors no longer exist, so the nav item now goes straight
to `/products` and the dropdown markup, its state and its reset are deleted.
The footer's two links repoint to `/products` and `/terminal/aapl`.

## Page structure — `/terminal/:symbol`

Three columns, `246px / 1fr / 358px`, capped at 1560px.

| Region | Content | Source of every figure |
|---|---|---|
| Symbol rail (left) | the terminal universe, live change per row, current row marked | `/api/quotes` |
| Tape | the same universe scrolling | `/api/quotes` |
| Instrument header | monogram, name, exchange, price, change, market state | `/api/quotes` |
| **OVERVIEW** | today's move against the whole Nasdaq-100 distribution; ruled day stats | `/api/quotes` |
| **COST TO BUY** | quantity stepper and the all-in cost of that many shares | `calculateTradeCost` + `pricingRates.ts` |
| **TAX & RULES** | LRS, TCS, W-8BEN, DTAA, Schedule FA | existing articles, linked |
| **PEERS** | today's Nasdaq-100 movers, this symbol located among them | `/api/quotes` |
| Context rail (right) | how to buy this from India; three relevant guides | static copy + `articles/registry.ts` |

**No fabricated panels.** No P/E, no market cap, no holders, no analyst target,
no newswire, until an endpoint exists for them.

### What is deliberately not ported from `screener/`

- The **order ticket** — a simulated BUY/SELL desk with a `STARTING_CASH` of
  56,320 and hardcoded positions `{AAPL: 12, NVDA: 30, MSFT: 8}`. A regulated
  intermediary must not ship a fake trade button. The one gold CTA goes to
  `TRADING_PLATFORM_URL` instead, which is where execution actually happens.
- The **account avatar, cash label, portfolio value and positions count**.
- The **fictional instrument set** — six hardcoded companies with invented
  fundamentals.
- **`lightweight-charts`** — a canvas library is a client-only dependency and a
  hydration hazard under `renderToString`. Charts here are inline SVG paths
  computed by pure functions, exactly as the source `.dc.html` designs draw
  them.
- **`motion` / framer-motion** — this repo has no animation library. Every
  Meridian animation becomes a CSS keyframe guarded by
  `prefers-reduced-motion`.

## The price-history question

`03-viewtrade-api.md` lists `GET /aes/api/quotes/equity/historical` and
`/intraday` as documented but **never called**, under `uma` auth rather than the
`b2b` machine token the proxy holds. This machine has no `.env.local` and no
access to the credential store, so **that spike could not be run during this
work**.

The repository's own standard is that nothing ships unverified — every claim in
`03-viewtrade-api.md` carries a **VERIFIED** tag or is listed as not existing.
Writing a proxy against an endpoint whose auth, parameters and response schema
are all unknown would violate that standard, so **no `api/history.ts` is
written here**. The follow-up is recorded in
[`04-decisions.md`](04-decisions.md) with the exact questions to answer.

The page is therefore designed around data that *is* verified. The OVERVIEW
signature graphic is **today's move plotted against the whole Nasdaq-100
distribution**: every constituent's percentage change as a 1px tick on a shared
axis, with this symbol's tick in gilt and the quartiles ruled. It needs only
`/api/quotes`, and it answers a question a price chart cannot — *is this move
actually big?* A chart slot can be added above it later without restructuring
anything.

## Acceptance criteria

| # | Criterion |
|---|---|
| 1 | Six sections on `/products` in the order above; four tabs on `/terminal/:symbol` |
| 2 | `npm run build` completes; the prerendered page count rises from 49 by exactly `TERMINAL_UNIVERSE.length`; every terminal page emits a `<title>` |
| 3 | `npm run build:debug` + `npm run preview` — no hydration warning on `/products` or any terminal route, console completely clean |
| 4 | An instrument row on `/products` opens that symbol's terminal; the symbol rail marks the current row; browser back returns to the band |
| 5 | Every figure traces to `/api/quotes`, `pricingRates.ts` or `calculateTradeCost` — zero invented financial figures in the diff |
| 6 | `<MarketNote/>` renders on every view that shows a price; every change carries a glyph and a sign, never colour alone |
| 7 | Legacy `.subsection` markup gone from Products; the `zportfolio` typo gone; the duplicated `ArrowIcon` extracted once |
| 8 | No rate restated — `pricingRates.ts` stays the single source; `meridian.css` adds or changes nothing on `:root` |
| 9 | No horizontal scroll at 360 / 768 / 1280 / 1560; the context rail drops rather than narrows |
| 10 | WCAG AA on every text/background pair in both worlds, measured — including `--m-ink-4` `#8a8076`, `--m-up` `#7dd3a0` and `--m-down` `#e0796b` on `#080706` |

## Verification

_Filled in after implementation._
