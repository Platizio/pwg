---
version: 1
slug: "app-terminal-page-tsx"
primary_target: "app/(terminal)/page.tsx"
related_targets: ["components/dashboard/dashboard.tsx"]
---

## Scope

The dashboard at `/`. Visitor mode: **Operate**. The screener at
`/instrument/[ticker]` is out of scope and still uses the hairline system; the
sidebar is shared and has moved to the card surface.

## The wireframe this is built to

The user marked up a screenshot of the previous build. Six blocks, and the
marks at the outer margins were an instruction to **use the full width**, not
content:

    ✓ session line                     (ticked — keep)
    ▢ top gainers  |  ▢ top losers
    ▢ popular stocks, rotating ribbon, ticker + logo + info
    ▢ sectoral divisions, four each, view-all below
    ▢ key events of the market
    ▢ latest news as per the market

Everything else on that screenshot was struck out. The build is exactly these
six and nothing more.

## Visual language

Meridian v2 — the lit-card surface, taken from a second reference the user
pinned (a prop-trading dashboard). Adopted: 16px radius, filled gradient cards
with an inset top highlight and a pooled shadow, a champagne-glow card, pill
controls, an icon-tile navigation rail, tick meters, cream CTA pill.

**Kept from Meridian:** the three voices. Instrument Serif for names and
magnitudes, IBM Plex Mono for comparable figures, Manrope for labels. This is
the single thing that stops the surface reading as a clone of the reference.

**Two label voices.** Cards name things in title case at 14px (`card-label`).
The tracked-caps eyebrow survives only where something is annotated rather than
named — the role under the user's name, and badges.

## Constraints this surface must keep

- **No line charts.** The user removed them explicitly; the equity plot that
  briefly returned was cut again because it is not one of the six blocks.
- **Covered vs quoted.** The universe is larger than the six instruments with
  pages. Only covered symbols render as links.
- **The glow lives on the ribbon card.** It is the one extravagance; the light
  pools low so the heading stays in the dark half and the cells silhouette.
- The wash is capped at 0.16 alpha — the measured AA ceiling. See DESIGN.md's
  Lit Ground Rule before touching it.
- `ink-4` is decoration only. Text bottoms out at `ink-3`.

## Unresolved

- The rail's `Calendar`, `Preferences` and `Concierge desk` items, the collapse
  button and the language pill are inert.
- The watchlist in the sidebar has no counterpart in either reference. It was
  kept because `/instrument/*` depends on it for navigation.
- The book no longer appears on the dashboard; portfolio value is in the rail.
- The screener still uses the hairline system, so crossing to `/instrument/*`
  shows a visible change of surface.
