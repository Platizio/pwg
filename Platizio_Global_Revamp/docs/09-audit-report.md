# Platizio Global Revamp — Design, Trust & Multi-Market Readiness Audit

**Scope:** Home, Pricing, About, Media (`Platizio_Global_Revamp/`, branch `Platizio_Global_Revamp`) vs. the pre-revamp site (branch `main`), benchmarked against India's international-investing platforms and premium wealth brands.

---

## Executive Summary

**1. Yes, it genuinely looks different — but not evenly.** The token layer replaces literal Tailwind defaults (the original's `--gray-*` scale and `--emerald` were hex-identical to Tailwind's stock slate palette and emerald-500) with measured, custom values, and a one-typeface site becomes a disciplined three-face system. Home gained a real live-data layer that didn't exist before (`main` has no `api/` directory at all). But the single most-viewed surface on the site — the hero — carries **zero lines of revamp CSS** (confirmed by grep across all seven revamp stylesheets), and it shows: a hardcoded gradient color (`#14365E`) now matches no current token, orphaned by the revamp's own remapping of `--navy-soft`. Some "transformation" is really relocation: the team section is the identical 8 people in the identical roles, just shown in a grid instead of a carousel.

**2. It doesn't consistently read HNI — it code-switches.** About's custody Q&A (ViewTrade IFSC, DTCC, SIPC to $500,000) is genuinely sophisticated, specific writing. One scroll away, Home's flagship new section sells fractional investing "from as little as one dollar," and the cost calculator's own presets top out at $25,000 — against the $250,000/year an LRS investor can actually remit (`src/pages/FAQs.tsx:33,145`). Zero instances of "HNI," "family office," or "sophisticated" appear anywhere across all four pages (repo-wide grep, confirmed). Pricing claims completeness ("Three things apply to Indian residents investing abroad," `Pricing.tsx:118-119`) while omitting the one tax that scales with account size — US estate tax, up to 40% above a $60,000 threshold — even though the platform already wrote the correct content (`src/articles/registry.ts:339-348`) and simply didn't link to it.

**3. Competitively, it wins on depth and loses on the checkable stuff.** The custody-chain Q&A out-specifies every direct competitor reviewed (Vested, INDmoney, Appreciate, Winvesta). But there is no verifiable IFSCA registration/authorisation number anywhere on the site — INDmoney publishes its exact registration numbers on-page — Pricing discloses every fee except forex (every competitor states a specific FX rate or range), and every primary CTA is still a full 999px pill, the mass-retail shape convention the revamp's own tokens.css comment says it's trying to move away from.

**4. There is no dark theme, and — for these four pages specifically — there shouldn't be one yet.** The palette has real on-dark precedent (`--gain-on-dark` at 8.08:1, `--loss-on-dark` at 6.26:1), but the token architecture is a literal palette (403 raw palette references across the revamp's own CSS plus the legacy stylesheet), not a semantic role layer, and the "seven-step ink scale" tokens.css frames as a depth system resolves in shipped CSS to two flat tones — `ink-950`, `ink-850`, `ink-600`, `ink-500` are declared and never used anywhere outside their own definitions. Building a real dark theme is scoped at roughly the size of one of the four page revamps already shipped. The cheap, valuable move regardless of that decision: consolidate 19 hand-picked on-dark text opacities into a real token scale now.

**5. The 2-3 month multi-market roadmap runs straight into deep, executable coupling.** Four separate subsystems — live quotes (`NASDAQ_100` flat array, no market field anywhere from the hook to the ViewTrade HTTP call), the pricing engine (`SEC fee`/`FINRA transaction fee` as literal strings, an unconditional SEC-fee-on-sell branch), the news filter (a keyword allow-list paired with an exclude-list that explicitly *rejects* Sensex/Nifty/FTSE by name), and the custody Q&A (SIPC/DTCC framed as the universal answer) — are each independently hardcoded to the US market, with nothing in routing or shared components treating "which market" as a variable at all. This is new debt the revamp created by succeeding (the original had no live-data pipeline to couple), and it's cheap to restructure now, expensive once a second market's data is already flowing.

---

## Verdict Table

