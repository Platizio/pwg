---
name: Meridian
description: A private-markets terminal rendered as a hand-ruled ledger — champagne gilt on warm black, serif names, mono numerals.
colors:
  page: "#080706"
  shell: "#0b0a09"
  rail: "#0a0908"
  raised: "#15120f"
  rule: "#241f1a"
  rule-section: "#201b17"
  rule-list: "#1c1815"
  rule-table: "#16130f"
  rule-raised: "#34291f"
  rule-mono: "#3a2f22"
  rule-control: "#302821"
  rule-dot: "#2a231c"
  ink: "#f2ede5"
  ink-2: "#c7bfb4"
  ink-3: "#9a9186"
  ink-4: "#8a8076"
  gold: "#d9bd8b"
  gold-hi: "#f0dcb8"
  gold-dim: "#b8945c"
  gold-deep: "#8a6e43"
  on-gold: "#1a1207"
  up: "#7dd3a0"
  down: "#e0796b"
  on-down: "#1a0907"
  cta-gold-from: "#e8cfa3"
  cta-gold-to: "#c9a46f"
  cta-down-to: "#c9584a"
  mark-bone: "#e5ddd1"
  mark-sage: "#93c7a8"
  mark-slate: "#b0bfcb"
  mark-clay: "#c9a88a"
  bar-quiet: "#243029"
  share-3: "#4a3b26"
  share-4: "#221d18"
typography:
  display:
    fontFamily: "Outfit, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(2.625rem, 4vw, 3.625rem)"
    fontWeight: 400
    lineHeight: 0.9
    letterSpacing: "0.005em"
  figure:
    fontFamily: "Outfit, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(2.75rem, 3.5vw, 3.25rem)"
    fontWeight: 400
    lineHeight: 1
    letterSpacing: "normal"
  headline-xl:
    fontFamily: "Outfit, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(1.875rem, 3vw, 2.5rem)"
    fontWeight: 400
    lineHeight: 1
    letterSpacing: "0.005em"
  headline-lg:
    fontFamily: "Outfit, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.8125rem"
    fontWeight: 400
    lineHeight: 1
    letterSpacing: "0.01em"
  headline:
    fontFamily: "Outfit, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.625rem"
    fontWeight: 400
    lineHeight: 1
    letterSpacing: "0.02em"
  stat:
    fontFamily: "Outfit, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 400
    lineHeight: 1.1
    letterSpacing: "0.01em"
  section:
    fontFamily: "Outfit, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.625rem"
    fontWeight: 400
    lineHeight: 1.2
    letterSpacing: "normal"
  section-sm:
    fontFamily: "Outfit, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 400
    lineHeight: 1.2
    letterSpacing: "normal"
  title:
    fontFamily: "Outfit, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.3125rem"
    fontWeight: 400
    lineHeight: 1.3
    letterSpacing: "normal"
  readout:
    fontFamily: "Outfit, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.0625rem"
    fontWeight: 400
    lineHeight: 1.3
    letterSpacing: "0.01em"
    fontFeature: "tnum"
  title-sm:
    fontFamily: "Outfit, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 400
    lineHeight: 1.35
    letterSpacing: "normal"
  card-label:
    fontFamily: "Outfit, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: "0.005em"
  body-lg:
    fontFamily: "Outfit, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.84375rem"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "0.02em"
  body:
    fontFamily: "Outfit, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.84375rem"
    fontWeight: 400
    lineHeight: 1.75
    letterSpacing: "normal"
  label-lg:
    fontFamily: "Outfit, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 700
    lineHeight: 1.4
    letterSpacing: "0.14em"
  label:
    fontFamily: "Outfit, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.6875rem"
    fontWeight: 700
    lineHeight: 1.4
    letterSpacing: "0.18em"
  numeric-xl:
    fontFamily: "Outfit, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 400
    lineHeight: 1.3
    letterSpacing: "0.04em"
    fontFeature: "tnum"
  numeric-lg:
    fontFamily: "Outfit, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.84375rem"
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: "0.04em"
    fontFeature: "tnum"
  numeric:
    fontFamily: "Outfit, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: "0.05em"
    fontFeature: "tnum"
  numeric-sm:
    fontFamily: "Outfit, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: "0.06em"
    fontFeature: "tnum"
  numeric-xs:
    fontFamily: "Outfit, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.71875rem"
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: "0.08em"
    fontFeature: "tnum"
rounded:
  none: "0px"
  shell: "3px"
  full: "9999px"
