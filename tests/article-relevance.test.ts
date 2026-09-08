import assert from "node:assert/strict";
import test from "node:test";

import { MAX_AGE_DAYS } from "../lib/api/normalize/relevance.ts";
import { articleRelevanceOf } from "../lib/api/normalize/article-relevance.ts";

/* Is this newsapi.ai article ABOUT the company, or does it merely name it?
 *
 * The sibling module `relevance.ts` answers that for gateway articles, where
 * the provider hands us a per-ticker `sentiment_reasoning` sentence saying
 * outright whether the company is the subject. newsapi.ai (Event Registry)
 * carries no such field. What it carries is `concepts` — a scored list of the
 * entities the piece is about — and the company's standing in that list is the
 * analogous signal.
 *
 * THE SCALE IS SMALL, COARSE, AND NOT TO BE TRUSTED IN ABSOLUTE TERMS
 *
 * One live page of 25 AAPL articles was read to calibrate this file, and every
 * concept score observed was a 4 or a 5:
 *
 *   "Apple changes name of Lake Ontario to Lake America for U.S. users"
 *      Lake Ontario:5   Donald Trump:5   Apple Inc.:4
 *   "Is this the iPhone 18 Ultra? Leaker claims to reveal Apple's foldable"
 *      Steve Jobs:5     IPhone:5        Apple Inc.:5
 *   "Apple's New CEO Hypes Product Launch in First Employee Address"
 *      Apple Inc.:5     Bloomberg News:4  Chief executive officer:4
 *
 * Apple scores a 4 on a story about renaming a lake and a 5 on a story about
 * its own chief executive. Any test that pinned a threshold to the raw number
 * would pass today and mean nothing, so the fixtures below deliberately use
 * several different scales — 0..5, 0..100, and a flat all-tied list — and
 * assert the same verdicts from each. A scorer that reads magnitude instead of
 * standing will fail at least one of them.
 *
 * ABSENCE IS THE LOUDEST SIGNAL
 *
 * In that same page, a slot-machine explainer, a Nissan export story and a
 * crypto-futures press release carried no Apple concept at all. A populated
 * concept list that omits the company is the provider saying, in its own
 * vocabulary, that the piece is not about it.
 */

const NOW = Date.UTC(2026, 8, 2, 12, 0);
const HOURS = (n: number) => NOW - n * 3_600_000;
const DAYS = (n: number) => NOW - n * 86_400_000;

type Concept = { label: { eng: string }; score: number };
type Article = Parameters<typeof articleRelevanceOf>[0];

/** `[label, score]` pairs, so a fixture reads like the API response does. */
const concepts = (...pairs: Array<[string, number]>): Concept[] =>
  pairs.map(([eng, score]) => ({ label: { eng }, score }));

function article(over: Partial<Article> = {}): Article {
  return {
    title: "Some headline",
    body: "Some body text.",
    concepts: concepts(["Apple Inc.", 5]),
    publishedMs: HOURS(6),
    ...over,
  };
}

/* ---------- the company is what the piece is about ---------- */

test("the company as the top-scoring concept is coverage", () => {
  const r = articleRelevanceOf(
    article({
      title: "Apple's New CEO Hypes Product Launch in First Employee Address",
      concepts: concepts(["Apple Inc.", 5], ["Bloomberg News", 4], ["Chief executive officer", 4]),
    }),
    "Apple",
    "AAPL",
    NOW,
  );
  assert.equal(r.verdict, "coverage");
});

test("the same standing on a 0..100 scale reaches the same verdict", () => {
  const r = articleRelevanceOf(
    article({
      title: "Apple's New CEO Hypes Product Launch in First Employee Address",
      concepts: concepts(["Apple Inc.", 87], ["Tim Cook", 41], ["Nasdaq", 12]),
    }),
    "Apple",
    "AAPL",
    NOW,
  );
  assert.equal(r.verdict, "coverage");
});

test("a company tied at the top of a coarse list is still the subject", () => {
  /* Every score is a 5. Rank has to be read as "nothing outscores it", not as
     a position in the array, or a tie demotes the company arbitrarily. */
  const r = articleRelevanceOf(
    article({
      title: "Is this the iPhone 18 Ultra? Leaker claims to reveal Apple's foldable",
      concepts: concepts(["Steve Jobs", 5], ["IPhone", 5], ["Apple Inc.", 5]),
    }),
    "Apple",
    "AAPL",
    NOW,
  );
  assert.equal(r.verdict, "coverage");
});

