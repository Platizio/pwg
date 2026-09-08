# P0 Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put the new marketing design system in place (tokens, base type, liquid glass, motion primitives, buttons) and rebuild the shared chrome (header, footer, contact modal, WhatsApp float) on it, without breaking `/products`, `/terminal` or the pages that are rebuilt in later phases.

**Architecture:** A four-sheet chain under `app/(site)/styles/` (`tokens → base → glass → chrome`) loads after the legacy sheets and wins the cascade; `tokens.css` also carries a marked legacy-alias block so the not-yet-rebuilt pages keep their paper tones. Chrome components move to `components/marketing/chrome/`, motion primitives to `components/marketing/motion/`, and every pure helper they need lives in `lib/motion.ts` where the node test suite can reach it. The old chrome sheets and the header/footer/WhatsApp/skip-link/gold-button sections of `css/styles.css` are removed so nothing fights the new chrome.

**Tech Stack:** Next.js 16 App Router, React 19, `motion` 12, Lenis 1.3, next/font (Newsreader, Manrope, IBM Plex Mono), plain CSS with custom properties, `node --test` for pure logic and the CSS guard tests.

**Ground rules for every task:**
- No git writes. Do not commit, branch, stash or create worktrees; Aayush asked for the working tree to stay uncommitted until he says otherwise. Each task ends with a verification step instead of a commit.
- Never touch `Platizio_Global_Revamp/pages/Products.tsx`, `Platizio_Global_Revamp/styles/products.css`, or anything under `app/terminal`, `components/terminal`, `components/dashboard`.
- CSS rules that the guard tests enforce (`tests/guard-css-declarations.test.ts`): no `@supports` around a `backdrop-filter` that uses `var()`, no property declared twice in one block, no declaration without a value.
- Every colour comes from `app/(site)/styles/tokens.css`. No new hex literals in any other sheet except inside `rgba()` shadows that the tokens file also defines.
- Run from the repo root `/Users/aayushsharma/Desktop/PWG/pwg new`. Tests: `npm test`. Types: `npx tsc --noEmit`. Lint: `npm run lint`.

---

## File structure

| File | Responsibility |
|---|---|
| `app/layout.tsx` | Loads IBM Plex Mono and Manrope 700 through next/font (Modify) |
| `app/(site)/styles/tokens.css` | Every token, plus the legacy-alias block (Create) |
| `app/(site)/styles/base.css` | Ground, type roles, `.wrap`, `.band`, `.eyebrow`, `.label`, figures, compat classes, marquee track (Create) |
| `app/(site)/styles/glass.css` | The liquid-glass material and the three buttons (Create) |
| `app/(site)/styles/chrome.css` | Nav pill, drawer, under-bar rule, footer, WhatsApp float, skip link (Create) |
| `app/(site)/layout.tsx` | The new import chain and the new chrome components (Modify) |
| `app/(site)/site-chrome.tsx` | Mounts the specular and ripple listeners once (Modify) |
| `lib/motion.ts` | Pure helpers: `pointerFraction`, `specularVars` (Modify) |
| `tests/specular.test.ts` | Tests for the pure helpers (Create) |
| `tests/tokens-contrast.test.ts` | Measures every text/ground pair in tokens.css (Create) |
| `components/marketing/motion/reveal.tsx` | Server-visible entrance reveal (Create) |
| `components/marketing/motion/use-specular.ts` | One document listener writing `--mx/--my` onto `[data-glass]` (Create) |
| `components/marketing/motion/ripple.ts` | Press ripple on `.btn-gold` (Create) |
| `components/marketing/motion/marquee.tsx` | The ticker track (Create) |
| `components/marketing/motion/counter.tsx` | Width-reserving count-up (Create) |
| `components/marketing/ui/buttons.tsx` | `GoldButton`, `GlassButton`, `QuietButton` (Create) |
| `components/marketing/chrome/header.tsx` | The nav pill (Create, from `src/components/Header.tsx`) |
| `components/marketing/chrome/footer.tsx` | The navy footer with the glass bar (Create, from `src/components/Footer.tsx`) |
| `components/marketing/chrome/contact-modal.tsx` | The modal, restyled CSS constant (Create, from `src/components/ContactModal.tsx`) |
| `components/marketing/chrome/whatsapp-float.tsx` | Glass pill with the green disc (Create, from `src/components/WhatsAppFloat.tsx`) |
| `css/styles.css` | Chrome sections removed by script (Modify) |
| `PRODUCT.md` | Brand commitments updated (Modify) |
| Deleted | `src/components/Header.tsx`, `src/components/Footer.tsx`, `src/components/ContactModal.tsx`, `src/components/WhatsAppFloat.tsx`, `components/marketing/glass-button.tsx`, `Platizio_Global_Revamp/styles/chrome.css`, `app/(site)/glass.css`, `app/(site)/footer.css`, `app/(site)/design-system.css`, `app/(site)/marketing-tokens.css` |

---

### Task 1: Fonts

**Files:**
- Modify: `app/layout.tsx`

- [ ] **Step 1: Add IBM Plex Mono and Manrope 700**

In `app/layout.tsx`, change the import line and the two font constants:

```tsx
import { IBM_Plex_Mono, Manrope, Newsreader, Outfit } from "next/font/google";
```

Replace the `manrope` constant with:

```tsx
const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

/* Figures, tickers and provenance lines. Loaded at two weights only: 500 for
   figures that carry a value, 400 for the provenance line under them. */
const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
});
```

Change the `<html>` className to include the new variable:

```tsx
className={`${outfit.variable} ${newsreader.variable} ${manrope.variable} ${plexMono.variable} h-full antialiased`}
```

- [ ] **Step 2: Verify types**

Run: `npx tsc --noEmit`
Expected: no errors.

---

### Task 2: Token contrast test, then the tokens

**Files:**
- Create: `tests/tokens-contrast.test.ts`
- Create: `app/(site)/styles/tokens.css`

- [ ] **Step 1: Write the failing test**

Create `tests/tokens-contrast.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { contrastRatio, customProperties, parseCss, parseColor, resolveVars } from "../lib/css-audit.ts";

/* The marketing tokens, measured.
 *
 * Every text tone is used on a known ground, and a tone that reads on one
 * ground fails on another: the products page learned that --champagne is 1.9:1
 * as words on paper. So the pairs are listed here, with the ground each tone
 * is allowed on, and the WCAG ratio is computed from the file rather than
 * remembered from a comment. 4.5:1 is the AA floor for text; 3:1 for the
 * display sizes (24px+) and for control boundaries. */

const path = fileURLToPath(new URL("../app/(site)/styles/tokens.css", import.meta.url));
const css = readFileSync(path, "utf8");
const vars = customProperties(parseCss(css), (p) => p === ":root");

function color(name: string) {
  const value = resolveVars(`var(${name})`, vars);
  const parsed = parseColor(value);
  assert.ok(parsed, `${name} did not resolve to a measurable colour (got "${value}")`);
  return parsed;
}

const TEXT_PAIRS: Array<[fg: string, bg: string, floor: number]> = [
  ["--ink", "--paper", 4.5],
  ["--ink", "--paper-2", 4.5],
  ["--ink", "--paper-3", 4.5],
  ["--ink-2", "--paper", 4.5],
  ["--ink-2", "--paper-2", 4.5],
  ["--ink-3", "--paper", 4.5],
  ["--ink-3", "--paper-2", 4.5],
  ["--ink-3", "--paper-3", 4.5],
  ["--gold-text", "--paper", 4.5],
  ["--gold-text", "--paper-2", 4.5],
  ["--gold-text", "--paper-3", 4.5],
  ["--on-gold", "--foil", 4.5],
  ["--on-gold", "--foil-hi", 4.5],
  ["--gain", "--paper", 4.5],
  ["--loss", "--paper", 4.5],
  ["--night-ink", "--navy", 4.5],
  ["--night-ink", "--navy-2", 4.5],
  ["--night-ink", "--navy-3", 4.5],
  ["--night-ink-2", "--navy", 4.5],
  ["--night-ink-2", "--navy-2", 4.5],
  ["--night-ink-3", "--navy", 4.5],
  ["--foil", "--navy", 4.5],
  ["--foil", "--navy-2", 4.5],
  ["--gain-n", "--navy", 4.5],
  ["--loss-n", "--navy", 4.5],
];

for (const [fg, bg, floor] of TEXT_PAIRS) {
  test(`${fg} on ${bg} clears ${floor}:1`, () => {
    const ratio = contrastRatio(color(fg), color(bg));
    assert.ok(ratio >= floor, `${fg} on ${bg} measures ${ratio.toFixed(2)}:1, below ${floor}:1`);
  });
}

test("the fill gold is never a text tone: it fails AA on paper, which is why --gold-text exists", () => {
  const ratio = contrastRatio(color("--foil"), color("--paper"));
  assert.ok(ratio < 4.5, `--foil on --paper unexpectedly reads (${ratio.toFixed(2)}:1); the split into fill and text tokens is no longer needed`);
});

test("every token the chrome reads is declared", () => {
  for (const name of [
    "--paper", "--paper-2", "--paper-3", "--ink", "--ink-2", "--ink-3",
    "--foil", "--foil-hi", "--foil-deep", "--gold-text", "--on-gold",
    "--navy", "--navy-2", "--navy-3", "--night-ink", "--night-ink-2", "--night-ink-3",
    "--gain", "--loss", "--gain-n", "--loss-n",
    "--rule", "--rule-2", "--rule-n", "--rule-n2",
    "--r-card", "--r-tile", "--r-chip", "--r-pill",
    "--shadow-card", "--shadow-card-hover", "--shadow-gold", "--shadow-night",
    "--display", "--sans", "--mono",
    "--size-display", "--size-h2", "--size-h3", "--size-lede",
    "--section", "--section-tight", "--gutter", "--measure",
    "--ease", "--t-fast", "--t", "--t-slow",
    "--bar-inset", "--bar-h", "--grain",
  ]) {
    assert.ok(vars.has(name), `${name} is not declared on :root in tokens.css`);
  }
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --conditions=react-server --test tests/tokens-contrast.test.ts`
Expected: FAIL with `ENOENT` reading `app/(site)/styles/tokens.css`.

- [ ] **Step 3: Create the tokens file**

Create `app/(site)/styles/tokens.css`:

