import { C, PEER_COLORS, trend } from "../tokens";
import { marketCap as capOf, money, pct, ratio, usd } from "./format";
import type { PricePoint } from "../api/normalize/series";
import type { InstrumentSnapshot } from "./instrument";

/* The instrument page's readings, derived from what the feed actually says.

   This replaces a module that computed nearly all of it from a seed: RSI was
   `38 + seed % 34`, the fifty-day average was `price × 0.96`, the analyst
   split was `analysts × 0.62`, and the one-year return was `chg × 11`. Every
   one of those looked entirely reasonable on the page.

   The return shapes are unchanged, so the panels render exactly as they did.
   What changed is where the numbers come from, and that anything the feed
   cannot answer now arrives as a dash instead of a plausible invention. */

const DASH = "—";

const asUsd = (n: number | null) => (n === null ? DASH : usd(n));
const asNum = (n: number | null, digits = 2) => (n === null ? DASH : n.toFixed(digits));

/** Shares, abbreviated the way a statistics grid has room for. */
function shares(n: number | null): string {
  if (n === null || n <= 0) return DASH;
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  return Math.round(n).toLocaleString("en-US");
}

/** The five figures in the bordered strip under the chart. */
export function dayStats(s: InstrumentSnapshot) {
  const p = s.profile;
  return [
    { label: "Day's open", value: asUsd(p.open) },
    { label: "Previous close", value: asUsd(p.previousClose) },
    { label: "Volume", value: p.volume === null ? DASH : shares(p.volume) },
    { label: "Day's high", value: asUsd(p.dayHigh) },
    { label: "Day's low", value: asUsd(p.dayLow) },
  ];
}

const INSIGHT_TONE = { up: C.up, note: C.gold, warn: C.down } as const;
type Kind = keyof typeof INSIGHT_TONE;

/* Observations, not opinions.

   The authored version carried three sentences of analysis per company. These
   are statements about figures on this page and nothing else — where the price
   sits in its year, what the momentum indicator reads, and how recent coverage
   has leaned. Anything that cannot be traced to a number is simply not said. */
export function insights(s: InstrumentSnapshot) {
  const out: Array<{ kind: Kind; title: string; body: string }> = [];
  const { profile, technical, news, returns } = s;

  if (technical.rangePosition !== null && profile.high52 !== null && profile.low52 !== null) {
    const at = technical.rangePosition;
    out.push({
      kind: at >= 80 ? "up" : at <= 20 ? "warn" : "note",
      title:
        at >= 80
          ? "Near its twelve-month high"
          : at <= 20
            ? "Near its twelve-month low"
            : "Mid-range for the year",
      body: `The last price sits ${at.toFixed(0)}% of the way between ${usd(profile.low52)} and ${usd(profile.high52)}, the lowest and highest it has traded in a year.`,
    });
  }

  if (technical.rsiState !== null && technical.rsi.latest !== null) {
    out.push({
      kind: technical.rsiState === "overbought" ? "warn" : technical.rsiState === "oversold" ? "up" : "note",
      title:
        technical.rsiState === "overbought"
          ? "Momentum reads stretched"
          : technical.rsiState === "oversold"
            ? "Momentum reads washed out"
            : "Momentum is unremarkable",
      body: `The fourteen-day relative strength index is ${technical.rsi.latest.toFixed(1)}. Above seventy is conventionally read as overbought and below thirty as oversold.`,
    });
  }

  const scored = news.filter((n) => n.sentiment !== null);
  if (scored.length >= 3) {
    const positive = scored.filter((n) => n.sentiment === "positive").length;
    const negative = scored.filter((n) => n.sentiment === "negative").length;
    out.push({
      kind: positive > negative ? "up" : negative > positive ? "warn" : "note",
      title: "Recent coverage",
      body: `Of ${scored.length} recent stories carrying a tone, ${positive} read positive and ${negative} negative. The tone is the publisher's, not ours.`,
    });
  }

  if (out.length < 3 && returns.ret1y !== null) {
    out.push({
      kind: returns.ret1y >= 0 ? "up" : "warn",
      title: "Over the past year",
      body: `Total return of ${pct(returns.ret1y, 1)}, measured to the last completed session and adjusted for splits.`,
    });
  }

  return out.slice(0, 3).map((i, index) => ({
    ...i,
    num: `0${index + 1}`,
    color: INSIGHT_TONE[i.kind],
  }));
}