test("the top concept scores near the top of the range when the headline names it too", () => {
  const r = articleRelevanceOf(
    article({
      title: "Apple names John Ternus chief executive",
      concepts: concepts(["Apple Inc.", 5], ["Tim Cook", 3]),
    }),
    "Apple",
    "AAPL",
    NOW,
  );
  assert.ok(r.score >= 0.9, `expected a top-of-range score, got ${r.score}`);
});

/* ---------- standing, not magnitude ---------- */

test("a company far down the list is not coverage even with a respectable raw score", () => {
  /* Every concept here scores 4 or 5 — the observed live range — and the
     company is last. Magnitude says "high", standing says "incidental". */
  const r = articleRelevanceOf(
    article({
      title: "Nvidia's Blackwell ramp reshapes the AI supply chain",
      concepts: concepts(
        ["Nvidia Corporation", 5],
        ["Jensen Huang", 5],
        ["Artificial intelligence", 5],
        ["Taiwan Semiconductor Manufacturing Company", 5],
        ["Data center", 4],
        ["Graphics processing unit", 4],
        ["Supply chain", 4],
        ["Blackwell", 4],
        ["Apple Inc.", 4],
      ),
    }),
    "Apple",
    "AAPL",
    NOW,
  );
  assert.notEqual(r.verdict, "coverage");
});

test("a company eighth in a list of twenty is in a roundup", () => {
  const filler: Array<[string, number]> = [];
  for (let i = 0; i < 8; i += 1) filler.push([`Concept ${i}`, 100 - i]);
  for (let i = 0; i < 11; i += 1) filler.push([`Tail ${i}`, 30 - i]);
  const r = articleRelevanceOf(
    article({
      title: "Twenty things that moved markets",
      concepts: concepts(...filler.slice(0, 8), ["Apple Inc.", 40], ...filler.slice(8)),
    }),
    "Apple",
    "AAPL",
    NOW,
  );
  assert.equal(r.verdict, "roundup");
});

test("a passing mention low against its own article's maximum is a mention", () => {
  const r = articleRelevanceOf(
    article({
      title: "Vanguard's VTI versus Schwab's SCHB",
      concepts: concepts(["The Vanguard Group", 100], ["Exchange-traded fund", 90], ["Apple Inc.", 8]),
    }),
    "Apple",
    "AAPL",
    NOW,
  );
  assert.equal(r.verdict, "mention");
});

/* ---------- absence does most of the work ---------- */

test("a populated concept list that omits the company is a mention", () => {
  /* The slot-machine explainer and the Nissan export story from the live page.
     The provider enumerated what the piece is about and the company is not in
     it — that is a stronger statement than any score it could have carried. */
  const r = articleRelevanceOf(
    article({
      title: "How slot machine odds actually work",
      concepts: concepts(["Slot machine", 5], ["Gambling", 5], ["Nevada", 4]),
    }),
    "Apple",
    "AAPL",
    NOW,
  );
  assert.equal(r.verdict, "mention");
});

test("absence outranks a headline that happens to contain the name", () => {
  const absent = articleRelevanceOf(
    article({
      title: "Apple orchards brace for a hard winter",
      concepts: concepts(["Agriculture", 5], ["Weather", 4]),
    }),
    "Apple",
    "AAPL",
    NOW,
  );
  const present = articleRelevanceOf(
    article({ title: "A quiet session", concepts: concepts(["Apple Inc.", 5]) }),
    "Apple",
    "AAPL",
    NOW,
  );
  assert.equal(absent.verdict, "mention");
  assert.ok(present.score > absent.score, `${present.score} should beat ${absent.score}`);
});

/* ---------- breadth: the basket piece ---------- */

