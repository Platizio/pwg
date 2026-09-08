/* Does this story bear on the share price, or is it merely about the company?
 *
 * The relevance scorers answer a different question. Once they were working,
 * Apple's rail read:
 *
 *   John Ternus takes helm as Apple eyes AI, foldable phones     <- yes
 *   How Much Is Apple's New CEO John Ternus Getting Paid?        <- yes
 *   Apple Maps Renames Lake Ontario To Lake America              <- no
 *
 * All three are genuinely about Apple. The third will not move the stock a
 * cent. "News that says why the stock is going up, down or sideways" needs
 * aboutness AND consequence, and aboutness alone was all we had.
 *
 * A WEIGHT, NOT A GATE. Rejecting trivia outright takes a quietly covered name
 * straight back to an empty rail, which Tesla had already demonstrated once.
 * So this ranks: the earnings story beats the app update, and trivia occupies
 * a slot only when there is nothing better to put there.
 *
 * Keyword matching, deliberately. The alternative is a classifier, and a
 * classifier here would be a confident guess with no audit trail on a
 * regulated surface. A phrase list is crude, but every decision it makes can
 * be read off the page and argued with — and when it is wrong, the fix is one
 * line rather than a retrain.
 */

export type ImpactKind =
  | "earnings"
  | "analyst"
  | "leadership"
  | "deal"
  | "capital"
  | "legal"
  | "trading"
  | "launch"
  | "none";

export type Impact = {
  /** 0..1. Comparable across articles; combine with relevance to rank. */
  score: number;
  /** What kind of event this looks like, for a label on the rail. */
  kind: ImpactKind;
};

/* Three tiers rather than a continuum. A finer scale would imply a precision
   a phrase list does not have. */
const MOVES = 0.9;
const MATERIAL = 0.5;
const NONE = 0.15;

/* A leak is not an event. These are demoted before anything else is
   considered, because a rumour piece cheerfully uses the vocabulary of the
   thing it is speculating about — "Leaker claims to reveal Apple's foldable"
   would otherwise read as a product launch. */
const SPECULATION =
  /\b(leak|leaker|leaked|rumou?r|rumou?red|claims? to|allegedly|reportedly|could|might|what if|concept art)\b/i;

/* Ordered. The first tier that matches decides the kind, so the more
   consequential reading wins when a headline carries both: "Apple announces a
   buyback" is capital, not a launch. */
const TIERS: Array<{ kind: ImpactKind; score: number; pattern: RegExp }> = [
  {
    kind: "earnings",
    score: MOVES,
    pattern:
      /\b(earnings|results|guidance|forecast|outlook|revenue|profit|margin|eps|beats?|missed?|estimates?|quarterly|q[1-4]\b|full[- ]year)\b/i,
  },
  {
    kind: "analyst",
    score: MOVES,
    pattern:
      /\b(upgrade[sd]?|downgrade[sd]?|price target|rating|overweight|underweight|outperform|underperform|initiated coverage|a buy|buy or sell|bull case|bear case)\b/i,
  },
  {
    kind: "leadership",
    score: MOVES,
    pattern:
      /\b(ceo|cfo|coo|chairman|takes? (the )?helm|steps? down|stepping down|resign\w*|ousted|appoint\w*|succeed\w*|successor|names? new|pay (target|package)s?|compensation)\b/i,
  },
  {
    kind: "deal",
    score: MOVES,
    pattern:
      /\b(acquir\w+|acquisition|merger|merge[sd]?|takeover|buyout|to buy|stake in|divest\w*|spin[- ]off|joint venture)\b/i,
  },
  {
    kind: "capital",
    score: MOVES,
    pattern:
      /\b(buyback|share repurchase|dividend|stock split|share offering|raises? \$|debt offering|bond sale|ipo)\b/i,
  },
  {
    kind: "legal",
    score: MOVES,
    pattern:
      /\b(lawsuit|sue[sd]?|antitrust|investigation|probe|fine[sd]?|penalt\w+|settlement|recall|ban(?:ned|s)?|sanction\w*|sec filing|regulat\w+ approval)\b/i,
  },
  {
    kind: "trading",
    score: MOVES,
    pattern:
      /\b(shares?|stock)\b[^.]{0,40}\b(jump\w*|surge\w*|soar\w*|slump\w*|plunge\w*|tumbl\w*|slide[sd]?|rise[sn]?|fell|fall\w*|rall\w+|skid|sell[- ]off)\b|\b(market cap|valuation|all[- ]time high|52[- ]week)\b/i,
  },
  {
    /* A real corporate event a market prices, but not a results print. Sits
       between the two so a launch beats trivia without beating earnings. */
    kind: "launch",
    score: MATERIAL,
    pattern:
      /\b(launch\w*|unveil\w*|announce[sd]?|event|debut\w*|rollout|roll out|contract|partnership|deal with|order book|production start)\b/i,
  },
];

/**
 * How much this story bears on the price.
 *
 * Reads the headline first and the summary only as support: a headline is
 * written to carry the news, while a body mentions everything in passing, so
 * weighting them equally would let one stray word in paragraph nine outrank
 * what the story is actually about.
 */
export function marketImpactOf(article: { title: string; summary?: string | null }): Impact {
  const title = (article.title ?? "").trim();
  if (!title) return { score: 0, kind: "none" };

  /* The summary is consulted only when the headline settles nothing, which is
     why it cannot lift a story above the tier its own headline earned. */
  const support = (article.summary ?? "").trim();

  if (SPECULATION.test(title)) return { score: NONE, kind: "none" };

  for (const tier of TIERS) {
    if (tier.pattern.test(title)) return { score: tier.score, kind: tier.kind };
  }

  if (support && !SPECULATION.test(support)) {
    for (const tier of TIERS) {
      /* A tier below what the headline would have earned, because the evidence
         is weaker: the body mentioned it, the headline did not lead with it. */
      if (tier.pattern.test(support)) {
        return { score: Math.min(tier.score, MATERIAL), kind: tier.kind };
      }
    }
  }

  return { score: NONE, kind: "none" };
}