spacing:
  hairline: "1px"
  bar: "2px"
  xs: "8px"
  sm: "12px"
  md: "18px"
  lg: "26px"
  xl: "34px"
  rail: "246px"
  aside: "358px"
components:
  button-primary:
    backgroundColor: "{colors.gold}"
    textColor: "{colors.on-gold}"
    typography: "{typography.label}"
    rounded: "{rounded.none}"
    padding: "0 24px"
    height: "44px"
  button-primary-hover:
    backgroundColor: "{colors.gold-hi}"
    textColor: "{colors.on-gold}"
  button-destructive:
    backgroundColor: "{colors.down}"
    textColor: "{colors.on-down}"
    typography: "{typography.label}"
    rounded: "{rounded.none}"
    padding: "16px 16px"
  button-outline:
    backgroundColor: "transparent"
    textColor: "{colors.ink-2}"
    typography: "{typography.label}"
    rounded: "{rounded.none}"
    padding: "0 20px"
    height: "44px"
  button-outline-hover:
    textColor: "{colors.gold}"
  segment:
    backgroundColor: "transparent"
    textColor: "{colors.ink-3}"
    typography: "{typography.numeric}"
    rounded: "{rounded.none}"
    padding: "0 16px"
    height: "44px"
  segment-active:
    backgroundColor: "rgba(217, 189, 139, 0.1)"
    textColor: "{colors.gold}"
  card:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    padding: "16px 0"
  card-positive:
    backgroundColor: "rgba(217, 189, 139, 0.07)"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    padding: "24px"
  list-row:
    backgroundColor: "transparent"
    textColor: "{colors.ink-2}"
    rounded: "{rounded.none}"
    padding: "10px 8px 10px 0"
    height: "44px"
  list-row-active:
    backgroundColor: "rgba(217, 189, 139, 0.06)"
    textColor: "{colors.ink}"
  chip-up:
    backgroundColor: "transparent"
    textColor: "{colors.up}"
    typography: "{typography.numeric}"
    rounded: "{rounded.none}"
    padding: "6px 12px"
  chip-down:
    backgroundColor: "transparent"
    textColor: "{colors.down}"
    typography: "{typography.numeric}"
    rounded: "{rounded.none}"
    padding: "6px 12px"
  notice-ok:
    backgroundColor: "rgba(217, 189, 139, 0.06)"
    textColor: "{colors.gold}"
    typography: "{typography.label}"
    rounded: "{rounded.none}"
    padding: "14px"
  notice-error:
    backgroundColor: "rgba(224, 121, 107, 0.14)"
    textColor: "{colors.down}"
    typography: "{typography.label}"
    rounded: "{rounded.none}"
    padding: "14px"
---

# Design System: Meridian

## Overview

**Creative North Star: "The Private Ledger"**

Meridian is a hand-ruled book of account rendered in light. Its structure comes from lines, not boxes: a hairline separates every row, every column, every section, and nothing is ever put in a card to make it look important. Names are set in a serif, figures in a monospace that holds its columns, and the labels between them are tiny and widely tracked, the way a printed ledger annotates its own margins. The ground is a warm near-black rather than a neutral grey, lit by a single radial wash of gold from above the fold and dusted with film grain, so the surface reads as paper in a dim room instead of glass in a bright one.

The system spends almost nothing so that a few things can be expensive. Champagne gilt appears on roughly a tenth of any screen — a 1px underline beneath the live tab, a 2px bar beside the current nav item, the previous-close reference on the chart, and exactly one filled gradient button. Everything else is ink on paper at four levels of quiet. Because so little is filled, the one gold CTA is unmissable without being loud, and a row can signal selection with nothing more than a hairline warming and eight pixels of indent.

Density is high but never cramped: this is a working instrument, read for long stretches by someone who already knows what the numbers mean. The confirmed anti-reference is the terminal this replaced — graphite ground, neon `#3BE081` accent, rounded filled cards from 9px to 22px, Space Grotesk throughout. Meridian is its opposite on every axis, and drifting back toward filled rounded panels is the specific failure mode to guard against.

**Key Characteristics:**
- Structure by hairline rule, never by card fill
- Three typefaces with strict jobs: serif names, mono numbers, sans labels
- Square by law — 0px radius everywhere except the 3px shell and true circles
- Gold as punctuation, not as surface
- Warm black ground with a gold wash and 5% film grain
- Micro-labels at 10px with 0.26em tracking as the connective tissue

## Colors

A warm, low-chroma palette: four levels of ink on four levels of near-black, one gilt accent, and a deliberately muted pair for direction.