test("a basket piece is a roundup even though the company ties for the top score", () => {
  /* The Magnificent-Seven case, and the reason share-of-maximum cannot decide
     alone: in a basket every member scores alike, so every member looks
     central. Only the company-shaped breadth of the list gives it away. */
  const r = articleRelevanceOf(
    article({
      title: "The Magnificent Seven face a September reckoning",
      concepts: concepts(
        ["Apple Inc.", 5],
        ["Microsoft Corporation", 5],
        ["Alphabet Inc.", 5],
        ["Amazon.com, Inc.", 5],
        ["Meta Platforms", 5],
        ["Tesla, Inc.", 4],
        ["Nvidia Corporation", 4],
      ),
    }),
    "Apple",
    "AAPL",
    NOW,
  );
  assert.equal(r.verdict, "roundup");
});

test("a story naming rivals well below the company is not a basket piece", () => {
  /* The guard on the breadth rule. "Nvidia passes Apple" names five companies,
     but four of them are scenery — they never approach the subject's score. */
  const r = articleRelevanceOf(
    article({
      title: "Nvidia passes Apple to become the most valuable company",
      concepts: concepts(
        ["Nvidia Corporation", 100],
        ["Apple Inc.", 30],
        ["Microsoft Corporation", 20],
        ["Alphabet Inc.", 18],
        ["Amazon.com, Inc.", 15],
        ["Tesla, Inc.", 12],
      ),
    }),
    "Nvidia",
    "NVDA",
    NOW,
  );
  assert.equal(r.verdict, "coverage");
});

/* ---------- name matching ---------- */

test("a corporate suffix on the concept does not break the match", () => {
  for (const [master, label] of [
    ["Apple", "Apple Inc."],
    ["Alphabet", "Alphabet Inc."],
    ["Microsoft", "Microsoft Corporation"],
    ["Tesla", "Tesla, Inc."],
    ["Barclays", "Barclays PLC"],
    ["Prosus", "Prosus N.V."],
  ] as const) {
    const r = articleRelevanceOf(
      article({ title: "A headline", concepts: concepts([label, 5], ["Something else", 3]) }),
      master,
      "XXXX",
      NOW,
    );
    assert.equal(r.verdict, "coverage", `${master} should match ${label}`);
  }
});

test("a suffix on the master name does not break the match either", () => {
  /* Our own master list is not clean. "Meta Platforms" has to find "Meta",
     which means the normalisation must run over both sides, not just theirs. */
  const r = articleRelevanceOf(
    article({ title: "A headline", concepts: concepts(["Meta", 5], ["Instagram", 3]) }),
    "Meta Platforms",
    "META",
    NOW,
  );
  assert.equal(r.verdict, "coverage");
});

test("a different company sharing a first word is NOT a match", () => {
  /* Apple Hospitality REIT trades as APLE and has nothing to do with AAPL.
     Any rule loose enough to let a prefix match would put hotel news on the
     iPhone page, which is a worse failure than dropping a story. */
  const r = articleRelevanceOf(
    article({
      title: "Hotel REIT raises its dividend",
      concepts: concepts(["Apple Hospitality REIT", 5], ["Real estate investment trust", 4]),
    }),
    "Apple",
    "AAPL",
    NOW,
  );
  assert.equal(r.verdict, "mention");
});

test("the near-miss is rejected in the other direction too", () => {
  /* Same pair, roles swapped: the hotel REIT's own page must not pick up
     iPhone coverage because "Apple Inc." shortens to "apple". */
  const r = articleRelevanceOf(
    article({
      title: "Apple unveils the iPhone 18",
      concepts: concepts(["Apple Inc.", 5], ["IPhone", 5]),
    }),
    "Apple Hospitality REIT",
    "APLE",
    NOW,
  );
  assert.equal(r.verdict, "mention");
});

test("an ampersand written either way is the same company", () => {
  const r = articleRelevanceOf(
    article({ title: "A headline", concepts: concepts(["Johnson and Johnson", 5]) }),
    "Johnson & Johnson",
    "JNJ",
    NOW,
  );
  assert.equal(r.verdict, "coverage");
});

test("a leading article and a possessive do not defeat the match", () => {
  const r = articleRelevanceOf(
    article({ title: "A headline", concepts: concepts(["Walt Disney Co", 5]) }),
    "The Walt Disney Company",
    "DIS",
    NOW,
  );
  assert.equal(r.verdict, "coverage");
});

