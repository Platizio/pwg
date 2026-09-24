import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

import {
  RAIL_ATTR,
  RAIL_FOLDED,
  RAIL_PRE_PAINT,
  RAIL_STORAGE_KEY,
  applyFolded,
  readFolded,
  writeFolded,
} from "../components/terminal/rail-fold.ts";

/* A storage that holds strings, and one that refuses every call the way
   Safari's private mode and a blocked-cookies profile do. */
function memoryStorage(seed: Record<string, string> = {}) {
  const map = new Map(Object.entries(seed));
  return {
    getItem: (k: string) => (map.has(k) ? (map.get(k) as string) : null),
    setItem: (k: string, v: string) => void map.set(k, v),
    map,
  };
}
const refusing = {
  getItem: () => {
    throw new Error("SecurityError");
  },
  setItem: () => {
    throw new Error("QuotaExceededError");
  },
};

/* The slice of an element the helpers touch. */
function fakeRoot() {
  const attrs = new Map<string, string>();
  return {
    setAttribute: (k: string, v: string) => void attrs.set(k, v),
    removeAttribute: (k: string) => void attrs.delete(k),
    getAttribute: (k: string) => attrs.get(k) ?? null,
    attrs,
  };
}

test("only the exact folded value reads as folded", () => {
  assert.equal(readFolded(memoryStorage({ [RAIL_STORAGE_KEY]: RAIL_FOLDED })), true);
  assert.equal(readFolded(memoryStorage({ [RAIL_STORAGE_KEY]: "open" })), false);
  assert.equal(readFolded(memoryStorage({ [RAIL_STORAGE_KEY]: "true" })), false);
  assert.equal(readFolded(memoryStorage()), false);
});

test("storage that throws or is absent reads as open, never as an error", () => {
  assert.equal(readFolded(refusing), false);
  assert.equal(readFolded(undefined), false);
});

test("writing round-trips through the reader", () => {
  const s = memoryStorage();
  assert.equal(writeFolded(s, true), true);
  assert.equal(readFolded(s), true);
  assert.equal(writeFolded(s, false), true);
  assert.equal(readFolded(s), false);
  assert.equal(s.map.get(RAIL_STORAGE_KEY), "open");
});

test("a refused write reports it and does not throw", () => {
  assert.equal(writeFolded(refusing, true), false);
  assert.equal(writeFolded(undefined, true), false);
});

test("applyFolded sets and clears the root attribute", () => {
  const root = fakeRoot();
  applyFolded(root, true);
  assert.equal(root.getAttribute(RAIL_ATTR), RAIL_FOLDED);
  applyFolded(root, false);
  assert.equal(root.getAttribute(RAIL_ATTR), null);
});

/* The inline script is a string the browser runs before React exists, so it
   cannot import the constants. Run it for real against the same fakes. */
function runPrePaint(storage: unknown) {
  const root = fakeRoot();
  vm.runInNewContext(RAIL_PRE_PAINT, {
    localStorage: storage,
    document: { documentElement: root },
  });
  return root;
}

test("the pre-paint script folds the rail for a stored choice", () => {
  const root = runPrePaint(memoryStorage({ [RAIL_STORAGE_KEY]: RAIL_FOLDED }));
  assert.equal(root.getAttribute(RAIL_ATTR), RAIL_FOLDED);
});

test("the pre-paint script leaves the rail open otherwise", () => {
  assert.equal(runPrePaint(memoryStorage()).getAttribute(RAIL_ATTR), null);
  assert.equal(
    runPrePaint(memoryStorage({ [RAIL_STORAGE_KEY]: "open" })).getAttribute(RAIL_ATTR),
    null,
  );
});

test("the pre-paint script survives storage that throws", () => {
  assert.doesNotThrow(() => runPrePaint(refusing));
  assert.equal(runPrePaint(refusing).getAttribute(RAIL_ATTR), null);
});

/* Tailwind reads class names out of the source as literal text, so the
   collapsed-state variants in work-column.tsx spell the attribute out rather
   than interpolating the constant. This is what keeps the two in step. */
test("work-column's collapsed variants name the same attribute and value", () => {
  const src = readFileSync(
    new URL("../components/terminal/work-column.tsx", import.meta.url),
    "utf8",
  );
  const variant = `[:root[${RAIL_ATTR}=${RAIL_FOLDED}]_&]:`;
  assert.ok(src.includes(variant), `expected ${variant} in work-column.tsx`);
  const other = src.match(/\[:root\[[^\]]+\]_&\]:/g) ?? [];
  assert.ok(other.length > 0);
  for (const v of other) assert.equal(v, variant);
});
