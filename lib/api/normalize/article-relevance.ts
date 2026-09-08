import { MAX_AGE_DAYS, type Relevance, type Verdict } from "./relevance.ts";

/* Is this newsapi.ai article ABOUT the company, or does it merely name it?
 *
 * `relevance.ts` answers that for gateway articles. This module answers it for
 * newsapi.ai (Event Registry), and exists as a separate scorer only because the
 * two providers hand us different evidence. The verdicts, the return shape and
 * the score scale are deliberately identical, because the terminal merges both
 * lists into one ranked rail and sorts them against each other.
 *
 * WHAT REPLACES `sentiment_reasoning`
 *
 * The gateway writes a per-ticker sentence stating outright whether the company
 * is the subject, and `relevance.ts` is built on the principle that the
 * provider's own per-ticker signal outranks crude proxies like tag count.
 * newsapi.ai has no such sentence. What it has is `concepts` — a scored list of
 * the entities the piece is about — and the company's standing in that list is
 * the same kind of evidence: the provider telling us, in its own vocabulary,
 * how central this company is. So standing decides first here, exactly as
 * reasoning decides first there, and breadth is the fallback in both.
 *
 * THE SCORE IS A RANKING, NOT A MAGNITUDE
 *
 * The concept score's scale is not documented and is not stable. A live page of
 * 25 AAPL articles came back with every single score a 4 or a 5:
 *
 *   "Apple changes name of Lake Ontario to Lake America"  Apple Inc.: 4
 *   "Apple's New CEO Hypes Product Launch"                Apple Inc.: 5
 *
 * Four for a story about renaming a lake, five for a story about its own chief
 * executive. Any threshold pinned to the raw number — `score > 50`, or even
 * `score > 3` — keeps both or rejects both, and would silently invert the day
 * the provider rescales. So this module never reads magnitude in absolute
 * terms. It reads two things that survive a rescale:
 *
 *   RANK    how many distinct concepts outscore the company, and
 *   SHARE   the company's score as a fraction of the largest score in THIS
 *           article's own list.
 *
 * Rank leads because it is the only signal that stays sharp when the whole
 * scale collapses to two values. When nine concepts sit at 5 and the company
 * sits at 4, share reads a comfortable 0.8 and says "central"; rank says the
 * company is behind nine other things, which is the truth.
 *
 * ABSENCE IS THE LOUDEST SIGNAL OF ALL
 *
 * On that same page, a slot-machine explainer, a Nissan export story and a
 * crypto-futures press release carried no Apple concept whatsoever. A populated
 * concept list that omits the company is a stronger statement than any score it
 * could have carried, and requiring a company-concept match is doing most of
 * the filtering here. Note the asymmetry that makes this safe: an ABSENT
 * company is decisive, a MISSING LIST is not — see the fallback below.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO
 *
 * It does not read the body, does not dedupe, and does not judge whether a
 * claim is true. The upstream query already restricts the keyword to the title,
 * matches it as a phrase and skips syndicated duplicates, so this module is
 * left with one narrow question: is this company the subject.
 */

/* Age is not redefined here. Both scorers feed one rail, and a story that is
   news on one half of it must be news on the other — a second constant would
   drift the moment either is tuned, and the rail would start showing a
   fortnight-old headline from one provider beside a fresh one from the other. */
export { MAX_AGE_DAYS };

/* --- how central the company has to be ------------------------------------ */

/* Rank is "how many concepts outscore this one", so co-leaders all sit at 0.
   That matters more than it sounds: on the observed 4-or-5 scale a tie at the
   top is the common case, and reading rank off the array index instead would
   demote a subject to third place purely by the order the provider happened to
   serialise its JSON. */

/** Beyond the top few, the company is part of the cast rather than the subject. */
const CONTENDER_RANK = 3;

/** This far down a list, the article is an enumeration and the company is in it. */
const ROUNDUP_RANK = 7;

/** Behind the leader but close enough to still be what the piece is about. */
const CENTRAL_SHARE = 0.75;

