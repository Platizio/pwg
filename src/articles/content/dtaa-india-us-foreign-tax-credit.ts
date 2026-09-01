const content = `
<p><em>Updated August 2026.</em></p>
<p>The India–US Double Taxation Avoidance Agreement exists so that the same income is not fully taxed twice. For an investor holding US shares, it does two specific things: it caps US withholding on dividends, and it entitles you to credit in India for the US tax you have already paid.</p>
<p>The second half is not automatic. It has to be claimed, on a specific form, and the form is changing.</p>

<h2>Where the DTAA actually applies</h2>
<table>
<thead>
<tr><th>Income type</th><th>Taxed in the US?</th><th>Taxed in India?</th><th>DTAA role</th></tr>
</thead>
<tbody>
<tr><td>Capital gains on US shares</td><td>No</td><td>Yes</td><td>None needed — only one country taxes</td></tr>
<tr><td>Dividends</td><td>Yes, withheld at source</td><td>Yes, at slab rate</td><td>Caps withholding at 25%; grants credit in India</td></tr>
</tbody>
</table>
<p>So the DTAA matters for dividends and not for capital gains. An investor holding non-dividend-paying growth stocks may never need to use it; an investor holding dividend-paying ETFs will use it every year.</p>

<h2>The dividend rate under Article 10</h2>
<p>Article 10 of the treaty deals with dividends. For Indian tax residents holding US shares as portfolio investors, the withholding rate is <strong>25%</strong>, down from the 30% domestic default, provided <strong>Form W-8BEN</strong> is on file with the broker.</p>
<p>The <strong>15%</strong> rate that appears in the treaty requires the recipient to hold at least <strong>10% of the voting stock</strong> of the paying company. It is a corporate-shareholder provision and is not available to retail investors, however often it is quoted as though it were.</p>

<h2>Claiming the credit in India: the mechanics</h2>
<p>Foreign tax credit is claimed under <strong>Section 90</strong> of the Income Tax Act, read with <strong>Rule 128</strong> and the treaty itself.</p>
<p>Three things go into the return:</p>
<ul>
<li><strong>Form 67</strong> — the statement of foreign income and the tax paid on it.</li>
<li><strong>Schedule FSI</strong> — foreign source income, country by country.</li>
<li><strong>Schedule TR</strong> — the tax relief claimed.</li>
</ul>
<p>You will also need supporting evidence of the tax paid abroad — broker dividend statements showing the withholding, and in some cases a certificate from the deductor.</p>
<p>A <strong>Tax Residency Certificate</strong> is required in some circumstances to establish treaty eligibility. Whether one is needed for retail dividend credit depends on the facts and the assessing officer's requirements, and is worth confirming with your CA rather than assuming either way.</p>

<h2>Form 67 is becoming Form 44 — but not yet</h2>
<p>This transition is being widely reported, and it is easy to state backwards in a way that would misdirect anyone filing this year. The years matter.</p>
<table>
<thead>
<tr><th>Income earned in</th><th>Assessment year</th><th>Form to use</th></tr>
</thead>
<tbody>
<tr><td>FY 2024-25</td><td>AY 2025-26</td><td><strong>Form 67</strong></td></tr>
<tr><td>FY 2025-26</td><td>AY 2026-27</td><td><strong>Form 67</strong></td></tr>
<tr><td>FY 2026-27 onwards</td><td>AY 2027-28 onwards</td><td><strong>Form 44</strong></td></tr>
</tbody>
</table>
<p>Under the <strong>Income-tax Act, 2025</strong>, effective 1 April 2026, Form 67 is replaced by <strong>Form 44</strong> under Rule 76 of the Income-tax Rules, 2026, for income earned from tax year 2026-27 onwards.</p>
<p>So if you are filing now, in respect of income already earned, <strong>Form 67 is still the correct form</strong>. Form 44 applies to income earned from 1 April 2026, which is reported in the following year's return.</p>
<p>The change is administrative rather than substantive. The eligibility conditions and the method of computing the credit carry over largely unchanged; the form number and the portal label are what move.</p>

<h2>Timing, and what happens if you file late</h2>
<p>Rule 128 requires the form to be filed on or before the due date for furnishing the return. Historically this was read strictly, and late filing was treated as forfeiting the credit entirely.</p>
<p>A consistent line of tribunal decisions has since held that the requirement is <strong>directory rather than mandatory</strong> — that filing the form is a procedural condition, and a delay should not by itself extinguish a substantive treaty entitlement.</p>
<p>That is genuinely helpful if you have already missed it. It is not a reason to plan around missing it: relying on litigation to recover a credit you could have claimed on time is a poor trade, and outcomes are fact-specific.</p>

<h2>How much credit you actually get</h2>
<p>The credit is generally limited to the <strong>lower of</strong> the foreign tax paid and the Indian tax attributable to that same income.</p>
<p>This produces an asymmetry worth understanding:</p>
<ul>
<li><strong>Indian rate above 25%:</strong> you get full credit for the US withholding and pay the difference in India. Total burden is your Indian slab rate.</li>
<li><strong>Indian rate below 25%:</strong> credit is capped at the Indian liability on that income. The excess US withholding is generally not refundable, in either country.</li>
</ul>
<p>The practical consequence is that US dividend income is relatively less efficient for lower-slab taxpayers than for higher-slab ones. See <a href="/articles/dividend-tax-us-stocks-india">Dividend Tax on US Stocks</a> for a worked example.</p>

<h2>Records to keep</h2>
<ul>
<li>Broker dividend statements showing gross dividend and tax withheld.</li>
<li>Any withholding certificates issued.</li>
<li>Year-end consolidated broker statements.</li>
<li>Form W-8BEN acknowledgement, and a note of its expiry.</li>
<li>Conversion rates used, with the basis on which they were selected.</li>
<li>Filed copies of Form 67 (or Form 44, from AY 2027-28) with acknowledgement numbers.</li>
</ul>

<h2>Conclusion</h2>
<p>The DTAA does its job automatically on the US side — 25% withholding once W-8BEN is filed. On the Indian side it does nothing unless you claim it.</p>
<p>File the form with the return, keep the statements that evidence the foreign tax, and note the year boundary: Form 67 for income up to FY 2025-26, Form 44 from FY 2026-27.</p>
<p>See also <a href="/articles/how-to-report-us-stocks-in-itr">How to Report US Stocks in Your ITR</a>.</p>

<p><strong>Disclaimer:</strong> This article is for educational purposes only and is not tax or legal advice. Treaty interpretation, credit entitlement and procedural requirements depend on individual facts and are subject to change, including under the Income-tax Act, 2025 and rules made under it. Details are stated as of August 2026. Please consult a qualified CA before claiming foreign tax credit, and read our <a href="/disclaimer">Risk Disclosure and Disclaimer</a>.</p>
`
export default content
