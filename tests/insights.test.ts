import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  INSIGHT_LIMIT,
  MIN_INSIGHT_SCORE,
  asOfLabel,
  insightCandidates,
  insightInputFrom,
  sectorFundFor,
  stockInsights,
  type InsightInput,
  type StockInsight,
} from "../lib/market/insights.ts";
import type { AnalystAvailability } from "../lib/api/normalize/analyst.ts";
import type { PricePoint } from "../lib/api/normalize/series.ts";
import type { InstrumentSnapshot } from "../lib/market/instrument.ts";
import { DIVIDENDS, PEERS, PROFILE, SESSIONS, SHORT, daily } from "./insights-fixtures.ts";

/* The Overview tab's insights, held to real data.

   Every fixture below is a real store-backed page captured on 24 Sep 2026 (see
   tests/insights-fixtures.ts), and every expected figure was computed by a
   separate scratch script from those same bars, not read back off the module.
   What these pin, in order of how much a mistake would cost:

     - no sentence is advice. Nothing says buy, sell, cheap, expensive,
       bullish or bearish; every claim is a measured figure with its date.
     - a figure the data cannot support is not said at all. Stale short
       interest (every name on file today settles in 2017), an analyst feed
       this account cannot read, an unrepaired split record, a benchmark whose
       bars end a fortnight early: each removes its insight rather than
       printing a plausible sentence over a bad number.
     - the numbers in the sentences are the numbers in the bars, rounded the
       way the rest of the page rounds them. */

/* 24 Sep 2026, 10:30 UTC: 06:30 in New York, the morning the fixtures were
   captured. The last completed session in every series is 23 Sep. */
const NOW = Date.UTC(2026, 8, 24, 10, 30);
const DAY = 86_400_000;

type Subject = "AAPL" | "NVDA" | "JPM" | "NFLX" | "TSLA";

const ADVICE =
  /\b(buy|buying|sell|selling|should|recommend\w*|undervalued|overvalued|cheap|expensive|bullish|bearish|opportunit\w*|attractive|upside potential|must)\b/i;

const NOT_ENTITLED: AnalystAvailability = { state: "not-entitled", status: 403 };

function input(symbol: Subject, sectorFund: string | null, over: Partial<InsightInput> = {}): InsightInput {
  const p = PROFILE[symbol];
  return {
    ticker: symbol,
    daily: daily(symbol),
    splitsKnown: true,
    market: { symbol: "SPY", daily: daily("SPY") },
    sector: sectorFund === null ? null : { symbol: sectorFund, daily: daily(sectorFund) },
    pe: p.pe,
    evToEbitda: p.evToEbitda,
    peers: PEERS[symbol].map((q) => ({ id: q.id, name: q.name, pe: q.pe })),
    sharesOutstanding: p.sharesOutstanding,
    shortInterest: SHORT[symbol],
    analyst: NOT_ENTITLED,
    earnings: null,
    dividends: DIVIDENDS[symbol],
    quoteAsOf: p.asOf,
    now: NOW,
    ...over,
  };
}

const byId = (list: StockInsight[], id: string) => list.find((i) => i.id === id);

function need(list: StockInsight[], id: string): StockInsight {
  const found = byId(list, id);
  assert.ok(found, `expected a "${id}" insight, got [${list.map((i) => i.id).join(", ")}]`);
  return found;
}

/* ── the shape every insight must have ─────────────────────────────────── */

test("every insight, on every real fixture, is dated, sourced and free of advice", () => {
  const cases: Array<[Subject, string]> = [
    ["AAPL", "XLK"],
    ["NVDA", "XLK"],
    ["JPM", "XLF"],
    ["NFLX", "XLC"],
    ["TSLA", "XLY"],
  ];
  for (const [symbol, fund] of cases) {
    const all = insightCandidates(input(symbol, fund));
    assert.ok(all.length >= 4, `${symbol}: only ${all.length} candidates`);
    for (const i of all) {
      assert.ok(i.title.length > 0 && i.title.length <= 80, `${symbol} ${i.id}: title "${i.title}"`);
      assert.ok(i.body.length > 0, `${symbol} ${i.id}: empty body`);
      assert.ok(i.source.length > 0, `${symbol} ${i.id}: no source`);
      assert.ok(i.asOf === null || /^\d{4}-\d{2}-\d{2}$/.test(i.asOf), `${symbol} ${i.id}: asOf ${i.asOf}`);
      assert.ok(["up", "down", "neutral"].includes(i.tone));
      assert.ok(Number.isFinite(i.score) && i.score >= 0 && i.score <= 100, `${symbol} ${i.id}: score ${i.score}`);
      assert.doesNotMatch(`${i.title} ${i.body}`, ADVICE, `${symbol} ${i.id} reads as advice`);
      // No NaN, Infinity or undefined may reach a sentence.
      assert.doesNotMatch(`${i.title} ${i.body}`, /NaN|Infinity|undefined|null/);
    }
    const ids = all.map((i) => i.id);
    assert.equal(new Set(ids).size, ids.length, `${symbol}: duplicate ids ${ids}`);
  }
});

