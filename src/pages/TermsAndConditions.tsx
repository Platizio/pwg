import { Link } from 'react-router-dom'
import SEO, { breadcrumbSchema } from '../components/SEO'

export default function TermsAndConditions() {
  return (
    <>
      <SEO
        title="Terms & Conditions"
        description="Terms & Conditions for Platizio Global's international investing offering — US Stocks and ETFs for Indian investors via ViewTrade IFSC."
        canonical="/terms"
        jsonLd={breadcrumbSchema([['Home', '/'], ['Terms & Conditions', '/terms']])}
      />
      {/* ===== PAGE HERO ===== */}
      <section className="page-hero">
        <div className="container">
          <div className="breadcrumb">
            <Link to="/">Home</Link><span className="crumb-sep" aria-hidden="true">/</span><span>Terms &amp; Conditions</span>
          </div>
          <h1>Terms &amp; Conditions</h1>
          <p>International Investing Offering — Platizio Global</p>
          <div className="page-hero-meta">
            Effective Date: 11 May 2026
          </div>
        </div>
      </section>

      {/* ===== CONTENT ===== */}
      <section className="section">
        <div className="container legal-doc">

          {/* Entity meta */}
          <div className="legal-meta reveal">
            <div className="legal-meta-item">
              <dt>Legal Entity</dt>
              <dd>Platizio Services LLP</dd>
            </div>
            <div className="legal-meta-item">
              <dt>LLPIN</dt>
              <dd>AAQ-9558</dd>
            </div>
            <div className="legal-meta-item">
              <dt>Registered Office</dt>
              <dd>Unit No. DGL-229, Second Floor, DLF Galleria Mall, Mayur Vihar-1, Delhi, India – 110092</dd>
            </div>
            <div className="legal-meta-item">
              <dt>Website</dt>
              <dd><a href="https://www.platizio.com" target="_blank" rel="noopener noreferrer">https://www.platizio.com</a></dd>
            </div>
            <div className="legal-meta-item">
              <dt>Support Email</dt>
              <dd><a href="mailto:supportglobal@platizio.com">supportglobal@platizio.com</a></dd>
            </div>
            <div className="legal-meta-item">
              <dt>Business Hours</dt>
              <dd>Monday to Friday, 9:00 AM to 5:00 PM India Standard Time</dd>
            </div>
          </div>

          {/* Preamble note */}
          <div className="legal-note reveal">
            This document is intended to be used as the investor-facing legal document for Platizio Global's international investing offering. It should be read together with ViewTrade's applicable customer agreements, disclosures, account opening documents and charges, where applicable.
          </div>

          {/* Table of Contents */}
          <div className="legal-toc reveal">
            <h2>Contents</h2>
            <ol>
              <li><a href="#tc-1">Introduction, Scope and Acceptance</a></li>
              <li><a href="#tc-2">Definitions</a></li>
              <li><a href="#tc-3">Nature of Platizio Global and Role of the Parties</a></li>
              <li><a href="#tc-4">No Investment Advice or Recommendation</a></li>
              <li><a href="#tc-5">Eligibility</a></li>
              <li><a href="#tc-6">Account Opening, KYC, Declarations and Verification</a></li>
              <li><a href="#tc-7">Products Offered Through the Platform</a></li>
              <li><a href="#tc-8">Liberalised Remittance Scheme, FEMA and Funding</a></li>
              <li><a href="#tc-9">Fees, Charges, Taxes and Remuneration</a></li>
              <li><a href="#tc-10">Orders, Execution, Settlement and Statements</a></li>
              <li><a href="#tc-11">Custody, Ownership and Investor Protection</a></li>
              <li><a href="#tc-12">Dividends, Taxes and Reporting</a></li>
              <li><a href="#tc-13">Risk Disclosures</a></li>
              <li><a href="#tc-14">Platform Access, Security and User Responsibilities</a></li>
              <li><a href="#tc-15">Technology, Availability and Third-Party Services</a></li>
              <li><a href="#tc-16">Communications and Electronic Records</a></li>
              <li><a href="#tc-17">Privacy and Data Protection</a></li>
              <li><a href="#tc-18">Suspension, Restriction and Termination</a></li>
              <li><a href="#tc-19">Intellectual Property</a></li>
              <li><a href="#tc-20">Indemnity</a></li>
              <li><a href="#tc-21">Limitation of Liability</a></li>
              <li><a href="#tc-22">Force Majeure</a></li>
              <li><a href="#tc-23">Governing Law, Jurisdiction and Dispute Resolution</a></li>
              <li><a href="#tc-24">Changes to these Terms</a></li>
              <li><a href="#tc-25">Contact and Grievance Redressal</a></li>
              <li><a href="#tc-26">Miscellaneous</a></li>
            </ol>
          </div>

          {/* ---- Sections ---- */}

          <div className="legal-section reveal" id="tc-1">
            <h2><span className="legal-num">1</span>Introduction, Scope and Acceptance</h2>
            <p>These Terms and Conditions ("Terms") govern the use of Platizio Global, an international investing offering operated under the umbrella of Platizio Services LLP, a limited liability partnership incorporated on 05 December 2019 with LLPIN AAQ-9558 and registered with the Registrar of Companies, Delhi.</p>
            <p>Platizio Global is intended to facilitate access to international investment products through a white-labelled platform arrangement with ViewTrade. By registering, accessing, browsing, clicking "I Agree", submitting any information, or using any feature of the platform, you agree to be bound by these Terms, the Privacy Policy, the applicable risk disclosures, the applicable fee schedule, and any terms separately provided by ViewTrade or any other regulated service provider.</p>
            <p>If you do not agree with these Terms, you must not use the platform. These Terms are an electronic record under the Information Technology Act, 2000 and do not require any physical, electronic or digital signature.</p>
          </div>

          <div className="legal-section reveal" id="tc-2">
            <h2><span className="legal-num">2</span>Definitions</h2>
            <p>In these Terms, unless the context otherwise requires, the following terms shall have the meanings set out below.</p>
            <p><strong>"Account"</strong> means the international brokerage or investment account opened, maintained, operated, processed, executed, cleared, settled or serviced by ViewTrade or its affiliates or service providers.</p>
            <p><strong>"Company", "Platizio", "we", "our" or "us"</strong> means Platizio Services LLP, operating the Platizio Global offering.</p>
            <p><strong>"Investor", "User", "you" or "your"</strong> means any person who accesses, registers for, or uses the platform.</p>
            <p><strong>"Platform"</strong> means the website, mobile application, white-labelled interface, digital journey, customer support channels and related technology made available under the Platizio Global brand.</p>
            <p><strong>"ViewTrade"</strong> means ViewTrade International IFSC Private Limited and/or any other ViewTrade entity, affiliate, broker, clearing broker, custodian, technology provider or regulated service provider designated by ViewTrade for providing the underlying international investing services.</p>
            <p><strong>"Services"</strong> means facilitation of account opening, KYC, onboarding, international investing access, order routing interface, portfolio viewing, transaction display, funding and withdrawal assistance, statements, reporting, support and related services made available through the platform.</p>
            <p><strong>"LRS"</strong> means the Liberalised Remittance Scheme prescribed by the Reserve Bank of India, as amended from time to time.</p>
            <p><strong>"Applicable Law"</strong> means all applicable laws, statutes, rules, regulations, circulars, guidelines, directions, orders and regulatory requirements issued by any competent authority, including laws applicable in India, IFSC/GIFT City, the United States and any other relevant jurisdiction.</p>
          </div>

          <div className="legal-section reveal" id="tc-3">
            <h2><span className="legal-num">3</span>Nature of Platizio Global and Role of the Parties</h2>
            <p>Platizio Global is a white-labelled and partner-enabled international investing offering. Platizio provides the customer-facing brand, digital interface, onboarding support, investor communication support and customer assistance. Platizio does not itself act as the broker, broker-dealer, custodian, clearing broker, investment adviser, research analyst, portfolio manager, bank, authorised dealer, remittance provider, stock exchange, depository or tax adviser.</p>
            <p>The underlying international brokerage, account approval, KYC/AML verification, trade execution, custody, clearing, settlement, statements, confirmations, transaction records, corporate actions, remittance processing support and related regulated activities are handled by ViewTrade or its appointed affiliates, brokers, clearing brokers, custodians, banks, payment partners and other service providers.</p>
            <p>ViewTrade has full control over the investment products that may be made available on the platform, the eligibility criteria, order acceptance or rejection, execution venues, clearing and custody arrangements, statements, charges, restrictions, compliance checks, service availability and account approval decisions. Platizio does not control or guarantee any product availability, account approval, order execution, settlement or withdrawal outcome.</p>
            <p>You may be required to accept ViewTrade customer agreements, risk disclosures, account forms, declarations, KYC documents, tax forms, remittance declarations and other documentation. In relation to brokerage, custody, execution, settlement, account statements, ViewTrade charges, investor protection, and product-specific matters, ViewTrade documents shall govern in addition to these Terms. Where there is a direct conflict on such matters, the applicable ViewTrade document shall prevail to the extent of the conflict.</p>
          </div>

          <div className="legal-section reveal" id="tc-4">
            <h2><span className="legal-num">4</span>No Investment Advice or Recommendation</h2>
            <p>Platizio does not provide any investment advice, personalised recommendation, research report, portfolio management, suitability assessment, tax advice, legal advice, accounting advice or solicitation to buy, sell, hold or otherwise deal in any security or financial product.</p>
            <p>All information, content, market data, screeners, charts, articles, alerts, watchlists, portfolio views, educational materials, tools or communications provided on or through the platform are for general informational and educational purposes only. They should not be treated as a recommendation, advice, solicitation, guarantee or assurance of any return.</p>
            <p>All orders placed by you are placed at your own discretion and on an unsolicited basis. You are solely responsible for evaluating the suitability, risk, tax consequences and legal implications of every investment decision. You should consult your own financial, legal and tax advisers before investing.</p>
          </div>

          <div className="legal-section reveal" id="tc-5">
            <h2><span className="legal-num">5</span>Eligibility</h2>
            <p>You may use the platform only if you are legally capable of entering into binding contracts, are at least 18 years of age, are not prohibited under Applicable Law from using the services, and satisfy all eligibility requirements prescribed by Platizio, ViewTrade, banks, regulators and service providers.</p>
            <p>The offering is primarily intended for persons who are permitted to invest in international securities under Applicable Law, including resident Indian individuals using permissible remittance routes, and such other categories of users as may be accepted by ViewTrade. Non-resident Indians, overseas citizens of India, entities, trusts, family offices, corporates or other categories may be allowed only if permitted by Applicable Law and approved by ViewTrade.</p>
            <p>The platform is not intended for minors, persons who are subject to sanctions, persons located in restricted jurisdictions, persons prohibited under anti-money laundering laws, or any person whose onboarding is rejected by ViewTrade. Platizio and ViewTrade reserve the right to refuse, suspend or terminate access without assigning reasons where required for compliance, risk management or legal reasons.</p>
          </div>

          <div className="legal-section reveal" id="tc-6">
            <h2><span className="legal-num">6</span>Account Opening, KYC, Declarations and Verification</h2>
            <p>To use the services, you must complete the onboarding process and provide all requested information and documents. This may include PAN, identity proof, address proof, photograph, selfie or liveness check, bank account details, tax residency information, FATCA/CRS declarations, W-8BEN or equivalent tax forms, source of funds declaration, LRS declaration, signature, nominee information and any other information required by Platizio, ViewTrade, banks or regulators.</p>
            <p>You represent that all information provided by you is true, accurate, complete and up to date. You must promptly update any change in your personal, contact, bank, tax residency, citizenship, KYC, FATCA/CRS, beneficial ownership, source of funds or regulatory status.</p>
            <p>Account approval is subject to successful completion of KYC, AML, sanctions screening, tax documentation, ViewTrade approval, bank verification and all other applicable compliance checks. Platizio does not guarantee account approval and shall not be liable for rejection, delay, suspension or closure of your account by ViewTrade or any service provider.</p>
            <p>You authorise Platizio to collect and share your information with ViewTrade, banks, KYC vendors, regulators, auditors, technology vendors and other service providers for onboarding, KYC/AML checks, account opening, transaction processing, monitoring, record keeping and compliance purposes.</p>
          </div>

          <div className="legal-section reveal" id="tc-7">
            <h2><span className="legal-num">7</span>Products Offered Through the Platform</h2>
            <p>Products made available through the platform are offered and controlled by ViewTrade. Such products may include U.S.-listed stocks, exchange-traded funds, fractional shares and other international financial products permitted by ViewTrade and Applicable Law. Product availability may change at any time without prior notice.</p>
            <p>Platizio does not manufacture, issue, sponsor, underwrite, manage, recommend, guarantee or control any security, ETF or financial product displayed on the platform. Product names, logos, issuer names and trademarks belong to their respective owners.</p>
            <p>Unless expressly enabled by ViewTrade and permitted by Applicable Law, the platform does not offer margin trading, short selling, options, futures, swaps, contracts for difference, crypto-assets, crypto-linked instruments, commodities, securities lending, leveraged borrowing or any other product that is restricted or not supported under the applicable ViewTrade arrangement.</p>
          </div>

          <div className="legal-section reveal" id="tc-8">
            <h2><span className="legal-num">8</span>Liberalised Remittance Scheme, FEMA and Funding</h2>
            <p>If you are a person resident in India, any remittance for international investing may be subject to the Liberalised Remittance Scheme, the Foreign Exchange Management Act, 1999, RBI directions, authorised dealer bank requirements, tax collected at source rules and other applicable foreign exchange regulations.</p>
            <p>Resident Indian investors are solely responsible for ensuring that all remittances are within the prescribed LRS limit, are made for permitted purposes, are made from their own bank account, and are properly declared to the authorised dealer bank. Platizio does not monitor your aggregate annual LRS utilisation across banks or platforms.</p>
            <p>You must complete all bank, LRS, Form A2, source of funds, tax and remittance declarations required by the bank, ViewTrade or Applicable Law. You must not use the platform to circumvent LRS limits, route third-party funds, make prohibited remittances, evade taxes or violate foreign exchange laws.</p>
            <p>Funding and withdrawal flows will be handled through banking channels, ViewTrade-designated accounts, IFSC banking channels, authorised dealer banks, payment partners or other channels prescribed by ViewTrade. Platizio does not hold, pool, control or custody client funds.</p>
          </div>

          <div className="legal-section reveal" id="tc-9">
            <h2><span className="legal-num">9</span>Fees, Charges, Taxes and Remuneration</h2>
            <p>You are responsible for all fees, charges, taxes and expenses associated with use of the platform and ViewTrade services. These may include brokerage, account opening charges, account maintenance charges, custody charges, exchange fees, regulatory fees, bank remittance charges, foreign exchange conversion charges, withdrawal charges, payment processing charges, platform charges, technology charges, tax collected at source, GST, U.S. withholding tax, and any other applicable charges.</p>
            <p>The exact fees and charges applicable to your account will be disclosed in the platform, the ViewTrade schedule of charges, transaction flow, account opening documents, statements or other disclosures made available from time to time. You should review all fees before placing any order or initiating any remittance.</p>
            <p>Platizio may receive referral fees, platform fees, service fees, revenue share, commission, technology fees, or other consideration from ViewTrade or other service providers in connection with the services. Unless separately disclosed as a direct charge to you, such remuneration may be retained by Platizio.</p>
            <p>All fees are subject to change. Past fee displays, screenshots, marketing materials or estimates may not reflect the final charge applied to your transaction. Taxes are your responsibility. Platizio does not provide tax advice.</p>
          </div>

          <div className="legal-section reveal" id="tc-10">
            <h2><span className="legal-num">10</span>Orders, Execution, Settlement and Statements</h2>
            <p>Orders entered through the platform are transmitted to ViewTrade or its designated systems for acceptance, routing and execution. Platizio does not execute orders. ViewTrade may accept, reject, delay, cancel, modify, restrict or refuse any order based on account status, market conditions, compliance checks, insufficient funds, trading restrictions, regulatory requirements, system availability or other reasons.</p>
            <p>The price at which an order is executed may differ from the price displayed on the platform due to market movement, liquidity, delays, exchange conditions, execution venue practices, foreign exchange conversion and other factors. No execution price, order fill, execution time or return is guaranteed.</p>
            <p>Settlement timelines, trade confirmations, holdings statements, account statements, tax documents and other records will be provided by ViewTrade or its appointed service providers. You must promptly review all confirmations and statements and report discrepancies to the support channel within the time period specified by ViewTrade or Applicable Law.</p>
            <p>Corporate actions, dividends, splits, mergers, tender offers, voting rights, rights issues, spin-offs, fractional share adjustments and other issuer actions will be handled according to ViewTrade and custodian policies. Certain corporate actions or shareholder rights may not be available, especially for fractional holdings or omnibus structures.</p>
          </div>

          <div className="legal-section reveal" id="tc-11">
            <h2><span className="legal-num">11</span>Custody, Ownership and Investor Protection</h2>
            <p>Cash and securities are held, cleared, settled and recorded by ViewTrade or its appointed brokers, clearing brokers, custodians, depositories or banks. Platizio does not hold securities or client money and does not provide custody services.</p>
            <p>Your legal and beneficial ownership rights, account structure, omnibus or individual account treatment, fractional share treatment, transferability and investor protection will be governed by ViewTrade and custodian documentation. Where investor protection coverage is available through a foreign broker, clearing broker or custodian, such coverage is subject to that provider's terms and exclusions.</p>
            <p>Investor protection arrangements, if any, do not protect against market losses, decline in value of securities, foreign exchange losses, tax losses, liquidity losses or losses caused by your own investment decisions. You should carefully read all ViewTrade and custodian disclosures before investing.</p>
          </div>

          <div className="legal-section reveal" id="tc-12">
            <h2><span className="legal-num">12</span>Dividends, Taxes and Reporting</h2>
            <p>Dividends, interest, corporate action proceeds and sale proceeds may be subject to tax withholding in the relevant foreign jurisdiction and tax reporting in India or any other country of which you are a tax resident. U.S. dividends may be subject to U.S. withholding tax, depending on your tax documentation and applicable treaty provisions.</p>
            <p>You are solely responsible for filing income tax returns, reporting foreign assets, claiming foreign tax credits, maintaining records, complying with Schedule FA or other reporting requirements, and obtaining independent tax advice. Platizio does not provide tax computation, tax filing, tax optimisation, estate tax advice or legal advice.</p>
            <p>The value of your investments may be affected by changes in Indian tax law, U.S. tax law, estate tax rules, withholding tax rates, treaty benefits, foreign exchange rules and reporting requirements.</p>
          </div>

          <div className="legal-section reveal" id="tc-13">
            <h2><span className="legal-num">13</span>Risk Disclosures</h2>
            <p>International investing involves significant risks. You acknowledge and accept that you may lose part or all of your invested capital. No returns are guaranteed by Platizio, ViewTrade or any service provider.</p>
            <p>Key risks include market risk, liquidity risk, currency risk, country risk, regulatory risk, taxation risk, remittance risk, custodian risk, settlement risk, fractional share risk, corporate action risk, technology risk, cybersecurity risk, third-party service provider risk, force majeure risk and risk arising from changes in Indian, IFSC, U.S. or other foreign laws.</p>
            <p>Currency movements between INR and USD can materially affect your returns. Even if a security gains value in U.S. dollars, your INR return may be lower or negative due to exchange rate changes, conversion spreads, bank charges and taxes.</p>
            <p>Foreign markets may have different trading hours, settlement cycles, investor protection mechanisms, disclosure practices, corporate governance standards and tax rules. You must understand these differences before investing.</p>
          </div>

          <div className="legal-section reveal" id="tc-14">
            <h2><span className="legal-num">14</span>Platform Access, Security and User Responsibilities</h2>
            <p>You are responsible for maintaining the confidentiality of your login credentials, passwords, OTPs, devices, email account and mobile number. You must immediately notify us if you suspect unauthorised access, fraud, loss of device, compromise of credentials or any suspicious activity.</p>
            <p>You must use the platform only for lawful purposes. You must not scrape, copy, reverse engineer, tamper with, overload, disrupt, misuse, bypass, attack, resell, share access to, or otherwise misuse the platform or any data, content, API, algorithm, security system, account or service.</p>
            <p>You must not use the platform for money laundering, tax evasion, market abuse, manipulation, insider trading, unauthorised third-party trading, fraudulent activity, prohibited remittances, sanctioned transactions or any unlawful activity.</p>
          </div>

          <div className="legal-section reveal" id="tc-15">
            <h2><span className="legal-num">15</span>Technology, Availability and Third-Party Services</h2>
            <p>The platform relies on third-party systems, internet connectivity, exchanges, banks, ViewTrade systems, clearing brokers, custodians, payment partners, cloud infrastructure, KYC vendors, market data providers and other service providers. The platform may be unavailable, delayed, interrupted, inaccurate or restricted due to maintenance, outages, cybersecurity events, market events, regulatory restrictions or third-party failures.</p>
            <p>Platizio does not guarantee uninterrupted availability, error-free operation, real-time data accuracy, order routing continuity, settlement timing, funding timing or withdrawal timing. We may suspend, modify or discontinue any feature or access to the platform at any time for operational, security, legal or business reasons.</p>
            <p>Any third-party link, service, content, data feed or integration displayed on the platform is provided for convenience and is subject to the terms of that third party. Platizio is not responsible for third-party content, failure, security, accuracy, legality or availability.</p>
          </div>

          <div className="legal-section reveal" id="tc-16">
            <h2><span className="legal-num">16</span>Communications and Electronic Records</h2>
            <p>You consent to receive all account-related, transactional, service, legal, compliance, risk, support and marketing communications electronically, including through email, SMS, WhatsApp, telephone, mobile notifications, in-app notifications, website notices and other digital channels. The primary support email for Platizio Global is <a href="mailto:supportglobal@platizio.com">supportglobal@platizio.com</a>.</p>
            <p>You agree that electronic records, electronic consents, click-wrap acceptance, OTP verification, digital signatures and electronic communications are valid and binding. You must keep your mobile number, email address and bank details updated at all times.</p>
            <p>You consent to recording, monitoring and retention of calls, WhatsApp messages, chats, emails and other support communications for compliance, training, quality assurance, dispute resolution and record keeping.</p>
          </div>

          <div className="legal-section reveal" id="tc-17">
            <h2><span className="legal-num">17</span>Privacy and Data Protection</h2>
            <p>Your personal data will be collected, used, shared, transferred, retained and protected in accordance with the Platizio Global Privacy Policy. The Privacy Policy forms an integral part of these Terms.</p>
            <p>You consent to the collection and processing of your personal data for onboarding, KYC, AML, remittance, tax, account opening, ViewTrade account servicing, transaction processing, regulatory reporting, fraud prevention, support, analytics, service improvement and other lawful purposes.</p>
            <p>You understand that your personal data may be shared with ViewTrade, banks, KYC vendors, payment partners, affiliates, technology vendors, regulators, auditors, legal advisers, tax authorities and other service providers, including entities located outside India, to provide the services and comply with Applicable Law.</p>
          </div>

          <div className="legal-section reveal" id="tc-18">
            <h2><span className="legal-num">18</span>Suspension, Restriction and Termination</h2>
            <p>Platizio or ViewTrade may suspend, restrict, freeze or terminate your access to the platform or account if you violate these Terms, fail KYC/AML checks, provide false information, misuse the platform, engage in suspicious activity, violate Applicable Law, fail to pay charges, become subject to sanctions, exceed regulatory limits, or if required by any regulator, bank, broker, custodian, court or competent authority.</p>
            <p>Account closure may require liquidation of positions, settlement of trades, completion of compliance checks, payment of outstanding charges, withdrawal of funds and retention of records. Certain holdings, especially fractional shares, may need to be sold rather than transferred. Closure timelines are subject to ViewTrade and banking processes.</p>
            <p>Termination of your account does not affect any rights, obligations, liabilities, indemnities, disclaimers, limitations of liability or record retention obligations that arose before termination or are intended to survive termination.</p>
          </div>

          <div className="legal-section reveal" id="tc-19">
            <h2><span className="legal-num">19</span>Intellectual Property</h2>
            <p>All rights, title and interest in the platform, brand name Platizio Global, logos, design, software, data, layout, content, workflows, user interface, documentation, trademarks, service marks and other intellectual property belong to Platizio, ViewTrade or their respective licensors.</p>
            <p>You are granted a limited, revocable, non-exclusive, non-transferable right to use the platform solely for your personal or authorised business use. You must not copy, modify, distribute, sell, license, reproduce, reverse engineer, decompile, exploit or create derivative works from the platform or its content except as permitted in writing.</p>
          </div>

          <div className="legal-section reveal" id="tc-20">
            <h2><span className="legal-num">20</span>Indemnity</h2>
            <p>You agree to indemnify, defend and hold harmless Platizio, its partners, designated partners, officers, employees, affiliates, agents, advisers and service providers from and against all claims, losses, liabilities, penalties, damages, costs and expenses arising from or relating to your use of the platform, your investment decisions, your breach of these Terms, your violation of Applicable Law, your misrepresentation, your failure to comply with LRS, tax or KYC requirements, or your dispute with ViewTrade, banks, brokers, custodians or third parties.</p>
          </div>

          <div className="legal-section reveal" id="tc-21">
            <h2><span className="legal-num">21</span>Limitation of Liability</h2>
            <p>To the maximum extent permitted by law, Platizio shall not be liable for any market loss, capital loss, currency loss, tax loss, regulatory loss, opportunity loss, business loss, loss of profit, loss of data, loss caused by delay, loss caused by system failure, third-party failure, ViewTrade failure, bank failure, exchange failure, custodian failure, order rejection, non-execution, incorrect execution, delayed settlement, remittance delay, withdrawal delay, cyber event, force majeure event or any indirect, incidental, special, consequential or punitive damages.</p>
            <p>If liability cannot be excluded under Applicable Law, Platizio's total aggregate liability to you shall be limited to the fees actually paid by you directly to Platizio for the relevant service during the twelve months immediately preceding the event giving rise to the claim. For the avoidance of doubt, this cap does not include fees paid to ViewTrade, banks, brokers, custodians, payment partners or other third parties.</p>
          </div>

          <div className="legal-section reveal" id="tc-22">
            <h2><span className="legal-num">22</span>Force Majeure</h2>
            <p>Platizio shall not be liable for any failure or delay caused by events beyond its reasonable control, including acts of God, war, riots, civil unrest, terrorism, strikes, pandemics, epidemics, lockdowns, government actions, regulatory changes, exchange closures, market disruptions, power failures, telecommunications failures, cyberattacks, hacking, malware, cloud service outages, banking failures, payment system failures, ViewTrade outages or failures of any third-party service provider.</p>
          </div>

          <div className="legal-section reveal" id="tc-23">
            <h2><span className="legal-num">23</span>Governing Law, Jurisdiction and Dispute Resolution</h2>
            <p>These Terms shall be governed by and construed in accordance with the laws of India.</p>
            <p>The parties shall first attempt to resolve any dispute amicably by written communication to the grievance officer. If the dispute is not resolved within thirty days, it shall be referred to arbitration in accordance with the Arbitration and Conciliation Act, 1996. The seat and venue of arbitration shall be Delhi, India. The arbitration shall be conducted by a sole arbitrator appointed mutually by the parties. The language of arbitration shall be English.</p>
            <p>Subject to the arbitration clause above, the courts at Delhi, India shall have exclusive jurisdiction over disputes arising from or relating to these Terms, the platform or any matter connected with Platizio. Disputes relating to brokerage execution, custody, settlement, account statements or ViewTrade services may also be subject to the relevant ViewTrade agreement and regulatory framework.</p>
          </div>

          <div className="legal-section reveal" id="tc-24">
            <h2><span className="legal-num">24</span>Changes to these Terms</h2>
            <p>Platizio may modify these Terms at any time to reflect changes in law, regulation, business operations, ViewTrade requirements, fees, technology, services or risk disclosures. Updated Terms will be made available on the platform. Your continued use of the platform after the updated Terms are published constitutes acceptance of the revised Terms.</p>
            <p>Where changes are material and not required immediately by law, regulation, regulator direction or security reasons, Platizio will make reasonable efforts to provide prior notice through the platform, email or other communication channel.</p>
          </div>

          <div className="legal-section reveal" id="tc-25">
            <h2><span className="legal-num">25</span>Contact and Grievance Redressal</h2>
            <p>For support regarding Platizio Global, please contact <a href="mailto:supportglobal@platizio.com">supportglobal@platizio.com</a>. Business hours are Monday to Friday, 9:00 AM to 5:00 PM India Standard Time.</p>
            <p>For grievances relating to the platform, please contact: Anuj Pal, Operations and Compliance Head, Platizio Services LLP, Unit No. DGL-229, Second Floor, DLF Galleria Mall, Mayur Vihar-1, Delhi, India – 110092. Email: <a href="mailto:grievances@platizio.com">grievances@platizio.com</a>. Call: +91 9289837100.</p>
            <p>Grievances will be acknowledged within 24 hours and addressed within 15 working days, subject to Applicable Law and the nature of the issue. Matters relating to execution, custody, settlement, account statements, ViewTrade charges or brokerage account operations may be escalated to ViewTrade or the relevant service provider.</p>
          </div>

          <div className="legal-section reveal" id="tc-26">
            <h2><span className="legal-num">26</span>Miscellaneous</h2>
            <p>These Terms, together with the Privacy Policy, risk disclosures, account opening documents, ViewTrade agreements and applicable fee disclosures, constitute the agreement governing your use of the platform.</p>
            <p>If any provision of these Terms is held invalid, illegal or unenforceable, the remaining provisions shall continue in full force and effect. Failure by Platizio to enforce any provision shall not constitute a waiver. You may not assign your rights or obligations under these Terms without our prior written consent. Platizio may assign or transfer its rights and obligations to any affiliate, successor or acquirer as part of a restructuring, merger, sale or transfer of business.</p>
            <p>Clauses relating to no advice, risk disclosures, taxes, fees, indemnity, limitation of liability, intellectual property, data retention, governing law, jurisdiction, dispute resolution and miscellaneous provisions shall survive termination or closure of your account.</p>
          </div>

          {/* Contact Card */}
          <div className="legal-contact reveal">
            <h3>Questions or Grievances?</h3>
            <p>
              For platform support: <a href="mailto:supportglobal@platizio.com">supportglobal@platizio.com</a><br />
              For grievances: <a href="mailto:grievances@platizio.com">grievances@platizio.com</a> · +91 9289837100<br />
              Grievance Officer: Anuj Pal, Operations and Compliance Head<br />
              Unit No. DGL-229, Second Floor, DLF Galleria Mall, Mayur Vihar-1, Delhi, India – 110092<br />
              Business Hours: Monday to Friday, 9:00 AM to 5:00 PM IST
            </p>
          </div>

        </div>
      </section>
    </>
  )
}
