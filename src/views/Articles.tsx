"use client"

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { motion } from 'motion/react'
import Link from 'next/link'
import Image from 'next/image'
import SEO, { breadcrumbSchema, itemListSchema } from '../components/SEO'
import { ARTICLES, articlesByTopic, featuredArticles } from '../articles/registry'
import { TOPICS } from '../articles/topics'
import { groupByPrimaryTopic } from '../../Platizio_Global_Revamp/lib/articleSelect'
import type { Article } from '../articles/types'

/*
 * /articles — the library index, in the world /products established.
 *
 * WHY THIS FILE CARRIES ITS OWN SHEET. The page used to borrow `.page-hero`
 * from page.css and `.lib-*` from library.css. `.page-hero` is an ink floor:
 * measured in the browser it painted #4a3f30 and set its type in #fffdf9, so
 * the library opened on a near-black band and then dropped onto cream — the
 * "black and champagne" the whole restyle exists to remove. Those two sheets
 * open nineteen other routes between them and are not this page's to edit, so
 * the fix is to stop reaching for them: everything below is scoped under
 * `.alib`, and no rule here can touch another page.
 *
 * WHERE THE COLOURS COME FROM. Token names only — `--surface`, `--white`,
 * `--gray-800/700/600`, `--gold`, `--gold-hi`, `--line`, `--ease`. Not one hex
 * is written down. The palette is being normalised across the site in parallel;
 * spelling #f7f3ec here would opt this page out of that work and out of every
 * palette change after it. The two derived tones (a firmer hairline, a gold
 * edge) are `color-mix()` off the same tokens for the same reason.
 *
 * NO `@supports` ANYWHERE IN THIS SHEET. This build's CSS minifier silently
 * empties any `@supports` block whose declaration contains a `var()` — verified
 * in-browser, the rule shipped as `.nav { }`. There is nothing here that needs
 * a feature query, so there is no way to get bitten by it.
 *
 * WHAT THE PAGE IS. The three pieces the registry marks `featured` lead, and
 * the rest are a text index grouped under the hub each one names first. Both
 * orderings come from fields that already exist — nothing is invented, and
 * nothing is ranked by a signal the data does not carry. That decision predates
 * this restyle and is unchanged; what changed is that the page now reads as the
 * same document as /products.
 */

/* The /products ease, by its token name. Reused by the JS transitions below so
   the scroll reveals and the CSS hover gestures move on one curve. */
const EASE = [0.22, 1, 0.36, 1] as const

