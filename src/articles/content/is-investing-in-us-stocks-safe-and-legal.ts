const content = `
<p>Two questions sit behind most hesitation about investing abroad, and they are different questions. <em>Is it legal?</em> is about Indian regulation. <em>Is it safe?</em> is about what happens to your shares if an intermediary fails. Both have clear answers.</p>

<h2>Is it legal? Yes, and here is the specific basis</h2>
<p>The Reserve Bank of India's <strong>Liberalised Remittance Scheme</strong> permits resident individuals to remit up to <strong>USD 250,000 per financial year</strong> for a defined list of permitted purposes. Investment in overseas equity is one of them.</p>
<p>This is not a grey area or a loophole. It is an explicit scheme with a stated limit, a prescribed remittance process through authorised dealer banks, and a reporting framework in the Indian tax return.</p>
<p>Two obligations come with it, and meeting them is what keeps the investment fully compliant:</p>
<ul>
<li><strong>TCS</strong> is collected by your bank on remittances above ₹10 lakh cumulative per PAN in a financial year. See <a href="/articles/tcs-on-lrs-explained">TCS on LRS Remittances</a>.</li>
<li><strong>Schedule FA disclosure</strong> of the foreign holdings in your annual return, whether or not you made a gain. See <a href="/articles/schedule-fa-foreign-assets-reporting">Schedule FA</a>.</li>
</ul>
<p>An investor who remits within the limit and discloses correctly is doing something entirely ordinary and entirely legal.</p>

<h2>Who regulates the account</h2>
<p>Accounts opened through Platizio Global are held with <strong>ViewTrade IFSC</strong>, regulated by the <strong>International Financial Services Centres Authority</strong> in GIFT City.</p>
<p>IFSCA is a unified regulator established by statute to oversee financial services in India's international financial services centre. Being IFSCA-regulated means the entity operates under a defined supervisory framework rather than outside one.</p>
<p>It is worth being precise about what this is: an <strong>IFSC-regulated account, not a standard US brokerage account</strong>. The distinction matters for how custody works, which is the next question.</p>

<h2>Where your shares actually sit</h2>
<p>This is the part that deserves a direct answer rather than reassurance.</p>
<p>Securities are custodised in the name of <strong>ViewTrade IFSC with DTCC</strong> — the Depository Trust and Clearing Corporation, the central securities depository for the US market — <strong>for the benefit of customers</strong>.</p>
<p>So the shares are held in ViewTrade IFSC's name, not in yours individually. This surprises investors used to Indian demat accounts, where holdings sit in the individual's own name. It is the standard structure for client assets under US regulations, and the key point is that <strong>the ownership and benefit of the account belong to you as the end client</strong>. The custodian holds them on your behalf; it does not own them.</p>

<h2>What happens if the broker fails</h2>
<p>US brokerage accounts are covered by the <strong>Securities Investor Protection Corporation (SIPC)</strong>, up to <strong>USD 500,000 in total, including up to USD 250,000 for cash</strong>.</p>
<p>Being precise about what that does and does not cover matters more than the headline number:</p>
<table>
<thead>
<tr><th>SIPC covers</th><th>SIPC does not cover</th></tr>
</thead>
<tbody>
<tr><td>Failure of the brokerage firm</td><td>A fall in the market value of your investments</td></tr>
<tr><td>Missing securities or cash in a failed firm's accounts</td><td>Bad investment decisions</td></tr>
<tr><td>Return of your assets, up to the limits</td><td>Currency movements against you</td></tr>
</tbody>
</table>
<p>SIPC is insolvency protection, not investment protection. If you buy a share and it falls 40%, that is your loss and no scheme covers it. That is true of every market, including India's.</p>

<h2>The risks that are real</h2>
<p>Having established that the legal and custodial position is sound, it is worth being straightforward about the risks that genuinely apply. None of them is a reason not to invest; all of them are reasons to invest deliberately.</p>
<ul>
<li><strong>Market risk.</strong> US shares can and do fall. Nothing about the structure changes that.</li>
<li><strong>Currency risk.</strong> Your return combines the asset's performance with rupee–dollar movement, and the two can pull in opposite directions. See <a href="/articles/currency-risk-explained">Currency Risk Explained</a>.</li>
<li><strong>Concentration risk.</strong> The US market is heavily weighted towards a small number of very large technology companies. Broad-index exposure is less diversified than the number of holdings suggests.</li>
<li><strong>Tax complexity.</strong> More forms and more schedules than a purely domestic portfolio. Manageable, but not automatic. See <a href="/articles/tax-on-us-stocks-in-india">Tax on US Stocks in India</a>.</li>
<li><strong>US estate tax.</strong> Above a USD 60,000 threshold, US-situs assets can attract estate tax at rates up to 40%, and India has no treaty relief on this. Relevant to larger portfolios. See <a href="/articles/us-estate-tax-indian-investors">US Estate Tax for Indian Investors</a>.</li>
</ul>

<h2>Questions worth asking any provider</h2>
<p>Whoever you invest through, these are the questions that separate a clear answer from a vague one:</p>
<ul>
<li>Who regulates the entity holding my account, and under what licence?</li>
<li>In whose name are the securities custodised, and with which depository?</li>
<li>What protection applies if the broker fails, and what does it exclude?</li>
<li>What is the full cost of a remittance, including forex markup?</li>
<li>What happens if I want to move my holdings elsewhere, or exit entirely?</li>
</ul>
<p>Platizio Global's answers to these are on the <a href="/faqs">FAQ page</a>.</p>

<h2>Conclusion</h2>
<p>Investing in US stocks from India is legal under an explicit RBI scheme, the account sits with an IFSCA-regulated entity, the securities are custodised with DTCC for the benefit of customers, and brokerage failure is covered by SIPC within stated limits.</p>
<p>What is not covered — and never is, anywhere — is the market moving against you. The sensible posture is to treat the structural questions as settled and spend your attention on the investment decisions instead.</p>

<p><strong>Disclaimer:</strong> This article is for educational purposes only and is not investment, tax, or legal advice. Regulatory and protection details are stated as of August 2026 and can change. SIPC coverage limits apply per customer as defined by SIPC rules. Please read our <a href="/disclaimer">Risk Disclosure and Disclaimer</a> and consult a qualified professional before investing.</p>
`
export default content
