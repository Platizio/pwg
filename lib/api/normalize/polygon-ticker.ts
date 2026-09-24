/* The gateway's symbol, as Polygon spells it.
 *
 * The two agree for ordinary shares and dotted classes ("BRK.B"), and differ
 * for two families that together make 470 of the 13,797 tradable symbols:
 *
 *   preferred series   gateway "ABR-D"   Polygon "ABRpD"
 *   warrants           gateway "ACHR+"   Polygon "ACHR.WS"
 *
 * Unmapped, Polygon answers nothing for them and they fall back to the
 * gateway's /historical, whose closes are not the official ones. Anything not
 * recognised here passes through unchanged, so the worst case is the fallback
 * that existed before. */
export function polygonTicker(symbol: string): string {
  const preferred = /^([A-Z]+)-([A-Z])$/.exec(symbol);
  if (preferred) return `${preferred[1]}p${preferred[2]}`;
  const warrant = /^([A-Z]+)\+$/.exec(symbol);
  if (warrant) return `${warrant[1]}.WS`;
  return symbol;
}