| Dimension | Grade | Justification |
|---|---|---|
| Visual design, typography & color system | **B** | Real, measured token system replacing literal framework defaults, but the site's two most-viewed surfaces (hero, page-hero) carry zero revamp CSS, and a contrast bug the team already fixed once reproduces, unfixed, in two more places. |
| Dark-theme readiness | **C-** | No dark theme exists (confirmed live via `prefers-color-scheme` and by grep); real on-dark color precedent exists, but no semantic layer, no tested dark-on-dark layering, and shadows tuned only for a white canvas. |
| Layout & information architecture | **C+** | Each page's internal narrative is coherent, but two footer deep-links into Media are dead, Home's own hero CTA routes to a page this project never touched, and Pricing/About's highest-intent CTA sits outside any landmark. |
| Accessibility | **C+** | Strong, consistent fundamentals (skip link, correct focus trap, WCAG 1.4.1-compliant gain/loss encoding everywhere) sit beside two WCAG Level A failures on the flagship new ticker. |
| Content, tone & trust for HNI | **C+** | About's custody Q&A is genuinely sophisticated; Home's highest-visibility new section pitches "$1" fractional investing to a reader who doesn't have that problem, and Pricing claims tax completeness while omitting the one tax that scales with size. |
| Competitive positioning | **C+** | Wins on trust-content depth and pricing-calculator rigor; loses on the specific signals this audience checks first — registration number, forex disclosure, CTA shape, named leadership. |
| Technical architecture & consistency | **B** | One real source of truth for pricing feeds every calculator and table end to end; a Node-verified rounding bug and ~400 lines of dead CSS are the concrete exceptions, not the pattern. |
| Performance & SEO | **B-** | Every route is genuinely, correctly prerendered with clean canonicals and heading order; a 688KB unsplit JS bundle and two real SEO regressions (lost article links, dropped video schema) are the drag. |
| Multi-market readiness | **D** | Four subsystems — quotes, pricing engine, news filter, custody Q&A — are each independently hardcoded to the US market, with no shared "market" concept anywhere in routing or components. |

---

## Original vs. Revamp, Page by Page

### Home — half transformed, half untouched
**Transformed:** The market-data half of the page didn't exist before. `TrendingBanner`, `PopularStocks`, `FeesTable` and `Regulations` are new, live-data-backed sections built on `useMarketData` → `/api/quotes` → ViewTrade, replacing three original sections outright (a promo-video embed, a "Recent on YouTube" grid, an articles teaser).

**Merely relocated:** The hero is byte-for-byte unstyled by the revamp — same globe, same legacy CSS, same gradient (now carrying an orphaned color literal). The original's generic "Why invest globally" cards are gone, but the category error they represented reappeared in new clothing: `PopularStocks.tsx:57-58`'s "You do not need the price of a whole share... from as little as one dollar" reassures the same reader-who-doesn't-need-it that the original's diversification cards did — different sentence, same miscalibration.

**Regressed:** `main:src/pages/Home.tsx` carried 5 internal links (`/products` plus 3 direct article links plus an `/articles` hub link). The revamped Home carries 3, zero into the article library. The hero's own second CTA, "Explore products" (`Home.tsx:88`), sends a reader straight to `Products.tsx` — confirmed **byte-identical** to pre-revamp `main` (`git diff main -- src/pages/Products.tsx` returns empty) — the single most-referenced page (hero CTA + primary nav) still entirely outside this work.

### Pricing — the real transformation
This is where the revamp does exactly what it should. The original's #1 flagged gap — bare rate formulas with no worked total — is closed by `TradeCostCalculator` and `CapitalGainsCompare`, both reading from one shared `data/pricingRates.ts`, plus a real worked TCS example (₹15,00,000 remitted → TCS on ₹5,00,000 → ₹1,00,000, `Pricing.tsx:129-137`) formatted with correct Indian digit grouping. This is the single biggest, most complete fix in the whole revamp.

**What's still open:** forex/FX is absent from the page entirely (and from the whole site — only one FAQ answer mentions it, with no bank named and no rate given); the tax section explicitly claims completeness while omitting estate tax; the calculator's own "Total cost" silently excludes FX with no flag, even though it's careful enough to name and size the smaller FINRA exclusion; SEC/FINRA are hardcoded directly into JSX rather than data, coupling the page to one market; the closing CTA section has no heading or landmark.

### About — the most improved, and the most unevenly improved
**Genuinely new:** the custody Q&A (`STRUCTURE` array, `About.tsx:24-67`) — "Who holds your shares?", "Who executes your orders?", "What protection applies?" — is confirmed absent from the original entirely. It names ViewTrade IFSC and DTCC and states the SIPC limit in the same breath. The opening paragraph now correctly leads with Platizio Global and US stocks instead of the original's unrelated Mutual Fund/SIF business line. `TeamGrid` shows all 8 people at once instead of the original's one-at-a-time rotating 3D carousel — a real transparency gain even with identical underlying data.