### Primary
- **Champagne Gilt** (`{colors.gold}`): The single accent. Reserved for the active tab underline, the active nav bar, the live-market dot, section eyebrows that mark a live region, the analyst target figure, the previous-close reference line, and the primary CTA gradient. It is a punctuation mark, not a surface.
- **Gilt Highlight** (`{colors.gold-hi}`): Hover state for gilt text and links only. Never a fill.
- **Gilt Dim** (`{colors.gold-dim}`): Eyebrow labels that sit in a gilt context — the `$` before the price, "SEE MORE" affordances, source lines in the newswire.
- **Gilt Deep** (`{colors.gold-deep}`): Structural gilt at low emphasis — the dashed previous-close rule, the deeper stop of the revenue-bar gradient. Below the AA text floor; decoration only.
- **Ink on Gilt** (`{colors.on-gold}`): The near-black that sits on every gold fill. Measures 8.0–12.3:1 across the CTA gradient.

### Secondary
- **Sage** (`{colors.up}`): Upward movement — rising prices, positive returns, bullish signals, buy-side volume, the BUY segment. Muted deliberately; a saturated green would read as a different, louder product.
- **Terracotta** (`{colors.down}`): Downward movement, the SELL side, and rejected orders. Paired with **Ink on Terracotta** (`{colors.on-down}`) on the destructive gradient.

### Tertiary

The **instrument marks** — the only place the palette admits hues it doesn't otherwise use. Each is worn by a single serif letter inside a hairline square, never as a fill, which is what keeps six differently-coloured symbols from turning a page into confetti. Peers borrow from the same set in rotation.

- **Bone** (`{colors.mark-bone}`), **Sage Mark** (`{colors.mark-sage}`), **Slate** (`{colors.mark-slate}`), **Clay** (`{colors.mark-clay}`): The rotation. All four sit at 10–15:1 on the shell and share the palette's warmth; a cool or saturated mark colour would break the set.
- **Gradient stops** (`{colors.cta-gold-from}` → `{colors.cta-gold-to}`, and `{colors.down}` → `{colors.cta-down-to}`): The two CTA sweeps. They exist only inside those gradients and are never used as flat fills.
- **Quiet bar** (`{colors.bar-quiet}`) and **share steps** (`{colors.share-3}`, `{colors.share-4}`): Non-current revenue bars and the tail of the market-share split. Chart geometry, not surface colour.

### Neutral
- **Parchment** (`{colors.ink}`): Primary text — serif headings, price figures, values that matter. 17:1 on the shell.
- **Parchment Dim** (`{colors.ink-2}`): Secondary numerals — tape prices, unselected watchlist tickers, revenue figures.
- **Slate Grey** (`{colors.ink-3}`): The floor for anything read — eyebrows, subtitles, timestamps, exchange strings, muted captions. 6.4:1 on the shell, 4.8:1 at the brightest point of the wash.
- **Ash** (`{colors.ink-4}`): **Decoration only — retired as a text tone.** It measured 5.1:1 on the unlit shell, but the shell is now lit by the champagne wash, and against that ground it falls to 3.1:1. It survives on chart axis ticks and legend swatches, where nothing is read.
- **Ground** (`{colors.page}`), **Shell** (`{colors.shell}`), **Rail** (`{colors.rail}`), **Raised** (`{colors.raised}`): Four near-blacks separating page from terminal from rails from tooltip. They differ by 1–3 points of luminance; the separation is felt, not seen.
- **Rules** (`{colors.rule}` → `{colors.rule-table}`): A graded family of hairlines. Structural dividers use `rule`, section headers `rule-section`, list rows `rule-list`, table rows `rule-table`. Raised surfaces and monogram tiles use `rule-raised` and `rule-mono`.

### Named Rules

**The One Gold Rule.** Champagne gilt covers no more than ~10% of any screen, and exactly one *filled* gold element exists per view — the primary CTA. Everything else gilt is a line, a dot, or type. If a second gold fill appears, one of them is wrong.

**The Warm Black Rule.** No pure black and no neutral grey. Every ground and every rule carries red-yellow warmth (`#080706`, not `#000`; `#241f1a`, not `#222`). A cool grey anywhere in this system reads as a bug.

**The Muted Signal Rule.** Up and down are sage and terracotta, never saturated green and red. The palette states direction without shouting it, because a trader reads these for hours.

