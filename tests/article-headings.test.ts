import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { extractHeadings } from "../src/articles/headings.ts";
import lrsExplained from "../src/articles/content/lrs-explained.ts";

/* The table of contents on an article page is built from the article's own
   body, and the body is a trusted HTML string in the registry rather than a
   parsed document. Extraction therefore happens on the server, once, at build
   time — which is only possible if it is a pure string-in/array-out function
   with no DOM behind it. These tests are the contract for that function.

   The awkward cases are not hypothetical. Four of the thirty bodies are a
   single line of nine to eleven thousand characters, headings carry entities
   (`S&amp;P 500`), and the same words appear as a heading in more than one
   place — so an id scheme that is not deduplicated produces two anchors
   pointing at the same place. */

/* ------------------------------------------------------------------ */
/* Nothing to find                                                     */
/* ------------------------------------------------------------------ */

test("a body with no headings yields nothing", () => {
  assert.deepEqual(extractHeadings("<p>One paragraph, no structure.</p>"), []);
  assert.deepEqual(extractHeadings(""), []);
});

test("h1, h4 and tags that merely start with an h are left alone", () => {
  /* `<h2x>` is not an h2, and `<header>` is not a heading. A regex without a
     word boundary matches both. */
  const html = `
    <h1>Title</h1>
    <h4>Aside</h4>
    <header>Chrome</header>
    <h2x>Not a heading</h2x>
    <h2>The only one</h2>
  `;
  assert.deepEqual(
    extractHeadings(html).map((h) => h.text),
    ["The only one"],
  );
});

test("a heading inside an HTML comment is not a heading", () => {
  const html = `<!-- <h2>Draft, cut before publication</h2> --><h2>Kept</h2>`;
  assert.deepEqual(
    extractHeadings(html).map((h) => h.text),
    ["Kept"],
  );
});

/* ------------------------------------------------------------------ */
/* Order, level and text                                               */
/* ------------------------------------------------------------------ */

test("headings come back in document order, each carrying its own level", () => {
  const html = `
    <h2>Why LRS matters</h2>
    <p>Body.</p>
    <h3>The limit</h3>
    <p>Body.</p>
    <h2>What it costs</h2>
  `;
  const headings = extractHeadings(html);

  assert.deepEqual(
    headings.map((h) => h.text),
    ["Why LRS matters", "The limit", "What it costs"],
  );
  assert.deepEqual(
    headings.map((h) => h.level),
    [2, 3, 2],
  );
  assert.deepEqual(
    headings.map((h) => h.id),
    ["why-lrs-matters", "the-limit", "what-it-costs"],
  );
});

test("inline markup inside a heading never reaches the text or the id", () => {
  const html = `<h2>The <strong>LRS</strong> limit, <em>explained</em></h2>`;
  assert.deepEqual(extractHeadings(html), [
    { id: "the-lrs-limit-explained", text: "The LRS limit, explained", level: 2 },
  ]);
});

test("a line break inside a heading becomes a space, not a join", () => {
  /* Every other tag is dropped outright — `<em>a</em>b` is one word. A `<br>`
     is the one tag that stands for a gap, so dropping it silently welds two
     words together in the contents rail. */
  assert.equal(extractHeadings(`<h2>Rates<br/>and limits</h2>`)[0].text, "Rates and limits");
  assert.equal(extractHeadings(`<h2>Rates<br>and limits</h2>`)[0].text, "Rates and limits");
  assert.equal(extractHeadings(`<h2>Co<span>st</span>s</h2>`)[0].text, "Costs");
});

test("entities are decoded before the text is read and the slug is cut", () => {
  /* `S&amp;P 500` is in the registry today. Slugging the raw string gives
     `s-amp-p-500`, which reads as a bug in the URL bar. */
  const headings = extractHeadings(
    `<h3>S&amp;P 500</h3><h2>Costs&nbsp;&amp; charges</h2><h2>Rates &#8212; 2026</h2>`,
  );
  assert.deepEqual(
    headings.map((h) => h.text),
    ["S&P 500", "Costs & charges", "Rates — 2026"],
  );
  assert.deepEqual(
    headings.map((h) => h.id),
    ["s-p-500", "costs-charges", "rates-2026"],
  );
});

