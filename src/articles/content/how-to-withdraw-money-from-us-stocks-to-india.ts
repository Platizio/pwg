const content = `
<p>This is the question that most often stops a first deposit, and it deserves answering before the money goes out rather than after. Money invested in US stocks is not locked away. The path back is defined, and the constraint that matters is a bank-account rule rather than a regulatory barrier.</p>

<h2>The sequence</h2>
<ol>
<li><strong>Sell the securities.</strong> Your holding converts to USD cash in the brokerage account.</li>
<li><strong>Wait for settlement.</strong> US equities settle on a <strong>T+1</strong> basis — one business day after the trade. Cash is not withdrawable before it settles.</li>
<li><strong>Place a withdrawal request</strong> from the platform, specifying the amount and your bank details.</li>
<li><strong>Funds are remitted to your Indian bank account</strong>, converted to rupees on the way in.</li>
</ol>
<p>Withdrawals typically reach the bank within a few business days once processed, though international transfers pass through correspondent banks and weekends or public holidays in either country extend that.</p>

<h2>The one rule that catches people</h2>
<p><strong>The receiving bank account must be in your own name.</strong></p>
<p>Funds remitted abroad under the LRS must return to the remitter. You cannot withdraw to a spouse's account, a parent's account, a joint account where you are not the primary holder, or a business account.</p>
<p>This follows from how the LRS works: the remittance was made under your individual limit, so the repatriation belongs to you. It is worth knowing before you need the money quickly.</p>

<h2>How long does it actually take?</h2>
<table>
<thead>
<tr><th>Stage</th><th>Typical duration</th></tr>
</thead>
<tbody>
<tr><td>Sale executes</td><td>Within the trading session</td></tr>
<tr><td>Settlement (T+1)</td><td>One business day</td></tr>
<tr><td>Withdrawal processing</td><td>Broker's processing time</td></tr>
<tr><td>International transfer</td><td>Typically a few business days</td></tr>
</tbody>
</table>
<p>Plan on the better part of a week end to end, and longer if it straddles a weekend or a holiday in either country. US and Indian public holidays do not coincide.</p>
<p>If funds have not arrived after about three business days from the broker's processing, check with your bank first — banks sometimes hold incoming international transfers pending confirmation. If your bank cannot trace them, contact support.</p>

<h2>What it costs</h2>
<ul>
<li><strong>Forex conversion on the way back.</strong> USD converts to INR, and the receiving bank applies its own spread. The same markup issue that applies on the way out applies on the way in, and it is equally unquoted.</li>
<li><strong>Intermediary bank charges.</strong> Correspondent banks in the chain may deduct fees.</li>
<li><strong>Brokerage on the sale itself.</strong> See <a href="/pricing">Pricing</a>.</li>
</ul>
<p>Note that <strong>TCS does not apply to money coming back</strong>. TCS is collected on outward remittance under the LRS. Repatriation is not a remittance abroad and does not attract it.</p>

<h2>The tax consequences</h2>
<p>This is where the sequencing matters, because two separate things happen and only one of them is triggered by the withdrawal.</p>
<p><strong>The sale is the taxable event, not the withdrawal.</strong> Capital gains arise when you sell the security, whether or not you bring the money home. An investor who sells and leaves the cash in the brokerage account has the same tax liability as one who repatriates immediately.</p>
<p>The treatment:</p>
<ul>
<li><strong>Held more than 24 months</strong> — long-term capital gains at 12.5% without indexation, plus surcharge and cess.</li>
<li><strong>Held 24 months or less</strong> — short-term, taxed at your slab rate.</li>
<li>Both legs convert to rupees at the prescribed SBI TT buying rate on the last day of the month preceding each transaction.</li>
<li>The ₹1.25 lakh LTCG exemption does not apply to foreign shares.</li>
</ul>
<p>See <a href="/articles/tax-on-us-stocks-in-india">Tax on US Stocks in India</a>.</p>

<h3>Two points about timing</h3>
<p><strong>The 24-month boundary is worth checking before selling.</strong> The difference between short-term at slab rate and long-term at 12.5% can be substantial, and a holding a few weeks short of 24 months is a case for waiting if nothing else is driving the decision.</p>
<p><strong>Selling does not end your Schedule FA obligation for that year.</strong> If you held the asset at any point during the reporting period, it is disclosable. See <a href="/articles/schedule-fa-foreign-assets-reporting">Schedule FA</a>.</p>

<h2>Partial withdrawals</h2>
<p>You do not have to exit everything. Selling part of a holding and withdrawing part of the proceeds is entirely normal, and leaves the rest invested.</p>
<p>Because each sale is a separate taxable event with its own holding-period test, partial exits give some control over which tax year gains fall into — though this should not drive investment decisions on its own.</p>

<h2>What about fractional shares?</h2>
<p>Fractions can be sold and the proceeds withdrawn like any other holding. The limitation is on <em>transferring</em> fractions to another broker, not on selling them. See <a href="/articles/fractional-shares-explained">Fractional Shares Explained</a>.</p>

<h2>Common mistakes</h2>
<ul>
<li>Expecting to withdraw to someone else's account.</li>
<li>Assuming cash is available the instant a sale executes, rather than after T+1 settlement.</li>
<li>Believing tax is triggered by repatriation rather than by the sale.</li>
<li>Selling just short of the 24-month boundary without checking.</li>
<li>Comparing exit costs on the wire fee alone and ignoring the inbound conversion spread.</li>
<li>Assuming TCS applies to incoming funds. It does not.</li>
</ul>

<h2>Conclusion</h2>
<p>Sell, wait for T+1 settlement, request withdrawal, receive funds in your own Indian bank account within a few business days. There is no lock-in and no approval to seek.</p>
<p>The two things worth internalising: the receiving account must be yours, and the tax event is the sale rather than the repatriation. Knowing the exit path in advance is what makes the entry decision easier.</p>

<p><strong>Disclaimer:</strong> This article is for educational purposes only and is not investment or tax advice. Processing times, charges and bank requirements vary and are outside our control. Tax rates and rules are stated as of August 2026 and can change. Please consult a qualified CA regarding your own position, and read our <a href="/disclaimer">Risk Disclosure and Disclaimer</a>.</p>
`
export default content