**Unchanged:** `data/team.ts` is confirmed to match the original `TeamCarousel`'s roster exactly — 2 Social Media Executives, 3 Product Software Developers, 2 Financial Market Analysts, 1 Senior Financial Market Analyst, zero advisory or operations titles, despite the page's own header promising "The research, advisory, and operations team." The founder bio is the same two generic, unverifiable bullets, reworded. The closing CTA is character-for-character identical to Home's, despite the page having just built a much more specific trust case than Home has. The custody Q&A stops one question short of "what happens if Platizio itself fails" — even though that exact answer already exists, written and ready, at `src/pages/FAQs.tsx` (id `sc-4`).

### Media — real wins undercut by two regressions
**Better:** Article links are now real, crawlable `href`s via `MediaPanels`, an improvement over the original carousel's `onClick`-only links with no `href` at all.

**Regressed:** `main:src/pages/Media.tsx` carried `id="videos"` (line 55) and `id="articles"` (line 96) that the site's footer still links to (`/media#articles`, `/media#videos`) sitewide — and that the team's own `docs/04-decisions.md` explicitly cited as the justification for cutting Home's direct article links ("the footer still links `/media#articles`, so articles remain crawlable"). Neither `id` exists in the revamped page; both footer links are dead. Separately, `main`'s `Media.tsx` mapped all 10 videos through a `videoSchema()` generator into JSON-LD; the revamped page imports only `breadcrumbSchema` — the generator (`src/components/SEO.tsx:114`) still exists, unused, but VideoObject structured data for all 10 videos is gone. Media is also the only one of the four pages with no on-page path back to opening an account — it closes on a newsletter signup instead.

---

## Reading for a High-Net-Worth Audience

The prose itself is well-calibrated where it's been rewritten: a repo-wide check finds **zero exclamation points and zero "don't worry / it's easy / hassle-free" phrasing** anywhere across all four pages. About's "The friction is not in the trade. It is in the forty steps on either side of it" (`About.tsx:109-110`) and "We would rather you understood the TCS credit you are owed than opened an account a day sooner" (`About.tsx:115-116`) are genuine, ownable voice — not template copy.

But the audience-calibration problem shows up in three concrete, checkable places:

- **The headline market pitch sells affordability to a reader who has neither problem.** `PopularStocks.tsx:55,57-58`: "Household names, fractional sizes... from as little as one dollar," in position 4 on Home, immediately below the hero. The cost calculator's presets (`TradeCostCalculator.tsx:10`: `['200','1000','5000','25000']`) top out at 10% of the $250,000/year LRS ceiling this audience can actually use.
- **The most consequential tax exposure for this exact audience is absent from the one page that claims to state it completely.** US estate tax — up to 40% of value above a $60,000 threshold in US-situs assets, a line a serious LRS-scale investor crosses within a handful of trades — isn't mentioned anywhere in `Pricing.tsx`, `TradeCostCalculator.tsx`, `CapitalGainsCompare.tsx`, or `pricingRates.ts`. The platform's own 31-article library already has a dedicated article on it.
- **"Guidance" and "a person to ask afterwards" are repeated but never quantified**, though the numbers exist: `FAQs.tsx` already states a 24-hour response / 1-5 day resolution SLA and an instant-to-48-hour approval window. Neither figure appears on Home, Pricing, About, or Media. Nor does a founding date, client count, or AUM figure for Platizio Global itself — the only "established" claim on the site (`About.tsx:121`) describes the parent LLP's mutual-fund distribution business, not the entity actually holding the reader's US-stocks relationship.

None of this requires new engineering. Every fix in this section is a copy change pulling content that already exists elsewhere in the same codebase onto the page a prospect actually reads.

---

## Competitive Position

**Where Platizio wins:**
- The custody-chain Q&A is more granular than anything found on Vested, INDmoney, Appreciate, or Winvesta — none lay out ViewTrade IFSC and DTCC as ultimate custodian this explicitly.
- The pricing calculators, reading from one shared `pricingRates.ts`, match or exceed the category's most concrete pricing tools (INDmoney's static table, Winvesta's live payments calculator) in rigor — once the forex gap is closed.
- The base palette already sits in the premium-wealth hue family: navy (hue 210°) and burnt-orange accent-500 (hue 20.5°) are 9.5° off a perfect complement, closer to Kotak Private's gold (`#CA9E58`) and 360 ONE's orange (`#FD7740`) than to the saturated blue/green/teal of INDmoney (`#089958`), Vested (`#1547EB`), or Appreciate (`#00E0C1`) — measured via computed styles.
- Home's hero headline, "Invest globally with Platizio," is already geography-agnostic ahead of the multi-market roadmap — the same positioning move Vested has made branding itself "the global investing specialist."
- `TeamGrid` showing all 8 staff at once is a real trust improvement over the original's rotating carousel — the information was always there, it's no longer hidden behind an autoplay interval.

