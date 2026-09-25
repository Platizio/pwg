import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { contrastRatio, customProperties, parseCss, parseColor, resolveVars } from "../lib/css-audit.ts";
import { presentation } from "../lib/market/universe.ts";
import { PEER_COLORS } from "../lib/tokens.ts";

/* The five colours a ticker is set in, measured in both lightings.
 *
 * They were literals, the dark theme's pastels, written into inline styles, so
 * the light theme drew them on cream at 1.19:1 to 1.97:1: "MCD" in gold and a
 * "P" monogram in cream all but vanished. They are custom properties now, with
 * a deeper set for paper, and a ticker symbol is 12px text, so every one has to
 * clear the 4.5:1 AA floor on every ground a ticker is drawn on. */

const css = readFileSync(fileURLToPath(new URL("../app/globals.css", import.meta.url)), "utf8");
const rules = parseCss(css);

const dark = customProperties(rules, (p) => p === ":root");
const pinnedLight = customProperties(rules, (p) => p === ":root[data-theme='light']");
const systemLight = customProperties(rules, (p) => p === ":root:not([data-theme='dark'])");

const MARKS = ["--c-mark-1", "--c-mark-2", "--c-mark-3", "--c-mark-4", "--c-mark-5"];
const GROUNDS = ["--c-page", "--c-shell", "--c-raised", "--c-card-to"];

function colour(name: string, vars: Map<string, string>) {
  const parsed = parseColor(resolveVars(`var(${name})`, vars));
  assert.ok(parsed, `${name} does not resolve to a colour`);
  return parsed;
}

for (const [theme, vars] of [
  ["dark", dark],
  ["light", pinnedLight],
] as const) {
  for (const mark of MARKS) {
    test(`${mark} clears 4.5:1 on every ${theme} ground`, () => {
      for (const ground of GROUNDS) {
        const ratio = contrastRatio(colour(mark, vars), colour(ground, vars));
        assert.ok(ratio >= 4.5, `${mark} on ${ground} (${theme}) measures ${ratio.toFixed(2)}:1`);
      }
    });
  }
}

test("both ways into the light theme set the same five marks", () => {
  for (const mark of MARKS) {
    assert.equal(systemLight.get(mark), pinnedLight.get(mark), `${mark} differs between the light blocks`);
  }
});

test("a ticker's colour is a theme token, never a literal", () => {
  for (const symbol of ["AAPL", "MCD", "AVGO", "PG", "ZZZZQ"]) {
    assert.match(presentation(symbol).color, /^var\(--c-mark-[1-5]\)$/, symbol);
  }
  for (const c of PEER_COLORS) assert.match(c, /^var\(--c-mark-[1-5]\)$/);
});