/* --- how wide the list has to be before it is a basket -------------------- */

/** A rival scoring this fraction of the leader is a co-subject, not scenery. */
const PEER_SHARE = 0.6;

/* Five names makes a basket. This is the same judgement `relevance.ts` makes
   with ROUNDUP_TAGS = 5, counted here as four PEERS because the company itself
   is the fifth. It is deliberately not that constant imported: a gateway tag is
   attached to every ticker an article names, while a peer here has to be a
   company that scores near the top, so the two are counting different things
   and would want tuning in different directions. */
const ROUNDUP_PEERS = 4;

/* --- score bands, kept flush with relevance.ts ---------------------------- */

/* The two scorers are sorted against each other, so the bands have to line up
   or the rail silently reorders. Both start at 0.5, both award +0.15 for a
   headline that names the company, both cap a mention at 0.15 and both return
   exactly 0 for stale. The centrality nudge below occupies the same ±0.35 span
   that the tag-count nudge occupies over there, which puts the maximum at
   0.5 + 0.35 + 0.15 = 1.0 — identical to `relevanceOf`'s maximum — and leaves
   every coverage verdict at 0.60 or above, just clear of the rejected bands. */
const BASE = 0.5;
const NUDGE_SUBJECT = 0.35;
const NUDGE_CONTENDER = 0.2;
const NUDGE_PERIPHERAL = -0.3;
/** Absence is the strongest rejection, so it is the deepest penalty. */
const NUDGE_ABSENT = -0.35;
/** No list at all is ignorance, not evidence: a shrug, not a verdict. */
const NUDGE_NO_LIST = -0.05;
const NUDGE_TITLE = 0.15;
const NUDGE_BROAD = -0.15;

/** A mention must never outrank real coverage, however fresh it is. */
const MENTION_CEILING = 0.15;
/** A basket piece may tie the weakest coverage but must never beat it. */
const ROUNDUP_CEILING = 0.5;

const clamp01 = (n: number) => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0);

/* --- name matching -------------------------------------------------------- */

/* Suffixes stripped from both sides before comparing. The first group is legal
   form, the second is the structural nouns that vendors add or drop at whim —
   our master says "Meta Platforms" where the concept says "Meta", and
   "Alphabet" where the concept says "Alphabet Inc.".

   "com" is here for Amazon.com and Salesforce.com, whose legal names carry the
   domain and whose concept labels sometimes do not.

   What is NOT here is the whole point of the list. Sector and descriptor words
   — Hospitality, Semiconductor, Financial, Energy — are identity-bearing, and
   the moment one is stripped, Apple Hospitality REIT (APLE, a hotel landlord)
   collapses onto Apple (AAPL) and hotel news lands on the iPhone page. */
const CORPORATE_SUFFIXES = new Set([
  "inc",
  "incorporated",
  "corp",
  "corporation",
  "co",
  "company",
  "companies",
  "ltd",
  "limited",
  "plc",
  "llc",
  "llp",
  "lp",
  "sa",
  "nv",
  "ag",
  "holding",
  "holdings",
  "group",
  "com",
  "platforms",
]);

/** Tokens that carry no identity wherever they appear. */
const FILLER_TOKENS = new Set(["the", "and"]);

/**
 * A company name reduced to the tokens that actually identify it.
 *
 * Comparison is by EQUALITY of the result, never by prefix or substring, and
 * that is a deliberate constraint rather than an oversight. Prefix matching
 * handles "Meta Platforms" vs "Meta" but also lets "Apple" swallow "Apple
 * Hospitality REIT"; there is no direction of the prefix rule that is safe,
 * because our master list is sometimes the longer name and sometimes the
 * shorter one. Reducing both sides to a canonical form and demanding equality
 * puts the entire risk in one auditable place — the suffix set above — and
 * guarantees that any extra identity-bearing token breaks the match.
 */
