const content = `
<p>Two categories get merged constantly in market commentary, and keeping them apart makes everything else easier to follow.</p>
<p><strong>NYSE and NASDAQ are exchanges</strong> — venues where shares change hands. <strong>The S&amp;P 500, the Dow Jones Industrial Average and the Nasdaq 100 are indices</strong> — measurements of a basket of shares. A company listed on NASDAQ may well be a member of the S&amp;P 500. The two facts are unrelated.</p>

<h2>The exchanges</h2>

<h3>NYSE</h3>
<p>The New York Stock Exchange is the older venue, tracing to the late eighteenth century. It has historically operated a hybrid model, combining electronic trading with designated market makers on a physical floor whose role is to maintain an orderly market in the shares assigned to them.</p>
<p>Its listings skew towards long-established industrial, financial, energy and consumer companies, though this is a tendency rather than a rule.</p>

<h3>NASDAQ</h3>
<p>NASDAQ opened in 1971 as the first fully electronic market and has no trading floor. Liquidity is provided by competing market makers rather than a single designated one per stock.</p>
<p>It has a heavier concentration of technology and biotechnology listings, largely a historical artefact of which companies chose to list there during periods of rapid growth in those sectors.</p>

<h3>Does the difference matter to you?</h3>
<p>For a retail investor buying a listed share, very little. Both are regulated US exchanges with deep liquidity in their major names. Your order routes to the relevant venue and executes; the mechanics behind it are largely invisible.</p>
<p>What the distinction does affect is <strong>index eligibility</strong> — and that is where it becomes relevant, as the next section shows.</p>

<h2>The indices</h2>

<h3>S&amp;P 500</h3>
<p>Tracks 500 large US companies, weighted by <strong>market capitalisation</strong>, so larger companies carry proportionally larger weights. Membership is decided by a committee against published criteria including size, liquidity and profitability, and companies are added and removed over time.</p>
<p>It is the most widely used proxy for "the US market", and it draws from both NYSE and NASDAQ listings.</p>
<p>The point worth internalising: because it is cap-weighted, <strong>500 companies is less diversified than it sounds</strong>. A meaningful share of the index sits in a small number of very large technology names, so the index's behaviour is more concentrated than the headline count implies.</p>

<h3>Nasdaq 100</h3>
<p>Tracks the 100 largest non-financial companies listed <strong>on NASDAQ</strong>. This is where exchange listing directly determines index membership.</p>
<p>Because of NASDAQ's listing profile and the exclusion of financials, it is substantially technology-weighted — more concentrated and historically more volatile than the S&amp;P 500. It is a sector-tilted index in practice, whatever its formal construction.</p>

<h3>Dow Jones Industrial Average</h3>
<p>Tracks just <strong>30</strong> companies, and weights them by <strong>share price</strong> rather than by company size.</p>
<p>That construction is a nineteenth-century artefact and it produces genuinely odd results: a company with a USD 500 share price influences the Dow more than one with a USD 50 share price, regardless of which is the larger business. A share split changes a company's weight in the index without changing anything about the company.</p>
<p>The Dow is the most quoted of the three in general news and the least useful as a measure of the US market. When a headline says "the market rose", it is usually more informative to look at the S&amp;P 500.</p>

<h2>Side by side</h2>
<table>
<thead>
<tr><th></th><th>S&amp;P 500</th><th>Nasdaq 100</th><th>Dow Jones</th></tr>
</thead>
<tbody>
<tr><td>Companies</td><td>500</td><td>100</td><td>30</td></tr>
<tr><td>Weighting</td><td>Market cap</td><td>Modified market cap</td><td><strong>Share price</strong></td></tr>
<tr><td>Exchange</td><td>NYSE and NASDAQ</td><td>NASDAQ only</td><td>NYSE and NASDAQ</td></tr>
<tr><td>Financials included</td><td>Yes</td><td>No</td><td>Yes</td></tr>
<tr><td>Best read as</td><td>Broad US large-cap</td><td>US large-cap growth/tech</td><td>A historical curiosity</td></tr>
</tbody>
</table>

<h2>Why this matters when choosing an ETF</h2>
<p>An index fund or ETF inherits every characteristic of the index it tracks — including its concentration.</p>
<p>Choosing between an S&amp;P 500 tracker and a Nasdaq 100 tracker is not a choice between two similar broad-market products. It is a choice about how much technology exposure you want and how much volatility you are willing to hold. Neither is wrong; they are different decisions.</p>
<p>See <a href="/articles/best-us-etfs-for-indian-investors">How to Evaluate US ETFs</a> and <a href="/articles/how-to-invest-in-sp500-from-india">How to Invest in the S&amp;P 500 from India</a>.</p>

<h2>A note on scope</h2>
<p>All three of these are <strong>US</strong> indices. Holding an S&amp;P 500 tracker gives you US exposure, not global exposure — Europe, Japan and emerging markets are entirely absent. If the objective is international diversification rather than US diversification, see <a href="/articles/international-stocks-beyond-the-us">International Stocks Beyond the US</a>.</p>

<h2>Conclusion</h2>
<p>Exchanges are where shares trade; indices are how baskets of them are measured. The S&amp;P 500 is the most representative of the three headline indices, the Nasdaq 100 is a technology tilt in index clothing, and the Dow's price weighting makes it the least informative despite being the most quoted.</p>
<p>Knowing which is which is what lets you read market commentary critically rather than taking "the market" at face value.</p>

<p><strong>Disclaimer:</strong> This article is for educational purposes only and is not investment advice. Index construction and methodology are set by their respective providers and can change. It does not recommend any index, ETF or security. Please read our <a href="/disclaimer">Risk Disclosure and Disclaimer</a>.</p>
`
export default content
