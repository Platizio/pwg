# Marketing site redesign — design spec

Date: 4 September 2026. Status: approved by Aayush on 5 September 2026; in implementation. Not committed (no git writes until asked).

## 1. Goal and scope

Rebuild every marketing page from scratch as a clean, industrial, US-finance-platform site in the products page's cream-and-gold world, with midnight navy as night moments, immersive Lenis + motion scroll, and liquid-glass buttons and footer. The bar is an award-winning company home page.

**In scope (rebuilt):** `/`, `/pricing`, `/about`, `/media`, `/articles`, `/articles/topic/[topic]`, `/articles/[slug]`, `/faqs`, `/help`, `/user-guide`, `/terms`, `/privacy`, `/disclaimer`, the 404, and the shared chrome: Header, Footer, ContactModal, WhatsAppFloat, the site layout's stylesheet chain.

**Out of scope (untouched):** `/products` (`Platizio_Global_Revamp/pages/Products.tsx`, `styles/products.css`) and `/terminal` (everything under `app/terminal`, `components/terminal`, `components/dashboard`). They are the references. The shared chrome they render inside (header, footer, `.container`) changes; their own markup and sheets do not.

**Copy:** preserved word for word. Every heading, paragraph, fact, figure, rate, regulatory and legal sentence, anchor id and link destination carried over from the content inventory. The rebuild changes structure, layout, materials and motion, never content.

## 2. Pinned decisions (from Aayush)

1. Palette: the products page's cream and gold. Navy only as night moments: one instrument panel per page plus the footer.
2. Register: industrial and clean, like a US finance platform. No ornament, no lattices, no stamps, no engraving. Luxury comes from material and precision.
3. Components and card styling: the v4 draft at platizio-v4.vercel.app, and the `/products` page's cards.
4. Type: v4's faces. Newsreader (display, weight 400, negative tracking, true italic as the one emphasis device), Manrope (prose and labels), IBM Plex Mono (figures, tickers, provenance lines).
5. Motion: immersive. Lenis smooth scroll with `motion` scroll scenes. Liquid-glass buttons where an action matters, a liquid-glass footer.
6. Home section order: hero (text left, animation right), moving ticker, why invest with us, how to invest, simple clean fees, regulated, footer.

## 3. The visual system

### 3.1 Tokens

Declared once in `app/(site)/styles/tokens.css` on `:root`. Every sheet reads tokens; no page hardcodes a colour.

| Role | Token | Value | Source |
|---|---|---|---|
| Paper ground | `--paper` | `#f2ede5` | v4 light band, measured |
| Paper raised (cards) | `--paper-2` | `#fcf8f1` | v4 `bg-card`, measured |
| Paper sunken (bands) | `--paper-3` | `#e9e2d6` | current tokens |
| Ink | `--ink` | `#1a1207` | products page ink |
| Ink secondary | `--ink-2` | `#4a3f30` | products page |
| Ink muted | `--ink-3` | `#6b5f4e` | products page; 5.7:1 on paper |
| Gold fill (buttons, chips) | `--foil` | `#d9bd8b` | v4 button fill; never text on paper. Named `--foil`, not `--gold`: the legacy sheets still loaded during the transition use `--gold` for text |
| Gold highlight | `--foil-hi` | `#f0dcb8` | foil top edge |
| Gold deep | `--foil-deep` | `#b8945c` | hairlines and rules |
| Gold as text on paper | `--gold-text` | `#765a33` | the products page's `#7e6238` deepened one step: 5.5:1 on paper, 4.9:1 on the sunken paper |
| Ink on gold | `--on-gold` | `#1a1207` | 8:1+ on the fill |
| Navy (night) | `--navy` | `#0b1b33` | new |
| Navy lifted | `--navy-2` | `#12294a` | new |
| Navy raised | `--navy-3` | `#1b3660` | new |
| Cream on navy | `--night-ink` | `#f2ede5` | 15:1 on navy |
| Cream muted on navy | `--night-ink-2` | `rgba(242,237,229,.72)` | 9.9:1 |
| Gain on paper / navy | `--gain`, `--gain-n` | `#1b7a50`, `#7dd3a0` | products / terminal |
| Loss on paper / navy | `--loss`, `--loss-n` | `#b0392c`, `#e0796b` | products / terminal |
| Hairline | `--rule` | `rgba(26,18,7,.11)` | products page |
| Hairline strong | `--rule-2` | `rgba(26,18,7,.18)` | |
| Hairline on navy | `--rule-n` | `rgba(217,189,139,.18)` | gold, not white |
| Ease | `--ease` | `cubic-bezier(0.22,1,0.36,1)` | shared with the terminal |

