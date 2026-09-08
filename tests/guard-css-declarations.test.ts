import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { parseCss } from "../lib/css-audit.ts";

/* Declarations that are not there, and declarations that are there twice.
 *
 * Both of these have shipped from this repo, and both shipped because CSS has
 * no failure mode. A declaration with no value is not a syntax error, it is a
 * declaration the browser drops — `box-shadow:` followed by nothing removed
 * the shadow from two tile types in products.css while every sibling tile kept
 * theirs, and the page rendered, and nothing anywhere said so. The same is
 * true of writing one property twice: `.ft-ind` declared `position` twice, the
 * second won, and a panel that was meant to be `sticky` quietly stopped
 * sticking. The comment at products.css:118 is the postmortem.
 *
 * A duplicate property is treated as a defect with no exceptions, including
 * the old progressive-enhancement idiom of declaring a fallback and then
 * overwriting it. That idiom is indistinguishable from the bug by reading, and
 * `@supports` says the same thing legibly — except in this build, where
 * `@supports` has its own trap, which is the third test below.
 */

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const IGNORED = new Set(["node_modules", ".next", ".git"]);

function cssFiles(dir: string = ROOT, found: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (IGNORED.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) cssFiles(full, found);
    else if (entry.name.endsWith(".css")) found.push(full);
  }
  return found.sort();
}

const sheets = cssFiles().map((path) => ({
  path,
  name: relative(ROOT, path),
  css: readFileSync(path, "utf8"),
}));

/* A guard that reads nothing passes for the wrong reason. */
test("the declaration lint actually has stylesheets to read", () => {
  assert.ok(sheets.length >= 10, `found only ${sheets.length} stylesheets to lint`);
});

/* What it would have caught: products.css shipping `box-shadow:` with nothing
   after it, twice, so two tile types lost a shadow their siblings kept. */
test("no declaration in the project's CSS ships without a value", () => {
  const empty: string[] = [];
  for (const sheet of sheets) {
    for (const rule of parseCss(sheet.css)) {
      for (const d of rule.declarations) {
        if (d.value === "") empty.push(`${sheet.name}:${d.line}  ${rule.prelude} { ${d.property}: }`);
      }
    }
  }
  assert.deepEqual(empty, [], `declarations with no value:\n${empty.join("\n")}`);
});

/* What it would have caught: `.ft-ind { position: sticky; … position: … }` —
   the second declaration silently winning and un-sticking the panel. */
test("no rule block declares the same property twice", () => {
  const dupes: string[] = [];
  for (const sheet of sheets) {
    for (const rule of parseCss(sheet.css)) {
      const seen = new Map<string, number>();
      for (const d of rule.declarations) {
        const prop = d.property.toLowerCase();
        const first = seen.get(prop);
        if (first !== undefined) {
          dupes.push(`${sheet.name}:${d.line}  ${rule.prelude} { ${prop} } — already declared at line ${first}`);
        }
        seen.set(prop, d.line);
      }
    }
  }
  assert.deepEqual(dupes, [], `properties declared twice in one block:\n${dupes.join("\n")}`);
});

/* This build's CSS minifier empties any @supports block whose declaration uses
   a var() — verified in the browser, where the rule shipped as literally
   `.nav { }`. glass.css and marketing-surfaces.css both record the finding and
   both write the filter as a literal with no @supports wrapper for exactly
   this reason. The test stops the wrapper coming back. */
test("no @supports gates a backdrop-filter on a custom property", () => {
  const offenders: string[] = [];
  for (const sheet of sheets) {
    for (const rule of parseCss(sheet.css)) {
      const chain = [...rule.ancestors, rule.prelude];
      const supports = chain.filter((p) => p.startsWith("@supports"));
      if (supports.length === 0) continue;

      for (const condition of supports) {
        if (/backdrop-filter/i.test(condition) && /var\(/i.test(condition)) {
          offenders.push(`${sheet.name}:${rule.line}  condition: ${condition}`);
        }
      }
      for (const d of rule.declarations) {
        if (/backdrop-filter$/i.test(d.property) && /var\(/i.test(d.value)) {
          offenders.push(`${sheet.name}:${d.line}  ${d.property}: ${d.value}`);
        }
      }
    }
  }
  assert.deepEqual(offenders, [], `@supports bodies this build's minifier will empty:\n${offenders.join("\n")}`);
});

/* The build's prefixer keeps the unprefixed `backdrop-filter` only when the
   rule does not also spell `-webkit-backdrop-filter` by hand; write both and
   the served rule carries the prefixed one alone, which Chrome ignores, so the
   glass never blurs. Verified against the served chunk on 5 September 2026.
   The pipeline adds the prefix itself, so the source never writes it. */
test("no sheet under app/(site) hand-writes -webkit-backdrop-filter", () => {
  const offenders: string[] = [];
  for (const sheet of sheets) {
    if (!sheet.name.startsWith("app/(site)/")) continue;
    for (const rule of parseCss(sheet.css)) {
      for (const d of rule.declarations) {
        if (d.property.toLowerCase() === "-webkit-backdrop-filter") offenders.push(`${sheet.name}:${d.line}  ${rule.prelude}`);
      }
    }
  }
  assert.deepEqual(offenders, [], `hand-written -webkit-backdrop-filter (the prefixer drops the unprefixed line):\n${offenders.join("\n")}`);
});

/* The three lints above pass on a clean tree, which is exactly when a broken
   detector looks like a healthy codebase. These pin the detectors themselves
   to the shapes of the defects that shipped — including the shape that must
   NOT trip them: a value that simply continues on the next line. */
test("the detectors recognise the defects they were written for", () => {
  const sample = `
.tile {
  box-shadow: ;
  position: sticky;
  color: red;
  position: relative;
}
.card {
  /* a value on the following line is a value, not an absence */
  box-shadow:
    var(--card-shadow-md);
}
@supports (backdrop-filter: blur(1px)) {
  .nav { backdrop-filter: var(--glass-filter); }
}
`;
  const rules = parseCss(sample);

  const tile = rules.find((r) => r.prelude === ".tile");
  assert.ok(tile, "the parser lost a rule");
  assert.deepEqual(
    tile.declarations.filter((d) => d.value === "").map((d) => d.property),
    ["box-shadow"],
    "an empty declaration must be seen as empty",
  );
  assert.equal(
    tile.declarations.filter((d) => d.property === "position").length,
    2,
    "both halves of a duplicated property must be seen",
  );

  const card = rules.find((r) => r.prelude === ".card");
  assert.equal(card?.declarations[0].value, "var(--card-shadow-md)", "a multi-line value must not read as empty");

  const nav = rules.find((r) => r.prelude === ".nav");
  assert.ok(nav?.ancestors.some((a) => a.startsWith("@supports")), "an @supports ancestor must be recorded");
  assert.match(nav?.declarations[0].value ?? "", /var\(/);
});