```css
/* The marketing site's tokens. One :root, every sheet reads from here.
 *
 * Ground is the products page's cream, ink is its warm brown-black, gold is
 * split into a FILL (--foil, the v4 button colour, which measures 1.9:1 as
 * words on paper) and a TEXT tone (--gold-text, 5.5:1 on paper, 4.9:1 on the
 * sunken paper of the ticker band). Navy is the night:
 * it appears on at most one instrument panel per page and on the footer.
 *
 * tests/tokens-contrast.test.ts measures every pair below against the ground
 * it is used on. Change a value here and the test says whether it still reads.
 */

:root {
  /* ------------------------------------------------------------ ground */
  --paper: #f2ede5;
  --paper-2: #fcf8f1;
  --paper-3: #e9e2d6;

  /* --------------------------------------------------------------- ink */
  --ink: #1a1207;
  --ink-2: #4a3f30;
  --ink-3: #6b5f4e;

  /* -------------------------------------------------------------- gold */
  --foil: #d9bd8b;
  --foil-hi: #f0dcb8;
  --foil-deep: #b8945c;
  --gold-text: #765a33;
  --on-gold: #1a1207;

  /* ------------------------------------------------------------- night */
  --navy: #0b1b33;
  --navy-2: #12294a;
  --navy-3: #1b3660;
  --night-ink: #f2ede5;
  --night-ink-2: rgba(242, 237, 229, 0.72);
  --night-ink-3: rgba(242, 237, 229, 0.58);

  /* ----------------------------------------------------------- signals */
  --gain: #1b7a50;
  --loss: #b0392c;
  --gain-n: #7dd3a0;
  --loss-n: #e0796b;
  --gain-wash: rgba(27, 122, 80, 0.1);
  --loss-wash: rgba(176, 57, 44, 0.1);

  /* ------------------------------------------------------------- rules */
  --rule: rgba(26, 18, 7, 0.11);
  --rule-2: rgba(26, 18, 7, 0.18);
  --rule-n: rgba(217, 189, 139, 0.18);
  --rule-n2: rgba(217, 189, 139, 0.32);

  /* ------------------------------------------------------------- radii */
  --r-card: 24px;
  --r-tile: 16px;
  --r-chip: 8px;
  --r-pill: 999px;

  /* ----------------------------------------------------------- shadows */
  --shadow-card: 0 1px 2px rgba(26, 18, 7, 0.04), 0 2px 6px rgba(26, 18, 7, 0.05);
  --shadow-card-hover: 0 2px 4px rgba(26, 18, 7, 0.04), 0 18px 44px -22px rgba(26, 18, 7, 0.3);
  --shadow-gold: 0 14px 34px -14px rgba(184, 148, 92, 0.75);
  --shadow-night: 0 40px 100px -40px rgba(11, 27, 51, 0.7);

  /* -------------------------------------------------------------- type */
  --display: var(--font-newsreader), Georgia, "Times New Roman", serif;
  --sans: var(--font-manrope), ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
  --mono: var(--font-plex-mono), ui-monospace, "SF Mono", Menlo, monospace;

  --size-display: clamp(2.75rem, 6.4vw, 6rem);
  --size-h2: clamp(2rem, 3.8vw, 3.75rem);
  --size-h3: 1.5rem;
  --size-lede: clamp(1.0625rem, 1.3vw, 1.2rem);

  /* ------------------------------------------------------------ rhythm */
  --section: clamp(5rem, 9vw, 8.5rem);
  --section-tight: clamp(3rem, 5vw, 4.5rem);
  --gutter: clamp(1.25rem, 4vw, 3rem);
  --measure: 1360px;

  /* ------------------------------------------------------------ motion */
  --ease: cubic-bezier(0.22, 1, 0.36, 1);
  --t-fast: 140ms;
  --t: 260ms;
  --t-slow: 420ms;

  /* ------------------------------------------------------------ chrome */
  /* The rail's inset and the pill's height. Five sheets size sticky offsets
     and scroll margins off these two, so they are declared once. */
  --bar-inset: 14px;
  --bar-h: 70px;

  /* ------------------------------------------------------------- grain */
  /* v4's tile. A cached raster, never a live filter. Used on navy only. */
  --grain: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='180' height='180'><filter id='g' x='0' y='0' width='180' height='180' filterUnits='userSpaceOnUse' color-interpolation-filters='sRGB'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/><feColorMatrix type='saturate' values='0'/></filter><rect width='180' height='180' filter='url(%23g)'/></svg>");
}

/* ======================================================================
   LEGACY ALIASES — delete this block in P6.

   The pages not yet rebuilt (pricing, about, media, articles, help, legal)
   still load css/styles.css and the revamp sheets, which read the names
   below. These re-point every one of them at the new palette so those pages
   stay paper-toned until their own phase replaces them. Nothing new may
   read a name from this block.
   ====================================================================== */
:root {
  --paper-raised: var(--paper-2);
  --paper-sunken: var(--paper-3);
  --white: var(--paper-2);
  --surface: var(--paper);
  --surface-sunken: var(--paper-3);
  --surface-raised: var(--paper-2);

  --ink-900: var(--ink);
  --ink-800: #2b251d;
  --ink-700: #5a5044;
  --navy-deep: var(--navy);
  --navy-soft: var(--navy-3);

  --gray-800: var(--ink);
  --gray-700: #443c31;
  --gray-600: var(--ink-3);
  --gray-500: #8b8172;
  --gray-400: #a89e8d;
  --gray-300: #c9c0af;
  --gray-200: #ddd5c6;
  --gray-100: var(--paper-3);
  --gray-50: #f7f4ee;

  --champagne: var(--foil);
  --champagne-deep: #9f7e47;
  --gold: var(--gold-text);
  --gold-hi: #5f4926;
  --gold-deep: #9f7e47;
  --gold-light: var(--foil);
  --gold-gradient: linear-gradient(135deg, var(--foil-hi) 0%, var(--foil) 40%, var(--foil-deep) 100%);
  --gold-gradient-h: linear-gradient(90deg, var(--foil-hi) 0%, var(--foil) 40%, var(--foil-deep) 100%);
  --accent-300: #e6d3ae;
  --accent-400: var(--foil);
  --accent-500: #9f7e47;
  --accent-600: var(--gold-text);
  --accent-700: #5f4926;

  --wash: rgba(217, 189, 139, 0.22);
  --wash-soft: rgba(217, 189, 139, 0.12);
  --m-tint-shared: rgba(217, 189, 139, 0.22);

  --gain-on-dark: var(--gain-n);
  --loss-on-dark: var(--loss-n);
  --emerald: var(--gain);

  --line: var(--rule);
  --line-strong: rgba(26, 18, 7, 0.2);
  --line-on-dark: var(--rule-n);
  --line-on-dark-strong: var(--rule-n2);
  --rule-hair: rgba(26, 18, 7, 0.09);
  --rule-hair-2: rgba(26, 18, 7, 0.13);

  --font: var(--sans);
  --font-mono: var(--mono);
  --font-display: var(--display);
  --font-body: var(--sans);
  --ease-out: var(--ease);

  --glass-ground: var(--paper-2);
  --glass-ink: 26, 18, 7;
  --glass-accent: var(--gold-text);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --conditions=react-server --test tests/tokens-contrast.test.ts`
Expected: PASS, every pair. If `--night-ink-3` on `--navy` fails, raise its alpha to `0.62` and re-run; do not lower the floor.

- [ ] **Step 5: Run the whole suite**

Run: `npm test`
Expected: all pass (660 + the new ones).

---

### Task 3: base.css

**Files:**
- Create: `app/(site)/styles/base.css`

- [ ] **Step 1: Create the sheet**

```css
/* Base: the ground, the type roles, the layout rhythm, and the handful of
 * classes the products page and the legacy sheets share.
 *
 * Loads after tokens.css and after every legacy sheet, so where a legacy
 * sheet sets the same property at the same specificity, this wins.
 */

/* ================================================================ ground */

:root {
  color-scheme: light;
  accent-color: var(--gold-text);
  caret-color: var(--gold-text);
  scrollbar-color: rgba(26, 18, 7, 0.22) transparent;
  scrollbar-width: thin;
}

/* app/globals.css paints html and body with the terminal's near-black page
   colour for every route. The marketing site is paper to the very top of the
   viewport, overscroll included. */
html {
  background-color: var(--paper);
}

body {
  margin: 0;
  background: var(--paper);
  color: var(--ink);
  font-family: var(--sans);
  font-size: 1rem;
  line-height: 1.65;
  font-weight: 400;
  -webkit-font-smoothing: antialiased;
  font-synthesis-weight: none;
}

::selection {
  background: rgba(217, 189, 139, 0.45);
  color: var(--ink);
}

::-webkit-scrollbar { width: 11px; height: 11px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb {
  background: rgba(26, 18, 7, 0.18);
  border: 3px solid var(--paper);
  border-radius: var(--r-pill);
}
::-webkit-scrollbar-thumb:hover { background: rgba(26, 18, 7, 0.3); }

:where(a, button, input, select, textarea, [tabindex]):focus-visible {
  outline: 2px solid var(--gold-text);
  outline-offset: 3px;
  border-radius: 3px;
}

a {
  color: inherit;
  text-decoration-thickness: from-font;
  text-underline-offset: 0.18em;
}

/* ================================================================== type */

h1, h2, h3, .display {
  font-family: var(--display);
  font-weight: 400;
  color: var(--ink);
  text-wrap: balance;
  margin: 0;
}

h1 {
  font-size: var(--size-display);
  line-height: 1.04;
  letter-spacing: -0.02em;
  max-width: 15ch;
}

h2 {
  font-size: var(--size-h2);
  line-height: 1.06;
  letter-spacing: -0.02em;
  max-width: 18ch;
}

h3 {
  font-size: var(--size-h3);
  line-height: 1.25;
  letter-spacing: -0.01em;
}

/* The one emphasis device: a true italic clause inside a roman headline. */
h1 em, h2 em, .display em {
  font-style: italic;
  font-weight: 400;
  color: inherit;
}

p { margin: 0; text-wrap: pretty; }

.lede {
  font-size: var(--size-lede);
  line-height: 1.6;
  color: var(--ink-2);
  max-width: 50ch;
}

.body {
  line-height: 1.65;
  color: var(--ink-2);
  max-width: 62ch;
}

/* Tracked caps with a short gold rule. The section marker on every page. */
.eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 0.75rem;
  margin: 0;
  font-family: var(--sans);
  font-size: 0.6875rem;
  font-weight: 700;
  line-height: 1.4;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: var(--gold-text);
}
.eyebrow::before {
  content: "";
  width: 24px;
  height: 1px;
  border-radius: 0;
  background: var(--foil-deep);
}
.eyebrow--bare::before { content: none; }
.night .eyebrow { color: var(--foil); }
.night .eyebrow::before { background: var(--foil); }

.label {
  font-family: var(--sans);
  font-size: 0.625rem;
  font-weight: 700;
  line-height: 1.4;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--ink-3);
}

/* Figures never jitter: every digit is one width. */
.figure, .num, [data-num] {
  font-family: var(--mono);
  font-variant-numeric: tabular-nums;
  font-feature-settings: "tnum" 1;
}

.provenance {
  font-family: var(--mono);
  font-size: 0.6875rem;
  font-weight: 400;
  line-height: 1.5;
  letter-spacing: 0.08em;
  color: var(--ink-3);
}
.night .provenance { color: var(--night-ink-3); }

/* ================================================================ layout */

.wrap {
  width: 100%;
  max-width: var(--measure);
  margin-inline: auto;
  padding-inline: var(--gutter);
}

.band { padding-block: var(--section); }
.band--tight { padding-block: var(--section-tight); }

.rule {
  height: 1px;
  border: 0;
  margin: 0;
  background: var(--rule);
}

/* The night surface. At most one instrument panel per page carries it, and
   the footer. Cream type, gold rules, a 5% grain so it reads as material
   rather than as a flat fill. */
.night {
  position: relative;
  background: linear-gradient(180deg, var(--navy-2), var(--navy) 70%);
  color: var(--night-ink);
}
.night::before {
  content: "";
  position: absolute;
  inset: 0;
  pointer-events: none;
  background-image: var(--grain);
  background-size: 180px 180px;
  opacity: 0.05;
  mix-blend-mode: overlay;
  border-radius: inherit;
}
.night::after {
  content: "";
  position: absolute;
  inset: 0 0 auto;
  height: 1px;
  pointer-events: none;
  background: linear-gradient(90deg, transparent, var(--foil), transparent);
  border-radius: inherit;
}

/* ================================================================ marquee */

/* One list rendered twice, translated -50%. Spacing is margin on the ITEM;
   a gap on the track makes the wrap land one gap short (lib/motion.ts). */
.marquee {
  overflow: hidden;
  -webkit-mask-image: linear-gradient(90deg, transparent, #000 4%, #000 96%, transparent);
  mask-image: linear-gradient(90deg, transparent, #000 4%, #000 96%, transparent);
}
.marquee-track {
  display: flex;
  width: max-content;
  animation: marquee var(--marquee-duration, 46s) linear infinite;
}
.marquee:hover .marquee-track,
.marquee:focus-within .marquee-track { animation-play-state: paused; }
.marquee-item { flex: none; margin-inline-end: var(--marquee-spacing, 2rem); }
@keyframes marquee {
  from { transform: translate3d(0, 0, 0); }
  to { transform: translate3d(-50%, 0, 0); }
}

/* ========================================= shared with the products page */

/* The products page overrides this to 1360 under .ft; the legacy pages keep
   the 1200 reading measure until they are rebuilt. */
.container {
  max-width: var(--container, 1200px);
  margin: 0 auto;
  padding: 0 1.5rem;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
  border: 0;
}

/* QuoteChange. The arrow is load-bearing (WCAG 1.4.1), never remove it. */
.quote-change {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  font-family: var(--mono);
  font-weight: 500;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.quote-arrow { width: 9px; height: 9px; flex: none; }
.quote-change--inline { font-size: 0.875rem; }
.quote-change--inline.is-up { color: var(--gain); }
.quote-change--inline.is-down { color: var(--loss); }
.quote-change--inline.is-flat { color: var(--ink-3); }
.night .quote-change--inline.is-up { color: var(--gain-n); }
.night .quote-change--inline.is-down { color: var(--loss-n); }
.night .quote-change--inline.is-flat { color: var(--night-ink-3); }
.quote-change--chip {
  font-size: 0.75rem;
  padding: 0.3rem 0.5rem;
  border-radius: var(--r-chip);
  border: 1px solid transparent;
}
.quote-change--chip.is-up { color: var(--gain); background: var(--gain-wash); }
.quote-change--chip.is-down { color: var(--loss); background: var(--loss-wash); }
.quote-change--chip.is-flat { color: var(--ink-3); background: var(--paper-3); }
.night .quote-change--chip.is-up { color: var(--gain-n); background: transparent; border-color: rgba(125, 211, 160, 0.4); }
.night .quote-change--chip.is-down { color: var(--loss-n); background: transparent; border-color: rgba(224, 121, 107, 0.4); }
.night .quote-change--chip.is-flat { color: var(--night-ink-3); background: transparent; border-color: var(--rule-n); }

/* MarketNote. The disclosure under every block of prices. */
.market-note {
  margin-top: 1.25rem;
  font-family: var(--mono);
  font-size: 0.6875rem;
  line-height: 1.55;
  letter-spacing: 0.04em;
  color: var(--ink-3);
  text-align: center;
}
.market-note a {
  color: var(--ink-2);
  text-decoration: underline;
  text-underline-offset: 2px;
  text-decoration-color: var(--rule-2);
}
.market-note a:hover { color: var(--gold-text); text-decoration-color: currentColor; }
.market-note--dark { color: var(--night-ink-3); }
.market-note--dark a { color: var(--night-ink-2); }
.market-note--dark a:hover { color: var(--foil); }

@media (prefers-reduced-motion: reduce) {
  .marquee-track { animation: none; }
}
```

