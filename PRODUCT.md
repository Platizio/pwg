# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

**Primary: an Indian retail investor who has not yet bought a US stock.**
Confirmed by the user, 25 August 2026. They are curious but unsure the thing is
even legal or practical from India — whether a resident may hold Netflix or
Nvidia at all, what the money has to pass through to get there, and what it
costs. They arrive anxious about permission and process, not shopping for a
better instrument. Leading with a dense professional terminal reads to them as
"not for me".

Secondary, and explicitly not the one to design for: an investor who already
holds US stock and is comparing tools.

## Product Purpose

Let people resident in India buy and hold US-listed stocks and ETFs, and give
them a market terminal that helps them decide what to buy rather than guess.
Success on the marketing site is an opened account; success on the product is
someone who can act on a decision they understand.

## Positioning

Two things held together that the category usually separates: a **low, fully
published cost schedule** and a **real market terminal**. Indian platforms
offering US stocks tend to ship a thin buy/sell app; terminals that show
events, filings, analyst coverage and news are priced for professionals. The
claim is that the pricing buys more than a place to place an order.

Every rate is published before the trade, not disclosed after it.

## Operating Context

- Money reaches the US through the **Liberalised Remittance Scheme (LRS)**.
  TCS applies at 20% on cumulative LRS remittances above Rs 10,00,000 per PAN
  per financial year, and is credited against tax liability — it is not a cost.
- US market hours, so quotes are frequently outside session for an Indian
  reader; quote delay must be stated wherever a price appears.
- US holdings are foreign assets for Indian tax: slab rate before 24 months,
  12.5% after, no Rs 1.25 lakh exemption, Schedule FA disclosure annually.
- The reader is reading in INR terms but the product transacts in USD.

## Capabilities and Constraints

**Live market data.** A ViewTrade proxy (`api/quotes.ts`) serves quotes for any
requested US symbol. It returns **symbol, company name, last price, change,
change percent, currency, delayed flag and update time — and nothing else.**
Fundamentals, corporate events, newswire and analyst coverage exist only in the
separate screener application, not in this proxy.

**No index membership.** No constituent endpoint is entitled on this account,
so the S&P 500's actual membership cannot be known. Rankings run over a sample
of the largest 500 US companies by market value and must say so; claiming index
membership is prohibited.

**No FX rate.** Nothing in this codebase carries a USD/INR rate. Any figure
shown "in rupees" would be invented. Costs are computed and shown in USD, or
from a rate the reader supplies.

**Published rates** live once, in `pricingRates.ts`, and every surface reads
from there. Brokerage 0.29% (minimum $1), IGST 18% on brokerage, IFSCA and SEC
per-dollar fees, FINRA per-share on sells. Account opening, KYC, price tracking
and TradingView charting are $0. Rates as published 17 August 2026.

**Never restate a rate.** A second copy drifts.

**Prerendered.** 62 static pages via `scripts/prerender.mjs`. Any data hook must
return null identically on server and first client render; fetch in effect only;
no `Intl`, `new Date()` or `window` at render scope.

**Credentials.** Live keys live outside the repo and are read from environment
variables only. No key may appear in any source file, doc, commit or fixture.

**The screener** is a separate Next.js application in `screener/`, currently
localhost-only, with its own git repository and no remote. Deployment target is
Render, deferred until the interface work is settled.

## Brand Commitments

Existing identity, binding: the name Platizio Global; the site's own light
theme — white ground, navy ink, burnt orange accent; Bricolage Grotesque for
display, Inter for prose, IBM Plex Mono for figures.

User-stated and binding: **the marketing site keeps its white background**, and
**the terminal keeps its own separate dark treatment** — the marketing world is
not to be applied to it.

## Evidence on Hand

- Live quotes for any US-listed symbol, through the site's own proxy.
- A working market terminal (`screener/`) showing an index register, an events
  calendar, a newswire and analyst boards — real, running, screenshot-able.
- The full published rate schedule, and working cost calculators built on it.
- ~60 written guides and articles on LRS, TCS, taxation and allocation.
- Real captures of the terminal in `public/` (`terminal-hero`, `shot-*`).

Absent, and not to be fabricated: customer names, testimonials, assets under
management, user counts, returns, performance claims, or a USD/INR rate.

## Product Principles

1. **Answer permission before capability.** The first-timer's question is "am I
   allowed to, and what does it cost me" — not "how deep is your data".
2. **Show, using their own subject.** Proof means live data about a company the
   reader already knows, not a screenshot of an interface they don't.
3. **Every price carries its provenance.** Delay, timestamp and universe are
   stated wherever a figure appears.
4. **Publish the cost before the trade.** The whole schedule, in advance, is
   the position — so no surface may soften or omit a rate.
5. **Never claim what the data cannot support.** No index membership, no
   invented FX, no performance.

## Accessibility & Inclusion

WCAG AA contrast is treated as a build constraint and measured, not estimated.
Motion is decorative throughout and must be removable under
`prefers-reduced-motion`. The reader is frequently on a narrow phone.
