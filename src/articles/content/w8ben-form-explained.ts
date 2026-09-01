const content = `
<p>Form W-8BEN is a short declaration with a disproportionate effect. Filing it reduces US withholding tax on your dividends from 30% to 25%. Not filing it costs you five percentage points of every dividend, permanently and for no reason.</p>

<h2>What the form does</h2>
<p>Its full title is <em>Certificate of Foreign Status of Beneficial Owner for United States Tax Withholding and Reporting (Individuals)</em>. It is an IRS form, submitted to your broker rather than to the IRS directly.</p>
<p>It establishes two things:</p>
<ul>
<li>That you are <strong>not</strong> a US person, so the US domestic withholding and reporting regime for residents does not apply to you.</li>
<li>That you are a tax resident of a country with a treaty — India — and are therefore entitled to the treaty rate.</li>
</ul>
<p>Without it, the broker must default to the statutory 30% rate for non-resident payees, because it has no documented basis for applying anything lower.</p>

<h2>What it changes</h2>
<table>
<thead>
<tr><th></th><th>Without W-8BEN</th><th>With W-8BEN</th></tr>
</thead>
<tbody>
<tr><td>US withholding on dividends</td><td>30%</td><td><strong>25%</strong></td></tr>
<tr><td>US tax on capital gains</td><td>None</td><td>None</td></tr>
</tbody>
</table>
<p>Note that it does not affect capital gains, because Indian residents do not pay US tax on capital gains from US shares either way. Its entire effect is on dividend income.</p>
<p>The 15% rate sometimes quoted under the India–US treaty requires holding at least 10% of the paying company's voting stock. It is not available to retail investors, and W-8BEN does not unlock it.</p>

<h2>What you provide</h2>
<p>The form is short. In practice it is completed as part of digital onboarding rather than on paper. It asks for:</p>
<ul>
<li>Your full name and country of citizenship.</li>
<li>Your permanent residence address in India. This must be a genuine residential address — a care-of address or a US address undermines the claim of foreign status.</li>
<li>Your mailing address, if different.</li>
<li>A taxpayer identification number. For Indian residents this is generally the <strong>PAN</strong>, entered as a foreign TIN.</li>
<li>The treaty claim — India, and the article and rate relied on for dividends.</li>
<li>Signature, capacity and date.</li>
</ul>
<p>Accuracy on the address and TIN matters. These are the fields that support the treaty claim, and inconsistency between them is the usual reason a form is queried.</p>

<h2>It expires</h2>
<p>This is the part most often forgotten. A W-8BEN is generally valid from the date of signing until the <strong>end of the third succeeding calendar year</strong>.</p>
<p>A form signed in, say, June 2026 would generally remain valid to 31 December 2029, unless a change in circumstances makes any of the information incorrect before then.</p>
<p>When it lapses and is not renewed, the broker reverts to withholding at 30%. There is no warning built into the dividend itself — the money simply arrives smaller. It is worth noting the expiry alongside your other annual financial dates.</p>
<p>You must also submit a new form within a reasonable period if your circumstances change — a change of country of residence, citizenship, or address.</p>

<h2>What happens if you skip it</h2>
<p>Nothing dramatic, which is precisely why it gets overlooked. The account works, trades execute, and capital gains are unaffected. The only symptom is that dividends arrive 5% smaller than they should.</p>
<p>Worse, the extra withholding is generally not recoverable through the Indian foreign tax credit route in the way you might hope: the credit is capped at the Indian tax attributable to that income, so over-withholding abroad is not automatically made good in India. In some circumstances a refund claim can be pursued with the IRS, but that is a considerably more involved process than filing the form in the first place.</p>

<h2>W-8BEN and W-8BEN-E</h2>
<p>A brief clarification, because the names are similar. <strong>W-8BEN</strong> is for individuals. <strong>W-8BEN-E</strong> is for entities — companies, trusts, partnerships. An individual investor needs the former.</p>

<h2>Practical checklist</h2>
<ul>
<li>Complete it during onboarding, before you hold any dividend-paying security.</li>
<li>Use your genuine Indian residential address.</li>
<li>Enter your PAN as the foreign TIN.</li>
<li>Note the expiry date — end of the third calendar year after signing.</li>
<li>Re-file promptly if your residence, citizenship or address changes.</li>
<li>Keep the acknowledgement; it supports your foreign tax credit claim in India.</li>
</ul>

<h2>Conclusion</h2>
<p>W-8BEN is the least demanding piece of paperwork in global investing and one of the few with an immediate, quantifiable return. It takes minutes, it cuts dividend withholding by five percentage points, and its main failure mode is silent expiry rather than incorrect completion.</p>
<p>File it early, and diarise the renewal.</p>
<p>See also <a href="/articles/dividend-tax-us-stocks-india">Dividend Tax on US Stocks</a> and <a href="/articles/dtaa-india-us-foreign-tax-credit">The India–US DTAA and Foreign Tax Credit</a>.</p>

<p><strong>Disclaimer:</strong> This article is for educational purposes only and is not tax or legal advice. Form W-8BEN is an IRS form and its requirements, validity period and treaty rates are set by US law and the India–US treaty, which can change. Details are stated as of August 2026. Please consult a qualified tax professional if your circumstances are not straightforward, and read our <a href="/disclaimer">Risk Disclosure and Disclaimer</a>.</p>
`
export default content
