import { isValidElement } from 'react'

/**
 * The FAQ corpus.
 *
 * Lifted out of src/pages/FAQs.tsx so that one array feeds every consumer:
 * the /faqs page, the /help assistant's browser panel, and the build-time
 * corpus extractor that ingests these answers into the support knowledge base.
 * Answers stay React.ReactNode — several carry lists and links — so this file
 * is .tsx rather than .ts.
 */

export interface FaqItem {
  id: string
  q: string
  a: React.ReactNode
}

export interface FaqSection {
  id: string
  num: number
  title: string
  note?: React.ReactNode
  items: FaqItem[]
  /** Articles that go deeper on this section's questions */
  readMore?: { label: string; to: string }[]
}

export const FAQ_SECTIONS: FaqSection[] = [
  {
    id: 'getting-started',
    readMore: [{ label: 'How to invest in US stocks from India', to: '/articles/how-to-invest-in-us-stocks-from-india' }, { label: 'Minimum investment and real costs', to: '/articles/minimum-investment-and-costs-us-stocks' }],
    num: 1,
    title: 'Getting Started',
    items: [
      {
        id: 'gs-1',
        q: 'Can I, as an Indian resident, legally invest in US stocks?',
        a: 'Yes. Indian residents can invest in the US stock market under the Reserve Bank of India\'s Liberalised Remittance Scheme (LRS), which permits remittances of up to USD 250,000 per individual per financial year for permitted purposes, including overseas equity investment. Investing in US-listed stocks and ETFs through Platizio is fully compliant with these rules.',
      },
      {
        id: 'gs-2',
        q: 'Who can open an account with Platizio?',
        a: 'Any Indian resident individual with a valid PAN and the documents needed to complete KYC can open an account. Both first-time and experienced investors are welcome. Accounts are opened in your name with ViewTrade IFSC, introduced and managed by Platizio.',
      },
      {
        id: 'gs-3',
        q: 'Can NRIs (Non-Resident Indians) invest through Platizio?',
        a: <span>Yes. NRIs may invest where supported, subject to the rules of their country of residence and our broker partner's onboarding requirements. NRIs are typically asked to provide their passport, proof of address, and a tax identification number for their country of tax residence. NRIs are taxed according to the laws of the country where they are tax residents. Please contact <a href="mailto:supportglobal@platizio.com">supportglobal@platizio.com</a> to confirm eligibility for your country.</span>,
      },
      {
        id: 'gs-4',
        q: 'What documents are required to complete KYC?',
        a: 'To complete KYC you will generally need: a PAN card, proof of identity, proof of address (Aadhaar or equivalent), and your basic financial and bank details. The exact documents are confirmed during the digital onboarding process.',
      },
      {
        id: 'gs-5',
        q: 'What are the steps to open a Platizio Global account and complete KYC?',
        a: (
          <>
            <ol>
              <li>Sign up on the Platizio platform using your email or mobile number.</li>
              <li>Enter your personal details and tax residency information.</li>
              <li>Answer a short set of regulatory and risk-profile questions.</li>
              <li>Upload the required KYC documents (PAN, address proof, etc.).</li>
              <li>Submit your application with your digital signature (your full name).</li>
            </ol>
            Your account is opened in your name with ViewTrade IFSC at GIFT City once KYC is approved.
          </>
        ),
      },
      {
        id: 'gs-6',
        q: 'How long does account approval take?',
        a: 'Instant account opening for resident Indians subject to no blockers, and up to 48 hours for NRI and Foreign nationals.',
      },
      {
        id: 'gs-7',
        q: 'Can I add funds while my KYC is still under review?',
        a: 'No. You can add funds only after your account is approved, because your brokerage account number is generated only once KYC is completed.',
      },
      {
        id: 'gs-8',
        q: 'Are there any account opening or maintenance charges?',
        a: 'No, there are no account opening or maintenance charges.',
      },
      {
        id: 'gs-9',
        q: 'Can an HUF or a business entity open an account?',
        a: 'LRS is available to resident individuals (and minors with a guardian). HUFs, companies, and partnership firms are not eligible to invest through the individual LRS route, and our broker partner generally does not support HUF or business-entity accounts for this product.',
      },
    ],
  },
  {
    id: 'safety-custody',
    readMore: [{ label: 'Is investing in US stocks safe and legal?', to: '/articles/is-investing-in-us-stocks-safe-and-legal' }],
    num: 2,
    title: 'Safety, Custody & Regulation',
    items: [
      {
        id: 'sc-1',
        q: 'Who is ViewTrade and what role do they play?',
        a: 'ViewTrade is our US-based brokerage and financial-technology partner. They provide the underlying brokerage infrastructure that allows your orders to be executed on US exchanges and your securities to be held with ViewTrade IFSC. Platizio provides the platform and customer experience; ViewTrade provides the regulated brokerage rails.',
      },
      {
        id: 'sc-2',
        q: 'In whose name are my securities held?',
        a: 'The securities are custodised in the name of ViewTrade IFSC with DTCC for the benefit of customers — shares are held in ViewTrade IFSC\'s name (not the customer\'s). This is done to protect the client under US regulations and rules. The benefit of the account, including ownership and rights, still belongs to you as the end client. This is an IFSC-regulated account, not a standard US brokerage account.',
      },
      {
        id: 'sc-3',
        q: 'Are my investments insured?',
        a: 'US brokerage accounts are covered by SIPC (the Securities Investor Protection Corporation) up to USD 500,000 in total, including up to USD 250,000 for cash. This is the standard protection that applies across US broker-dealers. SIPC protects against the failure of a brokerage firm; it does not protect against a fall in the market value of your investments.',
      },
      {
        id: 'sc-4',
        q: 'What happens to my investments if Platizio stops operating?',
        a: 'Your securities and cash are held in your own name with ViewTrade IFSC, separate from Platizio\'s own funds. If Platizio were to cease operations, your assets would remain safe in your brokerage account and you would continue to be able to access them through the broker.',
      },
      {
        id: 'sc-5',
        q: "Are client funds kept separate from Platizio's own money?",
        a: 'Yes. Client money and securities are held with ViewTrade IFSC (GIFT City) with DTCC as ultimate custodian in your name, and are kept separate from Platizio\'s operational funds.',
      },
      {
        id: 'sc-6',
        q: 'How is my personal data protected?',
        a: 'Data is encrypted, protected and stored in GIFT IFSC, India.',
      },
    ],
  },
  {
    id: 'funding',
    readMore: [{ label: 'How to transfer money abroad', to: '/articles/how-to-transfer-money-for-us-stock-investing' }, { label: 'TCS on LRS remittances', to: '/articles/tcs-on-lrs-explained' }, { label: 'LRS explained', to: '/articles/lrs-explained' }],
    num: 3,
    title: 'Funding Your Account',
    items: [
      {
        id: 'fa-1',
        q: 'How do I add funds to my Platizio Global Trading Account?',
        a: 'You fund your US brokerage account by remitting money from your Indian bank account under the LRS. From within the platform you can select your bank, download the net-banking remittance instructions, and initiate the transfer. Funds are converted from INR to USD by your bank and credited to your brokerage account.',
      },
      {
        id: 'fa-2',
        q: 'How long does it take for funds to reach my account?',
        a: 'Funds are credited the same day if initiated before 1:30 PM (for integrated partner banks); the next working day if initiated after 1:30 PM.',
      },
      {
        id: 'fa-3',
        q: 'What is the maximum I can invest in a year?',
        a: 'Under the LRS, an Indian resident can remit up to USD 250,000 per financial year (April to March) across all permitted purposes combined. This is a per-individual limit set by the RBI.',
      },
      {
        id: 'fa-4',
        q: 'Which banks can I use, and are there preferred rates?',
        a: 'You can remit from most major Indian banks that support online LRS transfers. ViewTrade has partnered with various banks to offer a smoother experience and preferred foreign-exchange rates. You can also use your existing bank account — you are not required to open a new account.',
      },
      {
        id: 'fa-5',
        q: 'What is TCS, and how much will I pay?',
        a: (
          <span>
            TCS (Tax Collected at Source) is a tax your bank collects when you remit money abroad under the LRS. For overseas investments such as US stocks and ETFs, TCS applies at{' '}
            <strong>20%, only on the amount that exceeds ₹10 lakh</strong> of total LRS remittances in a financial year — the first ₹10 lakh in a year attracts no TCS.
            TCS is <strong>not an extra cost</strong>: it is adjustable against your income-tax liability and can be claimed back when you file your income-tax return. It is reflected in your Form 26AS.
          </span>
        ),
      },
      {
        id: 'fa-6',
        q: 'Can I transfer funds from an NRE or NRO account?',
        a: 'NRE/NRO transfers are supported by several banks. ICICI Bank generally supports online transfers from both NRE and NRO accounts; some other banks support online transfers only from NRE accounts. For NRO transfers, your bank may require a 15CA/CB certificate along with the A2 and declaration forms. Please check with your bank for their specific process.',
      },
      {
        id: 'fa-7',
        q: "Can I add money using a friend's or family member's bank account?",
        a: "No. Third-party transfers are not permitted. You can fund your account only from a bank account in which you are the primary holder, as the sender's name must match your account name.",
      },
      {
        id: 'fa-8',
        q: 'Can I add money via UPI, a forex card, or services like Wise / Western Union?',
        a: 'No. LRS investment remittances must be made through a bank under the prescribed purpose code (overseas portfolio investment). UPI, forex cards, and money-transfer services such as Wise or Western Union cannot be used for this purpose. The remittance must come from your own bank account.',
      },
    ],
  },
  {
    id: 'trading',
    readMore: [{ label: 'US stock market timings in India', to: '/articles/us-stock-market-timings-india' }, { label: 'Fractional shares explained', to: '/articles/fractional-shares-explained' }, { label: 'NYSE, NASDAQ and the US indices', to: '/articles/nyse-nasdaq-and-us-indices-explained' }],
    num: 4,
    title: 'Trading US Stocks & ETFs',
    items: [
      {
        id: 'tr-1',
        q: 'What can I invest in on Platizio Global?',
        a: 'Platizio offers US-listed stocks and ETFs. You can build a diversified portfolio across US companies and funds. We do not currently offer mutual funds, bonds, derivatives, or stocks listed on non-US exchanges.',
      },
      {
        id: 'tr-2',
        q: 'Can I trade derivatives, futures, or options?',
        a: 'No. Under RBI / FEMA rules, the LRS does not permit margin trading or speculative instruments such as futures, options, or other derivatives. Your US account is a cash account, not a derivatives and margin account.',
      },
      {
        id: 'tr-3',
        q: 'Can I do intraday trading? Will I get margins?',
        a: 'Your account is a cash account, so no margin is provided. The LRS is intended for genuine investment rather than speculative trading. You can buy and sell on the same day to the extent of the settled cash (buying power) available in your account, but active intraday trading is not recommended and margin-based intraday trading is not available.',
      },
      {
        id: 'tr-4',
        q: 'What is fractional investing, and can I buy fractions of a share?',
        a: 'Yes. You can buy fractional shares, which lets you invest a fixed rupee/dollar amount even in high-priced stocks. For example, if one share trades at USD 1,000 and you invest USD 100, you receive 0.1 of a share.',
      },
      {
        id: 'tr-5',
        q: 'Am I entitled to dividends if I own fractional shares?',
        a: 'Yes. You receive dividends in proportion to your holding. If a stock pays a USD 10 per-share dividend and you own 0.5 shares, you receive USD 5 (less applicable US withholding tax). Very small amounts below one cent may not be credited.',
      },
      {
        id: 'tr-6',
        q: 'What types of orders can I place?',
        a: (
          <span>
            <strong>Market order:</strong> buys or sells immediately at the best available current price.
            <br /><br />
            <strong>Limit order:</strong> buys or sells only at your chosen price or better. A limit order is not guaranteed to execute and is generally valid for up to 90 days (good till cancelled).
            <br /><br />
            <strong>Stop order:</strong> becomes a market order once the stock reaches a price you set (the stop price). Also valid for up to 90 days.
            <br /><br />
            <em>Note: Limit and stop orders can typically be placed on whole shares only, not fractional shares.</em>
          </span>
        ),
      },
      {
        id: 'tr-7',
        q: 'Can I cancel a pending order?',
        a: 'Yes, you can cancel an order while it is still pending. Once a market order begins executing after the market opens, it can no longer be cancelled.',
      },
      {
        id: 'tr-8',
        q: 'Do I receive interest on idle cash?',
        a: 'No interest is currently paid on idle cash, as IFSC regulations do not permit it at this time.',
      },
      {
        id: 'tr-9',
        q: 'Will I get a share certificate when I buy shares?',
        a: 'No. Physical share certificates are not issued in the US market. Your ownership is recorded electronically in your brokerage account, and a trade confirmation is available the next business day.',
      },
      {
        id: 'tr-10',
        q: 'Can I invest in US IPOs?',
        a: 'Direct subscription to US IPOs is generally not available to retail investors. In most cases, you can buy a company\'s shares once they begin trading after the IPO.',
      },
    ],
  },
  {
    id: 'withdrawals',
    readMore: [{ label: 'How to withdraw money back to India', to: '/articles/how-to-withdraw-money-from-us-stocks-to-india' }],
    num: 5,
    title: 'Withdrawals',
    items: [
      {
        id: 'wd-1',
        q: 'How do I withdraw money?',
        a: 'After you sell securities, the proceeds need to settle (typically T+1, i.e. one business day after the trade). Once the cash is settled, you can place a withdrawal request from the platform by entering the amount and your bank details. The bank account must be in your own name.',
      },
      {
        id: 'wd-2',
        q: 'When can I withdraw money after selling my holdings?',
        a: 'The sale proceeds appear in your cash balance immediately, but settlement takes one business day (T+1). After the cash settles, you can request a withdrawal, and the funds typically reach your bank account within 1–3 business days after the broker processes the request.',
      },
      {
        id: 'wd-3',
        q: 'What is "unsettled cash" and how is it different from buying power?',
        a: 'Unsettled cash is money from a sale that has not yet completed its one-business-day settlement period. Buying power is the cash available to trade. In a normal cash account, buying power can include both settled and unsettled cash for placing new buy orders, but you can only withdraw cash once it has settled.',
      },
      {
        id: 'wd-4',
        q: 'Will I receive my money in INR or USD?',
        a: 'You can usually choose to withdraw in INR (credited to your Indian bank account) or in USD. If your bank only accepts INR, the funds are converted by your bank, which may apply a forex mark-up and other applicable charges.',
      },
      {
        id: 'wd-5',
        q: 'Are there any withdrawal charges?',
        a: 'No, there are no withdrawal charges.',
      },
      {
        id: 'wd-6',
        q: 'Can I withdraw to a bank account different from the one I used to deposit?',
        a: 'Yes, as long as the destination bank account is in your own name. It need not be the same account you used to fund the platform. Withdrawals to third-party accounts are not permitted.',
      },
      {
        id: 'wd-7',
        q: 'Why have my withdrawal funds not reached my bank yet?',
        a: <span>It usually takes 1–3 business days after the broker processes the withdrawal. If funds have not arrived after 3 business days, first check with your bank in case they are holding the transfer pending confirmation. If your bank cannot trace the funds, email us at <a href="mailto:supportglobal@platizio.com">supportglobal@platizio.com</a> or call us at <a href="tel:+919289837100">+91 92898 37100</a> and we can help with the issue.</span>,
      },
    ],
  },
  {
    id: 'portfolio-reports',
    num: 6,
    title: 'Portfolio, Statements & Reports',
    items: [
      {
        id: 'pr-1',
        q: 'What is the difference between realised and unrealised profit/loss?',
        a: <span><strong>Realised profit/loss</strong> is the actual gain or loss once you sell a holding. <strong>Unrealised profit/loss</strong> is the gain or loss on a holding you still own, based on its current market price. It becomes realised only when you sell.</span>,
      },
      {
        id: 'pr-2',
        q: 'What is the cost basis?',
        a: 'Cost basis is the original amount you paid to buy a security, including commissions. When you sell, gains or losses are calculated against this cost basis. Indian tax rules require the First-In-First-Out (FIFO) method, meaning the shares you bought first are treated as sold first.',
      },
      {
        id: 'pr-3',
        q: 'Are shares sold using FIFO or LIFO?',
        a: 'Shares are sold on a First-In-First-Out (FIFO) basis, as required by the Indian tax code. Choosing specific lots to sell first is not available for Indian tax residents.',
      },
      {
        id: 'pr-4',
        q: 'Which exchange rate is used to show my returns in INR?',
        a: 'RBI reference rates are used to convert USD returns into INR, in line with Income Tax Department guidance.',
      },
      {
        id: 'pr-5',
        q: 'Where can I see my statements and trade confirmations?',
        a: 'Account statements, trade confirmations, and transaction history are available within the platform. Monthly account statements and daily trade confirmations are generated by the broker and can be downloaded for your records and tax filing.',
      },
      {
        id: 'pr-6',
        q: 'Can I download a Profit & Loss report?',
        a: 'Yes. You can generate realised and unrealised Profit & Loss reports for any period, including the previous financial year, and download them for your records or to support advance-tax calculations. We recommend having tax reports reviewed by your CA or tax advisor.',
      },
    ],
  },
  {
    id: 'transfers',
    num: 7,
    title: 'Transferring Securities In & Out',
    items: [
      {
        id: 'tf-1',
        q: 'Can I move my existing US holdings from another broker to Platizio?',
        a: 'Yes. Transfers use ACAT or DTC transfer mechanisms. With ACAT the client may have to pay a fee to their existing broker to move securities and cash. With DTC it is free, but only securities move — cash would need to be withdrawn separately before transfer.',
      },
      {
        id: 'tf-2',
        q: 'What transfer methods are used?',
        a: <span>US transfers use one of three standard systems: <strong>ACATS</strong> (the standard account-transfer service), <strong>DTC</strong>, and <strong>DRS</strong>. The correct method is determined automatically based on your source broker and the type of assets being transferred — you do not need to choose it yourself.</span>,
      },
      {
        id: 'tf-3',
        q: 'How long does an incoming transfer take, and are there charges?',
        a: <span>Most transfers complete within a few business days, though timelines depend on your source broker. Platizio does not charge a fee for incoming transfers, but <strong>your existing broker may charge a transfer or exit fee</strong>. Fractional shares generally cannot be transferred — only whole shares.</span>,
      },
      {
        id: 'tf-4',
        q: 'Will my cost basis and holding period carry over?',
        a: 'Cost basis is often not transferred automatically with the securities, so you may need to enter it manually after the transfer. Your holding period continues from your original purchase date and does not reset because of the transfer.',
      },
      {
        id: 'tf-5',
        q: 'Can I transfer my holdings out of Platizio to another broker?',
        a: 'Yes. The receiving broker initiates the transfer using the same standard US mechanisms. Note that exit/transfer charges may apply, and fractional shares cannot be transferred.',
      },
      {
        id: 'tf-6',
        q: 'Can I transfer money or shares between two Platizio accounts?',
        a: 'No. Since a PAN can be used for only one account, holding two Platizio accounts is not possible.',
      },
    ],
  },
  {
    id: 'esops-rsus',
    readMore: [{ label: 'RSU taxation explained', to: '/articles/rsu-taxation' }, { label: 'Schedule FA and foreign asset reporting', to: '/articles/schedule-fa-foreign-assets-reporting' }],
    num: 8,
    title: 'ESOPs, RSUs & ESPPs',
    items: [
      {
        id: 'er-1',
        q: 'I hold US-company ESOPs/RSUs. Can I move those funds or shares to Platizio?',
        a: 'Yes. Shares received under employee benefit schemes (ESOPs/RSUs) in US-listed companies are treated as Overseas Portfolio Investments under Indian regulations (where they are below 10% of the company\'s equity, which is usually the case). You can transfer such vested shares, or reinvest the proceeds of their sale, into other US-listed stocks or ETFs.',
      },
      {
        id: 'er-2',
        q: 'Is there a time limit to reinvest proceeds from selling ESOPs/RSUs?',
        a: 'Yes. Under the LRS rules for Overseas Portfolio Investments, proceeds from the sale of such shares should be reinvested in other listed securities within 180 days of the sale.',
      },
      {
        id: 'er-3',
        q: 'What are the tax implications of ESOP/RSU transfers?',
        a: 'When you sell ESOP/RSU shares, capital gains tax applies based on your holding period (long-term or short-term). Simply transferring shares (without selling) is not a taxable event. We recommend keeping records from your previous platform and consulting your CA.',
      },
    ],
  },
  {
    id: 'taxation',
    readMore: [{ label: 'Tax on US stocks in India', to: '/articles/tax-on-us-stocks-in-india' }, { label: 'Dividend tax on US stocks', to: '/articles/dividend-tax-us-stocks-india' }, { label: 'DTAA and foreign tax credit', to: '/articles/dtaa-india-us-foreign-tax-credit' }, { label: 'How to report US stocks in your ITR', to: '/articles/how-to-report-us-stocks-in-itr' }, { label: 'US estate tax for Indian investors', to: '/articles/us-estate-tax-indian-investors' }],
    num: 9,
    title: 'Taxation (for Indian Residents)',
    note: (
      <p className="faq-note">
        <strong>Note:</strong> This section explains how Indian tax rules generally apply to US investments. It is for information only and is not tax advice. Tax rules can change — please consult a qualified Chartered Accountant or tax advisor for your specific situation.
      </p>
    ),
    items: [
      {
        id: 'tx-1',
        q: 'How are my capital gains from US stocks taxed in India?',
        a: (
          <span>
            <strong>Long-Term Capital Gains (LTCG):</strong> If you hold a US stock or ETF for more than 24 months, the gain is taxed at a flat 12.5% (plus applicable surcharge and cess), without indexation.
            <br /><br />
            <strong>Short-Term Capital Gains (STCG):</strong> If you hold for 24 months or less, the gain is added to your total income and taxed at your applicable income-tax slab rate.
            <br /><br />
            There is no capital gains tax in the US for Indian (non-resident) investors — capital gains are taxed only in India.
          </span>
        ),
      },
      {
        id: 'tx-2',
        q: 'How are dividends from US stocks taxed?',
        a: 'Dividends are taxed in the US at a flat 25% withholding rate under the India-US tax treaty (DTAA), provided the relevant declaration (Form W-8BEN) is on file. The US company withholds this tax before paying you the balance. In India, the gross dividend is added to your income and taxed at your slab rate, but you can claim the 25% already paid in the US as a Foreign Tax Credit under the DTAA, so you are not taxed twice.',
      },
      {
        id: 'tx-3',
        q: 'What is the DTAA and how does it help me?',
        a: 'The India-US Double Taxation Avoidance Agreement (DTAA) ensures you are not taxed twice on the same income. Tax paid in the US (for example, dividend withholding) can be claimed as a Foreign Tax Credit against your Indian tax liability.',
      },
      {
        id: 'tx-4',
        q: 'Which documents do I need to file taxes in India for my US investments?',
        a: 'The key items are: a capital-gains summary, Schedule FA (Foreign Assets), Schedule FSI (Foreign Source Income), Schedule TR (Tax Relief), and Form 67 (to claim foreign tax credit). Platizio provides the supporting statements you need at the end of the financial year.',
      },
      {
        id: 'tx-5',
        q: 'Why is Schedule FA reported on a calendar-year (January–December) basis?',
        a: 'Schedule FA is reported using the accounting year of the country where the asset is held. For US stocks and ETFs, that is the calendar year (January to December), which is why Schedule FA does not follow the Indian April–March financial year.',
      },
      {
        id: 'tx-6',
        q: 'Do I have to pay any tax in the US?',
        a: 'You do not pay US tax on your capital gains. You do pay US withholding tax on dividends (25% under the DTAA), which you can then claim as a credit in India. All capital-gains tax is payable in India.',
      },
      {
        id: 'tx-7',
        q: 'Is there tax on rupee depreciation when I convert gains from USD to INR?',
        a: 'There is no separate tax on currency movement. Both the purchase and sale values are converted to INR using the prescribed RBI/SBI reference rates, and capital gains are computed in INR. The currency effect is therefore already built into the gain.',
      },
    ],
  },
  {
    id: 'managing-account',
    num: 10,
    title: 'Managing Your Account',
    items: [
      {
        id: 'ma-1',
        q: 'How do I update my email address, mobile number, or login method?',
        a: 'You can update your login email and mobile number from the Profile / Login & Security section of the platform. Changes are confirmed using an OTP for your security.',
      },
      {
        id: 'ma-2',
        q: 'How do I update my address or other details after they change on my government ID?',
        a: <span>Email us a copy of your updated government ID showing the changed details at <a href="mailto:supportglobal@platizio.com">supportglobal@platizio.com</a> and we will update your account.</span>,
      },
      {
        id: 'ma-3',
        q: 'How do I add a nominee or beneficiary?',
        a: 'You can add one or more beneficiaries from the Profile / Manage Beneficiaries section of the platform.',
      },
      {
        id: 'ma-4',
        q: 'How do I reset my password?',
        a: 'On the login page, select "Forgot Password", enter your registered email, and follow the link or OTP sent to you to set a new password.',
      },
      {
        id: 'ma-5',
        q: 'How do I close my Platizio Global Trading Account?',
        a: (
          <span>
            You can close your Platizio Global trading account by sending us an email request from your registered email address to <a href="mailto:supportglobal@platizio.com">supportglobal@platizio.com</a>. The closure process takes 2 working days once you submit your request.
            <br /><br />
            Before closing your account, please ensure you have:
            <ul>
              <li>Cleared any negative balance in your account</li>
              <li>Sold off any holdings in the account</li>
              <li>Withdrawn any cash balance from the account</li>
              <li>Downloaded all necessary reports (trade confirms, ledger, and P&amp;L statements), as these will not be accessible once your account is closed</li>
              <li>If you wish to move securities to another broker, transferred your shares and cash prior to requesting account closure</li>
            </ul>
            <strong>Please note:</strong> Upon submission of an account closure request, the client irrevocably agrees that any residual amounts — including but not limited to dividends, corporate action proceeds, or any other entitlements arising from prior holdings and received post-closure — shall not be credited to the client's account. The client acknowledges and accepts that such amounts may be forfeited, and that no claims shall lie against the Company in respect of the same.
          </span>
        ),
      },
      {
        id: 'ma-6',
        q: 'How do I request deletion of my personal data?',
        a: <span>Deleting your personal data requires closing your account. Contact <a href="mailto:supportglobal@platizio.com">supportglobal@platizio.com</a> to begin. After closure, your data is deleted except where it must be retained for regulatory and tax compliance for the legally required period.</span>,
      },
    ],
  },
  {
    id: 'support',
    num: 11,
    title: 'Support',
    items: [
      {
        id: 'sp-1',
        q: 'How do I contact Platizio Global for support?',
        a: <span>You can reach us by email at <a href="mailto:supportglobal@platizio.com">supportglobal@platizio.com</a> or call / WhatsApp at <a href="tel:+919289837100">+91 92898 37100</a>. We will respond within 24 hours on business days and your query shall be resolved within 1-5 days.</span>,
      },
      {
        id: 'sp-2',
        q: 'Can I contact the broker (ViewTrade) directly?',
        a: 'Please route all queries through Platizio support. We coordinate with our broker partner on your behalf for any account or transaction matter.',
      },
      {
        id: 'sp-3',
        q: 'Are downloadable statements available?',
        a: 'Yes. Account statements, trade confirmations, and transaction reports can be downloaded from the platform in PDF or Excel formats.',
      },
    ],
  },
]