/** Percent change across the last `sessions` trading days of the series. */
function over(points: PricePoint[], sessions: number): number | null {
  if (points.length < sessions + 1) return null;
  const last = points[points.length - 1].price;
  const prev = points[points.length - 1 - sessions].price;
  return prev > 0 ? (last / prev - 1) * 100 : null;
}

export function returns(s: InstrumentSnapshot) {
  const pts = s.history.daily;
  const rows: Array<[string, number | null]> = [
    ["1 month", over(pts, 21)],
    ["6 months", over(pts, 126)],
    ["1 year", s.returns.ret1y],
    ["5 years", s.returns.ret5y],
  ];

  return rows.map(([label, v]) => ({
    label,
    value: v === null ? DASH : `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(1)}%`,
    color: v === null ? C.ink4 : trend(v >= 0),
    width: v === null ? "0%" : `${Math.min(100, Math.abs(v) * 1.6 + 8)}%`,
  }));
}

export function ratios(s: InstrumentSnapshot) {
  const p = s.profile;
  const latest = s.financials.annual.at(-1);
  return [
    { label: "Market cap", value: capOf(p.marketCap) },
    { label: "P/E ratio", value: ratio(p.pe) },
    { label: "EPS (TTM)", value: p.eps === null ? DASH : usd(p.eps) },
    { label: "Dividend yield", value: p.dividendYield === null ? DASH : `${p.dividendYield.toFixed(2)}%` },
    { label: "Price / sales", value: ratio(p.priceToSales) },
    { label: "Price / book", value: ratio(p.priceToBook) },
    { label: "Return on equity", value: p.returnOnEquity === null ? DASH : `${(p.returnOnEquity * 100).toFixed(1)}%` },
    { label: "Profit margin", value: latest?.netMargin == null ? DASH : `${latest.netMargin.toFixed(1)}%` },
    { label: "Debt / equity", value: asNum(p.debtToEquity) },
    { label: "Beta (5Y)", value: asNum(p.beta) },
    { label: "Shares outstanding", value: shares(p.sharesOutstanding) },
    { label: "Average volume", value: shares(p.avgVolume) },
  ];
}

/** Revenue by fiscal year, in billions, for the bar chart. */
export function revenue(s: InstrumentSnapshot) {
  const years = s.financials.annual.filter((y) => y.revenue !== null);
  if (years.length === 0) return [];
  const billions = years.map((y) => (y.revenue as number) / 1e9);
  const max = Math.max(...billions);

  return years.map((y, i) => {
    const latest = i === years.length - 1;
    const v = billions[i];
    return {
      year: y.year,
      value: v >= 100 ? String(Math.round(v)) : v.toFixed(1),
      height: max > 0 ? `${((v / max) * 100).toFixed(1)}%` : "0%",
      /* The most recent fiscal year is the only bar that earns gold. */
      background: latest ? "linear-gradient(180deg, #E8CFA3, #8A6E43)" : C.rule,
      latest,
    };
  });
}

type Signal = "BULLISH" | "BEARISH" | "NEUTRAL" | "ABOVE" | "BELOW" | "ELEVATED" | "MODERATE" | "—";
const NEGATIVE: Signal[] = ["BEARISH", "BELOW"];
const POSITIVE: Signal[] = ["BULLISH", "ABOVE"];