**The Decoration Floor Rule.** `gold-deep` (4.1:1), `ink-4` (3.1:1 on lit ground) and the chart gridlines sit below the AA text floor and may never carry text — they are rules, ticks and swatches only. Text bottoms out at `ink-3`.

**The Directional Ground Rule.** A coloured card ground is only allowed where the card's subject *is* a direction. Two cards qualify — Top gainers (`.card-up`, sage) and Top losers (`.card-down`, terracotta) — and nothing else does: "Most active" is ranked by value traded and holds both risers and fallers, so it keeps the common `.card`. Both tints peak at 0.10 for the same reason champagne does, and both were measured twice because each board sets text in its own signal colour: on sage, `ink-3` holds 4.98:1 and the sage figures 8.60:1; on terracotta, `ink-3` holds 5.25:1 and the terracotta figures 5.52:1 — the tightest pair on the page.

**The Feature Card Rule.** Three card surfaces exist and they are not interchangeable. `.card` is flat and is the default — the boards, the sector cards, the rails. `.card-lit` carries a directional champagne tint and belongs only to the two cards the page is built around: the market card and the popular ribbon. `.card-glow` is the single extravagance and is rarer still. The tint is what makes a card read as *chosen*; put it on every surface and it stops being light falling on a few things and becomes wallpaper. `.card-lit` peaks at 0.10 alpha, which is measured the same way the wash is: `ink-3` holds 4.96:1 on it, 4.52:1 at 0.14 with no headroom left, and fails AA by 0.16.

**The Lit Ground Rule.** The champagne wash is not decoration layered over the design; it is the light the design is read by, and it raises the ground's luminance 6.6x at its peak. Its 0.16 alpha is a measured ceiling, not a taste value: at 0.20 the dimmest text tone drops to 4.34:1 and the page stops meeting AA. Push the wash further only by bringing every text tone up with it.

## Typography

**One family:** Outfit (with `ui-sans-serif`, system-ui fallback), weights 300–700.

It replaces the three-face system this document originally recorded — Instrument Serif for names, IBM Plex Mono for figures, Manrope for labels. The replacement is not a preference: the pinned reference sets every one of those jobs in a single geometric sans, headline figures included, and a page that mixes a geometric display number with a monospaced column reads as two designs rather than one.

**Character:** Three *roles*, one family. Weight, size and tracking do the work three faces used to do.

- **Display** — names, headings, headline figures. Weight 500, tracking −0.018em. A geometric face at display size needs negative tracking where a serif did not; without it the large figures read loose and soft.
- **Figure** — anything sitting in a column. Weight 400, tracking 0, and `font-variant-numeric: tabular-nums`. The face is proportional, so alignment comes from tabular figures rather than from a monospaced design. Omit it and a price column visibly jitters as digits change, which is the most obvious tell of a non-financial UI.
- **Label** — micro-labels, prose, navigation. Weight 400–600 depending on size.

The CSS utilities are still named `.font-serif` and `.font-mono`. They are named for the *roles*, not the faces: neither is a serif or a monospace any more. Renaming them would touch ninety call sites for no behavioural gain, and the comment above each definition says so.

### Hierarchy

The serif carries a wide ramp because magnitude *is* the hierarchy in a ledger — a price, a target and a holder name are three different orders of importance and are sized accordingly. The sans and mono bands are deliberately narrow: six steps between 10px and 12.5px, because dense tabular reading wants consistency, not variety.

**Display role — Outfit 500, tracking −0.018em**
- **Display** (42→58px, line-height 0.9, 0.005em): The last-traded price. The largest thing on screen.
- **Figure** (44→52px): The analyst consensus target, set in gilt. The only other figure allowed near display size.
- **Headline XL** (30→40px): The company name in the instrument header.
- **Headline LG** (29px): The portfolio value in the rail — the sidebar's one hero figure.
- **Headline** (26px, 0.02em): The Meridian wordmark, the order-ticket title, and the quantity in the stepper.
- **Stat** (24px): The five intraday figures in the day-stats strip.
- **Section** (22px): Section headings in the working column.
- **Section SM** (21px): Section headings in the right rail, and the values in "Your position".
- **Title** (19px): The instrument name in the order ticket, and the compact mobile price.
- **Title SM** (17px): Peer names, institutional holder names, newswire headlines, and the account monogram.