/* ------------------------------------------------------------------ */
/* Ids                                                                 */
/* ------------------------------------------------------------------ */

test("an id written into the markup is used rather than re-derived", () => {
  assert.deepEqual(extractHeadings(`<h2 id="tcs">Tax collected at source</h2>`), [
    { id: "tcs", text: "Tax collected at source", level: 2 },
  ]);
});

test("the id is found whichever order the attributes arrive in", () => {
  const before = extractHeadings(`<h2 id="costs" class="lede" data-x="1">Costs</h2>`);
  const after = extractHeadings(`<h2 class="lede" data-x="1" id="costs">Costs</h2>`);
  const single = extractHeadings(`<h2 class='lede' id='costs'>Costs</h2>`);
  const spaced = extractHeadings(`<h2   class="lede"   id = "costs"  >Costs</h2>`);

  for (const one of [before, after, single, spaced]) {
    assert.deepEqual(one, [{ id: "costs", text: "Costs", level: 2 }]);
  }
});

test("an attribute value holding a > does not end the tag early", () => {
  assert.deepEqual(extractHeadings(`<h2 data-note="a > b" id="cmp">Compare</h2>`), [
    { id: "cmp", text: "Compare", level: 2 },
  ]);
});

test("two headings with identical words still get different ids", () => {
  const html = `<h2>Costs</h2><h3>Costs</h3><h2>Costs</h2>`;
  assert.deepEqual(
    extractHeadings(html).map((h) => h.id),
    ["costs", "costs-2", "costs-3"],
  );
});

test("a generated id never collides with an id already in the markup", () => {
  const html = `<h2 id="costs">What you pay</h2><h2>Costs</h2>`;
  assert.deepEqual(
    extractHeadings(html).map((h) => h.id),
    ["costs", "costs-2"],
  );
});

test("a heading with nothing sluggable in it still gets a usable id", () => {
  const html = `<h2>Intro</h2><h2>—</h2><h2>★</h2>`;
  const ids = extractHeadings(html).map((h) => h.id);
  assert.deepEqual(ids, ["intro", "heading-2", "heading-3"]);
  assert.equal(new Set(ids).size, 3);
});

test("an id is always a legal URL fragment", () => {
  const html = `<h2>Route 1: Buying a US-listed S&amp;P 500 ETF directly</h2>
                <h3>  Leading and trailing space  </h3>
                <h2>Multiple---dashes &amp; symbols!!!</h2>`;
  for (const { id } of extractHeadings(html)) {
    assert.match(id, /^[a-z0-9][a-z0-9-]*$/, `${id} is not a clean fragment`);
    assert.doesNotMatch(id, /--/, `${id} has a doubled dash`);
  }
});

/* ------------------------------------------------------------------ */
/* Malformed markup                                                    */
/* ------------------------------------------------------------------ */

test("a self-closing heading does not swallow the section after it", () => {
  /* The naive lazy match runs from `<h2 />` to the *next* `</h2>`, which
     turns an empty heading and a real one into a single heading whose text is
     the paragraph between them. */
  const html = `<h2 />
    <p>A paragraph that is not a heading.</p>
    <h2>Real heading</h2>`;
  assert.deepEqual(extractHeadings(html), [
    { id: "real-heading", text: "Real heading", level: 2 },
  ]);
});

test("an unclosed heading does not swallow the rest of the body", () => {
  const html = `<h2>Never closed
    <p>Body text.</p>
    <h2>Closed properly</h2>
    <p>More body.</p>`;
  assert.deepEqual(
    extractHeadings(html).map((h) => h.text),
    ["Closed properly"],
  );
});

