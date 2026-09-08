import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { RATES, pct } from "../Platizio_Global_Revamp/data/pricingRates.ts";
import { COPY } from "../lib/home/copy.ts";

/* Guards on the rewritten copy. The words are free; the numbers are not. */

const everyString = (v: unknown, out: string[] = []): string[] => {
  if (typeof v === "string") out.push(v);
  else if (Array.isArray(v)) v.forEach((x) => everyString(x, out));
  else if (v && typeof v === "object") Object.values(v).forEach((x) => everyString(x, out));
  return out;
};

test("the page runs in the order Aayush set: why, how, regulated, fees, questions, the account", () => {
  /* This used to read the "01 — why global" labels off COPY. Those labels are
     gone from the page, so the number is no longer anywhere the copy can hold
     it — the order now lives only in the JSX. Read it from there rather than
     from a field kept alive purely to be asserted on. */
  const page = readFileSync(new URL("../components/home/home-page.tsx", import.meta.url), "utf8");
  const body = page.slice(page.indexOf("<div className=\"ft hm\">"));
  const order = [...body.matchAll(/<(Why|How|Regulated|Fees|Faq|Closing)\s*\/>/g)].map((m) => m[1]);
  assert.deepEqual(order, ["Why", "How", "Regulated", "Fees", "Faq", "Closing"]);
});

test("the FAQ's tax figures read the rate file rather than restating it", () => {
  const all = COPY.faq.items.map((i) => i.a).join("\n");
  assert.ok(all.includes(pct(RATES.tcsPct, 0)), "TCS rate");
  assert.ok(all.includes(pct(RATES.ltcgPct, 1)), "long-term gains rate");
  assert.ok(all.includes(`${RATES.ltcgThresholdMonths} months`), "holding period");
  assert.ok(all.includes(pct(RATES.dividendWithholdingPct, 0)), "dividend withholding");
  assert.ok(all.includes(`$${RATES.brokerageMinUsd} minimum`), "brokerage minimum");
});

test("six questions, each with a real answer", () => {
  assert.equal(COPY.faq.items.length, 6);
  for (const item of COPY.faq.items) {
    assert.ok(item.q.endsWith("?"), item.q);
    assert.ok(item.a.length > 60, item.q);
  }
});

test("three steps, five reasons, five regulatory facts", () => {
  assert.equal(COPY.how.steps.length, 3);
  assert.equal(COPY.why.reasons.length, 5);
  assert.equal(COPY.regulated.cells.length, 5);
});

test("the panel among the reasons carries the allowance, not a quote list", () => {
  const p = COPY.why.panel;
  assert.match(p.value, /^\$[\d,]+$/, "one figure, formatted");
  assert.match(p.note, /Liberalised Remittance Scheme/);
  /* Prices belong on the tape and in the terminal. A quote list here made the
     section read as a ticker with prose around it. */
  assert.ok(!("symbols" in p), "the panel must not list tickers");
});

test("the home page states one LRS allowance, not two", () => {
  /* The figure is the Reserve Bank's, not one of our rates, so it is typed
     rather than read from the rate file — which makes it exactly the kind of
     number that drifts. The page says it twice; both must agree. */
  const legal = COPY.faq.items[0].a;
  assert.ok(legal.includes(COPY.why.panel.value), `the first answer must state ${COPY.why.panel.value}`);
});

test("no line claims a number the product cannot support", () => {
  const banned = [/fraction/i, /₹/, /\d[\d,]*\+? ?(stocks|etfs|companies|investors|users|customers)\b/i, /\breturns?\b[^.]*%/i, /guarantee/i];
  /* The panel's symbols are tickers, not a claim about how many names we
     carry, so they are exempt from the count check above by being uppercase
     symbols rather than prose. */
  for (const s of everyString(COPY)) {
    for (const re of banned) assert.ok(!re.test(s), `"${s}" matches ${re}`);
  }
});

test("the primary action reads Start investing everywhere it appears", () => {
  assert.equal(COPY.cta.primary, "Start investing");
  assert.equal(COPY.closing.primary, "Start investing");
});

test("the headline carries one gold clause, the way the products page sets its own", () => {
  assert.ok(COPY.hero.h1.lead.length > 0);
  assert.ok(COPY.hero.h1.clause.endsWith("."));
});

test("the hero states what the account holds and who regulates it, and stops there", () => {
  /* Two facts. The hero used to carry a third about guidance; it is a promise
     about service rather than a fact about the account, and the strip is the
     wrong place to make it. Both survivors are checkable claims. */
  assert.equal(COPY.hero.facts.length, 2);
  const terms = COPY.hero.facts.map((f) => f.term).join(" ");
  assert.match(terms, /ETFs/);
  assert.match(terms, /IFSCA/);
  for (const f of COPY.hero.facts) assert.ok(f.desc.length > 15, f.term);
});

test("the cost is three figures: the trade, the account, the data", () => {
  const f = COPY.fees;
  assert.equal(f.figures.length, 3);
  const [trade, account, data] = f.figures;
  assert.equal(trade.value, pct(RATES.brokeragePct));
  assert.match(trade.note, new RegExp(`\\$${RATES.brokerageMinUsd}`));
  assert.equal(account.value, "$0");
  assert.equal(data.value, "Free");
  assert.match(data.label, /terminal/i);
  for (const fig of f.figures) assert.ok(fig.label.length > 8, fig.value);
});

test("the statutory charges are named as passed through and routed to /pricing, never enumerated here", () => {
  const f = COPY.fees;
  assert.match(f.passthrough, /at cost/);
  assert.match(f.passthrough, /published in full/);
  assert.match(f.link, /schedule/i);
  for (const re of [/IGST/, /IFSCA/, /\bSEC\b/, /FINRA/]) {
    assert.ok(!re.test(JSON.stringify(f)), `${re} belongs on the pricing page, not the home page's cost section`);
  }
});

test("the page keeps a route into the article library, as the page before it did", () => {
  const r = COPY.how.reads;
  assert.equal(r.links.length, 3);
  assert.equal(r.all.href, "/articles");
  for (const l of r.links) assert.match(l.href, /^\/articles\/[a-z-]+$/, l.label);
});