**Label role — Outfit 400–600**
- **Card label** (500, 14px): The name of what a card is showing. Title case, not tracked caps. This is the label voice of the card surface, and it carries most of the naming on the dashboard.
- **Body LG** (600, 12.5px, 0.02em): Navigation items.
- **Body** (400, 12px, line-height 1.65): Insight bodies, the About paragraph, descriptive prose. Set in `ink-4` with `text-wrap: pretty`.
- **Label LG** (700, 11px, 0.16em, uppercase): Meter labels, legend entries, signal names.
- **Label** (700, 10px, 0.26em, uppercase): The signature move — eyebrows above every value, column headers, "MARKET OPEN", "PRIVATE EXECUTION DESK". Wide tracking at small size is what makes this read as a ledger rather than an app.

**Readout** (400, 17px, tabular): the secondary figures beside a hero — the indices the lead index is not. Above every label, below every heading; the tier the ramp was missing once one figure grew to display size.

**Figure role — Outfit 400, tabular figures**
- **Numeric XL** (400, 18px, 0.04em): The three index levels in the dashboard's session strip. The only mono figure allowed above 14px — it exists because those three numbers are the first thing the landing surface has to answer, and the serif is reserved for names and single hero magnitudes.
- **Numeric LG** (400, 12px, 0.06em): Ratio values, technical readings, order summary figures.
- **Numeric** (500, 11.5px, 0.06em): Watchlist tickers and peer-table figures.
- **Numeric SM** (400, 10.5px, 0.1em): Range labels, holder share counts, the portfolio position line.
- **Numeric XS** (400, 10px, 0.08em): The market tape, timestamps, and chart axis ticks.

### Named Rules

**The One Family Rule.** Every voice is Outfit. Hierarchy is carried by weight, size and tracking, never by reaching for a second family. Introducing a serif or a monospace anywhere in this system is now the mistake the Three Voices Rule used to guard against in the other direction.

**The Tabular Rule (unchanged, and now load-bearing).** Every figure that sits in a column carries `tabular-nums`. Under the three-face system the monospace enforced this for free; with a proportional family it is the only thing holding a column steady, so it is not optional.

**The Two Label Voices Rule.** The card surface names things in **Card label** — title case, 14px, `ink-3`. The tracked-caps **Label** survives only where something is genuinely being *annotated* rather than named: a role under a person's name, a status on a badge. Setting every label in tracked caps was what made the first build read as an eye chart; setting none of them that way would lose the ledger's voice entirely.

**The Tracked Caps Rule.** Micro-labels are **11px at 0.18em** (0.22em for section eyebrows), set in `ink-3`. The system shipped at 10px/0.26em first and that was wrong twice over: 72% of the dashboard's text landed at or under 11.5px, and at that size the extravagant tracking stops reading as refinement and starts reading as an eye chart. The character is carried by the caps and the weight, not by the smallness or by the extremity of the tracking.

**The Reading Floor Rule.** Nothing that is read is set below 11px, prose is 13.5px at 1.75 line-height, and comparable figures are 12.5–13.5px. A dense instrument is not the same thing as a small one.

**The Tabular Rule.** Every figure that sits in a column uses `font-variant-numeric: tabular-nums`. Prices that jiggle as they tick are the single most obvious tell of a non-financial UI.

## Layout

A fixed three-column terminal that degrades by dropping columns, never by shrinking them. At `xl` (≥1280px) the shell is `246px / 1fr / 358px` — navigation rail, working column, reference rail — capped at 1560px wide and centred with a 20px gutter. At `lg` (1024–1279px) the right rail leaves the grid and re-flows to the bottom of the working column as a full-width section, so its content is never compressed into a strip. Below `lg` the navigation rail becomes an off-canvas drawer behind a hamburger, and a sticky compact bar carries the symbol, price and change so the essentials survive scrolling.

Inside the working column the rhythm is 26px between major blocks and 34px between panel groups, with content padded 30px at desktop and 16px on mobile. Panels sit on a 1.25–1.4 : 1 asymmetric split — the denser side always on the left. Spacing is expressed almost entirely as gaps and hairlines; there is very little padding, because a ruled system gets its breathing room from the rules themselves.

The chart is the one fixed-height element: 340px at `lg`, 300px at `sm`, 240px on mobile, given over entirely to price. Its height is reserved before the canvas mounts so the page never shifts.

**The Rule-Not-Box Rule.** Sections are separated by a 1px rule and vertical space. If a grouping needs a background fill to be legible, the hierarchy is wrong — fix the spacing, not the surface.

**The Drop-Don't-Squeeze Rule.** Below a breakpoint, a column moves or leaves. Columns never narrow past their design width; a 358px reference rail at 240px is worse than no rail.

## Elevation & Depth