- [ ] **Step 2: Verify the guard tests accept it**

Run: `npm test`
Expected: all pass (the CSS guards read every `.css` file in the tree).

---

### Task 4: glass.css

**Files:**
- Create: `app/(site)/styles/glass.css`

- [ ] **Step 1: Create the sheet**

```css
/* Liquid glass.
 *
 * One material, two variants, five surfaces: the nav pill, the gold button,
 * the glass button, the footer bar, and the floating cards inside a night
 * panel. backdrop-filter is priced per painted area, so it never goes on a
 * full-bleed region and the blur radius is never animated.
 *
 * The specular follows the pointer through --mx/--my, written by
 * components/marketing/motion/use-specular.ts onto every [data-glass]
 * element within reach. The material is complete without it.
 *
 * Every backdrop-filter is written as a literal: this build's CSS minifier
 * empties any @supports body that uses var() (tests/guard-css-declarations).
 */

.glass {
  position: relative;
  isolation: isolate;
  background: color-mix(in srgb, var(--paper-2) 58%, transparent);
  border: 1px solid rgba(26, 18, 7, 0.09);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.75),
    inset 0 -1px 0 rgba(26, 18, 7, 0.05),
    0 1px 2px rgba(26, 18, 7, 0.05),
    0 12px 32px -16px rgba(26, 18, 7, 0.25);
  backdrop-filter: blur(18px) saturate(170%);
  -webkit-backdrop-filter: blur(18px) saturate(170%);
}

/* The lens edge: an inner ring and a diagonal sheen, so the object reads as
   having thickness rather than as a tinted rectangle. */
.glass::before {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: inherit;
  pointer-events: none;
  z-index: -1;
  box-shadow: inset 0 0 0 1.5px rgba(255, 255, 255, 0.4), inset 0 0 20px rgba(255, 255, 255, 0.35);
  background: linear-gradient(115deg, rgba(255, 255, 255, 0.4), transparent 42%, transparent 58%, rgba(255, 255, 255, 0.2));
}

/* The specular. Lives on ::after so it never covers content. */
.glass::after {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: inherit;
  pointer-events: none;
  background: radial-gradient(200px 100px at var(--mx, 30%) var(--my, 20%), rgba(255, 255, 255, 0.6), transparent 60%);
  opacity: 0;
  transition: opacity var(--t-slow) var(--ease);
}
.glass:hover::after,
.glass:focus-within::after { opacity: 1; }

.glass--dark {
  background: rgba(18, 41, 74, 0.55);
  border-color: rgba(217, 189, 139, 0.22);
  box-shadow:
    inset 0 1px 0 rgba(240, 220, 184, 0.35),
    0 20px 60px -20px rgba(0, 0, 0, 0.6);
  color: var(--night-ink);
}
.glass--dark::before {
  box-shadow: inset 0 0 0 1px rgba(240, 220, 184, 0.12), inset 0 0 24px rgba(240, 220, 184, 0.08);
  background: linear-gradient(115deg, rgba(240, 220, 184, 0.18), transparent 40%, transparent 60%, rgba(240, 220, 184, 0.08));
}
.glass--dark::after {
  background: radial-gradient(220px 110px at var(--mx, 30%) var(--my, 20%), rgba(240, 220, 184, 0.35), transparent 60%);
}

/* ================================================================ buttons */

/* Shared anatomy. 44px minimum everywhere; the nav uses --sm at 40px, which
   is the one exception and is why the pill can be 60px tall. */
.btn-gold,
.btn-glass,
.btn-quiet {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.6rem;
  min-height: 48px;
  padding-inline: 1.5rem;
  border-radius: var(--r-pill);
  font-family: var(--sans);
  font-size: 0.875rem;
  font-weight: 500;
  line-height: 1;
  letter-spacing: 0.01em;
  white-space: nowrap;
  text-decoration: none;
  cursor: pointer;
  transition:
    transform var(--t) var(--ease),
    border-color var(--t) var(--ease),
    background-color var(--t) var(--ease),
    color var(--t) var(--ease),
    box-shadow var(--t-slow) var(--ease);
}
.btn-gold svg,
.btn-glass svg,
.btn-quiet svg {
  width: 16px;
  height: 16px;
  flex: none;
  transition: transform var(--t-slow) var(--ease);
}
.btn-gold:hover svg,
.btn-glass:hover svg { transform: translateX(3px); }
.btn--sm { min-height: 40px; padding-inline: 1.1rem; font-size: 0.8125rem; }
.btn--lg { min-height: 52px; padding-inline: 1.75rem; font-size: 0.9375rem; }

/* The primary action. Gold foil in glass: one per view. */
.btn-gold {
  position: relative;
  isolation: isolate;
  overflow: hidden;
  border: 0;
  color: var(--on-gold);
  font-weight: 600;
  background: linear-gradient(120deg, #efd9b0 0%, var(--foil) 34%, #c7a468 58%, #e6cc9f 100%);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.75),
    inset 0 -1px 0 rgba(90, 60, 20, 0.25),
    0 1px 2px rgba(26, 18, 7, 0.15),
    var(--shadow-gold);
}
/* The optically-variable flash: a soft-light highlight at the pointer. */
.btn-gold::before {
  content: "";
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: radial-gradient(220px 120px at var(--mx, 20%) var(--my, 30%), rgba(255, 255, 255, 0.65), rgba(255, 255, 255, 0) 60%);
  mix-blend-mode: soft-light;
}
/* The sweep on hover. Transform only. */
.btn-gold::after {
  content: "";
  position: absolute;
  inset: 0;
  pointer-events: none;
  border-radius: inherit;
  background: linear-gradient(105deg, transparent 35%, rgba(255, 255, 255, 0.55) 48%, transparent 60%);
  transform: translateX(-120%);
  transition: transform 0.9s var(--ease);
}
.btn-gold:hover {
  transform: translateY(-2px);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.8),
    inset 0 -1px 0 rgba(90, 60, 20, 0.25),
    0 2px 4px rgba(26, 18, 7, 0.15),
    0 22px 50px -16px rgba(184, 148, 92, 0.9);
}
.btn-gold:hover::after { transform: translateX(120%); }
.btn-gold:active { transform: translateY(0) scale(0.985); }

/* The press ripple, appended by components/marketing/motion/ripple.ts. */
.btn-gold .ripple {
  position: absolute;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.6);
  transform: translate(-50%, -50%) scale(0);
  animation: ripple 0.7s var(--ease) forwards;
  pointer-events: none;
}
@keyframes ripple {
  to { transform: translate(-50%, -50%) scale(40); opacity: 0; }
}

/* The ghost. Glass with a hairline; ink on paper, cream on navy. */
.btn-glass {
  position: relative;
  isolation: isolate;
  color: var(--ink);
  border: 1px solid var(--rule-2);
  background: color-mix(in srgb, var(--paper-2) 40%, transparent);
  backdrop-filter: blur(8px) saturate(140%);
  -webkit-backdrop-filter: blur(8px) saturate(140%);
}
.btn-glass:hover {
  border-color: var(--gold-text);
  transform: translateY(-2px);
}
.btn-glass--dark {
  color: var(--night-ink);
  border-color: var(--rule-n2);
  background: rgba(242, 237, 229, 0.08);
}
.btn-glass--dark:hover { border-color: var(--foil); }

/* The quiet button: a hairline and nothing else. */
.btn-quiet {
  color: var(--ink-2);
  border: 1px solid var(--rule-2);
  background: transparent;
}
.btn-quiet:hover {
  color: var(--ink);
  border-color: var(--ink-3);
  background: var(--paper-3);
}
.night .btn-quiet {
  color: var(--night-ink-2);
  border-color: var(--rule-n2);
}
.night .btn-quiet:hover {
  color: var(--night-ink);
  border-color: var(--foil);
  background: rgba(242, 237, 229, 0.06);
}

/* ============================================================== opt-outs */

/* Reduced transparency: a real opaque ground, not a thinner blur. */
@media (prefers-reduced-transparency: reduce) {
  .glass,
  .btn-glass {
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
    background: var(--paper-2);
  }
  .glass--dark,
  .btn-glass--dark { background: var(--navy-2); }
  .glass::before,
  .glass::after { display: none; }
}

/* Reduced motion: the material stays, the movement goes. */
@media (prefers-reduced-motion: reduce) {
  .glass::after,
  .btn-gold::after,
  .btn-gold .ripple { display: none; }
  .btn-gold,
  .btn-glass,
  .btn-quiet,
  .btn-gold svg,
  .btn-glass svg { transition: none; }
  .btn-gold:hover,
  .btn-glass:hover,
  .btn-gold:active { transform: none; }
}
```

