/**
 * The arithmetic behind the order ticket.
 *
 * The ticket lets a reader enter either side of `shares × price = amount` and
 * derives the other, because fractional shares make "spend $500" as valid an
 * instruction as "buy two shares". Both readings must agree, and the fill must
 * agree with what the button said — so the sum lives here, in one pure module,
 * rather than in the component that draws it.
 *
 * Nothing here reads a quote. The price arrives from the page's own snapshot,
 * which is the real last trade; the desk never looks a price up for itself.
 */

export type OrderSide = "buy" | "sell";
export type OrderType = "Market" | "Limit" | "Stop";
/** Which side of the equation the reader is typing into. */
export type EntryMode = "amount" | "shares";

export type OrderDraft = {
  side: OrderSide;
  type: OrderType;
  mode: EntryMode;
  /** Raw input, kept as typed so "1." and "0.50" survive a keystroke. */
  amount: string;
  shares: string;
  /** The limit or stop price, for the two types that carry one. */
  trigger: string;
  /** Last traded price, from the snapshot. */
  price: number;
};

/**
 * A number out of whatever a reader typed, or null.
 *
 * Commas and a leading `$` are what people paste out of other screens, so they
 * are read rather than rejected. Zero and negatives are not orders and come
 * back as null, which keeps every caller from having to test for them.
 */
export function parseMoney(raw: string): number | null {
  const cleaned = raw.replace(/[$,\s]/g, "");
  if (cleaned === "") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * The price the order would fill at.
 *
 * A market order fills at the last trade. A limit or a stop fills at the price
 * the reader named — using the last trade for those would print a quantity the
 * order could not produce, which is the specific lie this function exists to
 * avoid. Until that price is entered there is no execution price at all.
 */
export function executionPrice(draft: OrderDraft): number | null {
  if (draft.type === "Market") return draft.price > 0 ? draft.price : null;
  return parseMoney(draft.trigger);
}

/** The completed pair, whichever half the reader supplied. */
export function resolveOrder(draft: OrderDraft): {
  shares: number;
  amount: number;
  price: number | null;
} {
  const price = executionPrice(draft);
  const empty = { shares: 0, amount: 0, price };
  if (price === null) return empty;

  if (draft.mode === "amount") {
    const amount = parseMoney(draft.amount);
    return amount === null ? empty : { shares: amount / price, amount, price };
  }

  const shares = parseMoney(draft.shares);
  return shares === null ? empty : { shares, amount: shares * price, price };
}

export function validateOrder(
  draft: OrderDraft,
  book: { cash: number; held: number },
): { ok: true } | { ok: false; reason: string } {
  if (draft.type !== "Market" && parseMoney(draft.trigger) === null) {
    return {
      ok: false,
      reason: draft.type === "Limit" ? "Enter a limit price" : "Enter a stop price",
    };
  }

  const { shares, amount, price } = resolveOrder(draft);
  if (price === null) return { ok: false, reason: "No price to trade against" };
  if (shares <= 0) {
    return {
      ok: false,
      reason: draft.mode === "amount" ? "Enter an amount" : "Enter a quantity",
    };
  }

  if (draft.side === "buy") {
    /* Rounded to the cent before comparing: spending the last dollar of the
       book should be allowed, and a float that lands a millionth over would
       otherwise refuse it. */
    return Math.round(amount * 100) > Math.round(book.cash * 100)
      ? { ok: false, reason: "Insufficient buying power" }
      : { ok: true };
  }

  if (book.held <= 0) return { ok: false, reason: "You hold no shares of this name" };
  return Math.round(shares * 1e4) > Math.round(book.held * 1e4)
    ? { ok: false, reason: `You only hold ${formatShares(book.held)} shares` }
    : { ok: true };
}

const SHARE_FMT = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 4,
});

/**
 * A quantity, to four places and no further.
 *
 * Four is where a fractional share stops meaning anything at these prices, and
 * trailing zeros on a whole number read as false precision — "5" is what was
 * bought, not "5.0000". A holding too small to show at four places is floored
 * to the smallest that does rather than to zero, because "0" beside a real
 * position is worse than a rounded sliver.
 */
export function formatShares(n: number): string {
  if (n === 0) return "0";
  if (n > 0 && n < 0.0001) return "0.0001";
  return SHARE_FMT.format(n);
}