This system is flat. There is no elevation ladder, no resting shadow, and no surface that floats above another by default. Depth comes from three things instead: four near-black tones that separate page from shell from rail, a family of graded hairlines, and a radial gold wash that lights the top of the terminal. Film grain at 5% opacity over the whole shell ties those layers into one material.

**The wash belongs to the shell, not to the page.** It was originally set on `body`, where the opaque full-bleed shell covered every pixel of it — the light the entire design is lit by was being painted underneath an opaque sheet, and the terminal read as flat black. It now sits on the shell itself, and the rails are translucent (`rgba(10,9,8,0.66)`) rather than opaque so the same light carries across them at reduced strength. Opaque rails cut the wash into a stripe down the middle and made the terminal read as three unrelated panels.

Shadow appears in exactly four places, and in every case it marks *importance or displacement*, never rest.

### Shadow Vocabulary
- **Gilt bloom** (`box-shadow: 0 10px 34px rgba(217,189,139,0.22)` → hover `0 16px 44px rgba(217,189,139,0.36)`): The primary CTA only. A warm glow under the one gold element, growing on hover. This is the system's only coloured shadow.
- **Drawer cast** (`box-shadow: -40px 0 100px rgba(0,0,0,0.7)`): The order ticket sliding in from the right, marking it as displaced above the page.
- **Tooltip lift** (`box-shadow: 0 16px 34px rgba(0,0,0,0.7)`): The crosshair readout, which must stay legible over any part of the plot.
- **Shell seat** (`box-shadow: 0 50px 140px rgba(0,0,0,0.75)`): One very large, very soft shadow seating the whole terminal on the page. Desktop only.

**The No-Resting-Shadow Rule.** Nothing casts a shadow at rest. A card, a row or a panel with a `box-shadow` is out of system; if it needs separation, give it a rule.

**The Uncut-Wash Rule.** Nothing opaque may sit inside the wash's 440px reach without a reason that survives scrutiny. The instrument header broke this: it carried `bg-shell` at all times so that content could not scroll through it, and in doing so punched a hard-edged rectangle out of the light — the glow died at a razor edge along the chrome bar and the page below read as flat black. A ground that exists to hide scrolling content belongs to the *scrolled* state alone. It arrives with the pin and leaves with it, and at rest the light falls straight through.

Detecting the pin is the load-bearing half. `rootMargin` shrinks the observer's root rectangle and nothing else — an intermediate scroller still clips at its full height — so a sentinel watched against the implicit viewport root fires 24px after the pin, and for that scroll the header floats with nothing behind it. Name the scroller as the root, and shrink it by the block's own `top` plus the scroller's `padding-top`, because a sticky element pins against the padding edge rather than the scrollport.

**The Grain-Is-Material Rule.** The film grain is a single cached SVG-noise tile at 5% over `mix-blend-mode: overlay` — never a live `feTurbulence` filter, which re-rasterises on every paint.

## Shapes

Square by law. Radius is `0px` on every panel, button, input, chip, segment, tile and table cell. Two exceptions exist and only two: the terminal shell carries `3px` — just enough to stop the corner looking like a rendering error at 1560px — and genuinely circular elements (the account avatar, the pulsing market dot) use `9999px`.

The recurring silhouette is the bordered square: a 1px `rule-mono` outline holding a serif monogram, at 56px in the instrument header, 36px in the order ticket, and 26px in the peer table. The tile is never filled — the instrument's colour lives in the letter, not behind it, which is what keeps six differently-coloured symbols from turning the page into confetti.

Bars are hairlines too: meters are 2px, the analyst consensus split is 3px, the active-nav indicator is a 2px vertical bar, and legend swatches are a 1px line rather than a square chip.

**The Square Rule.** `border-radius: 0`. If a new component arrives with rounded corners, it was designed for a different system.

## Components

Refined and restrained. Controls are hairlines and space; nothing is filled except the single gold CTA. State is shown by a border warming to gold, a bar appearing, or a row indenting — never by a surface lighting up.

### Buttons
- **Shape:** Square (`0px`), 44px minimum height for touch.
- **Primary:** Gold gradient (`linear-gradient(135deg, #e8cfa3, #c9a46f)`) with near-black ink, 10px/0.22em uppercase label, 24px horizontal padding. Carries the gilt bloom shadow. There is one per view.
- **Hover / Focus:** Lifts 2px (`y: -2`), bloom grows; press scales to 0.985. Focus shows a 1px gold ring at 3px offset.
- **Outline:** Transparent with a `rule-control` hairline and `ink-2` label; the border warms to gold on hover. Used for FOLLOW and every secondary action.
- **Destructive:** The SELL confirm uses `linear-gradient(135deg, #e0796b, #c9584a)` with `#1a0907` ink — mirroring the primary's dark-ink-on-warm-gradient structure rather than inventing a light-on-red treatment, which measured 2.70:1 and failed AA.