**Where Platizio loses:**
- **No verifiable registration number anywhere.** A repo-wide search for "registration no / IFSCA/ / authorisation no" returns zero matches. INDmoney publishes its exact IFSCA Broker Dealer Regulation No. and Global Access Provider Authorisation No. directly on-page; Nippon India names its Principal Officer, Compliance Officer and Fund Manager individually with a registration number. Platizio's own Terms already state ViewTrade — not Platizio — holds the actual licenses, which makes ViewTrade's number the one addition that converts an assertion into something a reader can verify in under a minute.
- **Pricing discloses every fee except the one every competitor discloses first.** No forex/FX field exists anywhere in `pricingRates.ts`, `Pricing.tsx`, `FeesTable.tsx`, or `TradeCostCalculator.tsx`. Vested states 1.5-2%, INDmoney states 0.5-1.2%, Winvesta shows a live rate plus 0.99%+$3 with a real-time comparison against named alternatives on its own homepage.
- **Primary CTAs are still full 999px pills** — the mass-retail shape convention (INDmoney, Winvesta both full-pill) — while the competitor positioned closest to "specialist" rather than mass-market, Vested, uses an 8px radius. This sits in direct tension with the revamp's own token comment ("the old values were soft enough to feel consumer-app," `tokens.css`), which tightened every other radius but stopped at the one shape a visitor actually touches.
- **The team shows zero seniority or credentials.** 360 ONE Wealth leads with "17+ years of wealth management experience... 8,500+ UHNW & HNW families served"; Kotak Private bylines named experts; even Vested's testimonials name customer seniority. Platizio's roster is entirely execution-level titles with no founder, head of investments, or advisory board visible beyond one founder bio.
- **No named authorship on Media's content.** Kotak Private runs the identical subject matter — LRS thresholds, HNI money moving into US frontier tech — under named analyst bylines. Platizio's `NewsItem` interface has no author field.
- **Nobody in the direct US-stock-investing set runs a live named-competitor cost comparison**, and Platizio doesn't either — `CapitalGainsCompare.tsx` only compares holding periods on the same platform. This is a real, ownable gap, not a parity issue — but it's the single largest-effort item in this report and should come after the cheaper trust fixes, not before.

---

## The Theming & Dark-Mode Deep Dive

### The palette itself
This is real, checkable craft. The original's `--gray-*` scale and `--emerald` gain color are hex-identical to Tailwind CSS's stock slate palette and default emerald-500 — the pre-revamp neutral scale was, verifiably, an unmodified framework default. The revamp's replacement isn't just "different," it's tuned: `tokens.css`'s own comment claims a specific contrast fix for `gray-500`, and independent recomputation confirms it — the naive value (`#64798F`) measures 4.493:1 on white (fails the 4.5 AA floor), the shipped value (`#607488`) measures 4.826:1 (passes). The navy/burnt-orange hue relationship (210° vs 20.5°, 9.5° off a perfect complement) gives the palette real range: `--accent-300` reaches 6.21:1 on `ink-800` where `--accent-500` only reaches 3.02:1 on the same surface — the tools for legible on-dark accent text already exist in the palette.

### Light theme: real craft, literal architecture
The light theme works and is documented. What it isn't is a **role-based** system. `tokens.css` defines a literal palette — `ink-800`, `gray-600`, `accent-300` — not semantic tokens like `surface-page` or `text-secondary`. **181 raw palette references sit directly in the revamp's own seven CSS files, plus another 222 in the legacy stylesheet still loaded on all four pages** — 403 total, none re-mappable without being touched individually. `--white`, `--surface`, and `--surface-raised` are three separate names for the identical `#FFFFFF` (`tokens.css:71-74`); `--surface-raised` is used in exactly one place (`home-market.css:186`).

This literal architecture is the direct root cause of the report's most avoidable finding: **`.eyebrow.on-dark` was correctly fixed once** (`base.css:65`, routed to `var(--accent-300)`), but two structurally identical rules elsewhere reach for the raw `--gold` token directly and fail the same contrast bar. `css/styles.css:2101` (`.breadcrumb a { color: var(--gold); }`) renders at **2.57–3.02:1** against its navy-family background — real, functional "Home" navigation text on Pricing and About, well under the 4.5:1 text needs — and `css/styles.css:728` (`.hero-badge svg`) repeats the same unguarded token, though that instance is decorative. The team's own codebase proves it knows the fix; it just didn't propagate past the one place it was first applied.

