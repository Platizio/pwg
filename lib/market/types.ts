/** Lux grades insights three ways and colours them gold / sage / terracotta. */
export type InsightKind = "up" | "note" | "warn";

export type Insight = {
  kind: InsightKind;
  title: string;
  body: string;
};

export type NewsItem = {
  source: string;
  title: string;
  time: string;
  tag: string;
  /** What the headline actually means — shown when a reader opens the item. */
  summary: string;
};

/** Peers carry no colour of their own — they borrow from the PEER_COLORS rotation. */
export type Peer = {
  id: string;
  name: string;
  price: number;
  mcap: string;
  pe: number;
  ret: number;
};

export type Holder = {
  name: string;
  shares: string;
  pct: string;
};

export type ShareSlice = {
  label: string;
  pct: number;
};

export type Instrument = {
  id: string;
  short: string;
  name: string;
  ex: string;
  /** Single-letter monogram, set in Instrument Serif inside a hairline square. */
  mark: string;
  /** Monogram ink colour — the tile itself is only a border. */
  color: string;
  price: number;
  /** Day change, percent. */
  chg: number;
  /** Deterministic PRNG seed — the same instrument always draws the same series. */
  seed: number;
  sector: string;
  mcap: string;
  pe: number;
  eps: number;
  div: string;
  beta: number;
  ps: number;
  pb: number;
  roe: string;
  margin: string;
  debt: number;
  /** Revenue by fiscal year, billions USD, oldest first (FY2021…FY2025). */
  rev: number[];
  analysts: number;
  target: number;
  about: string;
  /** The company's own site. Real and public — the figures are simulated, the
      company is not, and a dead "Website" button helps nobody. */
  site: string;
  /** The company's investor-relations page, where the real filings live. */
  ir: string;
  share: ShareSlice[];
  comps: Peer[];
  holders: Holder[];
  insights: Insight[];
  news: NewsItem[];
};

export type RangeId = "1D" | "1W" | "1M" | "3M" | "1Y" | "5Y";

export type RangeDef = {
  id: RangeId;
  /** What the control reads. */
  label: string;
  /** Which series answers this range. */
  source: "intraday" | "daily";
  /** Trading sessions to show. Undefined means the whole series. */
  sessions?: number;
  /* What one point on this range actually is, in words a reader can check
     against the axis. The chart used to state this nowhere, so nothing on
     screen distinguished five daily closes from a week of minutes. */
  interval: string;
  /** Whether the time axis shows a clock rather than a date. */
  intraday: boolean;
};

export type TabId =
  | "overview"
  | "performance"
  | "fundamentals"
  | "technicals"
  | "competitors"
  | "holdings";
