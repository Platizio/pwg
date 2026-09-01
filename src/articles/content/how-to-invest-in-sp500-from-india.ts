const content = `
<p>The S&amp;P 500 tracks 500 of the largest US-listed companies, weighted by market capitalisation. For an Indian investor who wants broad US exposure without picking individual companies, it is usually the first index considered.</p>
<p>The complication is that the same index is reachable through several different structures, and they are <strong>not equivalent</strong>. They differ in what you own, what it costs, which currency you hold, and — most consequentially over time — how the gains are taxed.</p>

<h2>The three routes</h2>
<table>
<thead>
<tr><th></th><th>Direct US ETF</th><th>Indian feeder fund</th><th>GIFT City route</th></tr>
</thead>
<tbody>
<tr><td>What you own</td><td>Units of a US-listed ETF, in your own account</td><td>Units of an Indian mutual fund that invests overseas</td><td>Units of a fund domiciled in GIFT City</td></tr>
<tr><td>Currency held</td><td>USD</td><td>INR</td><td>Typically USD</td></tr>
<tr><td>Money leaves India?</td><td>Yes, under LRS</td><td>No</td><td>Yes, under LRS</td></tr>
<tr><td>Uses LRS limit?</td><td>Yes</td><td>No</td><td>Yes</td></tr>
<tr><td>TCS applies?</td><td>Yes, above ₹10 lakh</td><td>No</td><td>Yes, above ₹10 lakh</td></tr>
<tr><td>Schedule FA disclosure</td><td>Yes</td><td>No</td><td>Generally yes</td></tr>
<tr><td>LTCG holding period</td><td>More than 24 months</td><td>Depends on scheme category</td><td>Depends on structure</td></tr>
</tbody>
</table>
<p>This is a simplified comparison. Actual treatment depends on the specific product, the scheme's category under Indian mutual fund rules, and your own tax position.</p>

<h2>Route 1: Buying a US-listed S&amp;P 500 ETF directly</h2>
<p>You remit dollars under the LRS and buy units of a US-listed ETF that tracks the index. The units sit in your brokerage account, custodised with DTCC for the benefit of customers.</p>
<p><strong>What this gives you:</strong> direct ownership, dollar-denominated, priced continuously through the US session, with the ability to buy fractionally so the unit price is not a barrier.</p>
<p><strong>Tax treatment:</strong> gains held more than 24 months are long-term at 12.5%; 24 months or less is short-term at your slab rate. The ₹1.25 lakh LTCG exemption does not apply. Dividends are withheld at 25% in the US with W-8BEN on file, then taxed at slab in India with foreign tax credit relief. See <a href="/articles/tax-on-us-stocks-in-india">Tax on US Stocks in India</a>.</p>
<p><strong>What to be aware of:</strong> the holding is a foreign asset, so Schedule FA disclosure applies every year you hold it, regardless of gain.</p>

<h2>Route 2: An Indian feeder fund</h2>
<p>You invest rupees into an Indian mutual fund which in turn invests into an overseas fund tracking the index.</p>
<p><strong>What this gives you:</strong> simplicity. No remittance, no LRS limit consumed, no TCS, no Schedule FA, no separate brokerage account, and SIP facilities in rupees.</p>
<p><strong>Tax treatment:</strong> governed by the scheme's category under Indian mutual fund rules rather than by foreign-asset rules. Not every fund labelled "international" or "global" falls into the same category, and the treatment can differ materially between them. See <a href="/articles/feeder-vs-combo-funds">International Mutual Funds: Feeder vs Combo</a>.</p>
<p><strong>What to be aware of:</strong> you own units of an Indian fund, not the underlying ETF. There is an extra layer of costs, and at times regulatory limits on overseas investment by Indian funds have caused schemes to restrict or suspend fresh inflows.</p>

<h2>Route 3: GIFT City</h2>
<p>GIFT City hosts fund structures that invest outbound, including outbound mutual funds, PMS and AIF routes.</p>
<p><strong>What to be aware of:</strong> tax treatment depends on the specific structure and can involve pass-through treatment, investor bracket and income character. Minimum investment sizes are often considerably higher than retail. Platizio Global does not offer these products, though investors frequently compare them with direct US investing. See <a href="/articles/gift-city">GIFT City: India's Gateway to Global Investing</a>.</p>

<h2>Choosing between them</h2>
<p>There is no universally better route. The honest framing is that each optimises for something different:</p>
<ul>
<li><strong>If you want direct ownership and dollar exposure</strong>, and are comfortable with the annual reporting, the direct ETF route is the most transparent about what you actually hold.</li>
<li><strong>If you want the least administrative friction</strong>, and are content to own an Indian fund rather than the underlying, a feeder fund removes the remittance and disclosure steps entirely.</li>
<li><strong>If you are investing at a size where structure-specific tax treatment materially changes the outcome</strong>, GIFT City structures are worth a conversation with a tax advisor.</li>
</ul>
<p>The mistake worth avoiding is choosing on convenience alone and discovering the tax treatment afterwards. Over a long holding period, the tax difference between routes can outweigh the difference in expense ratios.</p>

<h2>What about the index itself?</h2>
<p>Two things are worth understanding regardless of route.</p>
<p><strong>It is market-cap weighted.</strong> The largest companies carry the largest weights, so "500 companies" is less diversified than it sounds — a meaningful share of the index sits in a small number of very large technology names.</p>
<p><strong>It is a US index.</strong> It gives you US exposure, not global exposure. Europe, Japan and emerging markets are absent. If the goal is genuinely international diversification rather than US diversification, see <a href="/articles/international-stocks-beyond-the-us">International Stocks Beyond the US</a>.</p>

<h2>Conclusion</h2>
<p>The S&amp;P 500 is reachable from India through at least three structures. They deliver similar market exposure and quite different ownership, cost and tax outcomes.</p>
<p>Decide the route before the product. It is the decision with the longest-lasting consequences, and the hardest one to reverse cheaply later.</p>
<p>See also <a href="/articles/best-us-etfs-for-indian-investors">How to Evaluate US ETFs</a> and <a href="/articles/etf-vs-index-fund-vs-mutual-fund">ETF vs Index Fund vs Mutual Fund</a>.</p>

<p><strong>Disclaimer:</strong> This article is for educational purposes only and is not investment or tax advice. It does not recommend any specific fund, ETF or index. Rates and rules are stated as of August 2026 and can change. Investors should consult a qualified financial and tax professional before choosing a route, and read our <a href="/disclaimer">Risk Disclosure and Disclaimer</a>.</p>
`
export default content
