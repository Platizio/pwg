const content = `
<p><em>Updated August 2026.</em></p>
<p>Holding US shares changes how you file. It rules out the simpler return forms, adds three or four schedules, and introduces a currency conversion step that has a prescribed basis rather than a convenient one.</p>
<p>None of it is difficult once the records exist. Almost all of the difficulty comes from trying to reconstruct a year of transactions in July.</p>

<h2>Which form</h2>
<p>Holding foreign assets rules out <strong>ITR-1</strong> and <strong>ITR-4</strong>, because neither contains Schedule FA.</p>
<ul>
<li><strong>ITR-2</strong> — salaried individuals, and anyone with capital gains and foreign assets but no business or professional income. This covers most investors.</li>
<li><strong>ITR-3</strong> — where there is business or professional income as well.</li>
</ul>
<p>Filing ITR-1 while holding foreign assets is a defective return, not merely a suboptimal one.</p>

<h2>The schedules, and what goes in each</h2>
<table>
<thead>
<tr><th>Schedule</th><th>What it captures</th><th>Applies when</th></tr>
</thead>
<tbody>
<tr><td><strong>Schedule CG</strong></td><td>Capital gains on shares sold during the year</td><td>You sold something</td></tr>
<tr><td><strong>Schedule OS</strong></td><td>Dividend income, under income from other sources</td><td>You received dividends</td></tr>
<tr><td><strong>Schedule FSI</strong></td><td>Foreign-source income, country by country</td><td>You had foreign income</td></tr>
<tr><td><strong>Schedule TR</strong></td><td>Tax relief claimed for foreign tax paid</td><td>You are claiming credit</td></tr>
<tr><td><strong>Schedule FA</strong></td><td>The foreign assets themselves</td><td><strong>You held them — sale or gain irrelevant</strong></td></tr>
</tbody>
</table>
<p>The last row is the one that catches people. Schedule FA is triggered by holding, not by transacting. A year in which you bought nothing, sold nothing and received nothing still requires disclosure. See <a href="/articles/schedule-fa-foreign-assets-reporting">Schedule FA and Foreign Asset Reporting</a>.</p>

<h2>Step 1: Gather the records</h2>
<ul>
<li>Year-end consolidated broker statement.</li>
<li>Monthly or quarterly statements — needed to establish peak value for Schedule FA.</li>
<li>Trade confirmations for every buy and sell.</li>
<li>Dividend statements showing gross dividend and tax withheld.</li>
<li>Bank remittance records for every LRS transfer, including TCS deducted.</li>
<li>Form 26AS and your Annual Information Statement, to confirm the TCS credited against your PAN.</li>
</ul>

<h2>Step 2: Compute capital gains in rupees</h2>
<p>Gains arise in dollars and are taxed in rupees, and the conversion basis is prescribed.</p>
<p>The generally applied rate is the <strong>SBI TT buying rate on the last day of the month immediately preceding the month of the transaction</strong>. Both the purchase and the sale are converted on this basis, using the rate relevant to each leg.</p>
<p>Then classify:</p>
<ul>
<li><strong>Held more than 24 months</strong> — long-term, taxed at 12.5% without indexation, plus surcharge and cess.</li>
<li><strong>Held 24 months or less</strong> — short-term, taxed at your slab rate.</li>
</ul>
<p>Two errors are worth calling out because they are so common: applying the <strong>12-month</strong> period that belongs to Indian listed equity, and applying the <strong>₹1.25 lakh LTCG exemption</strong>, which does not extend to foreign shares. See <a href="/articles/tax-on-us-stocks-in-india">Tax on US Stocks in India</a>.</p>

<h2>Step 3: Report dividends on the gross amount</h2>
<p>Dividends go into Schedule OS at the <strong>gross</strong> figure — before US withholding — not the net amount that reached your account.</p>
<p>The same amounts then appear in Schedule FSI as foreign-source income, with the US tax paid shown against them.</p>

<h2>Step 4: Claim the foreign tax credit</h2>
<p>The credit for US withholding is claimed through Schedule TR and requires a separate form to be filed.</p>
<p>For income earned in <strong>FY 2025-26 and earlier, that form is Form 67</strong>. For income earned from <strong>FY 2026-27 onwards, it becomes Form 44</strong> under the Income-tax Act, 2025. Anyone filing now, for income already earned, still uses Form 67.</p>
<p>The form should be filed on or before the return due date. See <a href="/articles/dtaa-india-us-foreign-tax-credit">The India–US DTAA and Foreign Tax Credit</a>.</p>

<h2>Step 5: Complete Schedule FA</h2>
<p>For each foreign holding and account, the schedule asks for the entity name and address, nature of interest, date acquired, initial investment, <strong>peak value during the period</strong>, closing value and income earned.</p>
<p>Confirm the applicable reporting period with your CA. For foreign assets it has historically been referenced to the calendar year rather than the April–March Indian tax year, which is not intuitive and has been revised across assessment years.</p>

<h2>Step 6: Claim your TCS</h2>
<p>TCS collected on your LRS remittances appears in Form 26AS against your PAN. It is adjustable against your total tax liability and refundable to the extent it exceeds it.</p>
<p>Investors who forget this step leave real money with the department. See <a href="/articles/tcs-on-lrs-explained">TCS on LRS Remittances</a>.</p>

<h2>Common mistakes</h2>
<ul>
<li>Filing ITR-1 while holding foreign assets.</li>
<li>Using a 12-month holding period instead of 24.</li>
<li>Claiming the ₹1.25 lakh LTCG exemption on foreign shares.</li>
<li>Converting at the transaction-date rate rather than the prescribed month-end rate.</li>
<li>Reporting net dividends instead of gross.</li>
<li>Filing the return but not Form 67, forfeiting the credit.</li>
<li>Skipping Schedule FA in a year with no transactions.</li>
<li>Leaving TCS unclaimed.</li>
</ul>

<h2>Conclusion</h2>
<p>Reporting US holdings correctly is a sequence of well-defined steps, and the sequence is the same every year. The investors who find it painless are the ones who keep statements as they arrive and note the conversion basis at the time.</p>
<p>Given the number of interacting rules — and the penalty exposure attached to Schedule FA specifically — this is an area where a CA's involvement is worth its cost.</p>

<p><strong>Disclaimer:</strong> This article is for educational purposes only and is not tax advice. Return forms, schedules, reporting periods and rates are prescribed by the Income Tax Department and change between assessment years; details are stated as of August 2026. This is a general outline and not a substitute for professional assistance with your own return. Please consult a qualified CA and read our <a href="/disclaimer">Risk Disclosure and Disclaimer</a>.</p>
`
export default content
