/**
 * The one horizontal inset every card on the terminal's home uses.
 *
 * The cards used to carry three — 20, 24 and 28px — so stacked down the page
 * their headings did not share a left line. On a phone it is 16px, the page's
 * own gutter, so the card edge and the text inside it keep one rhythm. Headings and first-row content
 * now sit on this inset in every card; a row that tints on hover is pulled
 * out by its own padding (see ROW_BLEED) so its text stays on the same line.
 */
export const CARD_X = "px-4 sm:px-6";

/**
 * Cancels CARD_X, so a strip inside the card runs out to the card's own edge.
 * The popular ribbon uses it: its cells are then cut by the card border rather
 * than by a hard line 20px inside it. Change it with CARD_X.
 */
export const CARD_BLEED = "-mx-4 sm:-mx-6";

/**
 * Pulls a list of hover-tinted rows out by the rows' own `px-2`, so the row
 * content lands on CARD_X while the tint gets room either side of it.
 */
export const ROW_BLEED = "-mx-2";