function canonicalise(name: string): { canon: string; droppedSuffix: boolean } {
  const tokens = name
    .toLowerCase()
    /* Possessives first: "Apple's" has to become "apple", not "apple s". */
    .replace(/['’]s\b/g, "")
    .replace(/['’]/g, "")
    /* A period after a single letter is an acronym's, not a separator's:
       "N.V." must reach the suffix set as "nv" rather than as two dead tokens
       "n" and "v". The word boundary keeps "Amazon.com" intact. */
    .replace(/\b([a-z])\./g, "$1")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter((t) => t.length > 0 && !FILLER_TOKENS.has(t));

  /* Strip repeatedly — "Prosus N.V." and "Fortune Brands Home & Security Inc"
     both end in more than one droppable token — but never to nothing. A name
     that is only a suffix ("Group", "Holdings") is a real if unlikely label,
     and reducing it to the empty string would make it match every other
     name reduced the same way. */
  let droppedSuffix = false;
  while (tokens.length > 1 && CORPORATE_SUFFIXES.has(tokens[tokens.length - 1])) {
    tokens.pop();
    droppedSuffix = true;
  }

  /* `droppedSuffix` is reported alongside the name because it is the only clue
     we have to whether a concept is a COMPANY at all. Event Registry does carry
     an entity type, but the declared `RawArticle` shape does not surface it, so
     "carries a legal suffix" is the available proxy: "Apple Inc." and "Meta
     Platforms" qualify, "Tim Cook" and "Nasdaq" do not.

     It under-counts, and knowingly. Bare labels — "Microsoft", "Nvidia" — are
     companies this test cannot see, so the peer threshold below is set low to
     compensate. The alternative proxy, "any high-scoring concept", was rejected
     outright: a focused story about a CEO change scores the executive and the
     product highly too, and counting those would file the best article on the
     rail as a basket piece. */
  return { canon: tokens.join(" "), droppedSuffix };
}

const canonicalName = (name: string) => canonicalise(name).canon;

const escapeForRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Does the headline name the company or its ticker outright?
 *
 * Same weight and meaning as `relevance.ts`'s version, with one hardening: the
 * match is on whole words. That module's plain `includes` is safe enough when a
 * reasoning sentence is there to overrule it, but here the headline is the ONLY
 * evidence left when the concept list is missing, so a false positive becomes
 * the verdict. "Meta" inside "Metabolism" and "Co" inside "Cocoa" would each
 * put an unrelated story on a company's page.
 */
function titleNames(title: string, companyName: string, ticker: string): boolean {
  const t = (title ?? "").toLowerCase();
  if (!t) return false;

  const tick = ticker.trim().toLowerCase();
  /* One- and two-letter tickers are ordinary English words; matching them would
     turn every headline containing "a" or "it" into coverage. */
  if (tick.length >= 3 && new RegExp(`\\b${escapeForRegex(tick)}\\b`).test(t)) return true;

  /* The first canonical token carries the identity — a headline writes "Apple",
     never "Apple Inc." — and matching the full name would miss nearly all of
     them. */
  const first = canonicalName(companyName).split(" ")[0] ?? "";
  return first.length >= 3 && new RegExp(`\\b${escapeForRegex(first)}\\b`).test(t);
}

/* --- the scorer ----------------------------------------------------------- */

type ConceptInput = { label: { eng: string }; score: number };

export type ArticleForRelevance = {
  title: string;
  body: string | null;
  concepts: ConceptInput[] | null;
  publishedMs: number;
};

/** A concept we were able to read: a real label and a real, positive score. */
type UsableConcept = { canon: string; score: number; incorporated: boolean };

/**
 * Keep only concepts that carry information.
 *
 * A NaN score, an infinite one, a zero, a negative or an empty label is not a
 * quiet zero — it is the absence of a reading, and scoring it as if it were a
 * measured nought would fabricate evidence. Worse, letting a zero through makes
 * the article's maximum zero and turns every share into 0/0, so a single junk
 * row would decide the whole list. Dropped rows also do not inflate anyone's
 * rank, which is the other half of not fabricating.
 */
function usableConcepts(concepts: ConceptInput[] | null): UsableConcept[] {
  if (!concepts) return [];
  const out: UsableConcept[] = [];
  for (const c of concepts) {
    const label = c?.label?.eng;
    const score = c?.score;
    if (typeof label !== "string" || typeof score !== "number") continue;
    if (!Number.isFinite(score) || score <= 0) continue;
    const { canon, droppedSuffix } = canonicalise(label);
    if (!canon) continue;
    out.push({ canon, score, incorporated: droppedSuffix });
  }
  return out;
}

/**
 * How much this newsapi.ai article is about `companyName` / `ticker`.
 *
 * NOTE the argument order: company name BEFORE ticker, which is the reverse of
 * `relevanceOf`. Transposing them yields a plausible-looking result rather than
 * an error — a ticker canonicalises to a harmless one-token name that matches
 * nothing — so every call site is worth a second look.
 *
 * Order of judgement mirrors `relevance.ts`: age disqualifies first, the
 * provider's own per-company signal decides next, and the crude proxy — how
 * many companies the piece is juggling — only speaks when the first two have
 * left the article standing.
 */
export function articleRelevanceOf(
  article: ArticleForRelevance,
  companyName: string,
  ticker: string,
  nowMs: number,
): Relevance {
  /* Age first, and non-finite counts as too old rather than as fresh. An
     unparseable date is a date we do not have; presenting it as this morning's
     news is the one failure mode worse than dropping the story. */
  const ageDays = (nowMs - article.publishedMs) / 86_400_000;
  if (!Number.isFinite(ageDays) || ageDays > MAX_AGE_DAYS) {
    return { score: 0, verdict: "stale" };
  }

  const named = titleNames(article.title ?? "", companyName ?? "", ticker ?? "");
  const concepts = usableConcepts(article.concepts);
  const target = canonicalName(companyName ?? "");

  /* No readable list at all. This is ignorance, not evidence, and it must not
     be confused with the company being absent from a list that exists: the
     provider omits concepts on some responses, and treating that silence as a
     denial would drop genuine coverage wholesale. So we fall back to the
     headline, exactly as `relevance.ts` falls back to tag count when the
     reasoning is null — and take the small NUDGE_NO_LIST penalty so an
     unverified story never outranks a verified one. */
  if (concepts.length === 0) {
    const score = clamp01(BASE + NUDGE_NO_LIST + (named ? NUDGE_TITLE : 0));
    return named
      ? { score, verdict: "coverage" }
      : { score: Math.min(score, MENTION_CEILING), verdict: "mention" };
  }

  const top = Math.max(...concepts.map((c) => c.score));

  /* A match on a BARE label is provisional, not decisive.
   *
   * Canonicalisation strips the legal suffix, which is what makes "Meta
   * Platforms" and "Meta" the same company — and what makes the fruit and the
   * company the same string. Event Registry labels the company "Apple Inc."
   * and the fruit "Apple"; across one live page the company appeared with its
   * suffix twenty times and bare exactly once, on a story about a Somerset
   * cider maker's harvest. That story matched, scored top, and was filed as
   * coverage on Apple's page.
   *
   * The suffix is the only thing separating them, so a bare match needs
   * corroboration: the TICKER in the headline, or some other concept that is
   * itself company-shaped. Note the company NAME in the headline cannot
   * corroborate — "apple harvest" is exactly the string that fooled it.
   *
   * A suffixed match stays decisive, so nothing verified pays for this. */
  const rawMatch = target ? concepts.find((c) => c.canon === target) : undefined;
  const tickerInTitle =
    !!ticker && new RegExp(`\\b${ticker.replace(/[^A-Za-z0-9]/g, "\\$&")}\\b`, "i").test(article.title ?? "");
  /* Corroboration, any one of which is enough:
       - the label carries a legal suffix, so it is unambiguously a company;
       - the TICKER is in the headline (the company NAME cannot corroborate —
         "apple harvest" is the exact string that fooled it);
       - some other concept is company-shaped, so this is a business article;
       - the match is the article's SINGLE highest-scoring entity.

     That last one is what keeps bare but unambiguous names working. "Meta"
     outscores "Instagram"; "Johnson and Johnson" stands alone. The cider story
     fails it precisely because its "Apple" is tied at five with Cider, Orchard,
     Harvest, Margaret Thatcher and Variety (botany) — an article whose subject
     is genuinely a company does not leave it tied with the scenery. */
  const strictTop =
    !!rawMatch &&
    rawMatch.score === top &&
    concepts.filter((c) => c.score === top).length === 1;
  const corroborated =
    rawMatch?.incorporated === true ||
    tickerInTitle ||
    strictTop ||
    concepts.some((c) => c.incorporated && c.canon !== target);
  const matched = rawMatch && corroborated ? rawMatch : undefined;

  /* Breadth, computed for every article because it is also the thing that
     rescues share-of-maximum from its worst failure. In a basket piece every
     member scores alike, so every member's share reads 1.0 and every member
     looks like the subject — a Magnificent-Seven note would be filed as
     coverage on all seven pages. Counting the rivals that score near the leader
     is what tells a basket from a story. The PEER_SHARE gate is what keeps
     "Nvidia passes Apple to become the most valuable company" out of it: four
     rivals are named there, but none of them come close to the subject. */
  const peers = concepts.filter(
    (c) => c !== matched && c.incorporated && c.score >= PEER_SHARE * top,
  ).length;
  const broad = peers >= ROUNDUP_PEERS;

  /* The list exists and the company is not in it. The provider enumerated what
     the piece is about and this company did not make the list; no headline
     coincidence ("Apple orchards brace for winter") should override that. */
  if (!matched) {
    const score = BASE + NUDGE_ABSENT + (named ? NUDGE_TITLE : 0);
    return { score: Math.min(clamp01(score), MENTION_CEILING), verdict: "mention" };
  }

  /* Rank as "how many concepts outscore this one" — counting concepts, not the
     distinct score values among them.

     The distinction is not academic; ranking by distinct values was written
     first and let a real filler article through. On a list where four concepts
     score 5 and five score 4, there are only two distinct values, so a company
     sitting dead last came out at rank 1 and was filed as coverage. Counting
     concepts gives it rank 4, which is the truth. Ties at the top are still
     handled — nothing strictly outscores any of them, so co-leaders all get
     rank 0 — which was the only reason to consider distinct values at all. */
  const rank = concepts.filter((c) => c.score > matched.score).length;
  const share = matched.score / top;

  const subject = rank === 0 || (rank < CONTENDER_RANK && share >= CENTRAL_SHARE);

  let score = BASE;
  if (subject) score += rank === 0 ? NUDGE_SUBJECT : NUDGE_CONTENDER;
  else score += NUDGE_PERIPHERAL;
  if (named) score += NUDGE_TITLE;
  if (broad) score += NUDGE_BROAD;

  /* A basket outranks a bare mention here, unlike in `relevance.ts` where the
     provider's dismissal is checked first. The reason is that over there the
     dismissal is an explicit sentence about this company, while here "peers
     everywhere" is a fact about the ARTICLE and settles what kind of piece it
     is before we ask what part the company plays in it. Both are rejected, so
     the ordering only decides which label the rail reports. */
  if (broad || rank >= ROUNDUP_RANK) {
    return { score: Math.min(clamp01(score), ROUNDUP_CEILING), verdict: "roundup" };
  }

  /* Present, but behind the leaders. On the coarse scale this is the ETF
     holdings list and the supplier note — the company is in the piece and the
     piece is not about it. */
  if (!subject) {
    return { score: Math.min(clamp01(score), MENTION_CEILING), verdict: "mention" };
  }

  return { score: clamp01(score), verdict: "coverage" };
}

/* Re-exported so a caller can hold one union across both scorers without
   reaching past this module for the vocabulary it shares. */
export type { Relevance, Verdict };
