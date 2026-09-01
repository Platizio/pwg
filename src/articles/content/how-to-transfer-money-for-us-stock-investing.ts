const content = `
<p>Moving money from an Indian bank account to a US brokerage account is a regulated, well-defined process. It runs under the Liberalised Remittance Scheme, goes through an authorised dealer bank, and takes a few business days.</p>
<p>The mechanics are straightforward. What catches people out is the cost embedded in the exchange rate, and the fact that the TCS threshold is cumulative rather than per transaction.</p>

<h2>Before you can remit</h2>
<p>Two prerequisites, in order:</p>
<p><strong>The brokerage account must be open and approved.</strong> The account number is generated at the end of KYC, and you cannot fund an account that does not yet exist. Account opening is instant for resident Indians where there are no blockers, and up to 48 hours for NRIs and foreign nationals.</p>
<p><strong>You need headroom under the LRS limit.</strong> USD 250,000 per individual per financial year, across all permitted purposes — so overseas travel, education and gifts all draw on the same allowance.</p>

<h2>The steps</h2>

<h3>1. Generate the remittance instructions</h3>
<p>From within the platform, select your bank and download the remittance details. These specify the beneficiary account, the correspondent bank and the SWIFT routing your bank needs.</p>
<p>Using the instructions generated for your own account matters. A transfer sent to generic details, or missing the reference that identifies your account, can be delayed or returned.</p>

<h3>2. Complete Form A2</h3>
<p>Form A2 is the declaration under FEMA that accompanies an outward remittance. It states the amount, the beneficiary and the <strong>purpose code</strong> under which the remittance is made.</p>
<p>For overseas equity investment the purpose code must reflect that. Selecting the wrong code — travel, or maintenance of relatives — misclassifies the remittance in the banking system and can complicate both the transfer and your later reporting. If your bank's interface is unclear, ask; this is a field worth getting right.</p>
<p>Most banks now handle A2 within net banking rather than on paper.</p>

<h3>3. Initiate the transfer</h3>
<p>Your bank debits rupees, converts to dollars, and sends the funds via SWIFT. At this point three things are applied:</p>
<ul>
<li><strong>The exchange rate</strong>, including the bank's markup.</li>
<li><strong>A wire or SWIFT fee</strong>, typically a fixed amount.</li>
<li><strong>TCS</strong>, if you have crossed the annual threshold.</li>
</ul>

<h3>4. Wait for credit</h3>
<p>Funds typically arrive within a few business days. International transfers pass through correspondent banks, and weekends and public holidays in either country extend the timeline. A transfer initiated on a Friday will not move over the weekend.</p>

<h2>The cost nobody quotes: forex markup</h2>
<p>This deserves its own section because it is usually the largest cost and the least visible.</p>
<p>Your bank does not give you the interbank rate. It gives you a rate that includes its own margin, and that margin is embedded in the rate rather than shown as a fee. A transfer can look fee-light and still be expensive.</p>
<p>What to do about it:</p>
<ul>
<li>Ask what rate will be applied before you confirm, and compare it against the live market rate.</li>
<li>Compare across the banks you hold accounts with — the spread differs more than most people assume.</li>
<li>Ask whether a better rate is available for larger amounts. It often is, and it is rarely offered unprompted.</li>
</ul>

<h2>TCS: the threshold is cumulative</h2>
<p>TCS applies at <strong>20% on the amount exceeding ₹10 lakh</strong> of cumulative LRS remittances under your PAN in a financial year. The threshold rose from ₹7 lakh on 1 April 2025.</p>
<p>Three points that cause confusion:</p>
<ul>
<li><strong>Cumulative, not per transaction.</strong> Four ₹3 lakh transfers total ₹12 lakh, and the last one crosses the threshold.</li>
<li><strong>Across all banks.</strong> The threshold attaches to your PAN, not to a bank relationship. Banks rely on your declaration of prior remittances, so keep your own running total.</li>
<li><strong>The 2% education and medical rate does not apply to investment remittances.</strong> Those remain at 20%.</li>
</ul>
<p>TCS is recoverable — it is creditable against your income tax and refundable if it exceeds your liability. See <a href="/articles/tcs-on-lrs-explained">TCS on LRS Remittances</a>.</p>

<h2>How often should you remit?</h2>
<p>Because the wire fee is fixed per transfer, frequent small remittances are inefficient. The generally better pattern is to accumulate in rupees and remit in larger tranches, then invest from the dollar balance as often as you like — trading inside the account costs nothing extra in remittance terms.</p>
<p>See <a href="/articles/minimum-investment-and-costs-us-stocks">Minimum Investment and Real Costs</a>.</p>

<h2>What to keep</h2>
<p>Every remittance generates records you will want at filing time:</p>
<ul>
<li>The bank's remittance advice or SWIFT confirmation.</li>
<li>The A2 form and the purpose code used.</li>
<li>The exchange rate applied and the rupee amount debited.</li>
<li>TCS deducted, cross-checked against Form 26AS.</li>
<li>A running total of remittances in the financial year, for both the LRS limit and the TCS threshold.</li>
</ul>

<h2>Common mistakes</h2>
<ul>
<li>Trying to fund before the brokerage account is approved.</li>
<li>Selecting the wrong purpose code on Form A2.</li>
<li>Assuming the TCS threshold resets per transaction or per bank.</li>
<li>Comparing banks on the wire fee while ignoring the markup in the rate.</li>
<li>Remitting monthly out of SIP habit, and paying the fixed fee twelve times a year.</li>
<li>Forgetting that travel and education spending also consume the LRS limit.</li>
</ul>

<h2>Conclusion</h2>
<p>The transfer process is: open the account, get the remittance instructions, complete A2 with the right purpose code, initiate, and wait a few days. The parts worth attention are the exchange rate — where the real cost hides — and your cumulative position against both the LRS limit and the TCS threshold.</p>
<p>Before the first transfer, it is worth reading <a href="/articles/how-to-withdraw-money-from-us-stocks-to-india">how the money comes back</a>. See also <a href="/articles/lrs-explained">LRS Explained</a>.</p>

<p><strong>Disclaimer:</strong> This article is for educational purposes only and is not investment, tax or legal advice. Bank processes, charges, exchange rates and timelines vary by institution. LRS rules and TCS rates are stated as of August 2026 and can change. Please confirm current requirements with your bank and a qualified adviser, and read our <a href="/disclaimer">Risk Disclosure and Disclaimer</a>.</p>
`
export default content