/* ---------- the headline, as a fallback rather than a signal ---------- */

test("with no concept list at all a headline naming the company keeps the story", () => {
  const r = articleRelevanceOf(
    article({ title: "Apple names John Ternus chief executive", concepts: null }),
    "Apple",
    "AAPL",
    NOW,
  );
  assert.equal(r.verdict, "coverage");
});

test("with no concept list and no name in the headline there is nothing to go on", () => {
  const r = articleRelevanceOf(
    article({ title: "Markets drift ahead of payrolls", concepts: null }),
    "Apple",
    "AAPL",
    NOW,
  );
  assert.equal(r.verdict, "mention");
});

test("a ticker in the headline counts as naming the company", () => {
  const r = articleRelevanceOf(
    article({ title: "Why (AAPL) climbed today", concepts: null }),
    "Apple",
    "AAPL",
    NOW,
  );
  assert.equal(r.verdict, "coverage");
});

test("a headline substring is not a headline mention", () => {
  /* "meta" inside "metabolism", "co" inside "cocoa". A bare `includes` on the
     first word of the name turns any long word into a false positive, and with
     no concept list to overrule it that false positive becomes the verdict. */
  const r = articleRelevanceOf(
    article({ title: "Metabolism drugs lead the biotech tape", concepts: null }),
    "Meta Platforms",
    "META",
    NOW,
  );
  assert.equal(r.verdict, "mention");
});

/* ---------- staleness, on the shared bound ---------- */

test("a story past the shared age bound is stale whatever its concepts say", () => {
  const r = articleRelevanceOf(
    article({
      title: "Apple names John Ternus chief executive",
      concepts: concepts(["Apple Inc.", 5]),
      publishedMs: DAYS(MAX_AGE_DAYS + 1),
    }),
    "Apple",
    "AAPL",
    NOW,
  );
  assert.equal(r.verdict, "stale");
  assert.equal(r.score, 0);
});

test("a story inside the bound is judged on its concepts, not its age", () => {
  const r = articleRelevanceOf(
    article({
      title: "Apple names John Ternus chief executive",
      concepts: concepts(["Apple Inc.", 5]),
      publishedMs: DAYS(MAX_AGE_DAYS - 1),
    }),
    "Apple",
    "AAPL",
    NOW,
  );
  assert.equal(r.verdict, "coverage");
});

/* ---------- the two scorers share one ranked rail ---------- */

test("the verdict bands do not overlap, so a merged list sorts sanely", () => {
  const coverage = articleRelevanceOf(
    article({ title: "Apple names a new chief executive", concepts: concepts(["Apple Inc.", 5]) }),
    "Apple",
    "AAPL",
    NOW,
  );
  const roundup = articleRelevanceOf(
    article({
      title: "The Magnificent Seven face a reckoning",
      concepts: concepts(
        ["Apple Inc.", 5],
        ["Microsoft Corporation", 5],
        ["Alphabet Inc.", 5],
        ["Amazon.com, Inc.", 5],
        ["Meta Platforms", 5],
        ["Tesla, Inc.", 5],
      ),
    }),
    "Apple",
    "AAPL",
    NOW,
  );
  const mention = articleRelevanceOf(
    article({ title: "Apple orchards brace for winter", concepts: concepts(["Agriculture", 5]) }),
    "Apple",
    "AAPL",
    NOW,
  );
  const stale = articleRelevanceOf(
    article({
      title: "Apple names a new chief executive",
      concepts: concepts(["Apple Inc.", 5]),
      publishedMs: DAYS(MAX_AGE_DAYS + 2),
    }),
    "Apple",
    "AAPL",
    NOW,
  );

  assert.ok(coverage.score >= 0.5, `coverage floor: ${coverage.score}`);
  assert.ok(roundup.score <= 0.5, `roundup ceiling: ${roundup.score}`);
  assert.ok(mention.score <= 0.15, `mention ceiling: ${mention.score}`);
  assert.equal(stale.score, 0);
});