### The "seven-step ink scale": promised depth, shipped as two flat tones
`tokens.css:16-26` declares 7 dark steps and frames them explicitly as a surface-depth system — "base for large fields, raised for cards sitting on them, line for separation." In the CSS that actually shipped, **`ink-950`, `ink-850`, `ink-600`, and `ink-500` are referenced nowhere outside their own definitions.** `ink-900` (17 uses) and `ink-800` (23 uses, mostly as the `--navy` text-color alias, not a surface) do almost all the work; `ink-700` appears only as a gradient endpoint. There is no instance anywhere in the four pages of two ink steps sitting adjacent as distinct flat layers — every dark panel (footer, trending band, news band, calc-result, page-hero, regs-cta, newsletter) is one flat tone or the identical `ink-700→ink-900` gradient, reused verbatim three times. This is a real, precisely quantified gap — but it produces **zero visible defect today**: nothing looks broken. It's the direct, concrete reason a dark theme isn't a token-file patch: the one configuration a dark theme needs proven out — dark-on-dark layering — has never actually been built or tested anywhere in the shipped product.

### On-dark text: 19 opacities standing in for a scale
Every dark panel across the four pages sets secondary/tertiary text color as a literal `rgba(255,255,255,X)`. A full grep finds **19 distinct alpha values in the revamp's own files alone** (0.06 through 0.95), plus 20 more, largely non-overlapping, in the legacy stylesheet. Two of the 19 (`0.12`, `0.22`) are already named border tokens (`--line-on-dark`/`--line-on-dark-strong`); the rest — the values actually driving on-dark text — are pure ad hoc literals. This is the exact pattern the light-side `--gray-50…800` scale was built specifically to eliminate; it's just never been applied to the dark side.

### Does a dark theme exist? No — confirmed two ways.
Grepping every stylesheet in the cascade for `@media (prefers-color-scheme)` returns nothing. Independently, loading the site with the browser's OS scheme forced to dark (`window.matchMedia('(prefers-color-scheme: dark)').matches === true`) produces zero visual change. This matches the established project fact: no dark theme, no `data-theme` attribute, anywhere.

### Is the architecture ready? Partially — and here's exactly what's missing.
**In its favor:** the palette already has tested on-dark precedent, because the site already carries permanent dark sections — `--gain-on-dark` (8.08:1 on `ink-800`) and `--loss-on-dark` (6.26:1) are both correctly used today.

**Against it:** tokens.css is a literal palette, not a role layer (above). The ink scale's "depth" half has never been proven out as an actual dark-on-dark stack, so there's no evidence today's declared values would even read correctly layered against each other. The on-dark text scale doesn't exist (above). And critically, **today's `--shadow-*` tokens are all ink-black `rgba` values tuned for a white page and will simply not read on a dark canvas** — elevation is a from-scratch problem, not a token swap.

### What would it actually cost?
Not a token-file patch. Realistically: a real role-based token layer, an actual on-dark text scale (3-4 steps, replacing ~39 literals), a genuine elevation system built and tested for a dark canvas, and a full contrast re-audit that has to include the 222 raw references still living in the legacy stylesheet — because that CSS loads on every one of these four pages too. In scope, this sits closer to one of the four page revamps already shipped than to a color-swap.

### Should they do it at all?
For these specific four pages: **no, not yet — and the audit's own reasoning holds up.** Home, Pricing, About, and Media are pre-login marketing and trust-building pages, not the trading interface a funded client actually monitors during a session — that product is externally hosted at `trade.clientbridge.in`, entirely outside this codebase. "Financial professionals prefer dark interfaces" is a real argument for a trading dashboard used for extended sessions; it's a much weaker argument for a marketing site read in a handful of short visits before signup. The dashboard's dark-mode ROI case doesn't transfer to this asset.

**The move worth making regardless of that decision:** consolidate the ~19 ad hoc on-dark opacities into a real 3-4 step token scale now. It fixes a quiet inconsistency in today's shipped pages, it's the direct prerequisite if a dark theme is ever built, and it costs a fraction of the full project above.

---

## Prioritised Recommendations

### Now — this week (cheap, verified, no design decision required)