/**
 * Flattens a React node tree to plain text.
 *
 * Derived from `FAQ_SECTIONS` rather than hand-copied. A previous version listed
 * 15 questions as literal strings while the page rendered 71, and every edit to
 * an answer silently desynced the two. Answers are React.ReactNode, so plain
 * text is extracted from the node tree — link text and <strong> runs included.
 */
export const nodeToText = (node: React.ReactNode): string => {
  if (node === null || node === undefined || typeof node === 'boolean') return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(nodeToText).join('')
  if (isValidElement(node)) {
    return nodeToText((node.props as { children?: React.ReactNode }).children)
  }
  return ''
}

/** Question/answer pairs as plain text. Feeds FAQPage JSON-LD and the corpus extractor. */
export const ALL_FAQS = FAQ_SECTIONS.flatMap(({ id: sectionId, items }) =>
  items.map(({ id, q, a }) => ({ id, sectionId, q, a: nodeToText(a).replace(/\s+/g, ' ').trim() }))
)

export interface FaqAnswer extends FaqItem {
  /** Section this answer lives in — also the /faqs anchor the assistant cites. */
  sectionId: string
  sectionTitle: string
}

/**
 * Answers keyed by item id, so a decision-tree leaf can render its answer.
 *
 * The tree stores only these ids, never answer text. One consequence worth
 * keeping: editing an answer here changes it everywhere at once, and there is no
 * second copy in the tree to forget about.
 */
export const FAQ_BY_ID = new Map<string, FaqAnswer>(
  FAQ_SECTIONS.flatMap((section) =>
    section.items.map((item): [string, FaqAnswer] => [
      item.id,
      { ...item, sectionId: section.id, sectionTitle: section.title },
    ])
  )
)

/**
 * The questions support is asked most often, surfaced at the top of /faqs so a
 * visitor does not have to guess which of the eleven sections holds them.
 *
 * Ids, not copies: the answer text lives once, in FAQ_SECTIONS above.
 */
export const FEATURED_FAQ_IDS = ['gs-5', 'fa-1', 'ma-4', 'ma-1', 'sp-1', 'ma-5'] as const

export const FEATURED_FAQS: FaqAnswer[] = FEATURED_FAQ_IDS.flatMap((id) => {
  const faq = FAQ_BY_ID.get(id)
  // A featured id that no longer resolves means an item was renamed or removed;
  // drop it rather than render an empty accordion row.
  return faq ? [faq] : []
})