test("an empty heading contributes no entry", () => {
  assert.deepEqual(extractHeadings(`<h2></h2><h3>   </h3><h2>Kept</h2>`), [
    { id: "kept", text: "Kept", level: 2 },
  ]);
});

/* ------------------------------------------------------------------ */
/* The real thing                                                      */
/* ------------------------------------------------------------------ */

test("a 20KB single-line body is read whole, and quickly", () => {
  /* Four of the thirty registry bodies are one line of ~10,000 characters.
     This is twice the worst of them, on one line, so a pattern that
     backtracks catastrophically shows up here rather than in a build. */
  const filler = "<p>" + "words and more words ".repeat(40) + "</p>";
  const parts: string[] = [];
  for (let i = 1; i <= 30; i++) {
    parts.push(`<h2>Section ${i}</h2>`, filler);
  }
  const body = parts.join("");

  assert.ok(body.length > 20_000, `body is only ${body.length} characters`);
  assert.doesNotMatch(body, /\n/, "the body under test must be a single line");

  const started = Date.now();
  const headings = extractHeadings(body);
  const elapsed = Date.now() - started;

  assert.equal(headings.length, 30);
  assert.equal(headings[0].text, "Section 1");
  assert.equal(headings[29].id, "section-30");
  assert.ok(elapsed < 1000, `took ${elapsed}ms — the pattern is backtracking`);
});

test("a published article body yields exactly the headings its markup declares", () => {
  const declared = (lrsExplained.match(/<h[23][\s>]/g) ?? []).length;
  const headings = extractHeadings(lrsExplained);

  assert.ok(declared > 0, "the fixture article has no headings to find");
  assert.equal(headings.length, declared);
  assert.equal(headings[0].text, "Why LRS matters");

  for (const h of headings) {
    assert.ok(h.text.trim().length > 0, "a heading came back with no words");
    assert.doesNotMatch(h.text, /[<>]/, `${h.text} still holds markup`);
    assert.match(h.id, /^[a-z0-9][a-z0-9-]*$/, `${h.id} is not a clean fragment`);
    assert.ok(h.level === 2 || h.level === 3, `${h.id} has level ${h.level}`);
  }

  assert.equal(new Set(headings.map((h) => h.id)).size, headings.length, "ids repeat");
});

test("every published body in the corpus extracts cleanly", async () => {
  /* Walked from disk rather than read off ARTICLES because registry.ts imports
     its thirty bodies without file extensions, which Node's own resolver
     cannot follow. The directory is the same set either way. */
  const dir = path.join(import.meta.dirname, "..", "src", "articles", "content");
  const files = readdirSync(dir).filter((f) => f.endsWith(".ts")).sort();

  assert.ok(files.length >= 30, `only ${files.length} bodies found`);

  let extracted = 0;
  for (const file of files) {
    const body: string = (await import(pathToFileURL(path.join(dir, file)).href)).default;
    const declared = (body.match(/<h[23][\s>]/g) ?? []).length;
    const headings = extractHeadings(body);

    assert.equal(headings.length, declared, `${file}: ${declared} declared, ${headings.length} found`);
    assert.equal(
      new Set(headings.map((h) => h.id)).size,
      headings.length,
      `${file}: two headings share an id`,
    );
    for (const h of headings) {
      assert.match(h.id, /^[a-z0-9][a-z0-9-]*$/, `${file}: ${h.id} is not a clean fragment`);
      assert.doesNotMatch(h.text, /[<>]/, `${file}: ${h.text} still holds markup`);
      assert.doesNotMatch(h.text, /&[a-z]+;/i, `${file}: ${h.text} still holds an entity`);
    }
    extracted += headings.length;
  }

  assert.ok(extracted > 300, `only ${extracted} headings across the whole corpus`);
});

test("extraction does not touch the string it was given", () => {
  const html = `<h2>Costs</h2>`;
  extractHeadings(html);
  assert.equal(html, `<h2>Costs</h2>`);
  /* Called twice, it answers the same both times — no counter survives a call. */
  assert.deepEqual(extractHeadings(html), extractHeadings(html));
});