const SHEET = `
/* ============================================================ the world */

.alib {
  /* Local aliases, one per role, so every rule below reads as intent rather
     than as a token lookup — and so a palette change lands in nine places. */
  --a-paper: var(--surface);
  --a-sheet: var(--white);
  --a-ink: var(--gray-800);
  --a-dim: var(--gray-700);
  --a-mute: var(--gray-600);
  --a-gold: var(--gold);
  --a-gold-hi: var(--gold-hi);
  --a-ease: var(--ease);

  /* The hairline, and a firmer one for the rules that carry a section. Both
     mixed from the ink token rather than restated, so they follow it. */
  --a-line-1: var(--line);
  --a-line-2: color-mix(in srgb, var(--gray-800) 14%, transparent);
  --a-edge: color-mix(in srgb, var(--gold) 42%, transparent);

  /* The champagne wash. --m-tint-shared is the product page's own value,
     published for exactly this; the literal is the fallback for the moment
     before the token layer loads, never the source of truth. */
  --a-wash: var(--m-tint-shared, rgba(201, 164, 111, 0.16));
  --a-wash-soft: color-mix(in srgb, var(--a-wash) 50%, transparent);

  /* Warm shadows. A neutral shadow on a warm ground reads as a smudge, so
     these are mixed from the page's own ink. */
  --a-shadow:
    0 1px 2px color-mix(in srgb, var(--gray-800) 4%, transparent),
    0 2px 6px color-mix(in srgb, var(--gray-800) 5%, transparent);
  --a-shadow-lg:
    0 4px 8px color-mix(in srgb, var(--gray-800) 5%, transparent),
    0 22px 48px color-mix(in srgb, var(--gray-800) 10%, transparent);

  --a-radius: 16px;

  /* Longhands, never the 'background' shorthand. chrome.css pulls the page's
     first element up under the nav pill and gives the height back as a
     transparent top border, and relies on 'background-origin: border-box' to
     make the ground paint continuously through it. The shorthand resets
     background-origin, which puts a hard-edged strip back across the top. */
  background-color: var(--a-paper);
  background-image: radial-gradient(1100px 520px at 50% 0%, var(--a-wash), transparent 62%);
  background-repeat: no-repeat;
  background-size: auto;
  color: var(--a-ink);
}

.alib :focus-visible { outline: 2px solid var(--a-gold); outline-offset: 3px; }
.alib ::selection { background: var(--a-wash); color: var(--a-ink); }

/* Figures stand in columns and never dance. */
.alib-fig,
.alib-count,
.alib-rail-n,
.alib-row-meta,
.alib-card-meta {
  font-variant-numeric: tabular-nums;
  font-feature-settings: 'tnum' 1;
}

/* A reading measure wider than the site's 1200 default: this page is an index
   of thirty rows beside a standing rail, not a column of prose. */
.alib-wrap {
  width: 100%;
  max-width: 1280px;
  margin-inline: auto;
  padding-inline: clamp(1.25rem, 4vw, 3rem);
}

/* ============================================================= type */

.alib-label {
  display: block;
  margin: 0;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.16em;
  line-height: 1.45;
  text-transform: uppercase;
  color: var(--a-gold);
}

.alib-h1 {
  font-family: var(--font-display);
  font-weight: 500;
  font-size: clamp(2.75rem, 6.5vw, 5rem);
  line-height: 1.02;
  letter-spacing: -0.03em;
  color: var(--a-ink);
  margin: 16px 0 0;
  max-width: 15ch;
  text-wrap: balance;
}

.alib-h2 {
  font-family: var(--font-display);
  font-weight: 500;
  font-size: clamp(1.75rem, 3.2vw, 2.6rem);
  line-height: 1.08;
  letter-spacing: -0.022em;
  color: var(--a-ink);
  margin: 16px 0 0;
  max-width: 18ch;
  text-wrap: balance;
}

/* The signature link: a 26px hairline that finishes drawing itself on hover
   and on keyboard focus. 'currentColor' so it follows the link's own tone
   rather than needing a second rule for the hover colour. */
.alib-link {
  display: inline-flex;
  align-items: center;
  gap: 12px;
  min-height: 44px;
  font-size: 9.5px;
  font-weight: 800;
  letter-spacing: 0.24em;
  text-transform: uppercase;
  color: var(--a-gold);
  text-decoration: none;
  white-space: nowrap;
  border-radius: 4px;
  transition: color 0.28s var(--a-ease);
}
.alib-link-rule {
  width: 26px;
  height: 1px;
  background: currentColor;
  transform: scaleX(0.62);
  transform-origin: left center;
  transition: transform 0.28s var(--a-ease);
}
.alib-link:hover { color: var(--a-gold-hi); }
.alib-link:hover .alib-link-rule,
.alib-link:focus-visible .alib-link-rule { transform: scaleX(1); }

/* ============================================================= hero */

.alib-hero { padding: clamp(2.75rem, 5.5vw, 5rem) 0 clamp(1.75rem, 3vw, 2.75rem); }

/* The trail sat on ink and was set in a pale tint. On paper it takes the
   page's own dim tone, and keeps a permanent underline so it is not identified
   by colour alone. The negative margin gives each link a 44px hit area without
   opening up the row. */
.alib-crumb { margin: 0 0 clamp(1.5rem, 3vw, 2.25rem); }
.alib-crumb ol {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  list-style: none;
  margin: 0;
  padding: 0;
  font-size: 12.5px;
  letter-spacing: 0.05em;
  color: var(--a-mute);
}
.alib-crumb a {
  display: inline-flex;
  align-items: center;
  min-height: 44px;
  margin-block: -12px;
  color: var(--a-dim);
  text-decoration: underline;
  text-decoration-color: color-mix(in srgb, var(--gray-700) 38%, transparent);
  text-underline-offset: 3px;
  border-radius: 4px;
  transition: color 0.25s var(--a-ease);
}
.alib-crumb a:hover { color: var(--a-gold-hi); text-decoration-color: currentColor; }
.alib-crumb-sep { color: color-mix(in srgb, var(--gray-600) 50%, transparent); }
.alib-crumb [aria-current='page'] { color: var(--a-ink); }

/* Copy-led split: the title takes the wider half, the deck and the two counts
   the narrower. Never 50/50 — an even split gives the eye no order to read in. */
.alib-hero-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 0.82fr);
  gap: clamp(2rem, 5vw, 4.5rem);
  align-items: end;
}

.alib-lede {
  margin: 0;
  padding-top: 20px;
  border-top: 1px solid color-mix(in srgb, var(--gold) 55%, transparent);
  font-size: 15.5px;
  line-height: 1.75;
  color: var(--a-dim);
  max-width: 44ch;
  text-wrap: pretty;
}

.alib-figs {
  display: flex;
  flex-wrap: wrap;
  gap: clamp(1.75rem, 4vw, 3.25rem);
  margin: clamp(1.5rem, 2.5vw, 2rem) 0 0;
}
/* column-reverse so the figure reads above its label while the markup keeps
   the <dt>-before-<dd> order a definition list requires. */
.alib-figs > div { display: flex; flex-direction: column-reverse; }
.alib-figs dd { margin: 0; }
.alib-fig {
  display: block;
  font-family: var(--font-display);
  font-size: clamp(2.5rem, 4.4vw, 3.5rem);
  font-weight: 500;
  line-height: 0.94;
  letter-spacing: -0.035em;
  color: var(--a-ink);
}
.alib-fig-cap {
  display: block;
  margin-bottom: 10px;
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--a-mute);
}

/* ============================================================= sections */

.alib-section { padding: clamp(2.75rem, 5vw, 5rem) 0 0; }

/* The section head: numbered eyebrow and title on the left, a short paragraph
   on the right, over one hairline. */
.alib-head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: clamp(2rem, 5vw, 3.75rem);
  padding-bottom: 20px;
  border-bottom: 1px solid var(--a-line-2);
}
.alib-head-l { min-width: 0; }
.alib-head-b {
  flex: none;
  margin: 0;
  max-width: 34ch;
  font-size: 13.5px;
  line-height: 1.8;
  color: var(--a-mute);
  text-wrap: pretty;
}
.alib-head-fig { flex: none; margin: 0; text-align: right; }
.alib-head-fig .alib-fig { font-size: clamp(2rem, 3vw, 2.75rem); }
.alib-head-fig .alib-fig-cap { margin: 10px 0 0; }

/* ============================================================= start here */

/* The lead against the two that follow it — 1fr / 0.82fr, copy-led. */
.alib-start {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 0.82fr);
  gap: clamp(1.25rem, 2.5vw, 2rem);
  align-items: start;
  padding-top: clamp(1.75rem, 3vw, 2.5rem);
}

/* Image-led inside the lead itself: 1.12fr of picture to 1fr of copy. */
.alib-lead {
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1.12fr) minmax(0, 1fr);
  border-radius: var(--a-radius);
  overflow: hidden;
  border: 1px solid var(--a-line-2);
  /* Depth from a wash rather than a heavier shadow, as the product page does. */
  background:
    radial-gradient(80% 92% at 4% 0%, var(--a-wash) 0%, var(--a-wash-soft) 36%, transparent 74%),
    var(--a-sheet);
  box-shadow: var(--a-shadow-lg);
}
/* No aspect-ratio while the lead is two columns: a grid item stretches to the
   row, so the ratio would be overruled by the copy column's height and the
   picture would stop short of the card's bottom edge — which is exactly what it
   did. The min-height is the floor for a short excerpt, nothing more. */
.alib-lead-shot { position: relative; display: block; min-height: clamp(220px, 26vw, 330px); }
.alib-lead-shot img { object-fit: cover; }
.alib-lead-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: clamp(1.35rem, 2.2vw, 2rem);
}
.alib-lead-title {
  font-family: var(--font-display);
  margin: 0;
  font-size: clamp(1.3rem, 2.1vw, 1.85rem);
  font-weight: 500;
  letter-spacing: -0.022em;
  line-height: 1.18;
  color: var(--a-ink);
  text-wrap: balance;
}
/* Only the headline is the target here, not the whole panel: the lead sits
   beside its own picture and a card-wide overlay would swallow the image's
   own affordance for no gain. */
.alib-lead-title a { color: inherit; text-decoration: none; }
.alib-lead-title a:hover { color: var(--a-gold-hi); }
.alib-lead-excerpt {
  margin: 0;
  font-size: 13.5px;
  line-height: 1.72;
  color: var(--a-mute);
  max-width: 42ch;
  text-wrap: pretty;
}

.alib-side { display: grid; gap: clamp(0.75rem, 1.5vw, 1rem); align-content: start; }

.alib-card {
  position: relative;
  display: grid;
  grid-template-columns: 132px minmax(0, 1fr);
  gap: 18px;
  padding: 16px;
  border-radius: 14px;
  background: var(--a-sheet);
  border: 1px solid var(--a-line-1);
  box-shadow: var(--a-shadow);
  transition:
    border-color 0.32s var(--a-ease),
    box-shadow 0.32s var(--a-ease),
    transform 0.32s var(--a-ease);
}
.alib-card:hover {
  transform: translateY(-2px);
  border-color: var(--a-edge);
  box-shadow: var(--a-shadow-lg);
}
/* The whole card is the target, so the ring has to be drawn on the card — a
   focus ring around the covered text alone is invisible under the overlay. */
.alib-card:focus-within { outline: 2px solid var(--a-gold); outline-offset: 3px; }
.alib-card-shot {
  position: relative;
  display: block;
  aspect-ratio: 4 / 3;
  border-radius: 10px;
  overflow: hidden;
  border: 1px solid var(--a-line-1);
}
.alib-card-shot img { object-fit: cover; }
.alib-card-body { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
.alib-card-title {
  font-family: var(--font-display);
  margin: 0;
  font-size: 16px;
  font-weight: 500;
  letter-spacing: -0.015em;
  line-height: 1.3;
  color: var(--a-ink);
  text-wrap: balance;
}
.alib-card-title a { color: inherit; text-decoration: none; }
.alib-card-title a::after { content: ''; position: absolute; inset: 0; border-radius: inherit; }
.alib-card-title a:hover { color: var(--a-gold-hi); }
.alib-card-meta,
.alib-lead-meta {
  font-size: 11.5px;
  letter-spacing: 0.05em;
  color: var(--a-mute);
}
.alib-lead-meta { margin: auto 0 0; padding-top: 14px; border-top: 1px solid var(--a-line-1); }

/* ============================================================= topics */

/* Seven hubs over four columns. The first spans two, which fills both rows
   exactly and gives the grid a composition instead of a leftover. */
.alib-topics {
  list-style: none;
  margin: clamp(1.75rem, 3vw, 2.5rem) 0 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: clamp(0.75rem, 1.5vw, 1rem);
}
.alib-topics > li:first-child { grid-column: span 2; }

.alib-topic {
  position: relative;
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 208px;
  padding: clamp(1.35rem, 2vw, 1.75rem);
  border-radius: var(--a-radius);
  background: var(--a-sheet);
  border: 1px solid var(--a-line-1);
  box-shadow: var(--a-shadow);
  color: inherit;
  text-decoration: none;
  transition:
    border-color 0.32s var(--a-ease),
    box-shadow 0.32s var(--a-ease),
    transform 0.32s var(--a-ease);
}
.alib-topic:hover {
  transform: translateY(-2px);
  border-color: var(--a-edge);
  box-shadow: var(--a-shadow-lg);
}
.alib-topics > li:first-child .alib-topic {
  background:
    radial-gradient(70% 120% at 0% 0%, var(--a-wash), transparent 68%),
    var(--a-sheet);
}
.alib-topic h3 {
  font-family: var(--font-display);
  margin: 0;
  font-size: clamp(1.05rem, 1.5vw, 1.25rem);
  font-weight: 500;
  letter-spacing: -0.018em;
  line-height: 1.25;
  color: var(--a-ink);
  text-wrap: balance;
}
.alib-topic p {
  margin: 12px 0 20px;
  font-size: 13px;
  line-height: 1.7;
  color: var(--a-mute);
  max-width: 44ch;
  text-wrap: pretty;
}
.alib-topic-foot {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  margin-top: auto;
  padding-top: 16px;
  border-top: 1px solid var(--a-line-1);
}
.alib-count {
  display: block;
  font-family: var(--font-display);
  font-size: clamp(1.9rem, 2.6vw, 2.4rem);
  font-weight: 500;
  line-height: 0.94;
  letter-spacing: -0.03em;
  color: var(--a-gold);
}
.alib-count-cap {
  display: block;
  margin-top: 8px;
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--a-mute);
}
/* The card is the link, so this is a gesture rather than a second target. */
.alib-topic-go { display: inline-flex; align-items: center; gap: 12px; padding-bottom: 6px; }
.alib-topic-rule {
  width: 26px;
  height: 1px;
  background: var(--a-gold);
  transform: scaleX(0.62);
  transform-origin: right center;
  transition: transform 0.28s var(--a-ease);
}
.alib-topic:hover .alib-topic-rule,
.alib-topic:focus-visible .alib-topic-rule { transform: scaleX(1); }

/* ============================================================= the library */

/* The rail stands beside the index rather than above it: with thirty rows in
   seven groups, a reader who wants one subject should not have to scroll for
   the heading. Asymmetric, and the rail is the narrow half. */
.alib-lib {
  display: grid;
  grid-template-columns: minmax(0, 0.3fr) minmax(0, 1fr);
  gap: clamp(2rem, 4vw, 3.5rem);
  align-items: start;
  padding-top: clamp(1.75rem, 3vw, 2.5rem);
}
.alib-rail {
  position: sticky;
  /* Clears the floating nav pill, whose height chrome.css publishes. */
  top: calc(var(--bar-inset, 14px) + var(--bar-h, 70px) + 24px);
}
.alib-rail-h {
  margin: 0 0 12px;
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--a-mute);
}
.alib-rail ol {
  list-style: none;
  margin: 0;
  padding: 0;
  border-top: 1px solid var(--a-line-1);
}
.alib-rail a {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  min-height: 44px;
  padding: 11px 0;
  border-bottom: 1px solid var(--a-line-1);
  font-size: 13px;
  line-height: 1.4;
  color: var(--a-dim);
  text-decoration: none;
  transition: color 0.25s var(--a-ease);
}
.alib-rail a:hover { color: var(--a-gold-hi); text-decoration: underline; text-underline-offset: 3px; }
.alib-rail-n { flex: none; font-size: 12px; color: var(--a-gold); }

.alib-group { scroll-margin-top: calc(var(--bar-inset, 14px) + var(--bar-h, 70px) + 24px); }
.alib-group + .alib-group { margin-top: clamp(2.25rem, 4vw, 3.25rem); }
.alib-group-head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px 24px;
  padding-bottom: 14px;
  border-bottom: 1px solid var(--a-line-2);
}
.alib-group-head h3 {
  font-family: var(--font-display);
  margin: 0;
  font-size: clamp(1.15rem, 1.8vw, 1.45rem);
  font-weight: 500;
  letter-spacing: -0.02em;
  line-height: 1.2;
  color: var(--a-ink);
  text-wrap: balance;
}

.alib-rows { list-style: none; margin: 0; padding: 0; }
.alib-row {
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 6px 24px;
  padding: 20px clamp(0.6rem, 1.2vw, 1rem);
  border-bottom: 1px solid var(--a-line-1);
  border-radius: 12px;
  transition: background 0.28s var(--a-ease);
}
.alib-row:hover,
.alib-row:focus-within { background: var(--a-wash-soft); }
.alib-row:focus-within { outline: 2px solid var(--a-gold); outline-offset: -2px; }
.alib-row-title {
  grid-column: 1;
  font-family: var(--font-display);
  margin: 0;
  font-size: 16.5px;
  font-weight: 500;
  letter-spacing: -0.012em;
  line-height: 1.35;
  color: var(--a-ink);
  text-wrap: balance;
}
.alib-row-title a { color: inherit; text-decoration: none; }
.alib-row-title a::after { content: ''; position: absolute; inset: 0; border-radius: inherit; }
.alib-row-title a:hover { color: var(--a-gold-hi); }
.alib-row-meta {
  grid-column: 2;
  grid-row: 1;
  font-size: 11.5px;
  letter-spacing: 0.05em;
  color: var(--a-mute);
  white-space: nowrap;
}
.alib-row-excerpt {
  grid-column: 1;
  margin: 0;
  font-size: 13px;
  line-height: 1.7;
  color: var(--a-mute);
  max-width: 62ch;
  text-wrap: pretty;
}

/* The page ends on a drawn line rather than on the last row's hairline. */
.alib-foot { padding: clamp(2.5rem, 5vw, 4.5rem) 0 clamp(3rem, 5vw, 5rem); }
.alib-foot-rule {
  height: 1px;
  max-width: 190px;
  margin-inline: auto;
  background: linear-gradient(90deg, transparent, var(--a-gold), transparent);
}

/* ============================================================= responsive */

@media (max-width: 1080px) {
  .alib-hero-grid { grid-template-columns: minmax(0, 1fr); gap: 2rem; align-items: start; }
  .alib-h1 { max-width: 18ch; }
  .alib-start { grid-template-columns: minmax(0, 1fr); }
  .alib-topics { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .alib-lib { grid-template-columns: minmax(0, 1fr); }
  /* A sticky rail above a list it points into is a header, not a rail. */
  .alib-rail { position: static; }
  .alib-head { flex-direction: column; align-items: flex-start; gap: 16px; }
  .alib-head-b { max-width: 62ch; }
  .alib-head-fig { text-align: left; }
}

@media (max-width: 760px) {
  .alib-lead { grid-template-columns: minmax(0, 1fr); }
  /* Stacked, the picture sets its own height again. */
  .alib-lead-shot { min-height: 0; aspect-ratio: 16 / 9; }
  .alib-topics { grid-template-columns: minmax(0, 1fr); }
  .alib-topics > li:first-child { grid-column: auto; }
  .alib-row { grid-template-columns: minmax(0, 1fr); }
  .alib-row-meta { grid-column: 1; grid-row: auto; }
}

@media (max-width: 520px) {
  .alib-card { grid-template-columns: 96px minmax(0, 1fr); gap: 14px; }
}

/* ============================================================= reduced motion */

/* MotionConfig reducedMotion="user" covers everything driven from JS. These are
   the CSS-driven gestures, which it cannot reach. */
@media (prefers-reduced-motion: reduce) {
  .alib-link-rule,
  .alib-topic-rule { transform: scaleX(1); transition: none; }
  .alib-card,
  .alib-topic,
  .alib-row,
  .alib-rail a,
  .alib-crumb a,
  .alib-link { transition: none; }
  .alib-card:hover,
  .alib-topic:hover { transform: none; }
}
`