- [ ] **Step 2: Verify the guard tests accept it**

Run: `npm test`
Expected: all pass.

---

### Task 5: Pure motion helpers, test first

**Files:**
- Create: `tests/specular.test.ts`
- Modify: `lib/motion.ts` (append)

- [ ] **Step 1: Write the failing test**

Create `tests/specular.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { pointerFraction, specularVars, SPECULAR_REACH } from "../lib/motion.ts";

/* The pointer, as a fraction of an element's box.
 *
 * Both the glass specular and the press ripple position themselves from this
 * one number pair, so it is computed once, here, where a test can reach it. */

const box = { left: 100, top: 50, width: 200, height: 40 };

test("the pointer at the box's top-left corner is 0%, 0%", () => {
  assert.deepEqual(pointerFraction(box, 100, 50), { x: 0, y: 0 });
});

test("the pointer at the centre is 50%, 50%", () => {
  assert.deepEqual(pointerFraction(box, 200, 70), { x: 50, y: 50 });
});

test("a zero-size box answers the centre rather than dividing by zero", () => {
  assert.deepEqual(pointerFraction({ left: 0, top: 0, width: 0, height: 0 }, 10, 10), { x: 50, y: 50 });
});

test("specular vars are percentages with one decimal", () => {
  assert.deepEqual(specularVars(box, 150, 60), { mx: "25.0%", my: "25.0%" });
});

test("a pointer beyond the reach returns null so the element is left alone", () => {
  assert.equal(specularVars(box, 100 - SPECULAR_REACH - 1, 60), null);
  assert.equal(specularVars(box, 300 + SPECULAR_REACH + 1, 60), null);
  assert.equal(specularVars(box, 150, 50 - SPECULAR_REACH - 1), null);
  assert.notEqual(specularVars(box, 100 - SPECULAR_REACH, 60), null);
});

test("outside the box but inside the reach still answers, so the highlight leads the pointer in", () => {
  const v = specularVars(box, 80, 60);
  assert.ok(v);
  assert.equal(v.mx, "-10.0%");
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --conditions=react-server --test tests/specular.test.ts`
Expected: FAIL, `pointerFraction` is not exported from `lib/motion.ts`.

- [ ] **Step 3: Append the helpers to `lib/motion.ts`**

Append at the end of `lib/motion.ts`:

```ts
/* ================================================================ specular

   The liquid-glass specular and the press ripple both need the pointer as a
   fraction of an element's box. One pure function, so a test can pin the
   arithmetic and the two effects can never disagree about where "here" is.
*/

export type Box = { left: number; top: number; width: number; height: number };

/** The pointer as percentages of the box. A degenerate box answers its centre. */
export function pointerFraction(box: Box, x: number, y: number): { x: number; y: number } {
  return {
    x: box.width > 0 ? ((x - box.left) / box.width) * 100 : 50,
    y: box.height > 0 ? ((y - box.top) / box.height) * 100 : 50,
  };
}

/** How far outside an element the specular still follows the pointer, in px. */
export const SPECULAR_REACH = 160;

/**
 * The `--mx` / `--my` values for a glass element, or null when the pointer is
 * beyond its reach and the element should be left as it was.
 *
 * Percentages rather than pixels so the same value survives a resize, and one
 * decimal so successive frames do not thrash the style attribute with noise.
 */
export function specularVars(
  box: Box,
  x: number,
  y: number,
  reach = SPECULAR_REACH,
): { mx: string; my: string } | null {
  if (
    x < box.left - reach ||
    x > box.left + box.width + reach ||
    y < box.top - reach ||
    y > box.top + box.height + reach
  ) {
    return null;
  }
  const f = pointerFraction(box, x, y);
  return { mx: `${f.x.toFixed(1)}%`, my: `${f.y.toFixed(1)}%` };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --conditions=react-server --test tests/specular.test.ts`
Expected: PASS, 6 tests.

---

### Task 6: Motion primitives

**Files:**
- Create: `components/marketing/motion/use-specular.ts`
- Create: `components/marketing/motion/ripple.ts`
- Create: `components/marketing/motion/reveal.tsx`
- Create: `components/marketing/motion/marquee.tsx`
- Create: `components/marketing/motion/counter.tsx`

- [ ] **Step 1: The specular listener**

Create `components/marketing/motion/use-specular.ts`:

```ts
"use client";

import { useEffect } from "react";
import { specularVars } from "@/lib/motion";

/**
 * One document-level pointer listener that writes `--mx` / `--my` onto every
 * `[data-glass]` element within reach of the pointer.
 *
 * One listener rather than one per element: the nav, three buttons and a
 * footer bar would otherwise each attach their own, and each would read its
 * own box on every move. This reads the boxes once per animation frame and
 * writes only what changed. Under reduced motion it does nothing at all; the
 * material is complete without the highlight.
 */
export function useSpecular(): void {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (!window.matchMedia("(hover: hover)").matches) return;

    let frame = 0;
    let px = 0;
    let py = 0;

    const paint = () => {
      frame = 0;
      const nodes = document.querySelectorAll<HTMLElement>("[data-glass]");
      for (const el of nodes) {
        const r = el.getBoundingClientRect();
        const v = specularVars({ left: r.left, top: r.top, width: r.width, height: r.height }, px, py);
        if (!v) continue;
        el.style.setProperty("--mx", v.mx);
        el.style.setProperty("--my", v.my);
      }
    };

    const onMove = (e: PointerEvent) => {
      px = e.clientX;
      py = e.clientY;
      if (!frame) frame = requestAnimationFrame(paint);
    };

    document.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      document.removeEventListener("pointermove", onMove);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);
}
```

- [ ] **Step 2: The ripple**

Create `components/marketing/motion/ripple.ts`:

```ts
"use client";

import { useEffect } from "react";
import { pointerFraction } from "@/lib/motion";

/** How long the ripple element stays in the DOM; matches the keyframe. */
const RIPPLE_MS = 800;

/**
 * A press ripple on every `.btn-gold`, delegated from the document so a button
 * rendered later still gets one. Transform and opacity only; the element is
 * removed when the animation is over.
 */
export function useRipple(): void {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const onDown = (e: PointerEvent) => {
      const target = (e.target as HTMLElement | null)?.closest?.(".btn-gold");
      if (!(target instanceof HTMLElement)) return;
      const r = target.getBoundingClientRect();
      const f = pointerFraction({ left: r.left, top: r.top, width: r.width, height: r.height }, e.clientX, e.clientY);
      const dot = document.createElement("span");
      dot.className = "ripple";
      dot.setAttribute("aria-hidden", "true");
      dot.style.left = `${f.x}%`;
      dot.style.top = `${f.y}%`;
      target.appendChild(dot);
      window.setTimeout(() => dot.remove(), RIPPLE_MS);
    };

    document.addEventListener("pointerdown", onDown, { passive: true });
    return () => document.removeEventListener("pointerdown", onDown);
  }, []);
}
```

- [ ] **Step 3: Reveal**

Create `components/marketing/motion/reveal.tsx`:

```tsx
"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ElementType, type ReactNode } from "react";
import { motion, useInView, useReducedMotion } from "motion/react";
import { EASE } from "@/lib/tokens";

/*
 * Entrance motion that server-renders VISIBLE.
 *
 * motion serialises `initial` into the server HTML, so `initial={{ opacity: 0 }}`
 * ships the page invisible to anyone whose JavaScript never runs. The server
 * renders the finished state (`initial={false}`); the hidden state is applied
 * only on the client, in a layout effect, and only to elements that start
 * below the fold, where nobody can watch them being hidden. Hiding is instant
 * and only the reveal is animated, so a fast scroll never catches an element
 * halfway through disappearing.
 *
 * Opacity and transform only. Never wrap an LCP element or an element whose
 * children are position: sticky (a transformed ancestor breaks sticky).
 */
const RISEN = { opacity: 1, y: 0 };
const WAITING = { opacity: 0, y: 22 };

const useMeasureEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

type Props = {
  children: ReactNode;
  className?: string;
  /** Seconds. Siblings stagger by passing `index * 0.06`. */
  delay?: number;
  /** The element to render. Defaults to a div. */
  as?: "div" | "li" | "section" | "article" | "span";
};

export function Reveal({ children, className, delay = 0, as = "div" }: Props) {
  const ref = useRef<HTMLElement>(null);
  const reduce = useReducedMotion();
  const [armed, setArmed] = useState(false);
  const seen = useInView(ref, { once: true, margin: "0px 0px -12% 0px" });

  useMeasureEffect(() => {
    if (reduce) return;
    const el = ref.current;
    if (!el) return;
    if (el.getBoundingClientRect().top > window.innerHeight) setArmed(true);
  }, [reduce]);

  const hidden = armed && !seen;
  const Tag = (motion as unknown as Record<string, ElementType>)[as];

  return (
    <Tag
      ref={ref}
      className={className}
      initial={false}
      animate={hidden ? WAITING : RISEN}
      transition={hidden ? { duration: 0 } : { duration: 0.62, ease: EASE, delay }}
    >
      {children}
    </Tag>
  );
}
```

- [ ] **Step 4: Marquee**

Create `components/marketing/motion/marquee.tsx`:

```tsx
import type { CSSProperties, ReactNode } from "react";
import { assertNoTrackGap } from "@/lib/motion";

type Props = {
  /** The items, rendered twice. Give each a stable key. */
  children: ReactNode[];
  /** Space after each item, as a CSS length. Becomes margin on the item. */
  spacing?: string;
  /** Seconds for one full pass. */
  duration?: number;
  className?: string;
  label: string;
};

/**
 * A seamless tape: the list rendered twice and translated -50%. The second
 * pass is aria-hidden so a screen reader hears each item once. Spacing goes on
 * the item, never on the track (see the note above marqueeSeamDrift).
 */
export function Marquee({ children, spacing = "2rem", duration = 46, className, label }: Props) {
  if (process.env.NODE_ENV !== "production") assertNoTrackGap({ className });
  const style = { "--marquee-spacing": spacing, "--marquee-duration": `${duration}s` } as CSSProperties;
  return (
    <div className={["marquee", className].filter(Boolean).join(" ")} role="region" aria-label={label} style={style}>
      <div className="marquee-track">
        {children.map((child, i) => (
          <div className="marquee-item" key={`a-${i}`}>{child}</div>
        ))}
        {children.map((child, i) => (
          <div className="marquee-item" key={`b-${i}`} aria-hidden="true">{child}</div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Counter**

Create `components/marketing/motion/counter.tsx`:

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { animate, useInView, useReducedMotion } from "motion/react";
import { EASE } from "@/lib/tokens";
import { widestSample } from "@/lib/motion";

type Props = {
  /** The final value. */
  to: number;
  /** Renders a value as text. Runs on the server too, so no Intl. */
  format: (n: number) => string;
  from?: number;
  /** Seconds. */
  duration?: number;
  className?: string;
};

/**
 * A figure that counts up once it is in view, inside a box already as wide as
 * the widest string it will render, so nothing beside it moves while it counts.
 * The server renders the final value; the count is an enhancement.
 */
export function Counter({ to, format, from = 0, duration = 1.2, className }: Props) {
  const ref = useRef<HTMLSpanElement>(null);
  const reduce = useReducedMotion();
  const seen = useInView(ref, { once: true, margin: "0px 0px -10% 0px" });
  const [text, setText] = useState(() => format(to));
  const widest = widestSample(from, to, format);

  useEffect(() => {
    if (!seen || reduce) return;
    const controls = animate(from, to, {
      duration,
      ease: EASE,
      onUpdate: (v) => setText(format(v)),
      onComplete: () => setText(format(to)),
    });
    return () => controls.stop();
  }, [seen, reduce, from, to, duration, format]);

  return (
    <span ref={ref} className={["figure", className].filter(Boolean).join(" ")} style={{ display: "inline-grid" }}>
      <span aria-hidden="true" style={{ gridArea: "1 / 1", visibility: "hidden" }}>{widest}</span>
      <span style={{ gridArea: "1 / 1" }}>{text}</span>
    </span>
  );
}
```