Radii: cards `24px` (v4), tiles and inputs `16px`, chips `8px`, buttons and the nav pill `999px`. Shadows are warm and pooled under the object, never neutral: card rest `0 1px 2px rgba(26,18,7,.04), 0 2px 6px rgba(26,18,7,.05)`; card hover `0 2px 4px rgba(26,18,7,.04), 0 18px 44px -22px rgba(26,18,7,.30)`; gold action `0 14px 34px -14px rgba(184,148,92,.75)`. A 180px grain tile (v4's `--grain-tile`) sits over the navy surfaces only, at 5% opacity, as a cached background image, never a live filter.

Contrast is measured, not estimated: a test in `tests/` resolves every text token against the ground it is used on through `lib/css-audit.ts` and fails below 4.5:1 (3:1 for the 24px+ display sizes).

### 3.2 Type

Loaded through next/font in `app/layout.tsx`: `Newsreader` (400 and 500, normal and italic, already loaded), `Manrope` (400, 500, 600, 700, already loaded), `IBM_Plex_Mono` (400, 500, added). Exposed as `--display`, `--sans`, `--mono`.

| Role | Face | Size (fluid) | Weight | Tracking | Notes |
|---|---|---|---|---|---|
| Display (h1) | Newsreader | `clamp(2.75rem, 6.4vw, 6rem)` | 400 | −0.02em | line-height 1.04, `text-wrap: balance`, max 15ch |
| Section (h2) | Newsreader | `clamp(2rem, 3.8vw, 3.75rem)` | 400 | −0.02em | max 18ch |
| Card title (h3) | Newsreader | `1.5rem` | 400 | −0.01em | |
| Lede | Manrope | `clamp(1.0625rem, 1.3vw, 1.2rem)` | 400 | 0 | line-height 1.6, max 50ch |
| Body | Manrope | `1rem` | 400 | 0 | line-height 1.65, max 62ch |
| Eyebrow | Manrope | `0.6875rem` | 700 | 0.22em | uppercase, `--gold-text` on paper, `--foil` on navy |
| Label | Manrope | `0.625rem` | 700 | 0.16em | uppercase, `--ink-3` |
| Figure | IBM Plex Mono | context | 500 | 0.02em | `tabular-nums` always |
| Provenance | IBM Plex Mono | `0.6875rem` | 400 | 0.08em | delay, timestamp, universe |

The italic is used once per headline at most ("Invest *Globally* with Platizio."). Reading floor: nothing read is under 11px; body never under 15px.

### 3.3 Components

**Nav pill.** Floating, 60px, 1360px max, liquid glass on paper (see 3.4). Wordmark left, six links, `Contact Us` quiet button, `Start Investing` gold pill. Condenses on scroll without changing the rail's height (the existing two-threshold mechanism, kept). The drawer, focus trap and `inert` behaviour of the current Header are kept exactly.

**Buttons.** Three and only three.
- `gold`: `--foil` fill, `--on-gold` text, pill, 48px (40px in the nav), Manrope 500 14px. Liquid-glass foil: a specular that follows the pointer, a sweep on hover, a ripple on press, lift 2px. One per view.
- `glass`: the ghost. Transparent glass with a hairline, ink text on paper, cream text on navy. v4's `bg-white/10 + blur(8px)` translated to each ground.
- `quiet`: hairline only, no fill, for tertiary actions.
All 44px minimum, visible focus ring in `--gold-text` at 3px offset.

**Cards.** v4's sheet merged with the products page's edge: `--paper-2` ground, 24px radius, 28px padding, 1px `--rule` border, warm rest shadow, hover lifts 2px and warms the border to `rgba(126,98,56,.42)` (products page). Title in Newsreader 24px, body Manrope 15px `--ink-2`. Icon tile 40px, 12px radius, gold tint `rgba(217,189,139,.18)` with a gold hairline. No accent bars, no gradients on cards.

**Section head.** Eyebrow with a 24px gold rule, h2 left, body copy right-aligned to the same baseline, over a hairline. v4's numbered marker `(01)·(WHY GLOBAL)` is used only where sections form a real sequence (Home's why/how/fees/regulated; the products-style steps on Pricing and About).