### Chips
- **Style:** No fill. A 1px border tinted to the signal colour at 35% alpha, mono numerals in the signal colour, 6px/12px padding, square.
- **State:** Direction only — sage border for a gain, terracotta for a loss. Chips are read-only badges here, never controls.

### Segmented controls
- **Style:** A single `rule` border around the group, with 1px dividers between items. No radius, no gaps.
- **Active:** `rgba(217,189,139,0.1)` wash with gold text. Inactive is transparent with `ink-3`.
- **Used for:** Time range (1D…5Y), order side, order type. Chart type is a quiet toggle rather than a segment — see below.

### Quiet toggles
- **Style:** No border and no fill. Label and icon in `ink-3`, warming to `ink` on hover.
- **Active:** Label in `gold` over a 1px `gold` rule beneath the control.
- **Used for:** chart type (area/candles), and any control that is set once and then left alone.
- **Why:** boxing every control equally told the reader they were equally important. The range strip is reached for constantly and keeps its border; a control that is set once recedes to type and a rule. One bordered group per toolbar is the ceiling.

### Cards / Containers
- **Corner style:** `--radius-card` (16px); inner tiles `--radius-tile` (12px).
- **Background:** Five surfaces, per the Feature Card and Directional Ground rules. `.card` — `linear-gradient(180deg,#16130f,#131009)`, the default. `.card-lit` — the same ground under two champagne radials pooling at the top-left corner and the bottom-right, peak 0.10 alpha; feature cards only. `.card-glow` — the champagne pool, one per view at most. `.card-up` / `.card-down` — sage and terracotta at the same 0.10 peak, for the two boards whose subject is a direction and no others.
- **Shadow strategy:** Negative spread so the shadow pools *under* the card rather than haloing it: `0 16px 36px -22px rgba(0,0,0,0.9)`, and `0 20px 44px -22px` on `.card-lit`.
- **Border:** `1px rgba(217,189,139,0.07)`, rising to `0.13` on `.card-lit` so the lit cards are edged as well as filled. Every card also carries `.edge-lit` — a 1px top hairline brightest at the centre, the way a bevel picks up a lamp. This is the detail that separates a lit card from a filled one.
- **Internal padding:** 28px on feature cards, 20–24px on boards.

### List rows
- **Style:** Full-width, separated by a `rule-list` top border, 44px minimum height.
- **Hover / Active:** Indents 8px (`padding-left`) with a 0.28s ease and warms to a 4–6% gold wash; the active row also grows a 1px gold bar at its left edge. The indent is the signature interaction of the system.

### Data tables
- **Style:** A grid of hairline-separated rows with 10px tracked-caps column headers. Company names in serif, all figures in mono, right-aligned.
- **Self row:** The instrument being viewed is tinted `rgba(217,189,139,0.04)` to locate it among its peers.
- **Mobile:** Below `sm` the table collapses into per-item ruled blocks. It never scrolls sideways.

### The chrome bar
A single ruled strip at the head of the working column, on every route: the instrument search on the left, the session readout on the right. Both were somewhere else before — the search in a band of its own stacked above each page's header, the session state written by the dashboard and therefore stated on exactly one route.

The two ends share one anatomy on purpose: **mark, label, 1px `rule-mono` divider, mono tail**, inside a `rule-control` hairline pill at 44px. Neither carries a fill. Each warms independently — the readout to gold when the market is trading, the search when the reader is typing — so the bar is dark at rest and lights only where something is happening. A filled search box was the one filled surface in a terminal whose chrome is hairlines and space, and it read as an object sat on a shelf rather than a control belonging to the frame.

The search panel floats from a bare positioned wrapper, never from the panel itself: `.edge-lit` declares `position: relative` and sits in the same cascade layer as Tailwind's `absolute`, so a surface carrying both resolves to `relative` and takes the page with it.

Below `sm` the readout drops out — the compact bar above already names the session, and the two side by side leave the search a stub.

