import { test } from "node:test";
import assert from "node:assert/strict";
import { slugifyHeading, tocItems } from "../lib/motion.ts";

/* 41 of the site's 50 URLs are long documents with no in-page navigation, so
   the contents list is the single highest-value thing this layer ships. It is
   only worth anything if its links land: every entry needs an id that exists
   on the page, exactly once.

   Duplicate ids are the failure mode that looks fine in review. Two sections
   called "Fees" both slugify to #fees, the browser jumps to the first one for
   both links, and the second entry is dead while still highlighting as you
   scroll past it. */

test("a heading that already has an id keeps it", () => {
  /* An id in the markup is a URL someone may have shared. Regenerating it
     silently breaks every existing deep link to the page. */
  const items = tocItems([{ id: "how-fees-work", text: "How fees work", level: 2 }]);
  assert.equal(items[0].id, "how-fees-work");
});

test("a heading without one is named after its text", () => {
  assert.deepEqual(
    tocItems([{ text: "Opening an account", level: 2 }]).map((i) => i.id),
    ["opening-an-account"],
  );
});

test("two headings with the same words get two different anchors", () => {
  const items = tocItems([
    { text: "Fees", level: 2 },
    { text: "What we cover", level: 2 },
    { text: "Fees", level: 2 },
  ]);
  assert.deepEqual(items.map((i) => i.id), ["fees", "what-we-cover", "fees-2"]);
  assert.equal(new Set(items.map((i) => i.id)).size, items.length);
});

test("a supplied id still wins the collision, and the generated one moves", () => {
  const items = tocItems([
    { text: "Fees", level: 2 },
    { id: "fees", text: "Charges and fees", level: 2 },
  ]);
  assert.equal(new Set(items.map((i) => i.id)).size, 2);
  assert.ok(items.some((i) => i.id === "fees"));
});

test("punctuation, case and runs of space collapse to one hyphen", () => {
  assert.equal(slugifyHeading("Fees, charges & what they cover"), "fees-charges-what-they-cover");
  assert.equal(slugifyHeading("  What's next?  "), "whats-next");
  assert.equal(slugifyHeading("Section 3 — the close"), "section-3-the-close");
});

test("a slug never opens or closes on a hyphen", () => {
  assert.equal(slugifyHeading("— Fees —"), "fees");
  assert.equal(slugifyHeading("(2026)"), "2026");
});

test("a heading with no letters left still gets a usable anchor", () => {
  /* "→" slugifies to nothing. An empty id is an anchor that goes to the top of
     the page, which reads as a broken link rather than an absent one. */
  const items = tocItems([{ text: "Intro", level: 2 }, { text: "→", level: 2 }]);
  assert.equal(items[1].id, "section-2");
  assert.ok(items[1].id.length > 0);
});

test("headings outside the requested levels are dropped, not renumbered around", () => {
  const source = [
    { text: "Title", level: 1 },
    { text: "One", level: 2 },
    { text: "One point one", level: 3 },
    { text: "Deep", level: 4 },
  ];
  assert.deepEqual(tocItems(source, { levels: [2, 3] }).map((i) => i.text), ["One", "One point one"]);
  assert.deepEqual(tocItems(source).map((i) => i.text), ["One", "One point one"]);
});

test("the level survives, because the list indents by it", () => {
  const items = tocItems([{ text: "One", level: 2 }, { text: "One point one", level: 3 }]);
  assert.deepEqual(items.map((i) => i.level), [2, 3]);
});

test("an empty document yields an empty list rather than a stub", () => {
  assert.deepEqual(tocItems([]), []);
});
