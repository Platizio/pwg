const content = `
<p>"What is the minimum I need to start?" has a misleading answer if you take it literally. Fractional shares mean there is no meaningful minimum imposed by share prices, and there are no account opening or maintenance charges.</p>
<p>The real floor is set by something else: the cost of getting money from India to a US brokerage account. Those costs are largely <strong>fixed per transfer</strong> rather than proportional to the amount, so they weigh heavily on small remittances and barely register on large ones.</p>

<h2>The costs, separated properly</h2>
<p>Some of what gets called "cost" is not cost at all. Separating the three categories makes the arithmetic clear.</p>
<table>
<thead>
<tr><th>Item</th><th>Scales with?</th><th>Genuinely a cost?</th></tr>
</thead>
<tbody>
<tr><td>Account opening / maintenance</td><td>—</td><td><strong>No charge at all</strong></td></tr>
<tr><td>Bank wire / SWIFT fee</td><td>Fixed per transfer</td><td>Yes</td></tr>
<tr><td>Forex markup</td><td>Proportional to amount</td><td>Yes — and rarely quoted</td></tr>
<tr><td>Brokerage on trades</td><td>Per trade</td><td>Yes — see <a href="/pricing">Pricing</a></td></tr>
<tr><td>TCS at 20% above ₹10 lakh</td><td>Proportional</td><td><strong>No — recoverable</strong></td></tr>
</tbody>
</table>

<h3>Forex markup is the one to watch</h3>
<p>This is the spread between the interbank rate and the rate your bank actually gives you. It is embedded in the exchange rate rather than shown as a line item, which is exactly why it goes unnoticed.</p>
<p>It is worth asking your bank what rate they will apply and comparing it to the prevailing market rate on the day. The difference is the real price of the conversion, and it varies more between banks than most people expect.</p>

<h3>TCS is not a cost</h3>
<p>TCS of 20% applies to the portion of your cumulative annual LRS remittances above ₹10 lakh per PAN. It is a prepayment of your own income tax: creditable against your liability and refundable if it exceeds it.</p>
<p>What it does cost you is the use of the money until you get it back — a cash-flow effect, not a charge. See <a href="/articles/tcs-on-lrs-explained">TCS on LRS Remittances</a>.</p>

<h2>Why transfer size matters more than trade size</h2>
<p>Because the wire fee is fixed, its impact as a percentage falls sharply as the transfer grows. Using an illustrative fixed fee to show the shape of the effect:</p>
<table>
<thead>
<tr><th>Amount remitted</th><th>Fixed fee as a % of the transfer</th></tr>
</thead>
<tbody>
<tr><td>₹10,000</td><td>Very high — a meaningful share of the amount</td></tr>
<tr><td>₹1,00,000</td><td>Roughly a tenth of the above, proportionally</td></tr>
<tr><td>₹5,00,000</td><td>Close to negligible</td></tr>
</tbody>
</table>
<p>The actual fee depends on your bank, so the point here is the shape of the curve rather than any specific figure. The conclusion holds regardless: <strong>fewer, larger remittances are more efficient than frequent small ones.</strong></p>

<h2>What this means for monthly investing</h2>
<p>Indian investors are accustomed to monthly SIPs, and the instinct is to replicate that with monthly remittances. That instinct is expensive.</p>
<p>A more efficient pattern is to <strong>accumulate in rupees and remit periodically</strong> — quarterly, half-yearly, or whenever a target amount is reached — then deploy from the dollar balance as often as you like. Trading within the account does not incur remittance costs; only crossing the border does.</p>
<p>This preserves the discipline of regular investing while paying the fixed transfer cost a few times a year rather than twelve.</p>

<h2>So what is a realistic starting amount?</h2>
<p>There is no prescribed minimum, and the honest answer is a judgement rather than a number. The relevant test is whether the fixed costs of a remittance are small enough relative to the amount that they do not materially dent it.</p>
<p>Two things follow:</p>
<ul>
<li>A one-off small amount to become familiar with the process is perfectly reasonable, treating the cost as tuition.</li>
<li>For ongoing investing, the amount per remittance matters much more than the amount per trade. Fractional shares mean even a modest dollar balance can be spread across several holdings.</li>
</ul>
<p>See <a href="/articles/fractional-shares-explained">Fractional Shares Explained</a>.</p>

<h2>Costs that are not fees</h2>
<p>Two further drags are worth counting even though nobody invoices you for them.</p>
<p><strong>Dividend withholding.</strong> 25% of US dividends is withheld at source with Form W-8BEN on file, and the Indian foreign tax credit is capped at the Indian tax on that income. For lower-slab investors, part of that withholding may not be recovered. See <a href="/articles/dividend-tax-us-stocks-india">Dividend Tax on US Stocks</a>.</p>
<p><strong>Bid-ask spread.</strong> Paid on entry and again on exit, and wider in pre-market and after-hours sessions than during regular hours.</p>

<h2>Conclusion</h2>
<p>There is no account minimum and no share-price barrier. The economics are driven by the cost of moving money across the border, which is largely fixed per transfer.</p>
<p>The practical rule that falls out of this: <strong>accumulate in rupees, remit in larger tranches, then invest as frequently as you like within the account.</strong> That keeps the discipline of regular investing without paying the border cost twelve times a year.</p>
<p>See also <a href="/articles/how-to-transfer-money-for-us-stock-investing">How to Transfer Money Abroad</a> and <a href="/pricing">Pricing and Charges</a>.</p>

<p><strong>Disclaimer:</strong> This article is for educational purposes only and is not investment or tax advice. Bank charges, forex markups and applicable rates vary by institution and over time; figures used are illustrative rather than quoted. Please check current charges with your bank and refer to our <a href="/pricing">Pricing</a> page, and read our <a href="/disclaimer">Risk Disclosure and Disclaimer</a>.</p>
`
export default content