### Navigation
- **Style:** Text-only, no icons, 12.5px semibold at 0.02em.
- **States:** Inactive `ink-4`; hover warms to `ink`; active is `ink` with a 2px gold bar at the left edge. There is no fill, no pill and no underline.
- **Tabs:** 10px/0.24em uppercase with a 1px gold underline that slides between tabs on a spring. Roving tabindex; arrow keys move, Home/End jump, and selection follows focus.

### The Order Ticket (signature)
A right-hand drawer at 406px on desktop, a bottom sheet below `sm`. Ruled top to bottom: header, instrument strip, buy/sell segments, quantity stepper, order type, summary, CTA. Fills announce politely in gold; rejections announce assertively in terracotta, so a refused order can never be mistaken for a filled one.

### The Order Ticket (dual entry)
Fractional shares make "spend $500" as complete an instruction as "buy two shares", so the ticket's hero card holds both sides of `shares × price = amount` at once: one is the reader's field, the other is a derived readout, and a square hairline swap between them trades which is which. The presets follow the mode — round dollar amounts when entering an amount, a single "sell all" when entering a quantity, because nobody sells a round dollar amount of a holding.

Market, Limit and Stop loss are a row of three. Choosing either of the latter two opens a price field beneath them, and **the derived quantity is then computed against that price rather than the last trade** — deriving it from the last trade would print a fill the order cannot make.

**The One-Arithmetic Rule.** The readout, the summary, the button label and the fill all come from `lib/market/order.ts` and none of them does its own sum. A ticket whose button promises a quantity its fill does not deliver is the worst bug this surface can have, so the two are made incapable of disagreeing rather than tested for agreement.

**The desk never looks a price up.** The quote arrives whole from the page's own snapshot. It used to arrive as a ticker that the desk resolved against six hand-authored mock instruments, with a fallback to the first of them — so a ticket on a $310 Apple opened at 147.04, and a ticket on any of the other thirteen thousand names opened as Apple outright.

### The Price Chart (signature)
A TradingView lightweight-charts canvas dressed to the system: price ladder on the left in mono `ink-4`, gridlines in `#15120f` / `#131110`, a vertical-only gold crosshair at 40% alpha, and a dashed `gold-deep` previous-close reference with an axis label. The plot is price alone: a volume histogram sat in a second pane beneath it and was removed, because it competed for the same vertical attention while answering a question this reader was not asking. On every instrument or range change a curtain retracts left-to-right over 1.25s, revealing the plot. The canvas is invisible to assistive technology, so it ships with `role="img"`, a spoken summary, and a visually-hidden data table of the sampled series.

## Do's and Don'ts

### Do:
- **Do** separate things with a 1px rule and vertical space. The Rule-Not-Box Rule is the system's spine.
- **Do** keep radius at `0px`. Only the shell (3px) and true circles are exempt.
- **Do** set every voice in Outfit, separating them by weight, size and tracking, and give every column figure `tabular-nums`.
- **Do** keep exactly one filled gold element per view, and let everything else gilt be a line, a dot or type.
- **Do** show state by warming a border to gold, revealing a 2px bar, or indenting a row 8px.
- **Do** give every interactive element a 44px minimum touch target and a 1px gold focus ring at 3px offset.
- **Do** colour direction with sage (`{colors.up}`) and terracotta (`{colors.down}`), and pair destructive gradients with dark ink.
- **Do** keep text at `ink-4` (5.1:1) or lighter, and confine `gold-deep` and the gridline tones to decoration.
- **Do** drop a column at a breakpoint rather than narrowing it.
- **Do** animate on `cubic-bezier(0.22, 1, 0.36, 1)`, and guard every motion path with a `prefers-reduced-motion` branch.

### Don't:
- **Don't** put content in a filled, rounded card. That is the previous system, and it is the specific drift this document exists to prevent.
- **Don't** add a resting `box-shadow`. Shadow marks displacement or the one CTA, never rest.
- **Don't** introduce a pure black, a neutral grey, or a cool-toned hairline. Every ground and rule is warm.
- **Don't** saturate the up/down colours toward neon green and red.
- **Don't** set a label below 10px, or drop the 0.26em tracking to fit more in — re-word instead.
- **Don't** introduce a second family. One family, three roles, separated by weight and tracking.
- **Don't** use a second gold fill. If two gold surfaces are on screen, one is wrong.
- **Don't** let a data table scroll sideways on mobile; collapse it into ruled blocks.
- **Don't** ship the grain as a live `feTurbulence` filter — it must stay a cached noise tile.
- **Don't** rely on `AnimatePresence` for unmounting in this stack; presence is owned by `lib/use-presence.ts`.
