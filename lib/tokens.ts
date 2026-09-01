/**
 * The Lux palette.
 *
 * This module used to hold the dark palette as literal hex, mirroring
 * `app/globals.css`. That worked while there was one lighting. Once the light
 * theme landed, every consumer of this module kept painting dark values onto
 * paper: the pale mint `up` and salmon `down` measured about 1.05:1 on cream,
 * and the chart grid — near-black by design on a near-black ground — read as a
 * heavy cage over the series it exists to support.
 *
 * So `C` now yields CSS custom properties rather than literals. Every consumer
 * here writes them into inline styles, SVG attributes or CSS gradient strings,
 * all of which resolve `var()` natively and therefore follow the theme with no
 * JavaScript at all.
 *
 * The one exception is <canvas>, which cannot resolve `var()`. `chartPalette()`
 * below reads the same custom properties off the document and hands back
 * literals, so the chart stays on the same tokens as everything else instead of
 * keeping a private copy of them.
 */
export const C = {
  page: "var(--color-page)",
  shell: "var(--color-shell)",
  rail: "var(--color-rail)",
  raised: "var(--color-raised)",

  rule: "var(--color-rule)",
  ruleSection: "var(--color-rule-section)",
  ruleList: "var(--color-rule-list)",
  ruleTable: "var(--color-rule-table)",
  ruleRaised: "var(--color-rule-raised)",
  ruleMono: "var(--color-rule-mono)",
  ruleDot: "var(--color-rule-dot)",

  ink: "var(--color-ink)",
  ink2: "var(--color-ink-2)",
  ink3: "var(--color-ink-3)",
  ink4: "var(--color-ink-4)",

  gold: "var(--color-gold)",
  goldHi: "var(--color-gold-hi)",
  goldDim: "var(--color-gold-dim)",
  goldDeep: "var(--color-gold-deep)",
  onGold: "var(--color-on-gold)",

  up: "var(--color-up)",
  down: "var(--color-down)",
  onDown: "var(--color-on-down)",

  gridH: "var(--c-grid-h)",
  gridV: "var(--c-grid-v)",

  crosshair: "var(--c-crosshair)",
  upFill: "var(--c-up-fill)",
  downFill: "var(--c-down-fill)",
} as const;

/** The custom properties `chartPalette` resolves, and what it falls back to. */
const CHART_VARS = {
  shell: ["--c-shell", "#0b0a09"],
  raised: ["--c-raised", "#15120f"],
  ruleSection: ["--c-rule-section", "#201b17"],
  ruleMono: ["--c-rule-mono", "#3a2f22"],
  ink4: ["--c-ink-4", "#8a8076"],
  goldDeep: ["--c-gold-deep", "#8a6e43"],
  up: ["--c-up", "#7dd3a0"],
  down: ["--c-down", "#e0796b"],
  gridH: ["--c-grid-h", "#15120f"],
  gridV: ["--c-grid-v", "#131110"],
  crosshair: ["--c-crosshair", "rgba(217, 189, 139, 0.4)"],
  upFill: ["--c-up-fill", "rgba(125, 211, 160, 0.42)"],
  downFill: ["--c-down-fill", "rgba(224, 121, 107, 0.42)"],
} as const;

export type ChartPalette = Record<keyof typeof CHART_VARS, string>;

/**
 * Literal colours for <canvas>, read off the live document.
 *
 * Returns the dark fallbacks during server render and before hydration, which
 * is the theme the page ships in unless the reader has chosen otherwise. The
 * chart re-reads this on theme change, so a wrong first guess corrects itself
 * on the same frame rather than persisting.
 */
export function chartPalette(): ChartPalette {
  const out = {} as Record<string, string>;
  const cs =
    typeof window === "undefined" ? null : getComputedStyle(document.documentElement);
  for (const [key, [prop, fallback]] of Object.entries(CHART_VARS)) {
    const v = cs?.getPropertyValue(prop).trim();
    out[key] = v || fallback;
  }
  return out as ChartPalette;
}

/**
 * The chart canvas's font family, resolved to a literal.
 *
 * Canvas is not CSS: `ctx.font` parses a font shorthand and silently discards
 * anything it cannot read, so `"10px var(--font-mono)"` left the axis figures at
 * the browser default — 10px sans-serif — while every other number on the page
 * was Outfit with tabular figures. The mismatch was invisible in code review and
 * obvious on screen once you looked for it.
 *
 * Custom properties substitute their own var() references in the computed value,
 * so reading --font-mono here yields a plain family list the canvas accepts. The
 * server-side fallback is a literal for the same reason.
 */
export function chartFontFamily(): string {
  const fallback = "ui-sans-serif, system-ui, sans-serif";
  if (typeof window === "undefined") return fallback;
  return getComputedStyle(document.documentElement).getPropertyValue("--font-mono").trim() || fallback;
}

/** Peers borrow from this rotation — the Lux source gives them no colour of their own. */
export const PEER_COLORS = [
  "#E5DDD1",
  "#D9BD8B",
  "#93C7A8",
  "#B0BFCB",
  "#C9A88A",
] as const;

/** Market-share segments, light to dark. */
export const SHARE_BG = ["#D9BD8B", "#8A6E43", "#4A3B26", "#221D18"] as const;
export const SHARE_FG = ["#1A1207", "#F2EDE5", "#C7BFB4", "#8A8076"] as const;

/** The design's ease — every reveal, meter and wipe shares it. */
export const EASE = [0.22, 1, 0.36, 1] as const;
export const EASE_CSS = "cubic-bezier(0.22, 1, 0.36, 1)";

export const trend = (up: boolean) => (up ? C.up : C.down);