/**
 * A scroll reveal that is safe to server-render.
 *
 * `motion` writes its `initial` prop into the SSR markup, so the usual
 * `initial={{opacity: 0}}` ships every one of these sections at opacity 0 to
 * anyone whose JS never runs. This site shipped that for months. So the hidden
 * state is never expressed as `initial` — the element renders in its FINAL
 * state on the server and on the first client paint, and is only pulled back to
 * hidden by an effect, and only when it is strictly below the fold at that
 * moment. An element already on screen is never touched, which also means the
 * hero and the lead card (the largest paint) are never animated.
 *
 * Opacity and transform only, and `y` rather than `top`.
 */
function useReveal<T extends HTMLElement>(delay: number) {
  const ref = useRef<T | null>(null)
  const [held, setHeld] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    // Already in view on arrival: leave it exactly as the server drew it.
    if (el.getBoundingClientRect().top < window.innerHeight) return
    // Below the fold, so hiding it now cannot be seen. Converges in one pass:
    // the branch above means a held element can only ever be un-held again.
    setHeld(true)
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setHeld(false)
          io.disconnect()
        }
      },
      { rootMargin: '0px 0px -6% 0px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  return {
    ref,
    initial: false as const,
    animate: held ? { opacity: 0, y: 20 } : { opacity: 1, y: 0 },
    /* Snapping to hidden must not be an animation — it happens off screen and
       the reader should only ever see the way back. */
    transition: held ? { duration: 0 } : { duration: 0.6, delay, ease: EASE },
  }
}