- [ ] **Step 6: Verify types**

Run: `npx tsc --noEmit`
Expected: no errors. If `motion` types reject the `Tag` cast in `reveal.tsx`, replace the dynamic tag with explicit branches (`as === "li" ? <motion.li …> : <motion.div …>`) rather than loosening types further.

---

### Task 7: Buttons

**Files:**
- Create: `components/marketing/ui/buttons.tsx`
- Delete: `components/marketing/glass-button.tsx`

- [ ] **Step 1: Create the buttons**

```tsx
"use client";

import Link from "next/link";
import type { ComponentPropsWithoutRef, ReactNode } from "react";

/**
 * The three buttons, and only three.
 *
 * `GoldButton` is the one primary action a view may carry. `GlassButton` is the
 * ghost beside it. `QuietButton` is a hairline for tertiary actions. Each
 * renders the element its props imply: an absolute URL becomes an anchor that
 * opens in a new tab with the house affordance, an internal path becomes a
 * next/link, and no href at all becomes a real <button>.
 *
 * Visuals live in app/(site)/styles/glass.css.
 */
type Size = "sm" | "md" | "lg";

type Props = {
  children: ReactNode;
  href?: string;
  size?: Size;
  className?: string;
  /** For the ghost on a night surface. */
  dark?: boolean;
} & Omit<ComponentPropsWithoutRef<"button">, "className" | "children">;

const cx = (...parts: Array<string | false | undefined>) => parts.filter(Boolean).join(" ");

function Button({ base, href, size = "md", className, dark, children, ...rest }: Props & { base: string }) {
  const cls = cx(
    base,
    size === "sm" && "btn--sm",
    size === "lg" && "btn--lg",
    dark && base === "btn-glass" && "btn-glass--dark",
    className,
  );
  const glass = base === "btn-gold" || base === "btn-glass" ? { "data-glass": "" } : {};

  if (href && /^https?:\/\//.test(href)) {
    return (
      <a className={cls} href={href} target="_blank" rel="noopener noreferrer" {...glass}>
        {children}
        <span className="sr-only"> (opens in a new tab)</span>
      </a>
    );
  }
  if (href) {
    return (
      <Link className={cls} href={href} {...glass}>
        {children}
      </Link>
    );
  }
  return (
    <button type="button" className={cls} {...glass} {...rest}>
      {children}
    </button>
  );
}

export function GoldButton(props: Props) { return <Button base="btn-gold" {...props} />; }
export function GlassButton(props: Props) { return <Button base="btn-glass" {...props} />; }
export function QuietButton(props: Props) { return <Button base="btn-quiet" {...props} />; }

/** The house arrow, for the primary action. */
export function Arrow() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12h14M13 5l7 7-7 7" />
    </svg>
  );
}
```

- [ ] **Step 2: Delete the old glass button**

Run: `rm components/marketing/glass-button.tsx` and `grep -rn "glass-button" app src components Platizio_Global_Revamp --include='*.tsx' --include='*.ts'`
Expected: no remaining imports.

- [ ] **Step 3: Verify types**

Run: `npx tsc --noEmit`
Expected: no errors.

---

### Task 8: chrome.css

**Files:**
- Create: `app/(site)/styles/chrome.css`

- [ ] **Step 1: Create the sheet**

