/* Naming a US listing the way TradingView names it.
 *
 * The advanced-chart widget takes a single string — "NASDAQ:AAPL". A wrong
 * venue does not degrade into an approximate chart; it renders an empty one.
 * So the rule here is asymmetric on purpose: prefix only where the venue is
 * known, and say nothing where it is not. An unprefixed US ticker resolves to
 * TradingView's own primary listing, which is right far more often than a
 * guess, and the widget is configured to let the reader search from there.
 *
 * WHY THE MIC AND NOT THE EXCHANGE CODE
 *
 * `ex` in lib/market/data/symbol-master.json is a bucket, not an exchange. Of
 * the 4,922 rows tagged AMEX: 2,731 are ARCX (NYSE Arca), 1,640 are BATS
 * (Cboe BZX), and only 325 are XASE (NYSE American). Prefixing that bucket
 * "AMEX:" would mis-name most of the ETF universe — including whichever of
 * those funds a reader is most likely to look up. Every master entry also
 * carries a `mic`, which is the actual venue, so the MIC decides and `ex` is
 * only consulted when there is no usable MIC.
 *
 * WHY BZX IS DELIBERATELY LEFT BARE
 *
 * TradingView carries Cboe BZX-listed funds under more than one prefix
 * depending on the fund. Picking one would render an empty chart for whichever
 * half we guessed wrong, and there is no way to tell from our data which half
 * a given symbol falls in. Unprefixed is the honest answer: TradingView
 * resolves its own primary listing. The same reasoning covers PINK, INDX and
 * anything unrecognised.
 *
 * This module is pure and takes the venue explicitly, so it can be tested
 * without loading the 2.5 MB master file. The lookup lives with the caller.
 */

/** The venues we can name with confidence, keyed by MIC. */
const BY_MIC: Record<string, string> = {
  XNYS: "NYSE",
  XNMS: "NASDAQ",
  XNCM: "NASDAQ",
  XNGS: "NASDAQ",
  XNAS: "NASDAQ",
  /* TradingView files NYSE Arca under AMEX, which is why SPY is AMEX:SPY. */
  ARCX: "AMEX",
  XASE: "AMEX",
};

/* Venues we recognise and deliberately refuse to name.
 *
 * These must short-circuit rather than fall through to the bucket below. A BZX
 * fund carries ex "AMEX", so falling through would prefix it "AMEX:" — the
 * precise mis-naming this module exists to prevent, reached by accident. A MIC
 * we recognise has already told us what we need to know; only a MIC we have
 * never seen leaves the question open for the bucket to answer.
 *
 * XXXX is not in here on purpose: it is the master's placeholder for "no MIC
 * recorded", so it is genuinely unknown and the bucket is the better guess. */
const BARE_MICS = new Set(["BATS", "IEXG", "XCHI", "XCBO", "PINL", "OOTC"]);

/** The coarse bucket, consulted only when the MIC is absent or never seen. */
const BY_EXCHANGE: Record<string, string> = {
  NSDQ: "NASDAQ",
  NYSE: "NYSE",
  /* Reachable only when the MIC is missing. With a MIC present this bucket
     never decides, which is the whole point of preferring it. */
  AMEX: "AMEX",
};

/**
 * The symbol string to hand the TradingView widget, or null when there is no
 * ticker to name.
 *
 * Returns a bare ticker rather than a guessed prefix whenever the venue is
 * unknown — see the header. Callers should treat the bare form as valid, not
 * as a failure.
 */
export function tradingViewSymbol(
  ticker: string,
  mic: string | null | undefined,
  ex: string | null | undefined,
): string | null {
  /* TradingView writes share classes with a dot; the gateway gives us either
     separator, as lib/market/paths.ts notes. */
  const symbol = ticker.trim().toUpperCase().replace(/\//g, ".");
  if (!symbol) return null;

  const code = (mic ?? "").trim().toUpperCase();
  if (BARE_MICS.has(code)) return symbol;

  const venue = BY_MIC[code] ?? BY_EXCHANGE[(ex ?? "").trim().toUpperCase()];

  return venue ? `${venue}:${symbol}` : symbol;
}