test("at most five are shown, most relevant first, and the order is stable", () => {
  const shown = stockInsights(input("AAPL", "XLK"));
  assert.equal(INSIGHT_LIMIT, 5);
  assert.ok(shown.length <= INSIGHT_LIMIT);
  for (let i = 1; i < shown.length; i += 1) {
    assert.ok(shown[i - 1].score >= shown[i].score, "sorted by score, descending");
  }
  assert.deepEqual(stockInsights(input("AAPL", "XLK")), shown, "same input, same output");
  assert.equal(stockInsights(input("AAPL", "XLK"), { limit: 2 }).length, 2);
  // The shown list is the head of the ranked candidates, not a different ranking.
  assert.deepEqual(
    shown.map((i) => i.id),
    insightCandidates(input("AAPL", "XLK")).slice(0, shown.length).map((i) => i.id),
  );
});

test("the module reads no clock of its own", () => {
  const src = readFileSync(new URL("../lib/market/insights.ts", import.meta.url), "utf8");
  assert.doesNotMatch(src, /Date\.now\(|new Date\(\)|performance\.now\(/);
  assert.doesNotMatch(src, /toLocaleDateString\(\)|toLocaleString\(\)/, "locale must be explicit");
});

/* ── 52-week range ─────────────────────────────────────────────────────── */

test("AAPL: 2.4% below a 52-week high set the session before", () => {
  const range = need(insightCandidates(input("AAPL", "XLK")), "range");
  assert.equal(range.title, "2.4% below its 52-week high");
  assert.equal(
    range.body,
    "Closed at $337.02 on 23 Sep 2026: 2.4% below the 52-week high of $345.34 (22 Sep 2026) and 38.5% above the low of $243.42 (20 Jan 2026).",
  );
  assert.equal(range.tone, "up");
  assert.equal(range.asOf, "2026-09-23");
});

test("NFLX: in the bottom sixth of its range reads as near the low, from the low", () => {
  const range = need(insightCandidates(input("NFLX", "XLC")), "range");
  assert.equal(range.title, "9.6% above its 52-week low");
  assert.match(range.body, /\$65\.08 \(17 Jul 2026\)/);
  assert.match(range.body, /\$124\.86 \(21 Oct 2025\)/);
  assert.equal(range.tone, "down");
});

test("a close at a fresh 52-week high on the last session says so, and ranks near the top", () => {
  const bars = daily("AAPL");
  const last = bars[bars.length - 1];
  bars[bars.length - 1] = { ...last, price: 350, high: 351.2 };
  const all = insightCandidates(input("AAPL", "XLK", { daily: bars }));
  const range = need(all, "range");
  assert.equal(range.title, "Set a 52-week high on 23 Sep 2026");
  assert.ok(range.score >= 85);
  assert.equal(all[0].id, "range");
});

test("a record that does not reach back a year makes no 52-week claim", () => {
  const short = daily("AAPL").slice(-200);
  assert.equal(byId(insightCandidates(input("AAPL", "XLK", { daily: short })), "range"), undefined);
});

/* ── trend against the averages ────────────────────────────────────────── */

test("AAPL: above both averages, with the averages printed", () => {
  const trend = need(insightCandidates(input("AAPL", "XLK")), "trend");
  assert.equal(trend.title, "Above its 50- and 200-day averages");
  assert.equal(
    trend.body,
    "The 23 Sep 2026 close of $337.02 was 4.8% above its 50-day average ($321.51) and 17.4% above its 200-day average ($287.16).",
  );
  assert.equal(trend.tone, "up");
});

test("JPM and TSLA: split verdicts name each side", () => {
  const jpm = need(insightCandidates(input("JPM", "XLF")), "trend");
  assert.equal(jpm.title, "Below its 50-day average, above its 200-day");
  assert.match(jpm.body, /4\.5% below its 50-day average \(\$353\.51\)/);
  assert.match(jpm.body, /5\.1% above its 200-day average \(\$321\.00\)/);
  assert.equal(jpm.tone, "neutral");

  const tsla = need(insightCandidates(input("TSLA", "XLY")), "trend");
  assert.equal(tsla.title, "Above its 50-day average, below its 200-day");

  const nflx = need(insightCandidates(input("NFLX", "XLC")), "trend");
  assert.equal(nflx.title, "Below its 50- and 200-day averages");
  assert.equal(nflx.tone, "down");
});

/** Oldest first, one bar a day, a smooth path through the given closes. */
function path(closes: number[], end = SESSIONS[SESSIONS.length - 1]): PricePoint[] {
  return closes.map((price, i) => ({
    at: end - (closes.length - 1 - i) * DAY,
    price,
    open: null,
    high: price * 1.005,
    low: price * 0.995,
    volume: 1_000_000,
  }));
}

test("a close that crossed its 200-day a few sessions ago is dated and ranked up", () => {
  /* 300 sessions: a long slide from 150 to 100, then a sharp recovery whose
     last three closes are the first above the falling 200-day average. */
  const closes: number[] = [];
  for (let i = 0; i < 280; i += 1) closes.push(150 - (50 * i) / 279);
  for (let i = 1; i <= 20; i += 1) closes.push(100 + i * 1.6);
  const bars = path(closes);

  const avg200 = (upTo: number) => closes.slice(upTo - 199, upTo + 1).reduce((a, b) => a + b, 0) / 200;
  let first = closes.length - 1;
  while (first > 0 && closes[first - 1] > avg200(first - 1)) first -= 1;
  const sessionsAbove = closes.length - first;
  assert.ok(sessionsAbove >= 1 && sessionsAbove <= 10, `fixture: ${sessionsAbove} sessions above`);

  const trend = need(
    insightCandidates(input("AAPL", null, { daily: bars, market: null })),
    "trend",
  );
  assert.match(trend.body, new RegExp(`closed above the 200-day for ${sessionsAbove} session`));
  assert.ok(trend.score >= 65, `score ${trend.score}`);
});

/* ── performance against SPY and the sector fund ───────────────────────── */

test("AAPL: ahead of SPY, behind XLK, every window printed from the bars", () => {
  const rel = need(insightCandidates(input("AAPL", "XLK")), "relative");
  assert.equal(rel.title, "Ahead of SPY, behind its sector fund XLK over 1 year");
  assert.equal(
    rel.body,
    "1 month: +8.6% (SPY +0.6%, XLK +8.5%). 3 months: +14.5% (SPY +4.7%, XLK +6.1%). 1 year: +32.5% (SPY +15.8%, XLK +39.4%). Price change to the 23 Sep 2026 close; dividends excluded.",
  );
  assert.equal(rel.tone, "up");
});

test("NFLX and JPM: behind both, and a mixed verdict", () => {
  const nflx = need(insightCandidates(input("NFLX", "XLC")), "relative");
  assert.equal(nflx.title, "Behind SPY and its sector fund XLC over 1 year");
  assert.match(nflx.body, /1 month: −10\.8% \(SPY \+0\.6%, XLC \+0\.2%\)/);
  assert.match(nflx.body, /3 months: −2\.0% \(SPY \+4\.7%, XLC \+4\.9%\)/);
  assert.match(nflx.body, /1 year: −41\.4% \(SPY \+15\.8%, XLC −4\.9%\)/);
  assert.equal(nflx.tone, "down");

  const jpm = need(insightCandidates(input("JPM", "XLF")), "relative");
  assert.equal(jpm.title, "Behind SPY, ahead of its sector fund XLF over 1 year");
});

test("without a sector fund the comparison is against SPY alone", () => {
  const rel = need(insightCandidates(input("AAPL", null)), "relative");
  assert.equal(rel.title, "Ahead of SPY over 1 year");
  assert.match(rel.body, /1 year: \+32\.5% \(SPY \+15\.8%\)/);
});

test("a benchmark is never compared with itself, and a misaligned one is refused", () => {
  const spy: InsightInput = {
    ...input("AAPL", null),
    ticker: "SPY",
    daily: daily("SPY"),
    pe: null,
    evToEbitda: null,
    peers: [],
  };
  assert.equal(byId(insightCandidates(spy), "relative"), undefined);

  // SPY's bars stop a fortnight before the subject's: no window can be aligned.
  const stale = daily("SPY").slice(0, -10);
  assert.equal(
    byId(insightCandidates(input("AAPL", null, { market: { symbol: "SPY", daily: stale } })), "relative"),
    undefined,
  );
});

test("a sector fund with an unrepaired split is not compared across it", () => {
  // XLK as if its 2-for-1 had not been applied 40 sessions ago: every close
  // before it doubled, a −50% "session" at the split.
  const raw = daily("XLK").map((b, i, all) =>
    i < all.length - 40 ? { ...b, price: b.price * 2, high: (b.high ?? b.price) * 2, low: (b.low ?? b.price) * 2 } : b,
  );
  const rel = need(insightCandidates(input("AAPL", null, { sector: { symbol: "XLK", daily: raw } })), "relative");
  assert.equal(rel.title, "Ahead of SPY over 1 year");
  assert.match(rel.body, /^1 month: \+8\.6% \(SPY \+0\.6%, XLK \+8\.5%\)\. 3 months: \+14\.5% \(SPY \+4\.7%\)\./);
});

/* ── valuation against the named peers ─────────────────────────────────── */

test("AAPL: P/E against the peer median, with a duplicate share class counted once", () => {
  const val = need(insightCandidates(input("AAPL", "XLK")), "valuation");
  assert.equal(val.title, "P/E 38.6% above its peers' median");
  assert.equal(
    val.body,
    "Trailing P/E of 38.6 against a median of 27.9 across 7 peers named in its company record (range 17.0 to 352.0).",
  );
  assert.equal(val.tone, "neutral");
  assert.equal(val.asOf, "2026-09-24");
});

test("TSLA reads as a multiple, JPM as in line", () => {
  assert.equal(
    need(insightCandidates(input("TSLA", "XLY")), "valuation").title,
    "P/E 12.6× its peers' median",
  );
  assert.equal(
    need(insightCandidates(input("JPM", "XLF")), "valuation").title,
    "P/E in line with its peers' median",
  );
});

test("EV/EBITDA joins the sentence only when enough peers carry it", () => {
  const peers = PEERS.AAPL.map((q, i) => ({ id: q.id, name: q.name, pe: q.pe, evToEbitda: [18, 20, 15, 15, 30, 60, 17, 25][i] }));
  const val = need(insightCandidates(input("AAPL", "XLK", { peers })), "valuation");
  // Alphabet's second class is dropped: 18, 20, 15, 30, 60, 17, 25 -> median 20.
  assert.match(val.body, /EV\/EBITDA of 29\.6× against a peer median of 20\.0×\.$/);
});

test("fewer than three priced peers, or no P/E of its own, says nothing about valuation", () => {
  const few = PEERS.AAPL.slice(0, 2).map((q) => ({ id: q.id, name: q.name, pe: q.pe }));
  assert.equal(byId(insightCandidates(input("AAPL", "XLK", { peers: few })), "valuation"), undefined);
  assert.equal(byId(insightCandidates(input("AAPL", "XLK", { pe: null })), "valuation"), undefined);
});

/* ── volume ────────────────────────────────────────────────────────────── */

test("NFLX: a 4.2× session, set beside SPY's own volume that day", () => {
  const vol = need(insightCandidates(input("NFLX", "XLC")), "volume");
  assert.equal(vol.title, "Volume 4.2× its 30-session average on 18 Sep 2026");
  assert.equal(
    vol.body,
    "18 Sep 2026 volume of 114.4M shares was 4.2× the average of the 30 sessions before it (27.5M), as the price fell 4.7%. SPY traded 1.7× its own average that session, a quarterly options-expiry Friday.",
  );
});

test("a heavy session the whole market shared ranks below one the stock had alone", () => {
  const nflx = need(insightCandidates(input("NFLX", "XLC")), "volume");
  const alone = need(insightCandidates(input("NFLX", "XLC", { market: null })), "volume");
  assert.ok(alone.score > nflx.score);
  assert.doesNotMatch(alone.body, /SPY/);
});

test("AAPL: a spike the whole market shared is true but takes no slot", () => {
  const vol = need(insightCandidates(input("AAPL", "XLK")), "volume");
  assert.equal(vol.title, "Volume 2.1× its 30-session average on 18 Sep 2026");
  assert.ok(vol.score < MIN_INSIGHT_SCORE, `score ${vol.score}`);
  assert.equal(byId(stockInsights(input("AAPL", "XLK")), "volume"), undefined);
});

test("a volume field that swings by orders of magnitude is not measured at all", () => {
  // Most of the baseline carries one venue's tape, the last bar the consolidated figure.
  const bars = daily("AAPL").map((b, i, all) =>
    i >= all.length - 40 && i < all.length - 1 && i % 5 !== 0 ? { ...b, volume: 250_000 } : b,
  );
  assert.equal(byId(insightCandidates(input("AAPL", "XLK", { daily: bars })), "volume"), undefined);
});

/* ── dividends, short interest, analysts, earnings ─────────────────────── */

test("JPM: the next ex-dividend date and the raise from the previous payment", () => {
  const div = need(insightCandidates(input("JPM", "XLF")), "dividend");
  assert.equal(div.title, "Next ex-dividend date: 6 Oct 2026");
  assert.equal(
    div.body,
    "$1.65 a share, payable 31 Oct 2026; up 10.0% from the previous $1.50 (ex-date 6 Jul 2026).",
  );
  // AAPL's last ex-date was 10 Aug: nothing is upcoming, so nothing is said.
  assert.equal(byId(insightCandidates(input("AAPL", "XLK")), "dividend"), undefined);
});

test("short interest settled in 2017 is not presented as today's", () => {
  for (const symbol of ["AAPL", "NVDA", "JPM", "NFLX", "TSLA"] as const) {
    assert.equal(
      byId(insightCandidates(input(symbol, null)), "short-interest"),
      undefined,
      `${symbol} printed a ${SHORT[symbol].settlementDate} short-interest figure`,
    );
  }
});

test("a current short-interest filing is shown with its settlement date", () => {
  const fresh = { shortInterest: 245_000_000, daysToCover: 6.2, settlementDate: "2026-09-15" };
  const si = need(insightCandidates(input("TSLA", "XLY", { shortInterest: fresh })), "short-interest");
  assert.equal(si.title, "6.2 days to cover short interest");
  assert.equal(
    si.body,
    "245.0M shares were sold short at the 15 Sep 2026 settlement, 6.2% of the 3.95B shares outstanding; covering them would take 6.2 days of average volume. Short interest is reported twice a month, on a lag.",
  );
  assert.equal(si.asOf, "2026-09-15");
});

test("analyst consensus is described without buy or sell, and only when the feed answers", () => {
  const available: AnalystAvailability = {
    state: "available",
    consensus: {
      label: "Buy",
      ratings: { buy: 30, hold: 10, sell: 2, total: 42, reportedTotal: 42, totalDisputed: false },
      target: { consensus: 400, low: 300, high: 450, currency: "USD" },
      upsidePct: (400 / 335.85 - 1) * 100,
      vendorUpsideUnverified: null,
    },
  };
  const a = need(insightCandidates(input("AAPL", "XLK", { analyst: available })), "analyst");
  assert.equal(a.title, "Consensus target 19.1% above the price");
  assert.equal(
    a.body,
    "Of 42 analysts in the consensus, 30 rate it positively, 10 neutrally and 2 negatively. The consensus price target is $400.00 (range $300.00 to $450.00).",
  );
  assert.doesNotMatch(a.body, /\bBuy\b/i);

  const foreign: AnalystAvailability = {
    ...available,
    consensus: { ...available.consensus, target: { ...available.consensus.target, currency: "INR" } },
  };
  const f = need(insightCandidates(input("AAPL", "XLK", { analyst: foreign })), "analyst");
  assert.doesNotMatch(f.body, /target/, "a target in another currency is withheld");
  assert.equal(f.title, "30 of 42 analysts rate it positively");

  for (const shut of [NOT_ENTITLED, { state: "no-coverage" } as const, { state: "unavailable", status: 502 } as const]) {
    assert.equal(byId(insightCandidates(input("AAPL", "XLK", { analyst: shut })), "analyst"), undefined);
  }
});

test("an earnings date inside a week leads the list; a past one is dropped", () => {
  const soon = { date: "2026-09-29", source: "company investor-relations calendar", timing: "after-close" as const };
  const list = stockInsights(input("AAPL", "XLK", { earnings: soon }));
  assert.equal(list[0].id, "earnings");
  assert.equal(list[0].title, "Next earnings report: 29 Sep 2026");
  assert.equal(
    list[0].body,
    "Scheduled for 29 Sep 2026, after the close, per company investor-relations calendar.",
  );
  const past = { date: "2026-09-20", source: "x", timing: null };
  assert.equal(byId(insightCandidates(input("AAPL", "XLK", { earnings: past })), "earnings"), undefined);
});

/* ── momentum and outsized sessions ────────────────────────────────────── */

test("XLF: an RSI under 30 is stated with the convention, not as a signal", () => {
  const xlf: InsightInput = {
    ...input("JPM", null),
    ticker: "XLF",
    daily: daily("XLF"),
    pe: null,
    evToEbitda: null,
    peers: [],
    dividends: [],
  };
  const m = need(insightCandidates(xlf), "momentum");
  assert.equal(m.title, "RSI(14) at 28.4, below 30");
  assert.equal(
    m.body,
    "The 14-session relative strength index closed at 28.4 on 23 Sep 2026, its 2nd session below 30. By convention a reading below 30 is called oversold and above 70 overbought.",
  );
  // AAPL's 62.9 is unremarkable and is not turned into a sentence.
  assert.equal(byId(insightCandidates(input("AAPL", "XLK")), "momentum"), undefined);
});

test("an outsized last session is measured against the stock's own year", () => {
  const bars = daily("AAPL");
  const prev = bars[bars.length - 2].price;
  bars[bars.length - 1] = { ...bars[bars.length - 1], price: prev * 0.92, low: prev * 0.915 };
  const move = need(insightCandidates(input("AAPL", "XLK", { daily: bars })), "big-move");
  assert.equal(move.title, "Fell 8.0% on 23 Sep 2026");
  assert.match(move.body, /^The 23 Sep 2026 decline of 8\.0% was \d+\.\d× its average daily move of \d\.\d% over the past year, and its largest one-day decline /);
  assert.equal(move.tone, "down");
  // An ordinary session is not news.
  assert.equal(byId(insightCandidates(input("AAPL", "XLK")), "big-move"), undefined);
});

/* ── what an unrepaired record may say ─────────────────────────────────── */

test("with the split record unreadable, nothing measured from the bars is said", () => {
  const all = insightCandidates(input("AAPL", "XLK", { splitsKnown: false }));
  for (const id of ["range", "trend", "relative", "volume", "big-move", "momentum"]) {
    assert.equal(byId(all, id), undefined, `${id} survived an unreadable split record`);
  }
  assert.ok(byId(all, "valuation"), "figures not drawn from the bars still stand");
});

test("an empty record produces no insight and no throw", () => {
  const empty: InsightInput = {
    ...input("AAPL", "XLK"),
    daily: [],
    market: null,
    sector: null,
    pe: null,
    peers: [],
    dividends: [],
    shortInterest: null,
    analyst: null,
  };
  assert.deepEqual(stockInsights(empty), []);
});

/* ── wiring helpers ────────────────────────────────────────────────────── */

test("asOfLabel prints the exchange date the panel footnotes", () => {
  assert.equal(asOfLabel("2026-09-23"), "as of 23 Sep 2026");
  assert.equal(asOfLabel("2026-01-05T00:00:00Z"), "as of 5 Jan 2026");
  assert.equal(asOfLabel(null), null);
  assert.equal(asOfLabel("soon"), null);
});

test("sectorFundFor maps the page's sector names to the SPDR funds", () => {
  assert.equal(sectorFundFor("Information technology"), "XLK");
  assert.equal(sectorFundFor("Financials"), "XLF");
  assert.equal(sectorFundFor(null), null);
  assert.equal(sectorFundFor("Not a sector"), null);
});

test("insightInputFrom reads a snapshot without reaching for a clock", () => {
  const p = PROFILE.AAPL;
  const snapshot = {
    profile: {
      id: "AAPL",
      short: "Apple",
      sector: p.sector,
      pe: p.pe,
      evToEbitda: p.evToEbitda,
      sharesOutstanding: p.sharesOutstanding,
      asOf: p.asOf,
    },
    history: { daily: daily("AAPL"), intraday: [], intradayNote: null },
    market: { symbol: "SPY", daily: daily("SPY") },
    peers: PEERS.AAPL.map((q) => ({ ...q, price: null, chg: null, marketCap: null })),
    shortInterest: SHORT.AAPL,
    analyst: NOT_ENTITLED,
    dividends: DIVIDENDS.AAPL,
    splitsKnown: true,
  } as unknown as InstrumentSnapshot;

  const built = insightInputFrom(snapshot, { now: NOW, sector: { symbol: "XLK", daily: daily("XLK") } });
  assert.deepEqual(stockInsights(built), stockInsights(input("AAPL", "XLK")));
});