| Fix | Effort | Why it's Now |
|---|---|---|
| Pull forward the four pieces of content that already exist elsewhere in the codebase but never reached the page: estate-tax paragraph on Pricing (`registry.ts`), "what if Platizio fails" Q&A on About (`FAQs.tsx` id `sc-4`, near-verbatim ready), guidance SLA numbers on Home/About (`FAQs.tsx` ids `sp-1`/`gs-6`), ViewTrade's IFSCA registration no. + Platizio Services LLP's AMFI ARN on `Regulations.tsx` | S | Copy-and-place. Zero engineering risk, closes four real trust gaps a diligence-minded reader would notice. |
| Fix the two WCAG Level A failures on the ticker: screen-reader double-read (give `TickerItem` the clone prop `NewsRail.tsx:20-38` already has) and no pause path (add a visible pause/play control, or at minimum make ticker items focusable so the existing `:focus-within` rule has something to attach to) | S/M | Live financial data announced twice, or unstoppable for keyboard/touch users, on a regulated platform's flagship new feature — not a judgment call. |
| Fix the recurring gold-on-navy contrast failure on `.breadcrumb a` and `.hero-badge svg` | S | The exact fix already shipped once at `base.css:65`; this finishes it. |
| Restore the two dead footer anchors (`id="articles"`, `id="videos"` on `MediaPanels.tsx`/`VideoShowcase.tsx`) | S | 2-line fix for a bug the team's own `docs/04-decisions.md` explicitly relies on being fixed. |
| Fix the Node-verified rounding bug: reuse `lib/pricing.ts`'s own `roundHalfUp` inside `api/_lib/buildPayload.ts`'s `round()` | S | The codebase already fixed this exact bug once; it just didn't propagate to the live-quote pipeline. |
| Add `aria-live="polite"` to both calculators' result regions | S | The page's signature feature is currently silent to screen readers on every recalculation. |
| Give Pricing's and About's closing CTA section a landmark, copying `Regulations.tsx`'s own pattern | S | The highest-intent moment on both pages is unreachable by heading or region navigation today. |
| Add the one-line forex caveat to the calculator's `calc-note`, matching the honesty already shown for the FINRA exclusion | S | Closes the "silently excludes its largest line item" gap immediately, ahead of the fuller Pricing forex section below. |
| Ship three zero-risk, already-diagnosed cleanups: delete the two orphaned video files (77.5MB combined), re-add Media's `VideoObject` schema (generator already exists at `SEO.tsx:114`, just uncalled), bump the stale sitemap `lastmod` | S each | Single-file, no decision required, confirmed orphaned/regressed. |
| Reinstate 2-3 direct links from Home into the article library | S | Five-minute fix for a measured SEO/link-equity regression against `main`. |
| Small token/data consistency fixes: swap the newsletter's hardcoded `#FFB3C1` for `var(--loss-on-dark)`; source `FeesTable`'s third free-item row from `pricingRates.ts` instead of hand-typing it; trim the two unused font-weight cuts from the Google Fonts query string; add `aria-labelledby` to Home's why/how sections | S each | One-line swaps into patterns the team already got right everywhere else. |
| Update the stale `Platizio_Global_Revamp/README.md` to describe the shipped four-page scope | S | Cheap now; expensive if it causes wasted rediscovery right as multi-market work starts. |

### Next — this quarter (real work, real value)

| Fix | Effort | Why it's Next, not Now |
|---|---|---|
| Rewrite Home's fractional-investing pitch and raise the calculator's preset ceiling toward ~$100k | S | Trivial to edit, but a positioning call worth a deliberate pass, not a same-day copy swap. |
| Add a real forex/FX section to Pricing — name the partnered banks, give an indicative rate | M | Needs sourced content from the ViewTrade relationship, not just a code change. |
| Bring the hero and page-hero under the revamp's own CSS: quick win first (fix the orphaned `#14365E` literal, align `.step-icon` to `.feature-icon`'s gradient), full pass later | S then M | The site's two most-viewed surfaces are still 100% legacy-owned; the quick win is nearly free. |
| Decide and document where "market" lives (URL segment / switcher / parallel pages) | S | This one decision gates whether the four multi-market couplings below get fixed once, coherently, or three times independently. |
| Restructure `pricingRates.ts`'s `RATES` into a market-keyed map; get ViewTrade's explicit answer on whether their quotes endpoint serves non-US instruments at all | L each | Start now, while there's exactly one market to migrate — not after a second market's data is already flowing. Whether ViewTrade's Polygon-passthrough proxy even covers a second market is currently unverified, not just unbuilt. |
| Fix the news pipeline's allow-list/exclude-list conflict risk and the hardcoded `$`/2-decimal currency formatting | M/S | Dormant today, a launch-week surprise otherwise — cheap to fix while nothing depends on it yet. |
| Add route-level code splitting (`React.lazy`), starting with Articles/TopicHub/ArticlePage | M | Real payload reduction (688KB raw / 201.6KB gzip today, measured) but needs the SSR prerender path re-verified — a real task. |
| Add a leadership/seniority tier to About's team section; add named authorship to Media's articles | M/S | Needs real people and bios, not code. |
| Trial `--radius-lg` (14px) on primary CTAs instead of the 999px pill | M | A genuine design question — does it still read as clickable — that deserves a real pass, not a blind global swap. |
| Consolidate the ~19 on-dark opacity literals into a real 3-4 step token scale | M | Valuable regardless of the dark-theme decision; the direct prerequisite if one is ever built. |
| Fix the fluid-type-scale specificity loss on `.feature-card h3`/`.step-card h3`; add `<link rel=preload>` for the Google Fonts stylesheet | S each | Both trivial, both currently defeated/missing for structural (not oversight) reasons worth fixing properly. |