```css
/* The chrome: the nav pill and its drawer, the rule that runs a page's first
 * section up behind the rail, the footer, the WhatsApp float, the skip link.
 *
 * The rail is an empty sticky strip and the pill is the object inside it. The
 * rail's height never changes: condensing takes 8px off the pill's padding and
 * hands it back to the rail as padding-bottom, so the five sheets that size
 * sticky offsets off --bar-inset + --bar-h stay right (see header.tsx).
 */

/* ================================================================== rail */

.site-header {
  position: sticky;
  top: 0;
  z-index: 100;
  padding: var(--bar-inset) clamp(0.75rem, 2vw, 1.25rem) 0;
  background: none;
  border: 0;
  box-shadow: none;
  pointer-events: none;
}

/* ================================================================== pill */

.nav {
  position: relative;
  pointer-events: auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 2rem;
  max-width: var(--measure);
  margin-inline: auto;
  padding-block: 8px;
  padding-inline: 1.5rem 0.75rem;
  border-radius: var(--r-pill);
}

/* The ground steps more opaque once type is passing underneath. A step, not a
   transition: header.tsx names the two properties that may transition. */
.site-header[data-condensed="true"] .nav {
  background: color-mix(in srgb, var(--paper-2) 82%, transparent);
}

.logo { display: flex; align-items: center; }
.logo-img {
  display: block;
  height: 30px;
  width: auto;
  margin: 0;
  user-select: none;
  -webkit-user-drag: none;
}

/* ------------------------------------------------------------- links */

.nav-links {
  position: relative;
  display: flex;
  align-items: center;
  gap: 0.25rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.nav-links > li > a:not(.btn-gold),
.nav-links .nav-trigger {
  position: relative;
  display: inline-block;
  padding: 0.5rem 0.75rem;
  border: 0;
  border-radius: var(--r-chip);
  background: none;
  font-family: var(--sans);
  font-size: 0.8125rem;
  font-weight: 500;
  letter-spacing: 0.01em;
  color: var(--ink-2);
  text-decoration: none;
  cursor: pointer;
  transition: color var(--t-fast) var(--ease);
}

/* The no-JS current-page mark: a rule under the label. Once the travelling
   marker has measured itself, these stand down. */
.nav-links > li > a:not(.btn-gold)::after,
.nav-links .nav-trigger::after {
  content: "";
  position: absolute;
  left: 0.75rem;
  right: 0.75rem;
  bottom: 2px;
  height: 1.5px;
  background: var(--foil-deep);
  transform: scaleX(0);
  transform-origin: center;
  transition: transform var(--t) var(--ease);
}
.nav-links > li > a:not(.btn-gold):hover,
.nav-links .nav-trigger:hover { color: var(--ink); }
.nav-links > li > a:not(.btn-gold):hover::after,
.nav-links .nav-trigger:hover::after { transform: scaleX(0.55); }
.nav-links > li > a.active,
.nav-links .nav-trigger.active { color: var(--ink); font-weight: 600; }
.nav-links > li > a.active::after,
.nav-links .nav-trigger.active::after { transform: scaleX(1); }
.nav-links.has-marker a:not(.btn-gold):not(.btn-quiet)::after,
.nav-links.has-marker .nav-trigger::after { display: none; }

/* One indicator for the whole list, laid out at 100px and scaled. */
.nav-marker {
  position: absolute;
  left: 0;
  bottom: 2px;
  width: 100px;
  height: 1.5px;
  background: var(--foil-deep);
  transform-origin: left center;
  pointer-events: none;
  transition: transform var(--t-slow) var(--ease), opacity var(--t) var(--ease);
}
.nav-links:not(.is-settled) .nav-marker { transition: none; }

/* ---------------------------------------------------------- dropdown */

.has-dropdown { position: relative; }

.dropdown-chevron {
  display: inline-block;
  width: 7px;
  height: 7px;
  margin-left: 6px;
  border-right: 1.5px solid currentColor;
  border-bottom: 1.5px solid currentColor;
  transform: rotate(45deg) translateY(-2px);
  opacity: 0.55;
  vertical-align: middle;
  transition: transform var(--t-fast) var(--ease), opacity var(--t-fast) var(--ease);
}
.has-dropdown:hover .dropdown-chevron { transform: rotate(225deg) translateY(2px); opacity: 1; }

.dropdown-wrap { display: contents; }

.dropdown {
  position: absolute;
  top: calc(100% + 8px);
  left: 0;
  min-width: 264px;
  margin: 0;
  padding: 0.5rem;
  list-style: none;
  background: var(--paper-2);
  border: 1px solid var(--rule);
  border-radius: var(--r-tile);
  box-shadow: var(--shadow-card-hover);
  opacity: 0;
  visibility: hidden;
  transform: translateY(-6px);
  transition: opacity var(--t) var(--ease), transform var(--t) var(--ease), visibility var(--t);
}
.has-dropdown:hover .dropdown,
.has-dropdown:focus-within .dropdown {
  opacity: 1;
  visibility: visible;
  transform: translateY(0);
}
.nav-links .dropdown a {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 0.75rem;
  border-radius: var(--r-chip);
  transition: background var(--t-fast) var(--ease);
}
.nav-links .dropdown a::after { content: none; }
.dropdown a:hover { background: var(--paper-3); }
.dropdown a strong { display: block; font-size: 0.875rem; font-weight: 600; color: var(--ink); }
.dropdown a span { display: block; font-size: 0.75rem; line-height: 1.45; color: var(--ink-3); }

/* ----------------------------------------------------------- actions */

.nav-actions { display: flex; align-items: center; gap: 0.6rem; }

.menu-toggle {
  display: none;
  width: 40px;
  height: 40px;
  place-items: center;
  padding: 0;
  border: 1px solid var(--rule-2);
  border-radius: var(--r-pill);
  background: none;
  color: var(--ink);
  cursor: pointer;
  transition: background var(--t-fast) var(--ease), border-color var(--t-fast) var(--ease);
}
.menu-toggle:hover { background: var(--paper-3); border-color: var(--ink-3); }
.menu-toggle svg { width: 20px; height: 20px; display: block; }

.nav-cta-mobile { display: none; }

/* ------------------------------------------------------------ drawer */

@media (max-width: 1080px) {
  .nav-marker { display: none; }
  .nav-links.has-marker a:not(.btn-gold):not(.btn-quiet)::after,
  .nav-links.has-marker .nav-trigger::after { display: block; }

  .menu-toggle { display: grid; }

  /* Anchored under the rail whatever it measures. */
  .nav-links {
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    z-index: 200;
    flex-direction: column;
    align-items: stretch;
    gap: 0.25rem;
    padding: 1rem 1.25rem 1.5rem;
    background: var(--paper-2);
    border: 1px solid var(--rule);
    border-radius: var(--r-card);
    box-shadow: var(--shadow-card-hover);
    transform: translateY(calc(-100% - 200px));
    transition: transform var(--t) var(--ease);
    pointer-events: none;
  }
  .nav-links.is-open { transform: translateY(8px); pointer-events: auto; }

  .nav-links > li > a:not(.btn-gold),
  .nav-links .nav-trigger {
    display: block;
    width: 100%;
    text-align: left;
    padding: 0.75rem 1rem;
    font-size: 0.9375rem;
  }
  .nav-links > li > a:not(.btn-gold)::after,
  .nav-links .nav-trigger::after { left: 1rem; right: auto; width: 18px; }

  .dropdown {
    position: static;
    opacity: 1;
    visibility: visible;
    transform: none;
    box-shadow: none;
    border: 0;
    padding: 0;
    max-height: 0;
    overflow: hidden;
    transition: max-height var(--t-slow) var(--ease), padding var(--t-slow) var(--ease);
  }
  .has-dropdown.products-open .dropdown { max-height: 320px; padding: 0 0 0 1rem; }

  .nav-actions .btn-quiet,
  .nav-actions .btn-gold { display: none; }

  .nav-cta-mobile {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    margin-top: 0.75rem;
    padding-top: 1rem;
    border-top: 1px solid var(--rule);
  }
  .nav-cta-mobile > * { width: 100%; justify-content: center; }
}

@media (max-width: 768px) {
  :root { --bar-h: 62px; }
  .nav { padding: 6px 0.5rem 6px 1rem; }
  .logo-img { height: 26px; }
}

/* ------------------------------------------- the page runs under the bar */

/* Whatever a page puts first is pulled up by the rail's height and given it
   back as a transparent top border, so its ground paints to the top of the
   viewport while its content stays where it was. A section that is not a
   canvas opts out with data-under-bar="off". */
#main-content > :first-child:not([data-under-bar="off"]) {
  margin-top: calc(-1 * (var(--bar-inset) + var(--bar-h)));
  border-top: calc(var(--bar-inset) + var(--bar-h)) solid transparent;
  background-origin: border-box;
}

/* ============================================================ skip link */

.skip-link {
  position: absolute;
  top: -100%;
  left: 1rem;
  z-index: 9999;
  padding: 0.75rem 1.25rem;
  border-radius: 0 0 var(--r-tile) var(--r-tile);
  background: var(--ink);
  color: var(--paper);
  font-weight: 600;
  font-size: 0.9375rem;
  text-decoration: none;
  transition: top var(--t) var(--ease);
}
.skip-link:focus { top: 0; outline: 3px solid var(--foil); outline-offset: 2px; }

/* ================================================================ footer */

.pgf {
  position: relative;
  overflow: hidden;
  padding-block: clamp(4rem, 8vw, 7rem) clamp(1.5rem, 3vw, 2.25rem);
  color: var(--night-ink-2);
  border-top: 0;
}
/* The wash that lights the close, above the grain the .night surface paints. */
.pgf .pgf-wash {
  position: absolute;
  inset: 0 0 auto;
  height: 60%;
  pointer-events: none;
  background: radial-gradient(1100px 420px at 50% 0%, rgba(217, 189, 139, 0.16), transparent 62%);
}

.pgf-inner {
  position: relative;
  max-width: var(--measure);
  margin-inline: auto;
  padding-inline: var(--gutter);
}

.pgf-sr {
  position: absolute;
  width: 1px; height: 1px;
  padding: 0; margin: -1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
  border: 0;
}

/* ---- 1. the close ---- */

.pgf-close {
  display: grid;
  gap: clamp(2rem, 4vw, 3.5rem);
  align-items: end;
  padding-bottom: clamp(2.5rem, 5vw, 4rem);
}
@media (min-width: 900px) {
  .pgf-close { grid-template-columns: minmax(0, 1fr) minmax(0, 0.66fr); }
}

.pgf-eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 0.75rem;
  margin: 0 0 1.1rem;
  font-family: var(--sans);
  font-size: 0.6875rem;
  font-weight: 700;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: var(--foil);
}
.pgf-eyebrow-rule { display: block; width: 24px; height: 1px; background: var(--foil); flex: none; }

.pgf-close-h {
  margin: 0;
  font-family: var(--display);
  font-size: clamp(1.9rem, 3.6vw, 3.4rem);
  line-height: 1.04;
  letter-spacing: -0.02em;
  font-weight: 400;
  text-wrap: balance;
  max-width: 19ch;
  color: var(--night-ink);
}

/* The liquid-glass bar carrying the last action. */
.pgf-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 1rem 1.25rem;
  padding: 0.6rem 0.6rem 0.6rem 1.5rem;
  border-radius: var(--r-card);
}
.pgf-bar-note {
  margin: 0;
  font-size: 0.875rem;
  line-height: 1.5;
  color: var(--night-ink-2);
  max-width: 30ch;
}
.pgf-bar-actions { display: flex; flex-wrap: wrap; gap: 0.5rem; }

/* ---- 2. the directory ---- */

.pgf-directory {
  display: grid;
  gap: clamp(1.75rem, 3vw, 2.5rem);
  padding-block: clamp(2.25rem, 4vw, 3.25rem);
  border-top: 1px solid var(--rule-n);
}
@media (min-width: 640px) { .pgf-directory { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (min-width: 1000px) { .pgf-directory { grid-template-columns: repeat(4, minmax(0, 1fr)) minmax(0, 1.25fr); } }

.pgf-col-h {
  margin: 0 0 0.9rem;
  font-family: var(--sans);
  font-size: 0.625rem;
  font-weight: 700;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: var(--night-ink-3);
}

.pgf-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.5rem; }

.pgf-link {
  position: relative;
  display: inline-block;
  padding-block: 0.35rem;
  font-size: 0.875rem;
  line-height: 1.5;
  color: var(--night-ink-2);
  text-decoration: none;
  transition: color var(--t-fast) var(--ease);
}
.pgf-link::after {
  content: "";
  position: absolute;
  left: 0; right: 0; bottom: 0;
  height: 1px;
  background: currentColor;
  transform: scaleX(0);
  transform-origin: left center;
  transition: transform var(--t) var(--ease);
}
.pgf-link:hover,
.pgf-link:focus-visible { color: var(--foil); }
.pgf-link:hover::after,
.pgf-link:focus-visible::after { transform: scaleX(1); }

.pgf-address {
  margin: 0.9rem 0 0;
  font-style: normal;
  font-size: 0.8125rem;
  line-height: 1.7;
  color: var(--night-ink-3);
}

/* ---- the wordmark ---- */

.pgf-wordmark {
  margin: clamp(0.5rem, 2vw, 1.5rem) 0 0;
  font-family: var(--display);
  font-size: clamp(3rem, 13vw, 11rem);
  line-height: 0.82;
  letter-spacing: -0.04em;
  font-weight: 400;
  text-wrap: nowrap;
  color: rgba(242, 237, 229, 0.06);
  user-select: none;
}

/* ---- 3. the record ---- */

.pgf-record {
  display: grid;
  gap: clamp(1.25rem, 2.5vw, 1.75rem);
  margin-top: clamp(1rem, 2vw, 1.5rem);
  padding-top: clamp(1.5rem, 2.5vw, 2rem);
  border-top: 1px solid var(--rule-n);
}

.pgf-reg {
  margin: 0;
  font-size: 0.75rem;
  line-height: 1.7;
  color: var(--night-ink-3);
  max-width: 92ch;
  text-wrap: pretty;
}

.pgf-record-foot {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: clamp(1rem, 3vw, 2.5rem);
}

.pgf-social, .pgf-legal, .pgf-apps {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 0.9rem 1.25rem;
}

.pgf-social-link {
  display: inline-block;
  padding-block: 0.35rem;
  font-size: 0.8125rem;
  color: var(--night-ink-2);
  text-decoration: none;
  transition: color var(--t-fast) var(--ease);
}
.pgf-social-link:hover,
.pgf-social-link:focus-visible { color: var(--foil); }

.pgf-copy {
  margin: 0 0 0 auto;
  font-family: var(--mono);
  font-size: 0.6875rem;
  letter-spacing: 0.06em;
  color: var(--night-ink-3);
  font-variant-numeric: tabular-nums;
}

/* ======================================================= whatsapp float */

.whatsapp-float {
  position: fixed;
  right: 1.5rem;
  bottom: 1.5rem;
  z-index: 900;
  display: inline-flex;
  align-items: center;
  gap: 0.7rem;
  padding: 0.4rem 1.1rem 0.4rem 0.4rem;
  border-radius: var(--r-pill);
  color: var(--ink);
  font-size: 0.875rem;
  font-weight: 600;
  text-decoration: none;
  transition: transform var(--t) var(--ease), box-shadow var(--t-slow) var(--ease);
  animation: whatsapp-float-in 0.35s var(--ease);
}
@keyframes whatsapp-float-in {
  from { opacity: 0; transform: translateY(14px) scale(0.92); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}
.whatsapp-float:hover,
.whatsapp-float:focus-visible { transform: translateY(-3px); }
.whatsapp-float:focus-visible { outline: 3px solid var(--gold-text); outline-offset: 3px; }
.whatsapp-float-icon {
  width: 36px;
  height: 36px;
  flex: none;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: #25d366;
  color: var(--paper-2);
}
.whatsapp-float-icon svg { width: 20px; height: 20px; }
.whatsapp-float-label { white-space: nowrap; }
@media (max-width: 560px) {
  .whatsapp-float { right: 1rem; bottom: 1rem; padding: 0.3rem; }
  .whatsapp-float-label { display: none; }
}

@media (prefers-reduced-motion: reduce) {
  .nav-marker, .dropdown, .nav-links, .pgf-link::after, .whatsapp-float { transition: none; animation: none; }
  .whatsapp-float:hover, .whatsapp-float:focus-visible { transform: none; }
}
```

- [ ] **Step 2: Verify the guard tests accept it**

Run: `npm test`
Expected: all pass.

---

### Task 9: Header

**Files:**
- Create: `components/marketing/chrome/header.tsx` (from `src/components/Header.tsx`)
- Delete: `src/components/Header.tsx`

- [ ] **Step 1: Move the file**

Run: `mkdir -p components/marketing/chrome && mv src/components/Header.tsx components/marketing/chrome/header.tsx`

(A plain `mv`: the index is not touched.)

- [ ] **Step 2: Repoint the imports at the top of the file**

Replace the import block with:

```tsx
import { useState, useEffect, useRef, useCallback, useSyncExternalStore } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { motion } from 'motion/react'
import { useAppContext } from '@/src/context/AppContext'
import { getLenis } from '@/src/lib/smoothScroll'
import { usePresence } from '@/lib/use-presence'
import { EASE, EASE_CSS } from '@/lib/tokens'
import { TRADING_PLATFORM_URL } from '@/src/constants'
import { Arrow } from '@/components/marketing/ui/buttons'
```

- [ ] **Step 3: Make the pill glass and the buttons the new ones**

In the JSX, change the `<nav>` opening tag to add the material and the specular hook target:

```tsx
      <nav
        className="nav glass"
        data-glass=""
        aria-label="Primary"
```

Replace the two desktop action controls inside `<div className="nav-actions">` with:

```tsx
          <button
            className="btn-quiet btn--sm"
            onClick={() => { openContact(); setMenuOpen(false) }}
          >
            Contact Us
          </button>
          <a
            className="btn-gold btn--sm"
            data-glass=""
            href={TRADING_PLATFORM_URL}
            target="_blank"
            rel="noopener noreferrer"
          >
            Start Investing
            <Arrow />
          </a>
```