test("a fresh mention never outranks older real coverage", () => {
  /* The failure this module exists to prevent, restated for the merged rail:
     recency must not float filler above the story that explains the move. */
  const mention = articleRelevanceOf(
    article({
      title: "Best ETFs to buy now",
      concepts: concepts(["Exchange-traded fund", 100], ["Apple Inc.", 5]),
      publishedMs: HOURS(1),
    }),
    "Apple",
    "AAPL",
    NOW,
  );
  const coverage = articleRelevanceOf(
    article({
      title: "Apple names John Ternus chief executive",
      concepts: concepts(["Apple Inc.", 100], ["Tim Cook", 40]),
      publishedMs: DAYS(9),
    }),
    "Apple",
    "AAPL",
    NOW,
  );
  assert.ok(coverage.score > mention.score, `${coverage.score} should beat ${mention.score}`);
});

test("a subject outranks a bit-part player", () => {
  const subject = articleRelevanceOf(
    article({ title: "Apple lifts guidance", concepts: concepts(["Apple Inc.", 5], ["Guidance", 3]) }),
    "Apple",
    "AAPL",
    NOW,
  );
  const bitPart = articleRelevanceOf(
    article({
      title: "Suppliers rally on a strong quarter",
      concepts: concepts(["Foxconn", 5], ["Supply chain", 5], ["Apple Inc.", 3]),
    }),
    "Apple",
    "AAPL",
    NOW,
  );
  assert.ok(subject.score > bitPart.score, `${subject.score} should beat ${bitPart.score}`);
});

/* ---------- degenerate input is data, not an exception ---------- */

test("null, empty and malformed concept lists are survivable", () => {
  const cases: Article[] = [
    article({ concepts: null }),
    article({ concepts: [] }),
    article({ concepts: concepts(["Apple Inc.", Number.NaN]) }),
    article({ concepts: concepts(["Apple Inc.", -5], ["Other", -1]) }),
    article({ concepts: concepts(["Apple Inc.", 0], ["Other", 0]) }),
    article({ concepts: concepts(["", 5], ["Apple Inc.", 5]) }),
    article({ concepts: concepts(["Apple Inc.", Number.POSITIVE_INFINITY]) }),
  ];
  for (const a of cases) {
    const r = articleRelevanceOf(a, "Apple", "AAPL", NOW);
    assert.ok(Number.isFinite(r.score), `score not finite: ${r.score}`);
    assert.ok(r.score >= 0 && r.score <= 1, `score out of range: ${r.score}`);
    assert.ok(["coverage", "mention", "roundup", "stale"].includes(r.verdict));
  }
});

test("an empty title and a null body never throw", () => {
  for (const a of [
    article({ title: "", body: null }),
    article({ title: "", body: null, concepts: null }),
    article({ title: "   ", body: "" }),
  ]) {
    const r = articleRelevanceOf(a, "Apple", "AAPL", NOW);
    assert.ok(r.score >= 0 && r.score <= 1, `score out of range: ${r.score}`);
  }
});

test("an empty company name and an empty ticker are survivable", () => {
  const r = articleRelevanceOf(article(), "", "", NOW);
  assert.ok(r.score >= 0 && r.score <= 1, `score out of range: ${r.score}`);
  assert.notEqual(r.verdict, "coverage");
});

test("a non-finite timestamp is stale rather than an exception", () => {
  for (const publishedMs of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
    const r = articleRelevanceOf(article({ publishedMs }), "Apple", "AAPL", NOW);
    assert.equal(r.verdict, "stale");
    assert.equal(r.score, 0);
  }
});

test("a non-finite clock is stale rather than an exception", () => {
  const r = articleRelevanceOf(article(), "Apple", "AAPL", Number.NaN);
  assert.equal(r.verdict, "stale");
  assert.equal(r.score, 0);
});

test("an article published a moment into the future is not penalised", () => {
  /* Clock skew between the publisher and us is routine and must not read as a
     negative age failure. */
  const r = articleRelevanceOf(
    article({ title: "Apple names a new chief executive", publishedMs: NOW + 60_000 }),
    "Apple",
    "AAPL",
    NOW,
  );
  assert.equal(r.verdict, "coverage");
});