**Ledger rows.** Term, dotted leader, mono value, hairline under each row. Free values in `--gain`.

**Accordion (FAQs).** v4's: full-width row, question 16px, a `+` that rotates to `×`, hairline between rows, native `<details>` so find-in-page and no-JS work.

**Ticker.** Full-bleed band on `--paper-3` with hairlines top and bottom, pinned label with the universe chip, a duplicated track translated −50% with spacing as item margin (never `gap`; `assertNoTrackGap` guards it), symbols in Manrope 600, prices and changes in Plex Mono, direction glyph plus sign.

**Night panel.** The one navy instrument per page: 24px radius, `--navy-2` to `--navy` gradient, `--rule-n` border, a gold top hairline brightest at the centre, grain at 5%, cream type, gold eyebrows, sage and terracotta for direction. Inside it, floating liquid-glass cards in the dark variant.

**Provenance line.** Wherever a price appears: delay, timestamp, universe, in Plex Mono 11px, never a footnote colour below 4.5:1.

### 3.4 Liquid glass

One material in two variants, in `app/(site)/styles/glass.css`, used on exactly five surfaces: the nav pill, the gold button, the glass button, the footer bar, and the night panel's floating cards.

- Ground: `color-mix(in srgb, var(--paper-2) 58%, transparent)` on paper; `rgba(18,41,74,.55)` on navy.
- Refraction: `backdrop-filter: blur(18px) saturate(170%)`, written as a literal (the build's minifier empties `@supports` bodies that use `var()`; `tests/guard-css-declarations.test.ts` enforces this).
- Lens edge: inset 1px top highlight, 1.5px inner ring at 35–40% white (gold-tinted on navy), a diagonal sheen gradient.
- Specular: a radial highlight positioned by `--mx`/`--my` custom properties set from `pointermove` by one document-level listener (`components/marketing/glass/use-specular.ts`), only for elements within 160px of the pointer.
- Press: a ripple from the pointer, 700ms, transform and opacity only.
- Never animate the blur. Never apply to a full-bleed area. `prefers-reduced-transparency` swaps to an opaque ground; `prefers-reduced-motion` removes the sweep and ripple.

### 3.5 Motion system

`app/(site)/motion-provider.tsx` (`MotionConfig reducedMotion="user"`) and `lib/scroll.ts` stay. Primitives live in `components/marketing/motion/`:

- `Reveal`: the existing server-visible pattern (`initial={false}`, hides only below-the-fold elements after mount, opacity and `y` only). Stagger capped at 0.06s per sibling, 5 siblings max.
- `Parallax` / `ScrollScene`: transform and opacity bound to `useSceneScroll`, `will-change` only while in view.
- `Pinned`: a section at least one viewport tall whose child scenes scrub with `useSceneScroll(ref, "pin")`.
- `Counter`: animates a figure once in view, reserving `widestSample` width so nothing beside it shifts.
- `Marquee`: the ticker track, geometry checked by `marqueeSeamDrift`.
- `ParticleField`: a canvas of gold particles on navy, v4's hero arc evolved: a slow-turning sphere of points with the New Delhi to New York route lit, pointer-parallaxed, paused off-screen and under reduced motion, DPR-capped at 2, one `requestAnimationFrame` loop.

Timing: feedback 120–150ms, state 200–300ms, layout 300–500ms, the hero entrance 600–800ms, all on `--ease`; exits faster than entrances. Lenis stays at 1.05s with `smoothWheel` and native touch.

**The one rehearsed sequence** is Home's hero: eyebrow and headline rise (staggered lines), the lede and actions follow, the night panel fades up with the particle globe already turning, the quote card slides in and its price counts to the live value, the ticket totals. 1.2s total. Everything else on the site is quiet supporting motion.

Under `prefers-reduced-motion`: no smoothing, no parallax, no pin scrub, no particles (a static gold constellation image renders instead), no counters, no sweeps. Content is always visible before any script runs.

## 4. Architecture

### 4.1 Files

```
app/(site)/
  layout.tsx                 imports the new chain, in order: tokens → base → glass → chrome → pages
  styles/
    tokens.css               3.1 and 3.2, :root only
    base.css                 reset, type roles, .container (1360), .section rhythm, focus, selection
    glass.css                3.4
    chrome.css               nav pill, drawer, footer, contact modal, whatsapp float
    home.css pricing.css about.css media.css library.css help.css legal.css
  page.tsx …                 unchanged route files; each still renders one view component
components/marketing/
  ui/        GoldButton, GlassButton, QuietButton, Card, Eyebrow, SectionHead, Ledger, Accordion, Provenance, NightPanel, Figure
  motion/    Reveal, Parallax, Pinned, Counter, Marquee, ParticleField, use-specular
  chrome/    Header, Footer, ContactModal, WhatsAppFloat
  home/      Hero, LiveRoute (night panel: quote card + one-share ticket + movers), Ticker, Why, How, Fees, Regulated
  pricing/ about/ media/ library/ help/ legal/  page sections
Platizio_Global_Revamp/      pages/Products.tsx, styles/products.css, components/, data/, hooks/, lib/ stay; Home.tsx, pages/Pricing.tsx, About.tsx, Media.tsx are deleted once their replacements ship
src/views/*                  become thin re-exports of the new page components (the route files import them)
```

Retired in P0: the old chrome sheets and the token overrides the new system replaces (`Platizio_Global_Revamp/styles/chrome.css`, `app/(site)/{glass,footer,design-system,marketing-tokens}.css`) plus the header, footer, skip-link, WhatsApp and gold-button sections of `css/styles.css`. The remaining legacy sheets (`css/styles.css`, `Platizio_Global_Revamp/styles/{tokens,base,page,home-market,pricing,about,media,help,library,legal}.css`, `app/(site)/marketing-surfaces.css`) keep loading beneath the new system until the page that needs each one ships, and are deleted in that page's phase; `tokens.css` carries a marked legacy-alias block for them until P6. Before deletion, P0 audits every class `Products.tsx` and its components use from those sheets (`container`, `sr-only` and any other) and re-declares them in `base.css` with the same values, so `/products` renders identically. The terminal imports none of these sheets.

### 4.2 Data and behaviour kept

- Live data: `useMarketData` (trending, popular, asOf, delayed), `useQuoteLookup` for the hero quote, `/api/news`, `/api/subscribe`, all fetched in effects only, null on the server and first client render.
- Rates: only `Platizio_Global_Revamp/data/pricingRates.ts` and `lib/pricing.ts`. The hero ticket calls `calculateTradeCost`; nothing retypes a rate.
- Scroll: `src/lib/smoothScroll.ts` and the `a[href^="#"]` interceptor in `site-chrome.tsx` stay; every in-page link keeps going through Lenis with the header offset.
- Content registries: articles, topics, FAQs, support tree, videos, team, news, untouched.
- SEO: `<SEO>` and its schema helpers untouched; every page passes the same title, description, canonical and JSON-LD as today.
- Anchors that other pages link to survive: `/#why`, `/media#articles`, `/media#videos`, `/faqs#<11 section ids>`, `/faqs#<71 item ids>`, `/pricing#schedule`, About's four ids, the topic hub's three, the legal TOC ids, article heading slugs.

## 5. Pages

Every page opens under the nav pill on paper (the first section still runs up behind the rail as chrome.css does today), uses the section rhythm `clamp(5rem, 9vw, 8.5rem)`, carries at most one night panel (the legal pages carry none) and ends in the navy footer.

### 5.1 Home (Persuade)

1. **Hero, split 1fr / 1.1fr at 1100px+.** Left: eyebrow, `Invest *Globally* with Platizio.`, lede, gold `Start investing` and glass `Explore products`, the three facts as a ruled definition list. Right: the night panel "the live route": the particle globe, the route New Delhi → New York, a floating glass quote card (company, symbol, live price with provenance, day change chip, 60-point sparkline from the last fetch), a floating "one share, all in" ticket (price, brokerage 0.29% min $1, IGST 18%, total) computed live, and four mover tiles. The quote defaults to AAPL and cycles through `POPULAR_8` every 8s (paused on hover, off under reduced motion). No price is invented: while loading, the card shows its skeleton at identical height.
2. **Ticker.** `TrendingBanner`'s data in the new band. The provenance line sits under it.
3. **Why invest with us** (`id="why"`). Section head, then the four cards on the 7/5, 5/7 grid, staggered reveal.
4. **How to invest.** A pinned section, two viewports tall. Left: the three steps as ruled rows with the `01 02 03` numerals; done steps ghost to 38%, the current step is bright with a 2px gold bar. Right, sticky: a product screen (a ruled form in the night-panel style) that advances through KYC → remittance → order as the scroll scrubs. Below the pin, the `Read first` links as a ruled list.
5. **Fees.** Section head, the ledger (five rows from the rate file) beside a card holding `0.29%` as a counter at display size with `per transaction · minimum $1 per order`, and the footnote with its link to `/pricing`.
6. **Regulated.** Four ruled tiles in one bordered group, the disclaimer paragraph, then the closing card with the gold action.
7. **Footer** (5.9).

### 5.2 Pricing (Persuade)

Hero split: copy left; the night panel is the calculator itself, `TradeCostCalculator` restyled as an instrument with the readout in mono and the `0.29%` figure above it. Then the full schedule as a ledger (`id="schedule"`), the four tax blocks as cards with `CapitalGainsCompare` inside its card, the close. Every exclusion note and rate line verbatim.

### 5.3 About (Persuade)

Hero split: copy and the on-page index left; right, the founder's photograph in a 24px card with his facts as a ruled list. Sections 01–04 as numbered section heads: prose with the aside as a card; the team as eight 24px cards with photos; the structure Q&A as ruled rows (never an accordion, as today); the close. The night panel here is the `Where your money actually sits` block: the four answers set on navy with gold eyebrows, because it is the page's proof.

### 5.4 Media (Read)

Hero with the three figures as counters. The news rail as the ticker band. Watch: the feature video in a 24px card with its play glyph, three rows beside it. Read: the five articles as ruled rows, the blog aside as a quiet card. The letter: the newsletter form inside the night panel, the input as a glass field, the status region kept. All YouTube thumbnails stay raw `<img>` with the documented fallback.

### 5.5 Articles library, topic hubs, article pages (Read)

Library: hero with the two figures, start-here as one lead card and two side cards, topics as a card grid, the index as ruled groups with the sticky rail. Topic hub: the same chassis with the dossier as a card and the rail with the three jumps. Article: the progress rule in gold, the masthead with the facts list, a sticky contents rail, prose at 62ch with Newsreader h2s, tables wrapped as today, the FAQ as real h3s, the close, related cards. The article page's night panel is the close ("Put it into practice"). The inline `<style>` sheets in `Articles.tsx` and `TopicHub.tsx` are replaced by `library.css`.

### 5.6 FAQs, Help, User guide (Read)

FAQs: hero, the six featured questions as the v4 accordion, the sticky 11-section rail, the eleven sections as accordions with every id intact, the disclaimer aside as a card, the close with three actions. Help: hero, the assistant panel restyled as a 24px card with a glass composer, the browse aside as ruled rows; all `support/*` logic untouched. User guide: hero, the three facts as cards, the two tracks as numbered ruled steps with the document rows as glass rows, the notes verbatim, the close.

### 5.7 Terms, Privacy, Disclaimer (Read)

One chassis: hero with the sub-line and effective date, the entity list as ruled rows, a sticky contents rail, numbered sections in the reading measure, the contact card. Text untouched. No night panel other than the footer.

### 5.8 404

Hero on paper with the code chip, the two actions, the five quick links as chips.

### 5.9 Header and footer

Header: 3.3's nav pill, same routes, same drawer behaviour and accessibility. Footer: navy, the closing statement at section size, the liquid-glass bar carrying the note and the gold `Open an account` plus the quiet `Talk to us first`, the five-column directory, the oversized wordmark at 6% cream, the record with the regulatory line verbatim, socials, legal links, app links, copyright. Contact modal and WhatsApp float restyled in the same tokens; their logic untouched.

## 6. Constraints

- WCAG AA measured by the token test in 3.1; every control 44px; focus visible everywhere; the drawer, modal and assistant keep their traps.
- Server HTML is the finished page: no `initial` hidden state, LCP elements never wrapped in motion, no `Intl`, `new Date()` or `window` at render scope.
- CSS: no `@supports` around `var()` filters, no property declared twice in a block, no empty declaration (existing guard tests), `background` longhands where `background-origin` matters, no `transition: all`.
- Performance: backdrop filters only on the five glass surfaces, one particle canvas per page paused off-screen, no `width`/`height`/`top` animations, `will-change` scoped to in-view scenes.
- `/products` and `/terminal` render byte-identically in their own markup; only the shared chrome around `/products` changes.

## 7. Testing

- Existing `npm test` suite stays green (CSS guards, motion geometry, market logic).
- New node tests: token contrast (3.1); hero ticket totals from `calculateTradeCost` for the sample prices; ticker geometry via `marqueeSeamDrift`; an anchor-inventory test that greps every rebuilt view for the ids listed in 4.2.
- `npm run build` passes (it runs `validate:support` first).
- Browser verification per page at 1440 and 390: no console errors, no horizontal scroll, reduced-motion renders static, the products page unchanged.

## 8. Phasing

Each phase is one implementation plan with its own review.

- **P0 Foundation:** tokens, base, glass, motion primitives, Header, Footer, ContactModal, WhatsAppFloat, the products compat audit, retire the old sheets, PRODUCT.md brand commitments updated to this system.
- **P1 Home.**
- **P2 Pricing.**
- **P3 About.**
- **P4 Media.**
- **P5 The article library:** index, topic hubs, article pages.
- **P6 Help centre:** FAQs, Help, User guide.
- **P7 Legal pages and 404,** then the retirement of every legacy stylesheet.
- **P8 Finish:** impeccable finish review over desktop and mobile captures, fixes, `DESIGN.md` written from the built system.

Plans: `docs/superpowers/plans/2026-09-04-p0-foundation.md`, `2026-09-04-p1-home.md`, `2026-09-05-p2-pricing.md`, `2026-09-05-p3-about.md`, `2026-09-05-p4-media.md`, `2026-09-05-p5-library.md`, `2026-09-05-p6-help.md`, `2026-09-05-p7-legal-404.md`, `2026-09-05-p8-finish.md`.
