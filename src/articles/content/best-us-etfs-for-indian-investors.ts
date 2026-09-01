const content = `
<p>This article does not name funds to buy. Recommending specific securities to a general audience is neither useful nor appropriate — the right holding depends on circumstances this page knows nothing about.</p>
<p>What it does instead is set out the criteria that actually distinguish one ETF from another, including one that matters specifically to Indian investors and appears in no fund factsheet.</p>

<h2>First: what kind of exposure?</h2>
<p>Before comparing funds, decide what the fund is for. ETFs fall into broad categories, and the choice between categories matters far more than the choice between two funds within one.</p>
<table>
<thead>
<tr><th>Category</th><th>What it does</th><th>Consideration</th></tr>
</thead>
<tbody>
<tr><td><strong>Broad market</strong></td><td>Tracks a wide index such as the S&amp;P 500 or a total-market index</td><td>The usual starting point. Widest diversification within US equity</td></tr>
<tr><td><strong>Sector</strong></td><td>Technology, healthcare, energy, financials</td><td>Deliberately concentrated. A view, not a default</td></tr>
<tr><td><strong>Thematic</strong></td><td>Clean energy, robotics, semiconductors</td><td>Narrowest and most volatile. Themes can stay out of favour for years</td></tr>
<tr><td><strong>International</strong></td><td>US-listed funds holding non-US companies</td><td>Reaches Europe, Japan and emerging markets from a US account</td></tr>
<tr><td><strong>Bond</strong></td><td>US government or corporate debt</td><td>Different risk and return profile from equity</td></tr>
</tbody>
</table>
<p>A common sequencing error is starting with a thematic fund because the theme is compelling, and only later adding broad exposure. The concentration in a thematic fund is a considered position, not a foundation.</p>

<h2>The standard comparison criteria</h2>

<h3>Expense ratio</h3>
<p>The annual percentage the fund charges. It compounds, so a difference that looks trivial is not over long horizons. Broad-market index ETFs are generally the cheapest; sector and thematic funds charge more.</p>

<h3>Assets under management</h3>
<p>Larger funds are generally more liquid and less likely to be closed or merged. A very small fund carries a real risk of closure, which forces a taxable disposal at a time you did not choose.</p>

<h3>Liquidity and spread</h3>
<p>Look at average daily volume and the typical bid-ask spread. A wide spread is a cost you pay on entry and again on exit, and it does not appear in the expense ratio. For an Indian investor trading during IST night hours, this matters more in the extended sessions where spreads widen further. See <a href="/articles/us-stock-market-timings-india">US Stock Market Timings in India</a>.</p>

<h3>Tracking difference</h3>
<p>How closely the fund has actually followed its index after costs. Tracking difference — the realised gap — is more informative than tracking error, which measures the variability of that gap. A fund that consistently lags its index by a predictable amount is doing its job less well than the headline expense ratio suggests.</p>

<h3>Index methodology</h3>
<p>Two funds with similar names can track quite different indices. Check what the index actually holds, how it weights, and how often it rebalances. A cap-weighted index concentrates in its largest members; an equal-weighted version of the same universe behaves differently. See <a href="/articles/nyse-nasdaq-and-us-indices-explained">NYSE, NASDAQ and the US Indices Explained</a>.</p>

<h2>The criterion specific to Indian investors</h2>
<p>Here is the one that appears in no factsheet: <strong>dividend withholding tax reduces your effective return, and it is invisible in the expense ratio.</strong></p>
<p>A US-domiciled ETF distributing dividends has 25% withheld at source for an Indian resident with Form W-8BEN on file. You can claim foreign tax credit in India, but that credit is capped at the Indian tax attributable to the same income. An investor in a lower slab may not recover all of it.</p>
<p>Two consequences follow:</p>
<ul>
<li>Comparing a high-yielding ETF with a low-yielding one on expense ratio alone understates the difference in what you actually keep.</li>
<li>Dividend-focused US strategies are less efficient for lower-slab Indian taxpayers than the headline yield suggests.</li>
</ul>
<p>See <a href="/articles/dividend-tax-us-stocks-india">Dividend Tax on US Stocks</a>.</p>

<h2>The other consideration nobody mentions: situs</h2>
<p>US-domiciled ETFs are <strong>US-situs assets</strong>. Above a USD 60,000 threshold they fall within the scope of US estate tax for non-resident aliens, at rates up to 40%, and India has no estate tax treaty providing relief.</p>
<p>For a portfolio well below that level this is not a live issue. For a growing portfolio it becomes one, and fund domicile is one of the levers available. See <a href="/articles/us-estate-tax-indian-investors">US Estate Tax for Indian Investors</a>.</p>

<h2>A practical checklist</h2>
<ul>
<li>What exposure am I actually buying — broad, sector, thematic, international?</li>
<li>What index does it track, and how is that index weighted?</li>
<li>What is the expense ratio, and how does it compare with peers tracking the same index?</li>
<li>Is the fund large and liquid enough that closure and spread are not concerns?</li>
<li>What is the realised tracking difference over several years?</li>
<li>What does it distribute, and what does withholding do to my net return at my slab?</li>
<li>Does this fit what I already hold, including any RSUs or employer stock?</li>
</ul>

<h2>Common mistakes</h2>
<ul>
<li>Choosing on past performance, which is the least predictive of the criteria above.</li>
<li>Comparing expense ratios across funds tracking different indices, as though they were interchangeable.</li>
<li>Buying several thematic funds and assuming the result is diversified.</li>
<li>Ignoring dividend withholding when comparing yields.</li>
<li>Overlapping heavily — a broad-market fund and a large-cap technology fund share many of the same holdings.</li>
</ul>

<h2>Conclusion</h2>
<p>Choosing an ETF is mostly a matter of deciding what exposure you want and then checking a handful of structural facts. Expense ratio, size, liquidity and tracking difference are the standard four. For an Indian investor, dividend withholding and fund domicile deserve equal billing, and neither is on the factsheet.</p>
<p>See also <a href="/articles/etf-vs-index-fund-vs-mutual-fund">ETF vs Index Fund vs Mutual Fund</a> and <a href="/products">what Platizio Global offers</a>.</p>

<p><strong>Disclaimer:</strong> This article is for educational purposes only and is not investment, tax or financial advice. It does not recommend any specific ETF, fund, index or security, and no performance claims are made or implied. All investments carry risk, including loss of capital. Tax positions are stated as of August 2026 and can change. Please consult a qualified financial and tax adviser, and read our <a href="/disclaimer">Risk Disclosure and Disclaimer</a>.</p>
`
export default content
