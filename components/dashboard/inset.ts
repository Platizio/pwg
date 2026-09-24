/**
 * The one horizontal inset every card on the terminal's home uses.
 *
 * The cards used to carry three — 20, 24 and 28px — so stacked down the page
 * their headings did not share a left line. Headings and first-row content
 * now sit on this inset in every card; a row that tints on hover is pulled
 * out by its own padding (see ROW_BLEED) so its text stays on the same line.
 */
export const CARD_X = "px-5 sm:px-6";

/**
 * Pulls a list of hover-tinted rows out by the rows' own `px-2`, so the row
 * content lands on CARD_X while the tint gets room either side of it.
 */
export const ROW_BLEED = "-mx-2";