test("the score stays inside nought and one across a wide sweep of inputs", () => {
  const titles = ["", "Apple everywhere", "Markets drift", "(AAPL) climbs"];
  const lists: Array<Concept[] | null> = [
    null,
    [],
    concepts(["Apple Inc.", 5]),
    concepts(["Apple Inc.", 1], ["Other", 5]),
    concepts(...Array.from({ length: 30 }, (_, i) => [`Co ${i} Inc.`, 30 - i] as [string, number])),
  ];
  const ages = [HOURS(1), DAYS(3), DAYS(MAX_AGE_DAYS + 5), Number.NaN];
  for (const title of titles) {
    for (const list of lists) {
      for (const publishedMs of ages) {
        const r = articleRelevanceOf(
          { title, body: null, concepts: list, publishedMs },
          "Apple",
          "AAPL",
          NOW,
        );
        assert.ok(
          Number.isFinite(r.score) && r.score >= 0 && r.score <= 1,
          `score out of range for ${title} / ${publishedMs}: ${r.score}`,
        );
      }
    }
  }
});

/* Found by running the live feed through this module.
 *
 * "Thatchers begins earliest apple harvest in 122-year history" — a Somerset
 * cider maker — scored 1.00 coverage on Apple's page. Its real concept list:
 *
 *   Thatchers Cider:5  Cider:5  Orchard:5  Margaret Thatcher:5  Harvest:5
 *   Variety (botany):5  Apple:5  Fruit:4  Cider apple:2  Somerset:3  …
 *
 * Event Registry labels the FRUIT "Apple" and the COMPANY "Apple Inc." — in
 * the same 25-article page the company appeared as "Apple Inc." twenty times
 * and the bare label exactly once, on this article. Canonicalisation strips
 * the legal suffix, which is right for "Meta Platforms" and fatal here: it
 * reduces both the fruit and the company to "apple" and they become the same
 * string.
 *
 * The suffix is the only thing distinguishing them, so a match on a BARE label
 * cannot carry an article to coverage by itself. It needs corroboration —
 * either a concept that is company-shaped, or the ticker in the headline.
 * Neither is present in a story about cider. */

test("the fruit is not the company, however high it scores", () => {
  const r = articleRelevanceOf(
    {
      title: "Thatchers begins earliest apple harvest in 122-year history",
      body: null,
      concepts: [
        { label: { eng: "Thatchers Cider" }, score: 5 },
        { label: { eng: "Cider" }, score: 5 },
        { label: { eng: "Orchard" }, score: 5 },
        { label: { eng: "Margaret Thatcher" }, score: 5 },
        { label: { eng: "Harvest" }, score: 5 },
        { label: { eng: "Variety (botany)" }, score: 5 },
        { label: { eng: "Apple" }, score: 5 },
        { label: { eng: "Fruit" }, score: 4 },
        { label: { eng: "Cider apple" }, score: 2 },
        { label: { eng: "Somerset" }, score: 3 },
      ],
      publishedMs: NOW - 3_600_000,
    },
    "Apple",
    "AAPL",
    NOW,
  );
  assert.notEqual(r.verdict, "coverage", "a cider harvest is not Apple coverage");
});

/* The other side of the same rule: the suffixed label is unambiguous and must
   still sail through, or the fix would cost every genuine story. */
test("the suffixed company label is decisive on its own", () => {
  const r = articleRelevanceOf(
    {
      title: "Apple Sets Pay Targets at $58 Million for Ternus",
      body: null,
      concepts: [
        { label: { eng: "Apple Inc." }, score: 5 },
        { label: { eng: "John Ternus" }, score: 4 },
      ],
      publishedMs: NOW - 3_600_000,
    },
    "Apple",
    "AAPL",
    NOW,
  );
  assert.equal(r.verdict, "coverage");
});

/* A bare label corroborated by the ticker in the headline is the company. This
   keeps companies Event Registry happens to label without a suffix working. */
test("a bare label plus the ticker in the headline is corroborated", () => {
  const r = articleRelevanceOf(
    {
      title: "NVDA jumps as Nvidia lifts guidance",
      body: null,
      concepts: [
        { label: { eng: "Nvidia" }, score: 5 },
        { label: { eng: "Data center" }, score: 3 },
      ],
      publishedMs: NOW - 3_600_000,
    },
    "Nvidia",
    "NVDA",
    NOW,
  );
  assert.equal(r.verdict, "coverage");
});
