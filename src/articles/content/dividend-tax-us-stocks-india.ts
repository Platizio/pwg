const content = `
<p><em>Updated August 2026.</em></p>
<p>Dividends are the one part of US investing where both countries tax the same income. Capital gains are taxed only in India; dividends are withheld in the United States and then taxed again in India, with credit available for the first.</p>
<p>Understanding the sequence matters, because the arithmetic looks alarming until you see where the credit lands.</p>

<h2>The three steps</h2>

<h3>1. The US withholds at source</h3>
<p>When a US company pays a dividend to a non-resident, tax is withheld before the money reaches the investor. The default rate is <strong>30%</strong>.</p>
<p>Under the India–US Double Taxation Avoidance Agreement, that rate drops to <strong>25%</strong> for Indian tax residents, provided <strong>Form W-8BEN</strong> is on file with the broker.</p>
<p>Filing W-8BEN is a one-off administrative step with a recurring benefit, and it needs renewing periodically. Not filing it means paying 30% instead of 25% for no reason at all. See <a href="/articles/w8ben-form-explained">Form W-8BEN Explained</a>.</p>

<h3>A note on the 15% rate</h3>
<p>The India–US treaty does contain a 15% dividend rate, and it is often quoted in error. It applies where the recipient holds at least <strong>10% of the voting stock</strong> of the paying company. That is a corporate shareholding threshold. <strong>Retail investors get 25%, not 15%.</strong></p>

<h3>2. India taxes the gross dividend</h3>
<p>Here is the part people find counter-intuitive. India taxes the <strong>gross</strong> dividend — the full amount before US withholding — not the net amount that arrived in your account.</p>
<p>The gross figure is added to your total income and taxed at your applicable slab rate. There is no separate concessional rate for foreign dividends.</p>

<h3>3. You claim credit for the US tax</h3>
<p>To prevent the same income being fully taxed twice, you claim a foreign tax credit for the US tax withheld, under Section 90 read with the DTAA.</p>
<p>The credit is claimed by filing <strong>Form 67</strong> and completing <strong>Schedule FSI</strong> and <strong>Schedule TR</strong> in your return. See <a href="/articles/dtaa-india-us-foreign-tax-credit">The India–US DTAA and Foreign Tax Credit</a> for the mechanics, including the Form 67 to Form 44 transition.</p>

<h2>A worked example</h2>
<p>Assume a US dividend of <strong>USD 1,000</strong> and an investor in the 30% slab, with W-8BEN on file. Rupee figures are illustrative.</p>
<table>
<thead>
<tr><th>Step</th><th>Amount</th></tr>
</thead>
<tbody>
<tr><td>Gross dividend declared</td><td>USD 1,000</td></tr>
<tr><td>US withholding at 25%</td><td>−USD 250</td></tr>
<tr><td><strong>Received in account</strong></td><td><strong>USD 750</strong></td></tr>
<tr><td>Taxable in India on gross</td><td>USD 1,000</td></tr>
<tr><td>Indian tax at 30% slab (plus surcharge and cess)</td><td>USD 300</td></tr>
<tr><td>Less foreign tax credit for US tax paid</td><td>−USD 250</td></tr>
<tr><td><strong>Net additional Indian tax payable</strong></td><td><strong>USD 50</strong></td></tr>
<tr><td><strong>Total tax borne</strong></td><td><strong>USD 300</strong></td></tr>
</tbody>
</table>
<p>The effective outcome is that you pay tax at your Indian slab rate overall — the US simply collects part of it first. The credit is generally capped at the Indian tax attributable to that income, so where the Indian rate is <em>lower</em> than 25%, the excess US withholding is typically not refundable.</p>
<p>That last point is worth sitting with: for an investor in a lower slab, US dividend withholding can exceed the Indian liability on the same income, and the surplus is not recovered. Dividend-heavy US holdings suit higher-rate taxpayers better than lower-rate ones, purely as a matter of credit arithmetic.</p>

<h2>Converting the amounts</h2>
<p>Dividend income is converted to rupees for Indian tax purposes. The generally applied basis is the SBI TT buying rate on the last day of the month preceding the month in which the dividend was received.</p>
<p>Both the gross dividend and the tax withheld should be converted consistently, so that the credit claimed matches the income reported.</p>

<h2>What this means for how you invest</h2>
<p>None of this is a reason to avoid dividend-paying US holdings. It is a reason to be aware of a few consequences:</p>
<ul>
<li><strong>Withholding is a real drag on total return</strong> for dividend-focused strategies, and it does not appear in an ETF's expense ratio.</li>
<li><strong>The credit needs claiming.</strong> It is not automatic. Miss Form 67 and you have simply paid twice.</li>
<li><strong>Documentation matters.</strong> Keep dividend statements and withholding certificates from the broker; the credit claim depends on them.</li>
<li><strong>Accumulating structures behave differently</strong> from distributing ones. Where a fund reinvests internally rather than distributing, the investor-level dividend event may not arise in the same way — but the treatment depends on the specific structure, and is worth checking rather than assuming.</li>
</ul>

<h2>Common mistakes</h2>
<ul>
<li>Reporting the <strong>net</strong> dividend received instead of the gross.</li>
<li>Not filing W-8BEN, and paying 30% instead of 25%.</li>
<li>Expecting the 15% treaty rate as a retail investor.</li>
<li>Forgetting Form 67, which forfeits the credit.</li>
<li>Assuming dividends are exempt because capital gains are not taxed in the US.</li>
</ul>

<h2>Conclusion</h2>
<p>US dividends are withheld at 25% with W-8BEN on file, taxed in India on the gross amount at your slab rate, and relieved through a foreign tax credit. Done correctly, you bear roughly your Indian slab rate in total. Done carelessly — no W-8BEN, no Form 67 — you can end up meaningfully worse off than the rules require.</p>
<p>See also <a href="/articles/tax-on-us-stocks-in-india">Tax on US Stocks in India</a>.</p>

<p><strong>Disclaimer:</strong> This article is for educational purposes only and is not tax or investment advice. Rates and treaty positions are stated as of August 2026 and can change. Foreign tax credit entitlement depends on individual facts, residential status, and correct and timely filing. Please consult a qualified CA before claiming credit, and read our <a href="/disclaimer">Risk Disclosure and Disclaimer</a>.</p>
`
export default content