function RevealLi({ children, className, delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  const r = useReveal<HTMLLIElement>(delay)
  return <motion.li className={className} {...r}>{children}</motion.li>
}

function RevealDiv({ children, className, delay = 0, id }: { children: ReactNode; className?: string; delay?: number; id?: string }) {
  const r = useReveal<HTMLDivElement>(delay)
  return <motion.div className={className} id={id} {...r}>{children}</motion.div>
}

/**
 * The two pieces that follow the lead.
 *
 * `alt=""` is deliberate rather than an omission: the headline sits beside the
 * image as live text, so describing the picture would make a screen reader read
 * the same thing twice. These keep next/image's lazy default; the lead below is
 * the largest contentful paint and takes `priority`, so it is both undeferred
 * and preloaded.
 *
 * `fill` because the thumb box is already reserved at 4/3 and the picture crops
 * into it — there is no intrinsic size worth declaring.
 */
function SideCard({ article }: { article: Article }) {
  return (
    <article className="alib-card">
      <span className="alib-card-shot">
        <Image
          src={article.logo}
          alt=""
          fill
          sizes="(max-width: 520px) 96px, 132px"
          decoding="async"
        />
      </span>
      <div className="alib-card-body">
        <p className="alib-label">{article.category}</p>
        <h3 className="alib-card-title">
          <Link href={`/articles/${article.slug}`}>{article.title}</Link>
        </h3>
        <span className="alib-card-meta">{article.dateLabel} · {article.readTime}</span>
      </div>
    </article>
  )
}

export default function Articles() {
  const groups = groupByPrimaryTopic(ARTICLES, TOPICS)
  const [lead, ...rest] = featuredArticles

  return (
    <div className="alib">
      {/* dangerouslySetInnerHTML rather than a text child: React escapes text,
          and an escaped `>` inside a <style> element is a literal `&gt;` to the
          CSS parser, which would break every child combinator in the sheet. The
          content is this module's own constant — nothing here is user input. */}
      <style dangerouslySetInnerHTML={{ __html: SHEET }} />

      <SEO
        title="Articles — Global Investing Insights"
        description="Browse every Platizio Global article — education-first reads on US Stocks, ETFs, the LRS, taxation, GIFT City, RSUs, currency risk, and global investing for Indian investors."
        canonical="/articles"
        jsonLd={[
          breadcrumbSchema([['Home', '/'], ['Articles', '/articles']]),
          itemListSchema(
            ARTICLES.map((a) => ({ name: a.title, path: `/articles/${a.slug}` }))
          ),
        ]}
      />

      {/* --------------------------------------------------------- hero */}
      <section className="alib-hero">
        <div className="alib-wrap">
          <nav className="alib-crumb" aria-label="Breadcrumb">
            <ol>
              <li><Link href="/">Home</Link></li>
              <li aria-hidden="true" className="alib-crumb-sep">/</li>
              <li><Link href="/media">Media</Link></li>
              <li aria-hidden="true" className="alib-crumb-sep">/</li>
              <li aria-current="page">Articles</li>
            </ol>
          </nav>

          <div className="alib-hero-grid">
            <div>
              <p className="alib-label">The library</p>
              <h1 className="alib-h1">Articles</h1>
            </div>

            <div>
              <p className="alib-lede">
                {ARTICLES.length} education-first reads across {TOPICS.length} subjects —
                US stocks, ETFs, the LRS, taxation and GIFT City, written for Indian
                investors.
              </p>
              {/* The two numbers the deck already states, given the weight the
                  product page gives a figure: oversized, tabular, tight. */}
              <dl className="alib-figs">
                <div>
                  <dt className="alib-fig-cap">Articles</dt>
                  <dd><span className="alib-fig">{ARTICLES.length}</span></dd>
                </div>
                <div>
                  <dt className="alib-fig-cap">Subjects</dt>
                  <dd><span className="alib-fig">{TOPICS.length}</span></dd>
                </div>
              </dl>
            </div>
          </div>
        </div>
      </section>

      {/* ----------------------------------------------------- start here */}
      {lead && (
        <section className="alib-section" aria-labelledby="lib-start">
          <div className="alib-wrap">
            <header className="alib-head">
              <div className="alib-head-l">
                <h2 className="alib-h2" id="lib-start">If you are reading one thing</h2>
              </div>
              <p className="alib-head-fig">
                <span className="alib-fig">{featuredArticles.length}</span>
                <span className="alib-fig-cap">selected of {ARTICLES.length}</span>
              </p>
            </header>

            <div className="alib-start">
              {/* No motion on this one. It holds the page's largest paint. */}
              <article className="alib-lead">
                <span className="alib-lead-shot">
                  <Image
                    src={lead.logo}
                    alt=""
                    fill
                    /* Measured, not guessed. Above 1080 the shot is 1.12 of a
                       2.12fr card inside the 1fr half of a 1fr/0.82fr split —
                       about 340px on a 1280 measure. Between 760 and 1080 the
                       split stacks but the card does not, so it is half the
                       gutter width; below 760 the card stacks too. */
                    sizes="(max-width: 760px) 92vw, (max-width: 1080px) 49vw, 340px"
                    priority
                    decoding="async"
                  />
                </span>
                <div className="alib-lead-body">
                  <p className="alib-label">{lead.category}</p>
                  <h3 className="alib-lead-title">
                    <Link href={`/articles/${lead.slug}`}>{lead.title}</Link>
                  </h3>
                  <p className="alib-lead-excerpt">{lead.excerpt}</p>
                  <span className="alib-lead-meta">{lead.dateLabel} · {lead.readTime}</span>
                </div>
              </article>

              <div className="alib-side">
                {rest.map((a) => <SideCard key={a.slug} article={a} />)}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* --------------------------------------------------------- topics */}
      <section className="alib-section" aria-labelledby="lib-topics">
        <div className="alib-wrap">
          <header className="alib-head">
            <div className="alib-head-l">
              <h2 className="alib-h2" id="lib-topics">Browse by topic</h2>
            </div>
            <p className="alib-head-b">
              A topic collects every article that touches it, so a piece can appear
              under more than one.
            </p>
          </header>

          <ul className="alib-topics">
            {TOPICS.map((topic, i) => {
              const count = articlesByTopic(topic.id).length
              return (
                /* Staggered, but shallow: past about 60ms a step the tail of a
                   grid visibly lags behind its head and the reveal becomes the
                   subject. */
                <RevealLi key={topic.id} delay={i * 0.05}>
                  <Link className="alib-topic" href={`/articles/topic/${topic.id}`}>
                    <h3>{topic.title}</h3>
                    <p>{topic.blurb}</p>
                    <span className="alib-topic-foot">
                      <span>
                        <span className="alib-count">{count}</span>
                        <span className="alib-count-cap">
                          {count === 1 ? 'article' : 'articles'}
                        </span>
                      </span>
                      <span className="alib-topic-go" aria-hidden="true">
                        <span className="alib-topic-rule" />
                      </span>
                    </span>
                  </Link>
                </RevealLi>
              )
            })}
          </ul>
        </div>
      </section>

      {/* -------------------------------------------------------- library */}
      <section className="alib-section" aria-labelledby="lib-all">
        <div className="alib-wrap">
          <header className="alib-head">
            <div className="alib-head-l">
              <h2 className="alib-h2" id="lib-all">Everything, by primary subject</h2>
            </div>
            <p className="alib-head-b">
              Each article is filed once, under the subject it is mainly about.
              Newest first within each group.
            </p>
          </header>

          <div className="alib-lib">
            {/* Plain hash links: site-chrome.tsx already intercepts every
                a[href^="#"] on the site and routes it through Lenis with the
                nav-pill offset applied, so this must not call scrollIntoView
                and must not install a second handler. */}
            <nav className="alib-rail" aria-label="Subjects in this index">
              <p className="alib-rail-h">In this index</p>
              <ol>
                {groups.map(({ topic, articles }) => (
                  <li key={topic.id}>
                    <a href={`#group-${topic.id}`}>
                      <span>{topic.title}</span>
                      <span className="alib-rail-n">{articles.length}</span>
                    </a>
                  </li>
                ))}
              </ol>
            </nav>

            <div>
              {groups.map(({ topic, articles }, i) => {
                /* Two different true numbers under one heading: this group holds
                   the articles filed HERE, while the hub above collects everything
                   that touches the subject. Printing only one of them made the
                   topic card say "14 articles" above a group listing one row. */
                const inHub = articlesByTopic(topic.id).length
                return (
                  <RevealDiv className="alib-group" id={`group-${topic.id}`} key={topic.id} delay={i === 0 ? 0 : 0.04}>
                    <div className="alib-group-head">
                      <h3>{topic.title}</h3>
                      <Link className="alib-link" href={`/articles/topic/${topic.id}`}>
                        {articles.length === inHub
                          ? `All ${inHub} in the hub`
                          : `${articles.length} filed here · ${inHub} in the hub`}
                        <span className="alib-link-rule" aria-hidden="true" />
                      </Link>
                    </div>
                    <ul className="alib-rows">
                      {articles.map((a) => (
                        <li className="alib-row" key={a.slug}>
                          <h4 className="alib-row-title">
                            <Link href={`/articles/${a.slug}`}>{a.title}</Link>
                          </h4>
                          <span className="alib-row-meta">{a.dateLabel} · {a.readTime}</span>
                          <p className="alib-row-excerpt">{a.excerpt}</p>
                        </li>
                      ))}
                    </ul>
                  </RevealDiv>
                )
              })}
            </div>
          </div>
        </div>
      </section>

      <div className="alib-foot">
        <div className="alib-wrap">
          <div className="alib-foot-rule" aria-hidden="true" />
        </div>
      </div>
    </div>
  )
}
