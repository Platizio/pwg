/* The gateway's symbol, as Polygon spells it.
 *
 * The two agree for ordinary shares and dotted classes ("BRK.B"), and differ
 * for five families (measured 24 Sep 2026, each against a live quote):
 *
 *   preferred series   gateway "ABR-D"    Polygon "ABRpD"
 *   preferred, bare    gateway "TY-"      Polygon "TYp"
 *   warrants           gateway "ACHR+"    Polygon "ACHR.WS"
 *   units              gateway "AAC.UN"   Polygon "AAC.U"
 *   rights             gateway "AIIA.RT"  Polygon "AIIAr"
 *
 * Unmapped, Polygon answers nothing for most of them and they fall back to the
 * gateway's /historical, whose closes are not the official ones. The bare
 * preferred is worse: Polygon reads "TY-" as "TY" and answers with the COMMON
 * stock (TY 34.60 against TYp 40.40 on 23 Sep; DCOM 39.95 against DCOMp 16.52),
 * so an unmapped one draws another security's prices under the preferred's
 * quote. Anything not recognised here passes through unchanged. */
export function polygonTicker(symbol: string): string {
  const preferred = /^([A-Z]+)-([A-Z])$/.exec(symbol);
  if (preferred) return `${preferred[1]}p${preferred[2]}`;
  const barePreferred = /^([A-Z]+)-$/.exec(symbol);
  if (barePreferred) return `${barePreferred[1]}p`;
  const warrant = /^([A-Z]+)\+$/.exec(symbol);
  if (warrant) return `${warrant[1]}.WS`;
  const unit = /^([A-Z]+)\.UN$/.exec(symbol);
  if (unit) return `${unit[1]}.U`;
  const right = /^([A-Z]+)\.RT$/.exec(symbol);
  if (right) return `${right[1]}r`;
  return symbol;
}

/* The ticker a company traded under before its current one, for the days it
 * did.
 *
 * Polygon files history under the TICKER, not the company. Measured 24 Sep
 * 2026: Polygon's "META" before 9 Jun 2022 is the Roundhill metaverse ETF
 * ($14.91 on 24 Sep 2021) and Facebook's bars are under "FB", ending on
 * 8 Jun 2022 at 196.64; "ELV" has nothing before 28 Jun 2022, Anthem's bars
 * being under "ANTM" to the 27th (482.58). The gateway's /historical files the
 * same history under the new ticker (META 352.96 on 24 Sep 2021, FB's close
 * that day; ELV 482.58 on 27 Jun 2022), so without this those years kept the
 * gateway's closes, which are not the official ones, and META's five-year
 * return could only be measured from the 24th, a session after its anchor.
 *
 * `from` is set when the company held the current ticker before, too. Fiserv
 * traded as FISV, then as FI from 7 Jun 2023, then as FISV again from 11 Nov
 * 2025 (Polygon: FI's last bar 10 Nov 2025 at 63.80, FISV's first 11 Nov at
 * 64.26), and the gateway's FISV has a hole across the FI years.
 *
 * Listed only where both sources were measured to line up. Renames whose
 * gateway series itself starts at the rename (XYZ, CPAY, RVTY, EG, DAY, GEN,
 * FBIN, GAP, WTW, CTRA, PARA, PSKY, BALL, BFH) are not listed: with no gateway
 * rows to check them against, the old ticker's bars would join only as far
 * back as the lead-in's continuity test happens to reach. */
export type Predecessor = { symbol: string; from?: string; until: string };

export const PREDECESSORS: Readonly<Record<string, readonly Predecessor[]>> = {
  META: [{ symbol: "FB", until: "2022-06-08" }],
  ELV: [{ symbol: "ANTM", until: "2022-06-27" }],
  FISV: [{ symbol: "FI", from: "2023-06-07", until: "2025-11-10" }],
};

/** The predecessors whose days reach `fromDay` ("yyyy-mm-dd") or later. */
export function predecessorsSince(symbol: string, fromDay: string): readonly Predecessor[] {
  return (PREDECESSORS[symbol] ?? []).filter((p) => p.until >= fromDay);
}