### Later — real, but gated or genuinely low-urgency

| Fix | Effort | Why it can wait |
|---|---|---|
| Live named-competitor cost comparison tool | L | Genuinely ownable, but needs sourced, dated competitor rate data and legal/accuracy review before publishing something that names rivals directly — sequence after the cheaper trust fixes above. |
| Rewrite the SIPC/DTCC custody framing for a second market | M | Cannot be written until compliance/legal produces that market's actual custody and protection facts. Flag to them now; no copy or code change is correct today. |
| Coordinated SEO/meta-copy pass removing "US"-specific language across Pricing/Media, and a broader pass on the 31-article library and `Products.tsx` | S/L | Correct and working today. The right time is a single coordinated pass 2-4 weeks before the second market's launch — editing now trades away current, correct search ranking for zero present benefit. |
| Delete ~400 lines of confirmed-dead legacy CSS (`.team-carousel`, `.promo-video`, `.yt-*`) | M | Safe (zero remaining references, grep-confirmed across the whole repo) but zero user-facing effect either way. |
| Resolve the ink-scale documentation-vs-reality gap: either build 1-2 genuine dark-on-dark layering moments, or simplify the token file's comment to match what's shipped | M | No visible defect today — this is a system-honesty cleanup, not a bug fix. |
| Decide whether Media's missing breadcrumb/page-level h1 is a permanent, intentional pattern (it was a deliberate, accessibility-reviewed choice) or should be reconciled with the other three pages | M | Revisit if/when page-to-page consistency becomes an explicit goal, not before. |
| Batch of cosmetic cleanup: trim Pricing/About meta descriptions to ~155 chars; extend the webp conversion script to team/article photos; add a `preconnect` for `img.youtube.com`; delete the dead `.skeleton-bar` reduced-motion rule; give About its own closing CTA instead of reusing Home's verbatim | S each | Bundle together whenever someone is already touching that file — none is worth a dedicated pass on its own. |
| Scope each page-specific stylesheet's import to its own page instead of the shared entry point | M | A real scaling risk as more pages are added — not a current emergency at 17.4KB gzip total. |

---

## Multi-Market Readiness Assessment

The roadmap calls for markets beyond the US within 2-3 months. The current codebase has **zero concept of "market" anywhere** — `Header.tsx` and `Products.tsx` are confirmed byte-identical to pre-revamp `main`, meaning even the shared chrome carries no market-awareness. Four subsystems each independently hardcode the US market:

| Subsystem | What's hardcoded | Evidence |
|---|---|---|
| Live quotes | Flat `NASDAQ_100` array, no market/exchange field anywhere from `useMarketData` down to the ViewTrade HTTP call; `DISPLAY_DECIMALS = 2` justified by "US equities are quoted in cents" | `data/marketUniverse.ts:11-30`, `api/_lib/viewtrade.ts:147`, `api/_lib/buildPayload.ts:22` |
| Pricing engine | `'SEC fee'`/`'FINRA transaction fee'` as literal strings in `TRADING_CHARGES`; `calculateTradeCost()` takes no market argument and its SEC-fee-on-sell branch is unconditional; regulator names hardcoded directly into calculator JSX | `data/pricingRates.ts:93,98`, `lib/pricing.ts:46,53`, `TradeCostCalculator.tsx:94-96` |
| News filter | `US_MARKET_KEYWORDS` allow-list paired with an `OTHER_MARKET` regex that explicitly *rejects* `sensex\|nifty\|ftse\|nikkei\|hang seng\|dax\|...` | `api/news.ts:47-49,56` |
| Custody Q&A | SIPC/DTCC framed as the complete, universal answer to "What protection applies?" — both are US-only institutions | `About.tsx:28-67` |

