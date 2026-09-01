const content = `
<p>These three terms overlap enough to cause genuine confusion, partly because they answer two different questions at once. One question is <em>how the fund decides what to hold</em>. The other is <em>how you buy and sell it</em>.</p>
<p>Separating those two axes makes the whole thing clear.</p>

<h2>The two questions</h2>

<h3>Question 1: How does the fund choose its holdings?</h3>
<ul>
<li><strong>Passive</strong> — it tracks an index, holding what the index holds in the proportions the index specifies. No judgement is exercised about which companies to own.</li>
<li><strong>Active</strong> — a manager selects holdings with the objective of doing better than a benchmark.</li>
</ul>

<h3>Question 2: How do you transact in it?</h3>
<ul>
<li><strong>Exchange-traded</strong> — it trades on an exchange throughout the session, at a market price that moves continuously, like a share.</li>
<li><strong>Fund-house dealt</strong> — you buy and sell directly with the fund at the end-of-day net asset value.</li>
</ul>
<p>The confusion arises because "index fund" answers question 1 and "ETF" answers question 2. They are not alternatives. <strong>An ETF can be passive or active, and an index fund can be exchange-traded or not.</strong></p>

<h2>Where the common terms land</h2>
<table>
<thead>
<tr><th></th><th>Exchange-traded</th><th>Dealt with the fund house</th></tr>
</thead>
<tbody>
<tr><td><strong>Passive (tracks an index)</strong></td><td>Index ETF — the most common US structure</td><td>Index fund — the common Indian structure</td></tr>
<tr><td><strong>Active (manager selects)</strong></td><td>Active ETF — a growing category</td><td>Active mutual fund — the traditional structure</td></tr>
</tbody>
</table>
<p>In Indian usage, "mutual fund" usually implies the right-hand column and "ETF" the left. In US usage, "index fund" and "ETF" are often used interchangeably because most US index products happen to be exchange-traded. The vocabulary is regional, which is part of why this trips people up.</p>

<h2>What the differences mean in practice</h2>

<h3>Pricing and execution</h3>
<p>An ETF's price moves through the session and you can specify a limit price. A fund-house-dealt fund transacts at that day's NAV, whenever in the day you placed the order.</p>
<p>For a long-term investor this matters far less than it sounds. Intraday pricing is useful for control over the entry price; it is not an advantage for someone buying monthly and holding for a decade.</p>

<h3>Cost</h3>
<p>Passive products of either structure are generally cheaper than active ones, because index tracking requires no research team.</p>
<p>ETFs add a cost that funds do not have: the <strong>bid-ask spread</strong>, paid on entry and again on exit. It does not appear in the expense ratio. For a widely traded ETF the spread is negligible; for a thinly traded one it can outweigh a lower expense ratio.</p>

<h3>Minimum investment</h3>
<p>Fund-house-dealt funds often accept small fixed amounts and support automated monthly investing natively. ETFs traditionally required whole units — though <strong>fractional trading removes that constraint</strong> for US-listed ETFs, letting you invest a fixed amount rather than a whole number of units. See <a href="/articles/fractional-shares-explained">Fractional Shares Explained</a>.</p>

<h2>The part that matters most for an Indian investor: tax</h2>
<p>Here the structure question is secondary to a different one — <strong>where the fund is domiciled and how you hold it.</strong></p>
<table>
<thead>
<tr><th></th><th>US-listed ETF, held directly</th><th>Indian mutual fund with overseas exposure</th></tr>
</thead>
<tbody>
<tr><td>What you own</td><td>Units of the US fund, in your account</td><td>Units of an Indian scheme</td></tr>
<tr><td>Currency</td><td>USD</td><td>INR</td></tr>
<tr><td>Uses LRS limit</td><td>Yes</td><td>No</td></tr>
<tr><td>TCS on funding</td><td>Yes, above ₹10 lakh</td><td>No</td></tr>
<tr><td>Schedule FA disclosure</td><td>Yes, every year held</td><td>No</td></tr>
<tr><td>LTCG treatment</td><td>More than 24 months, at 12.5%</td><td>Depends on the scheme's category</td></tr>
<tr><td>Dividend</td><td>25% US withholding, then Indian slab with credit</td><td>Handled within the scheme</td></tr>
<tr><td>US estate tax situs</td><td>US-situs above USD 60,000</td><td>Not US-situs</td></tr>
</tbody>
</table>
<p>Not every Indian fund labelled "international" or "global" falls into the same tax category, and the treatment can differ materially between them. See <a href="/articles/feeder-vs-combo-funds">International Mutual Funds: Feeder vs Combo</a> and <a href="/articles/tax-on-us-stocks-in-india">Tax on US Stocks in India</a>.</p>

<h2>Choosing between them</h2>
<p>The useful order of questions is:</p>
<ol>
<li><strong>What exposure do I want?</strong> Broad US market, a sector, international beyond the US.</li>
<li><strong>Passive or active?</strong> Do I want index tracking, or a manager's selection and the fee that comes with it?</li>
<li><strong>Direct or through an Indian scheme?</strong> This decides currency, LRS usage, disclosure obligations and tax treatment — the consequences with the longest tail.</li>
<li><strong>Then compare specific products</strong> on expense ratio, size, liquidity and tracking difference. See <a href="/articles/best-us-etfs-for-indian-investors">How to Evaluate US ETFs</a>.</li>
</ol>
<p>Most investors reverse this order, starting from a specific product and working backwards. Deciding the route first makes the product choice much simpler.</p>

<h2>Conclusion</h2>
<p>"Index fund" describes how a fund picks holdings. "ETF" describes how you trade it. They are answers to different questions, and a product can be both.</p>
<p>For an Indian investor, the structural label matters less than the route: a directly held US-listed ETF and an Indian international fund can track the same index and still differ in currency, reporting obligations and tax treatment. Choose the route deliberately, then choose the product.</p>

<p><strong>Disclaimer:</strong> This article is for educational purposes only and is not investment or tax advice. It does not recommend any fund, ETF or structure. Tax treatment depends on the specific product, scheme category and your own circumstances, and rates stated are as of August 2026. Please consult a qualified financial and tax adviser, and read our <a href="/disclaimer">Risk Disclosure and Disclaimer</a>.</p>
`
export default content
