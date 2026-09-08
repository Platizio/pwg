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
