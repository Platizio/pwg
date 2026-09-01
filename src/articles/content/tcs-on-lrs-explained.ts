const content = `
<p><em>Updated August 2026.</em></p>
<p>TCS — Tax Collected at Source — is the deduction your bank applies when you remit money abroad under the Liberalised Remittance Scheme. It is widely misunderstood as a tax on investing abroad. It is not. It is a prepayment of your own income tax, and you get it back.</p>
<p>That distinction matters, because treated as a cost it makes global investing look considerably more expensive than it is.</p>

<h2>The current position</h2>
<table>
<thead>
<tr><th>Remittance purpose</th><th>Threshold</th><th>Rate above threshold</th></tr>
</thead>
<tbody>
<tr><td><strong>Overseas investment</strong> (US stocks, ETFs)</td><td>₹10 lakh per PAN per financial year</td><td><strong>20%</strong></td></tr>
<tr><td>Education and medical treatment</td><td>₹10 lakh per PAN per financial year</td><td>2%</td></tr>
</tbody>
</table>
<p>Two points that are frequently confused:</p>
<p><strong>The threshold rose to ₹10 lakh on 1 April 2025</strong>, up from ₹7 lakh. Older articles still quote ₹7 lakh.</p>
<p><strong>The reduced 2% rate does not apply to investment remittances.</strong> Budget 2026 lowered the rate for education and medical purposes. Investment remittances remain at 20%.</p>

<h2>How the threshold actually works</h2>
<p>Three details determine what you actually pay.</p>
<p><strong>It applies only to the excess.</strong> The first ₹10 lakh attracts no TCS at all. If you remit ₹14 lakh in a year, TCS applies at 20% on ₹4 lakh — that is ₹80,000, not 20% of ₹14 lakh.</p>
<p><strong>It is cumulative per PAN, per financial year.</strong> Not per transaction and not per bank. Four separate ₹3 lakh remittances through three different banks still total ₹12 lakh against your PAN, and the last one crosses the threshold. Banks rely on your declaration of prior remittances, so keeping your own running total is worthwhile.</p>
<p><strong>It resets each financial year</strong>, on 1 April.</p>

<h2>Worked example</h2>
<p>An investor remits ₹6 lakh in May and ₹9 lakh in November, totalling ₹15 lakh in the year.</p>
<ul>
<li><strong>May, ₹6 lakh:</strong> cumulative total is ₹6 lakh, below the threshold. No TCS.</li>
<li><strong>November, ₹9 lakh:</strong> cumulative total reaches ₹15 lakh. The first ₹4 lakh of this remittance takes the total to ₹10 lakh with no TCS; the remaining ₹5 lakh attracts 20%, so ₹1,00,000 is collected.</li>
</ul>
<p>That ₹1,00,000 is not gone. It appears against the investor's PAN in Form 26AS and is adjustable against total tax liability for the year, or refundable if the liability is lower.</p>

<h2>Getting it back</h2>
<p>TCS is credited against your income-tax liability, in the same way as TDS.</p>
<ul>
<li>The bank deposits the collected amount and reports it against your PAN.</li>
<li>It appears in <strong>Form 26AS</strong> and your Annual Information Statement.</li>
<li>You claim it in your income tax return.</li>
<li>If it exceeds your liability, the excess is refunded.</li>
</ul>
<p>Alternatively, salaried taxpayers can furnish details to their employer so that TCS is factored into TDS on salary, which reduces the interim cash-flow effect rather than waiting for a refund.</p>

<h2>The real cost is cash flow, not tax</h2>
<p>Having established that TCS is recoverable, it is worth being straightforward about what it does cost you.</p>
<p>Money collected in November and refunded after filing the following year is money you did not have invested for that period. That is a genuine opportunity cost, even though the rupee amount comes back in full.</p>
<p>Two practical implications:</p>
<ul>
<li><strong>Timing.</strong> A remittance early in the financial year has a longer gap to refund than one late in the year.</li>
<li><strong>Sizing.</strong> If your intended annual remittance sits near ₹10 lakh, staying under the threshold avoids the cash-flow drag entirely. Spreading a large remittance across financial years has the same effect, though this should not override the investment rationale — timing the market badly to save on a recoverable prepayment is a poor trade.</li>
</ul>
<p>Note also that the LRS limit itself is <strong>USD 250,000 per individual per financial year</strong>, and it is per person. Family members each have their own limit and their own ₹10 lakh TCS threshold.</p>

<h2>What TCS is not</h2>
<ul>
<li><strong>Not a tax on investing abroad.</strong> It is a collection mechanism for tax you may owe anyway.</li>
<li><strong>Not a charge by the platform.</strong> Your bank collects and deposits it under statute.</li>
<li><strong>Not related to your investment's performance.</strong> It applies to the remittance, whatever the money subsequently does.</li>
<li><strong>Not a substitute for filing.</strong> Paying TCS does not discharge your obligation to report the income or disclose the assets in <a href="/articles/schedule-fa-foreign-assets-reporting">Schedule FA</a>.</li>
</ul>

<h2>Common mistakes</h2>
<ul>
<li>Quoting the old ₹7 lakh threshold.</li>
<li>Assuming the 2% education/medical rate applies to investments.</li>
<li>Calculating 20% on the whole remittance instead of the excess.</li>
<li>Treating TCS as a sunk cost and never claiming it.</li>
<li>Forgetting that the threshold is cumulative across banks.</li>
</ul>

<h2>Conclusion</h2>
<p>TCS on investment remittances is 20% on the amount above ₹10 lakh cumulative per PAN in a financial year. It is fully creditable, and for most investors the meaningful question is not whether they lose the money — they do not — but when they get it back.</p>
<p>Plan remittance timing and size with the cash-flow effect in mind, keep track of the cumulative total yourself, and claim the credit when you file.</p>
<p>See also <a href="/articles/lrs-explained">LRS Explained</a> and <a href="/articles/how-to-transfer-money-for-us-stock-investing">How to Transfer Money Abroad</a>.</p>

<p><strong>Disclaimer:</strong> This article is for educational purposes only and is not tax advice. Rates and thresholds are stated as of August 2026 and change with each Finance Act. Your ability to adjust or claim a refund of TCS depends on your overall tax position. Please consult a qualified CA, and read our <a href="/disclaimer">Risk Disclosure and Disclaimer</a>.</p>
`
export default content