Replace the two controls inside `<li className="nav-cta-mobile">` with:

```tsx
            <button
              className="btn-quiet"
              onClick={() => { openContact(); setMenuOpen(false) }}
            >
              Contact Us
            </button>
            <a
              className="btn-gold"
              data-glass=""
              href={TRADING_PLATFORM_URL}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setMenuOpen(false)}
            >
              Start Investing
              <Arrow />
            </a>
```

Remove the inline `<svg>` arrows those two anchors used to carry (the `Arrow` component replaces them). Everything else in the file — the condense thresholds, the marker, the drawer trap, `inert`, the `style` on the header and nav — stays exactly as it is.

- [ ] **Step 4: Verify types**

Run: `npx tsc --noEmit`
Expected: errors only where `app/(site)/layout.tsx` still imports the old path (fixed in Task 13); nothing inside `header.tsx`.

---

### Task 10: Footer

**Files:**
- Create: `components/marketing/chrome/footer.tsx` (from `src/components/Footer.tsx`)
- Delete: `src/components/Footer.tsx`

- [ ] **Step 1: Move the file**

Run: `mv src/components/Footer.tsx components/marketing/chrome/footer.tsx`

- [ ] **Step 2: Repoint the imports**

```tsx
import Link from 'next/link'
import { useAppContext } from '@/src/context/AppContext'
import {
  YOUTUBE_CHANNEL_URL,
  WHATSAPP_URL,
  APP_STORE_URL,
  PLAY_STORE_URL,
  TRADING_PLATFORM_URL,
} from '@/src/constants'
import { Arrow, GoldButton, QuietButton } from '@/components/marketing/ui/buttons'
```

Delete the local `function Arrow()` since the shared one is imported.

- [ ] **Step 3: Make the footer navy with the glass bar**

Change the `<footer>` opening tag and the close's right column:

```tsx
    <footer className="pgf night" aria-labelledby="pgf-close-heading">
      <div className="pgf-wash" aria-hidden="true" />
      <div className="pgf-inner">
```

Replace the whole `<div className="pgf-close-r">…</div>` block with:

```tsx
          <div className="pgf-bar glass glass--dark" data-glass="">
            <p className="pgf-bar-note">
              Account opening is online and guided end to end. No minimum balance.
            </p>
            <div className="pgf-bar-actions">
              {/* Wrapped, not passed directly: openContact takes an optional `interest`
                  string, so handing it straight to onClick would pass it the click
                  event as that argument. */}
              <QuietButton onClick={() => openContact()}>Talk to us first</QuietButton>
              <GoldButton href={TRADING_PLATFORM_URL}>
                Open an account
                <Arrow />
              </GoldButton>
            </div>
          </div>
```

(`GoldButton` renders the external anchor with the "(opens in a new tab)" affordance itself; the old `pgf-sr` span inside the link is no longer needed there. Keep every other `pgf-sr` in the file.)

Everything else in the footer — the directory, the wordmark, the record with its regulatory line, socials, legal and app links, the copyright — stays word for word.

- [ ] **Step 4: Verify types**

Run: `npx tsc --noEmit`
Expected: no errors inside `footer.tsx`.

---

### Task 11: Contact modal

**Files:**
- Create: `components/marketing/chrome/contact-modal.tsx` (from `src/components/ContactModal.tsx`)
- Delete: `src/components/ContactModal.tsx`

- [ ] **Step 1: Move the file and repoint imports**

Run: `mv src/components/ContactModal.tsx components/marketing/chrome/contact-modal.tsx`

Change the relative imports to alias imports:

```tsx
import { useAppContext } from '@/src/context/AppContext'
import { anonHeaders, backendConfig } from '@/src/lib/backend'
import { useTurnstile } from '@/src/lib/useTurnstile'
```

- [ ] **Step 2: Replace the `CSS` constant**

Replace the whole `const CSS = \`…\`` with:

```tsx
const CSS = `
.cm-overlay{position:fixed;inset:0;z-index:1000;display:flex;align-items:center;justify-content:center;padding:1rem}
.cm-scrim{position:absolute;inset:0;background:rgba(11,27,51,.62)}
.cm-panel{position:relative;z-index:1;display:flex;flex-direction:column;width:100%;max-width:540px;max-height:min(92vh,780px);background:var(--paper-2);color:var(--ink);border:1px solid var(--rule);border-radius:var(--r-card);box-shadow:var(--shadow-card-hover);overflow:hidden}
.cm-panel:focus{outline:none}
.cm-scroll{overflow-y:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch}

.cm-close{position:absolute;top:.75rem;right:.75rem;z-index:2;display:grid;place-items:center;width:44px;height:44px;padding:0;border:1px solid var(--rule-2);border-radius:var(--r-pill);background:transparent;color:var(--ink-3);cursor:pointer;transition:background var(--t-fast) var(--ease),color var(--t-fast) var(--ease)}
.cm-close:hover{background:var(--paper-3);color:var(--ink)}
.cm-close:focus-visible{outline:2px solid var(--gold-text);outline-offset:2px}
.cm-close svg{width:18px;height:18px}

.cm-head{padding:1.75rem 1.75rem 0;padding-right:4rem}
.cm-title{margin:0 0 .5rem;font-family:var(--display);font-size:1.75rem;line-height:1.15;font-weight:400;letter-spacing:-.02em;color:var(--ink)}
.cm-sub{margin:0;font-size:.9375rem;line-height:1.55;color:var(--ink-2)}
.cm-rule{height:1px;margin:1.25rem 1.75rem 0;background:var(--rule)}

.cm-body{padding:1.4rem 1.75rem 1.75rem}
.cm-field{margin-bottom:1.05rem}
.cm-label{display:block;margin-bottom:.45rem;font-size:.6875rem;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--ink-3)}
.cm-req{color:var(--loss);font-weight:700}
.cm-input{display:block;width:100%;min-height:48px;padding:.75rem 1rem;font:inherit;font-size:.9375rem;color:var(--ink);background:var(--paper);border:1px solid var(--rule-2);border-radius:var(--r-tile);transition:border-color var(--t-fast) var(--ease),box-shadow var(--t-fast) var(--ease),background var(--t-fast) var(--ease)}
.cm-input::placeholder{color:var(--ink-3);opacity:1}
.cm-input:hover{border-color:var(--ink-3)}
.cm-input:focus{outline:none;background:var(--paper-2);border-color:var(--gold-text);box-shadow:0 0 0 3px rgba(217,189,139,.35)}
.cm-input:focus-visible{outline:2px solid var(--gold-text);outline-offset:2px;box-shadow:none}
.cm-input[aria-invalid="true"]{border-color:var(--loss);background:var(--loss-wash)}
textarea.cm-input{min-height:104px;resize:vertical}

.cm-consent{display:flex;gap:.8rem;align-items:flex-start;min-height:44px;padding:.85rem 1rem;background:var(--paper);border:1px solid var(--rule);border-radius:var(--r-tile)}
.cm-consent[data-invalid="true"]{border-color:var(--loss);background:var(--loss-wash)}
.cm-check{position:relative;flex:0 0 auto;margin:.12rem 0 0;width:22px;height:22px;appearance:none;-webkit-appearance:none;background:var(--paper-2);border:1.5px solid var(--rule-2);border-radius:6px;cursor:pointer;transition:background var(--t-fast) var(--ease),border-color var(--t-fast) var(--ease)}
.cm-check::after{content:"";position:absolute;inset:-11px}
.cm-check:checked{background:var(--foil);border-color:var(--foil-deep)}
.cm-check:checked::before{content:"";position:absolute;left:7px;top:3px;width:5px;height:10px;border:solid var(--on-gold);border-width:0 2px 2px 0;transform:rotate(45deg)}
.cm-check:focus-visible{outline:2px solid var(--gold-text);outline-offset:3px}
.cm-consent-text{min-width:0}
.cm-consent-label{display:block;font-size:.875rem;line-height:1.5;font-weight:400;color:var(--ink-2);cursor:pointer}
.cm-consent-link{margin:.4rem 0 0;font-size:.875rem;line-height:1.5}
.cm-consent-link a{color:var(--gold-text);text-decoration:underline;text-underline-offset:2px}
.cm-consent-link a:focus-visible{outline:2px solid var(--gold-text);outline-offset:2px}

.cm-captcha{display:flex;justify-content:center;margin-bottom:.9rem}

.cm-alert:empty{display:none}
.cm-alert{margin:0 0 .95rem}
.cm-alert-inner{display:flex;gap:.55rem;align-items:flex-start;padding:.75rem .9rem;font-size:.875rem;line-height:1.45;color:var(--loss);background:var(--loss-wash);border:1px solid rgba(176,57,44,.32);border-radius:var(--r-tile)}
.cm-alert-inner svg{flex:0 0 auto;width:16px;height:16px;margin-top:.1rem}