export function technicals(s: InstrumentSnapshot) {
  const { technical: t, profile: p } = s;

  const against = (avg: number | null): { value: string; signal: Signal; fill: number } => {
    if (avg === null || p.price === null) return { value: DASH, signal: "—", fill: 0 };
    const above = p.price >= avg;
    const gap = Math.abs(p.price / avg - 1) * 100;
    return { value: money(avg), signal: above ? "ABOVE" : "BELOW", fill: Math.min(96, 50 + gap * 4) };
  };

  const sma = against(t.sma.latest);
  const ema = against(t.ema.latest);

  const rows: Array<{ label: string; value: string; signal: Signal; fill: number }> = [
    {
      label: "RSI (14)",
      value: t.rsi.latest === null ? DASH : t.rsi.latest.toFixed(1),
      signal:
        t.rsiState === "overbought" ? "BULLISH" : t.rsiState === "oversold" ? "BEARISH" : t.rsiState === null ? "—" : "NEUTRAL",
      fill: t.rsi.latest ?? 0,
    },
    { label: "SMA (50)", ...sma },
    { label: "EMA (20)", ...ema },
    {
      label: "52-week range",
      value: t.rangePosition === null ? DASH : `${t.rangePosition.toFixed(0)}%`,
      signal: t.rangePosition === null ? "—" : t.rangePosition >= 50 ? "ABOVE" : "BELOW",
      fill: t.rangePosition ?? 0,
    },
    {
      label: "Beta (5Y)",
      value: asNum(p.beta),
      signal: p.beta === null ? "—" : p.beta > 1.5 ? "ELEVATED" : "MODERATE",
      fill: p.beta === null ? 0 : Math.min(96, p.beta * 45),
    },
  ];

  /* Everything that is neither clearly good nor clearly bad reads gold — the
     palette has no neutral grey for signal. A row with nothing to say is dim. */
  return rows.map((r) => ({
    ...r,
    color:
      r.signal === "—"
        ? C.ink4
        : NEGATIVE.includes(r.signal)
          ? C.down
          : POSITIVE.includes(r.signal)
            ? C.up
            : C.gold,
    width: `${Math.max(6, Math.min(100, r.fill))}%`,
  }));
}

export function competitors(s: InstrumentSnapshot) {
  const p = s.profile;
  return [
    {
      id: p.id,
      mark: p.mark,
      name: p.short,
      color: p.color,
      price: asUsd(p.price),
      mcap: capOf(p.marketCap),
      pe: ratio(p.pe),
      ret: s.returns.ret1y === null ? DASH : pct(s.returns.ret1y, 1),
      retColor: s.returns.ret1y === null ? C.ink4 : trend(s.returns.ret1y >= 0),
      isSelf: true,
      covered: true,
    },
    ...s.peers.map((c, i) => ({
      id: c.id,
      mark: c.id.charAt(0),
      name: c.name,
      color: PEER_COLORS[i % PEER_COLORS.length],
      price: asUsd(c.price),
      mcap: capOf(c.marketCap),
      pe: ratio(c.pe),
      ret: c.chg === null ? DASH : pct(c.chg, 1),
      retColor: c.chg === null ? C.ink4 : trend(c.chg >= 0),
      isSelf: false,
      /* Every quoted symbol has a page now, so a peer row always leads
         somewhere real. */
      covered: true,
    })),
  ];
}

export function position(s: InstrumentSnapshot, held: number, portfolio: number) {
  const p = s.profile;
  const price = p.price ?? 0;
  const weight = portfolio > 0 ? ((held * price) / portfolio) * 100 : 0;
  const dayMove = p.chg === null || p.price === null ? null : (held * price * p.chg) / 100;

  return [
    { label: "Shares held", value: String(held), color: C.ink },
    { label: "Market value", value: p.price === null ? DASH : usd(held * price), color: C.ink },
    {
      label: "Today's move",
      value: dayMove === null ? DASH : `${dayMove >= 0 ? "+$" : "−$"}${money(Math.abs(dayMove))}`,
      color: dayMove === null ? C.ink4 : trend(dayMove >= 0),
    },
    { label: "Portfolio weight", value: `${weight.toFixed(1)}%`, color: C.ink },
  ];
}

/* The largest single-session moves in the record, which is a fact about the
   series rather than the three hardcoded dates this replaced. */
export function notableMoves(s: InstrumentSnapshot, count = 3) {
  const pts = s.history.daily;
  if (pts.length < 2) return [];

  const moves: Array<{ at: number; chg: number }> = [];
  for (let i = 1; i < pts.length; i += 1) {
    const prev = pts[i - 1].price;
    if (prev > 0) moves.push({ at: pts[i].at, chg: (pts[i].price / prev - 1) * 100 });
  }

  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return moves
    .sort((a, b) => Math.abs(b.chg) - Math.abs(a.chg))
    .slice(0, count)
    .sort((a, b) => b.at - a.at)
    .map((m) => ({ date: fmt.format(m.at), chg: pct(m.chg), color: trend(m.chg >= 0) }));
}
