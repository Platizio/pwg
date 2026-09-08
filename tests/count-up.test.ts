import { test } from "node:test";
import assert from "node:assert/strict";
import { figureWidth, widestSample } from "../lib/motion.ts";

/* A counter that animates 0 -> 1,000 renders "7", then "438", then "1,000". If
   the element is only as wide as whatever it currently shows, everything beside
   it slides about for the length of the animation — a stat row that reflows
   twice a second while it counts.

   So the element reserves the widest thing it will ever render, up front. That
   needs two pure pieces: a width for a rendered string, and a walk over the
   values the counter will pass through. Neither can be a character count on its
   own — the site sets `font-variant-numeric: tabular-nums`, which makes every
   DIGIT one width, and leaves the comma and the point narrow. "99999" is wider
   than "1,000" despite both being five characters. */

test("a digit is one figure wide and a comma is half of one", () => {
  assert.equal(figureWidth("1234"), 4);
  assert.equal(figureWidth("1,000"), 4.5);
  assert.equal(figureWidth("99999"), 5);
  assert.equal(figureWidth(""), 0);
});

test("the wider of two equal-length figures is the one with fewer separators", () => {
  assert.ok(figureWidth("99999") > figureWidth("1,000"));
  assert.equal("99999".length, "1,000".length);
});

test("counting up reserves the end, which is the longest number", () => {
  const fmt = (n: number) => new Intl.NumberFormat("en-US").format(Math.round(n));
  assert.equal(widestSample(0, 1000, fmt), "1,000");
});

test("counting down reserves the start, for the same reason", () => {
  const fmt = (n: number) => new Intl.NumberFormat("en-US").format(Math.round(n));
  assert.equal(widestSample(24500, 12, fmt), "24,500");
});

test("a rendering wider than either end is found rather than missed", () => {
  /* Real shape: a stat that abbreviates above ten thousand, so the widest thing
     it ever shows is the last un-abbreviated number on the way there. */
  const fmt = (n: number) => (n === 50 ? "-88.88%" : String(Math.round(n)));
  assert.equal(widestSample(0, 100, fmt, 5), "-88.88%");
});

test("both ends are measured whatever the sample count", () => {
  const fmt = (n: number) => new Intl.NumberFormat("en-US").format(Math.round(n));
  for (const samples of [0, 1, 2, 3, 7, 40]) {
    const w = figureWidth(widestSample(0, 1000, fmt, samples));
    assert.ok(w >= figureWidth(fmt(0)), `${samples} samples missed the start`);
    assert.ok(w >= figureWidth(fmt(1000)), `${samples} samples missed the end`);
  }
});

test("it never invents a string the counter cannot actually show", () => {
  /* Reserving "0000" for a counter that only ever renders "1,000" would be a
     lie the layout pays for on every render. */
  const fmt = (n: number) => new Intl.NumberFormat("en-US").format(Math.round(n));
  const seen = new Set<string>();
  for (let i = 0; i <= 1000; i++) seen.add(fmt(i));
  assert.ok(seen.has(widestSample(0, 1000, fmt)));
});

test("a counter that does not move still reserves its one rendering", () => {
  assert.equal(widestSample(42, 42, (n) => `${n}%`), "42%");
});

test("a counter running through zero measures the sign", () => {
  const fmt = (n: number) => (n > 0 ? "+" : "") + n.toFixed(1);
  assert.equal(widestSample(-12.5, 0.5, fmt), "-12.5");
});