.cm-submit{display:flex;align-items:center;justify-content:center;gap:.6rem;width:100%;min-height:52px;padding:.85rem 1.25rem;font:inherit;font-size:.9375rem;font-weight:600;color:var(--on-gold);background:linear-gradient(120deg,#efd9b0 0%,var(--foil) 34%,#c7a468 58%,#e6cc9f 100%);border:0;border-radius:var(--r-pill);box-shadow:inset 0 1px 0 rgba(255,255,255,.75),inset 0 -1px 0 rgba(90,60,20,.25),var(--shadow-gold);cursor:pointer;transition:transform var(--t) var(--ease),box-shadow var(--t-slow) var(--ease)}
.cm-submit:hover{transform:translateY(-2px)}
.cm-submit:focus-visible{outline:2px solid var(--ink);outline-offset:3px}
.cm-submit[aria-disabled="true"]{background:var(--paper-3);color:var(--ink-3);box-shadow:none;cursor:progress;transform:none}
.cm-spin{width:16px;height:16px;border-radius:50%;border:2px solid rgba(26,18,7,.2);border-top-color:var(--ink);animation:cm-spin .7s linear infinite}
@keyframes cm-spin{to{transform:rotate(360deg)}}

.cm-success{padding:2.75rem 1.75rem 3rem;text-align:center}
.cm-success:focus{outline:none}
.cm-tick{display:block;width:56px;height:56px;margin:0 auto 1.15rem;color:var(--gain)}
.cm-success-title{margin:0 0 .5rem;font-family:var(--display);font-size:1.75rem;font-weight:400;letter-spacing:-.02em;color:var(--ink)}
.cm-success-copy{margin:0;font-size:.9375rem;line-height:1.55;color:var(--ink-2)}
.cm-ref{display:inline-block;margin-top:1rem;padding:.55rem .9rem;font-family:var(--mono);font-size:.875rem;line-height:1.4;color:var(--ink);background:var(--paper);border:1px solid var(--rule);border-radius:var(--r-chip)}

.cm-sr{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap;border:0}

@media (min-width:480px){.cm-overlay{padding:1.5rem}}
@media (max-width:479px){
  .cm-head{padding:1.4rem 1.25rem 0;padding-right:3.6rem}
  .cm-rule{margin:1.05rem 1.25rem 0}
  .cm-body{padding:1.2rem 1.25rem 1.4rem}
  .cm-success{padding:2.2rem 1.25rem 2.4rem}
}
@media (prefers-reduced-motion: reduce){.cm-spin{display:none}.cm-submit{transition:none}.cm-submit:hover{transform:none}}
`
```

Nothing else in the file changes: the form, validation, backend calls, consent text and version, focus handling and `usePresence` timing stay as they are.

- [ ] **Step 3: Verify types**

Run: `npx tsc --noEmit`
Expected: no errors inside `contact-modal.tsx`.

---

### Task 12: WhatsApp float

**Files:**
- Create: `components/marketing/chrome/whatsapp-float.tsx` (from `src/components/WhatsAppFloat.tsx`)
- Delete: `src/components/WhatsAppFloat.tsx`

- [ ] **Step 1: Move and restyle**

Run: `mv src/components/WhatsAppFloat.tsx components/marketing/chrome/whatsapp-float.tsx`

Change the constants import to `import { WHATSAPP_URL } from '@/src/constants'` and the anchor's opening tag to:

```tsx
    <a
      className="whatsapp-float glass"
      data-glass=""
      href={WHATSAPP_URL}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Chat with us on WhatsApp"
    >
```

The 5-second delay, the `/help` suppression, the icon and the label stay.

- [ ] **Step 2: Verify types**

Run: `npx tsc --noEmit`
Expected: no errors inside `whatsapp-float.tsx`.

---

### Task 13: Strip the legacy chrome, retire the old sheets, wire the layout

**Files:**
- Modify: `css/styles.css` (by script)
- Delete: `Platizio_Global_Revamp/styles/chrome.css`, `app/(site)/glass.css`, `app/(site)/footer.css`, `app/(site)/design-system.css`, `app/(site)/marketing-tokens.css`
- Modify: `app/(site)/layout.tsx`, `app/(site)/site-chrome.tsx`

- [ ] **Step 1: Strip the chrome rules from `css/styles.css`**

Write `/private/tmp/claude-501/-Users-aayushsharma-Desktop-PWG-pwg-new/f2a6e964-ea6f-4a8d-9b46-9a86a847d70e/scratchpad/strip-legacy-chrome.mjs`:

```js
import { readFileSync, writeFileSync } from "node:fs";

/* Removes every rule whose selector list is entirely chrome — header, footer,
   WhatsApp, skip link, the gold button — from css/styles.css, inside @media
   blocks too. A rule that mixes a chrome selector with a page selector is
   kept, so nothing a page still needs disappears. */

const FILE = "css/styles.css";
const KILL = [
  /^\.site-header\b/, /^\.nav\b/, /^\.nav-/, /^\.logo\b/, /^\.logo-img\b/,
  /^\.has-dropdown\b/, /^\.dropdown\b/, /^\.dropdown-/, /^\.menu-toggle\b/,
  /^\.site-footer\b/, /^\.footer-/, /^\.social\b/, /^\.skip-link\b/,
  /^\.whatsapp-float/, /^@keyframes whatsapp-float-in\b/,
  /^\.btn-gold\b/, /^\.btn-pulse\b/,
];

function strip(css) {
  let out = "";
  let i = 0;
  while (i < css.length) {
    const open = css.indexOf("{", i);
    if (open < 0) { out += css.slice(i); break; }
    const prelude = css.slice(i, open);
    let depth = 1, j = open + 1;
    while (j < css.length && depth) { if (css[j] === "{") depth++; else if (css[j] === "}") depth--; j++; }
    const body = css.slice(open + 1, j - 1);
    const sel = prelude.replace(/\/\*[\s\S]*?\*\//g, "").trim();
    if (/^@(media|supports|layer)/.test(sel)) {
      out += prelude + "{" + strip(body) + "}";
    } else {
      const selectors = sel.split(",").map((s) => s.trim()).filter(Boolean);
      const kill = selectors.length > 0 && selectors.every((s) => KILL.some((re) => re.test(s)));
      if (!kill) out += prelude + "{" + body + "}";
    }
    i = j;
  }
  return out;
}

const before = readFileSync(FILE, "utf8");
const after = strip(before);
writeFileSync(FILE, after);
console.log(`css/styles.css: ${before.split("\n").length} -> ${after.split("\n").length} lines`);
```

Run: `node /private/tmp/claude-501/-Users-aayushsharma-Desktop-PWG-pwg-new/f2a6e964-ea6f-4a8d-9b46-9a86a847d70e/scratchpad/strip-legacy-chrome.mjs`
Expected: a line count roughly 500 lines lower. Then run: `grep -n "^\.site-header\|^\.nav {\|^\.whatsapp-float {\|^\.skip-link {\|^\.btn-gold {\|^\.site-footer {" css/styles.css`
Expected: no output.

- [ ] **Step 2: Delete the retired sheets**

Run:
```bash
rm Platizio_Global_Revamp/styles/chrome.css "app/(site)/glass.css" "app/(site)/footer.css" "app/(site)/design-system.css" "app/(site)/marketing-tokens.css"
```

- [ ] **Step 3: Rewrite the layout**

Replace the whole of `app/(site)/layout.tsx` with:

```tsx
import type { ReactNode } from "react";

import "lenis/dist/lenis.css";

/* The legacy sheets. They style the pages that later phases rebuild
   (pricing, about, media, articles, help, legal) and are deleted page by
   page as those ship. Their chrome sections are already gone. */
import "@/css/styles.css";
import "@/Platizio_Global_Revamp/styles/tokens.css";
import "@/Platizio_Global_Revamp/styles/base.css";
import "@/Platizio_Global_Revamp/styles/page.css";
import "@/Platizio_Global_Revamp/styles/home-market.css";
import "@/Platizio_Global_Revamp/styles/pricing.css";
import "@/Platizio_Global_Revamp/styles/about.css";
import "@/Platizio_Global_Revamp/styles/media.css";
import "@/Platizio_Global_Revamp/styles/help.css";
import "@/Platizio_Global_Revamp/styles/library.css";
import "@/Platizio_Global_Revamp/styles/legal.css";
import "./marketing-surfaces.css";
/* The products page owns its own sheet and imports it itself; this keeps the
   cascade position it had. */
import "@/Platizio_Global_Revamp/styles/products.css";

/* The system. Order is the cascade: tokens, then the ground and type, then the
   material, then the chrome. Everything above loses to these at equal
   specificity, which is the point. Nothing may be added below chrome.css. */
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/glass.css";
import "./styles/chrome.css";

import { AppProvider } from "@/src/context/AppContext";
import Header from "@/components/marketing/chrome/header";
import Footer from "@/components/marketing/chrome/footer";
import ContactModal from "@/components/marketing/chrome/contact-modal";
import WhatsAppFloat from "@/components/marketing/chrome/whatsapp-float";
import SiteChrome from "./site-chrome";
import { MotionProvider } from "./motion-provider";

/* The marketing site's chrome. The terminal sits outside this route group and
   keeps its own full-bleed shell; none of this loads there. */
export default function SiteLayout({ children }: { children: ReactNode }) {
  return (
    <AppProvider>
      <MotionProvider>
        <SiteChrome />
        <a href="#main-content" className="skip-link">
          Skip to main content
        </a>
        <Header />
        <main id="main-content">{children}</main>
        <Footer />
        <ContactModal />
        <WhatsAppFloat />
      </MotionProvider>
    </AppProvider>
  );
}
```

- [ ] **Step 4: Mount the two listeners in site-chrome**

In `app/(site)/site-chrome.tsx`, add the imports and a component:

```tsx
import { useSpecular } from "@/components/marketing/motion/use-specular";
import { useRipple } from "@/components/marketing/motion/ripple";

/* The liquid-glass pointer effects, attached once for the whole document. */
function GlassEffects() {
  useSpecular();
  useRipple();
  return null;
}
```

and render it inside `SiteChrome`:

```tsx
export default function SiteChrome() {
  return (
    <>
      <SmoothScroll />
      <ScrollHandler />
      <GlassEffects />
    </>
  );
}
```

- [ ] **Step 5: Find every other import of the moved components**

Run: `grep -rn "components/Header\|components/Footer\|components/ContactModal\|components/WhatsAppFloat\|marketing-tokens\|design-system.css" app src components Platizio_Global_Revamp lib --include='*.tsx' --include='*.ts' --include='*.css'`
Expected: no output. Fix any hit by repointing it at the new path.

- [ ] **Step 6: Verify types, lint, tests**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: all three clean.

---

### Task 14: PRODUCT.md brand commitments

**Files:**
- Modify: `PRODUCT.md`

- [ ] **Step 1: Replace the Brand Commitments section**

Replace the two paragraphs under `## Brand Commitments` with:

```markdown
Existing identity, binding: the name Platizio Global and the wordmark.

Aayush-stated on 4 September 2026, binding for every marketing page: the
products page's world — cream paper (`#f2ede5`), warm brown-black ink, gold
split into a fill (`#d9bd8b`, never words on paper) and a text tone
(`#7e6238`) — with midnight navy (`#0b1b33`) as night moments only: at most
one instrument panel per page, plus the footer. The register is clean and
industrial, like a US finance platform: structure by grid, hairline and
whitespace; no ornament, lattice, stamp or engraving. Components and card
styling follow the v4 draft (platizio-v4.vercel.app) and the products page.
Type is Newsreader for display with one italic clause at most, Manrope for
prose and labels, IBM Plex Mono for figures. Motion is Lenis smooth scroll
with one rehearsed sequence per page; liquid glass on the nav pill, the
primary button, the ghost button, the footer bar and floating night cards.
Copy is preserved word for word through any redesign.

**The terminal keeps its own separate dark treatment** — the marketing world
is not applied to it — and `/products` is the reference surface, not a
target.
```

- [ ] **Step 2: Verify the file still parses as the product schema**

Run: `grep -c "impeccable:product-schema" PRODUCT.md`
Expected: `1`.

---

### Task 15: Browser verification

**Files:** none.

- [ ] **Step 1: Home renders on the new chrome**

With the dev server running (`preview_start` name `platizio`), open `http://localhost:3000/` at 1440 wide. Check, with `read_console_messages`: no errors. Check with `read_page`: the nav pill's links, the two action controls, the footer's closing statement, directory and regulatory line all present with their text unchanged.

- [ ] **Step 2: The products page is unchanged in its own markup**

Open `http://localhost:3000/products`. Check with `javascript_tool`: `getComputedStyle(document.querySelector('.ft .container')).maxWidth === '1360px'`, `getComputedStyle(document.querySelector('.ft-cta')).backgroundImage` contains `linear-gradient`, and `document.querySelector('.quote-arrow')` (after choosing a company) measures 9px wide.

- [ ] **Step 3: A legacy page is still legible**

Open `http://localhost:3000/pricing` and `http://localhost:3000/faqs`. Check with `javascript_tool` that `getComputedStyle(document.body).backgroundColor` is `rgb(242, 237, 229)` and that no `h1`'s computed colour is white.

- [ ] **Step 4: The drawer**

Resize to 390 wide, open `/`, click the menu toggle, `read_page`: the six links and both actions listed; press Escape; the toggle regains focus.

- [ ] **Step 5: Reduced motion**

`resize_window` with `colorScheme` unchanged; use `javascript_tool` to confirm that under `matchMedia('(prefers-reduced-motion: reduce)')` being true (emulate through DevTools if the pane offers it, otherwise skip and note it) no `--mx` is written on `[data-glass]` after a pointer move.

- [ ] **Step 6: Record**

Report the three pages' console state and the four computed values in the task summary. Do not commit.