**The good news:** this isn't a full rebuild. Three of `pricingRates.ts`'s five categories (TCS, short-term/long-term capital gains) are already written in market-agnostic terms — "money remitted under the LRS," never "US" — only the SEC/FINRA/dividend-withholding portion is actually coupled. And the data model already carries the seam: `Quote.currency` flows end-to-end through `types/market.ts` and `buildPayload.ts` today, just unread by any display component yet.

**This is new debt, not inherited debt.** The original site had no live-data pipeline at all — `git show main:src/pages/Home.tsx` returns zero Nasdaq/trending/API references, and `api/` doesn't exist on `main`. The revamp's own genuine achievements — real live quotes, real fee-calculation functions, the custody Q&A promoted to About's headline structure — are exactly what turned shallow, easily-edited prose into deep, executable coupling. The better the US-only features got, the more expensive they became to generalize later.

**Recommended sequence, before any second-market UI work starts:**
1. Decide and document where "market" lives in the URL/component model (S) — this gates everything below.
2. Get ViewTrade's explicit confirmation on whether/how their quotes endpoint serves non-US instruments — `docs/03-viewtrade-api.md` never mentions a market parameter and tests only US symbols, so this is currently **unverified**, not just unbuilt.
3. Restructure `RATES` into a market-keyed map now, while there's exactly one entry to migrate.
4. Thread a `market` key through `Quote`/`QuotesResponse`/`useMarketData`/`api/quotes` so `TrendingBanner`/`PopularStocks` read their universe and label from a prop instead of a hardcoded `"Nasdaq-100"` string.
5. Split `US_MARKET_KEYWORDS`/`OTHER_MARKET` into a per-market config keyed the same way.
6. Fix the currency-symbol/decimal hardcoding — cheap now, a visible embarrassment (a `$` glued to a non-dollar number) the moment it isn't.
7. Flag the custody Q&A to compliance/legal in parallel, now — that content has its own lead time separate from engineering and can't be drafted the week of launch.

**Explicitly don't touch yet:** SEO titles/meta descriptions, the 31-article library, and `Products.tsx`'s content are all correctly US-specific today and premature to generalize before a second market is real.

---

## What NOT To Do

- **Don't build a full dark theme for these four pages right now.** The architecture cost is real (roughly one page-revamp's worth of work) and the ROI case ("financial professionals use dark interfaces") belongs to the actual trading dashboard at `trade.clientbridge.in`, which lives outside this codebase — not to pre-login marketing pages read in a few short sessions before signup. Do the cheap prerequisite (on-dark token consolidation) and stop there for now.
- **Don't force the ink scale's four unused steps into use just to "close the finding."** Inventing artificial visual layering to make `ink-950`/`ink-850`/`ink-600`/`ink-500` justify their own existence would add complexity with no design reason behind it. Either build 1-2 layering moments that earn their place, or shrink the token file's own comment to match what's actually shipped — don't manufacture usage.
- **Don't rewrite SEO titles and meta descriptions to be market-neutral today.** "Invest in US Stocks & ETFs from India" is the exact phrase this audience searches for right now, and it's currently ranking on it. Generalizing ahead of an actual second-market launch trades away working search equity for zero present benefit — do one coordinated pass 2-4 weeks out instead.
- **Don't self-host the three webfont families or build a bigger font pipeline than the problem calls for.** `display: swap` already prevents render-blocking; the entire realistic gain here is a single `<link rel=preload>` tag. Self-hosting adds build complexity for marginal improvement on an already-mitigated cost.
- **Don't build the live named-competitor comparison tool before the cheaper trust fixes.** It's the single largest-effort competitive recommendation in this report (L) and requires sourced, legally-reviewed data about named rivals. Shipping it before the registration number, the forex disclosure, and the CTA-shape trial — all cheaper, all higher-certainty wins — inverts the actual return on effort.
- **Don't purge the 74MB of orphaned video from git history.** Deleting the files from the working tree is sufficient and risk-free. Rewriting history to shrink the historical clone size disrupts every existing clone, branch, and PR reference for a benefit nobody has asked for.
- **Don't build out full market-segmented routing (e.g. `/us/pricing`) before a second market is actually confirmed.** The S-effort ask is to *decide and document* where market lives in the architecture — building the infrastructure itself, before there's a second market to serve, is speculative work against a roadmap that could still shift.
- **Don't reorder About's sections to put custody ahead of founder/team.** This was checked directly: the current order (mission → founder → team → custody → CTA) is a coherent, deliberate "people-first" narrative the page's own H1 ("The people behind your portfolio") supports, and the mission section already opens with a regulatory-credibility signal before the people sections. Moving custody earlier is a matter of editorial taste, not a defect — leave it as is.