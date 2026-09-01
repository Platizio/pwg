"use client"

import Link from 'next/link'
import SEO, { breadcrumbSchema } from '../components/SEO'

export default function PrivacyPolicy() {
  return (
    <>
      <SEO
        title="Privacy Policy"
        description="How Platizio Global collects, uses, and protects your personal data for its international investing offering — US Stocks and ETFs for Indian investors."
        canonical="/privacy"
        jsonLd={breadcrumbSchema([['Home', '/'], ['Privacy Policy', '/privacy']])}
      />
      {/* ===== PAGE HERO ===== */}
      <section className="page-hero">
        <div className="container">
          <div className="breadcrumb">
            <Link href="/">Home</Link><span className="crumb-sep" aria-hidden="true">/</span><span>Privacy Policy</span>
          </div>
          <h1>Privacy Policy</h1>
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
            This document is intended to be used as the investor-facing legal document for Platizio Global&apos;s international investing offering. It should be read together with ViewTrade&apos;s applicable customer agreements, disclosures, account opening documents and charges, where applicable.
          </div>

          {/* Table of Contents */}
          <div className="legal-toc reveal">
            <h2>Contents</h2>
            <ol>
              <li><a href="#pp-1">Introduction and Scope</a></li>
              <li><a href="#pp-2">Key Terms</a></li>
              <li><a href="#pp-3">Personal Data We Collect</a></li>
              <li><a href="#pp-4">Sources of Personal Data</a></li>
              <li><a href="#pp-5">Purposes of Processing</a></li>
              <li><a href="#pp-6">Legal Basis for Processing</a></li>
              <li><a href="#pp-7">Sharing and Disclosure of Personal Data</a></li>
              <li><a href="#pp-8">Cross-Border Transfers</a></li>
              <li><a href="#pp-9">Data Retention</a></li>
              <li><a href="#pp-10">Data Security</a></li>
              <li><a href="#pp-11">Cookies and Tracking Technologies</a></li>
              <li><a href="#pp-12">Marketing Communications</a></li>
              <li><a href="#pp-13">Your Rights</a></li>
              <li><a href="#pp-14">Withdrawal of Consent</a></li>
              <li><a href="#pp-15">Children and Minors</a></li>
              <li><a href="#pp-16">Third-Party Services and Links</a></li>
              <li><a href="#pp-17">Data Breach and Incident Handling</a></li>
              <li><a href="#pp-18">Changes to this Privacy Policy</a></li>
              <li><a href="#pp-19">Contact and Grievance Officer</a></li>
            </ol>
          </div>

          {/* ---- Sections ---- */}

          <div className="legal-section reveal" id="pp-1">
            <h2><span className="legal-num">1</span>Introduction and Scope</h2>
            <p>This Privacy Policy explains how Platizio Services LLP, operating under the brand Platizio Global, collects, uses, shares, transfers, stores and protects personal data in connection with its international investing platform and related services.</p>
            <p>Platizio Services LLP is a limited liability partnership incorporated on 05 December 2019 with LLPIN AAQ-9558, registered with the Registrar of Companies, Delhi, and having its registered office at Unit No. DGL-229, Second Floor, DLF Galleria Mall, Mayur Vihar-1, Delhi, India – 110092.</p>
            <p>This policy is intended to comply with the Digital Personal Data Protection Act, 2023 of India, the Information Technology Act, 2000, applicable rules and other relevant Indian data protection and privacy laws. Where the services involve ViewTrade, banks, brokers, custodians or other regulated entities, your data may also be processed in accordance with their respective privacy policies and applicable foreign laws.</p>
            <p>By registering for or using the platform, you consent to the collection, use, sharing, storage and transfer of your personal data as described in this Privacy Policy.</p>
          </div>

          <div className="legal-section reveal" id="pp-2">
            <h2><span className="legal-num">2</span>Key Terms</h2>
            <p><strong>&quot;Personal data&quot;</strong> means any data about an individual who is identifiable by or in relation to such data.</p>
            <p><strong>&quot;Processing&quot;</strong> means any operation performed on personal data, including collection, recording, storage, use, sharing, disclosure, transfer, analysis, deletion and retention.</p>
            <p><strong>&quot;Data Principal&quot;</strong> means the individual to whom the personal data relates.</p>
            <p><strong>&quot;Data Fiduciary&quot;</strong> means a person who determines the purpose and means of processing personal data. For the purposes of data collected and processed by Platizio for its platform, Platizio acts as a data fiduciary. ViewTrade and other regulated service providers may act as independent data fiduciaries or processors for their respective services.</p>
            <p><strong>&quot;Platform&quot;</strong> means the Platizio Global website, mobile application, white-labelled interface, customer journey, support channels and related technology.</p>
          </div>

          <div className="legal-section reveal" id="pp-3">
            <h2><span className="legal-num">3</span>Personal Data We Collect</h2>
            <p>We may collect <strong>identity and contact details</strong> such as your name, date of birth, PAN, Aadhaar or passport details, residential address, email address, mobile number, photograph, signature, nationality, tax residency and other identifying information.</p>
            <p>We may collect <strong>KYC and compliance information</strong> such as proof of identity, proof of address, selfie, liveness check, video verification, bank proof, source of funds, occupation, income range, FATCA/CRS declaration, W-8BEN or equivalent tax forms, LRS declaration, politically exposed person declaration, nominee information and other documentation requested by ViewTrade, banks or regulators.</p>
            <p>We may collect <strong>financial and transaction information</strong> such as bank account details, remittance information, foreign exchange conversion details, order instructions, trade confirmations, holdings, balances, account statements, dividends, withdrawals, fees, tax withholding data and transaction history.</p>
            <p>We may collect <strong>technical and usage information</strong> such as IP address, device identifiers, browser type, operating system, app version, login history, session data, pages viewed, clickstream, error logs, cookies, crash reports, approximate location, notification preferences and platform interactions.</p>
            <p>We may collect <strong>communication information</strong> such as emails, support tickets, calls, WhatsApp messages, chats, feedback, survey responses, complaints, consent records and recorded customer support interactions.</p>
          </div>

          <div className="legal-section reveal" id="pp-4">
            <h2><span className="legal-num">4</span>Sources of Personal Data</h2>
            <p>We collect personal data directly from you when you register, onboard, submit documents, use the platform, place orders, contact support or communicate with us.</p>
            <p>We may receive personal data from ViewTrade, banks, payment partners, KYC vendors, credit or identity verification agencies, analytics providers, regulators, auditors, affiliates and other authorised service providers.</p>
            <p>We may collect technical information automatically through cookies, tracking technologies, device logs, analytics tools and security systems when you use the platform.</p>
          </div>

          <div className="legal-section reveal" id="pp-5">
            <h2><span className="legal-num">5</span>Purposes of Processing</h2>
            <p>We process personal data for account registration, identity verification, KYC, AML, sanctions screening, tax documentation, onboarding with ViewTrade, remittance facilitation, trade and transaction processing, statement display, customer support and grievance redressal.</p>
            <p>We process personal data to comply with Applicable Law, including foreign exchange regulations, LRS requirements, tax laws, anti-money laundering laws, securities laws, data protection laws, regulatory directions, audit requirements and lawful requests from competent authorities.</p>
            <p>We process personal data to operate, maintain, improve, secure and personalise the platform, including fraud prevention, risk monitoring, cybersecurity, troubleshooting, analytics, product improvement, service communication and operational reporting.</p>
            <p>We may process personal data for marketing, investor education, product updates, research, surveys and promotional communication, subject to your preferences and applicable consent requirements.</p>
          </div>

          <div className="legal-section reveal" id="pp-6">
            <h2><span className="legal-num">6</span>Legal Basis for Processing</h2>
            <p>We process your personal data on one or more lawful bases, including your consent, performance of a contract, compliance with legal obligations, legitimate business purposes, prevention of fraud, security of the platform, regulatory reporting, and processing necessary for providing the services requested by you.</p>
            <p>Where the Digital Personal Data Protection Act, 2023 of India requires consent, such consent will be free, specific, informed, unconditional, unambiguous and based on clear affirmative action. You may withdraw consent as described in this policy, subject to legal and contractual limitations.</p>
          </div>

          <div className="legal-section reveal" id="pp-7">
            <h2><span className="legal-num">7</span>Sharing and Disclosure of Personal Data</h2>
            <p>We may share your personal data with ViewTrade for account opening, KYC/AML, brokerage account servicing, execution, custody, settlement, statements, reporting, support and compliance.</p>
            <p>We may share data with banks, authorised dealer banks, remittance partners, payment processors and foreign exchange service providers for remittance, withdrawal, account verification, transaction processing and reconciliation.</p>
            <p>We may share data with KYC vendors, AML screening providers, identity verification providers, technology vendors, cloud service providers, analytics providers, communication providers, legal advisers, auditors, consultants, tax advisers and support vendors.</p>
            <p>We may share data with regulators, government authorities, courts, law enforcement agencies, tax authorities, stock exchanges, depositories, IFSC authorities, overseas regulators or other competent authorities when required by law, regulation, order, request or legal process.</p>
            <p>We may share data with affiliates, group companies, successors, assignees or acquirers in connection with internal governance, business restructuring, merger, acquisition, sale of business, transfer of assets or continuation of services, subject to appropriate safeguards.</p>
            <p>We do not sell your personal data for monetary consideration.</p>
          </div>

          <div className="legal-section reveal" id="pp-8">
            <h2><span className="legal-num">8</span>Cross-Border Transfers</h2>
            <p>Because the platform facilitates international investing through ViewTrade and related entities, your personal data may be transferred to, stored in, accessed from or processed in jurisdictions outside India, including IFSC/GIFT City, the United States and other countries where ViewTrade, custodians, brokers, banks, technology vendors or service providers operate.</p>
            <p>Such transfers are made for account opening, KYC, compliance, execution, custody, settlement, statements, regulatory reporting, technology operations and customer support. We will use reasonable safeguards and contractual arrangements to protect your data in accordance with Applicable Law.</p>
          </div>

          <div className="legal-section reveal" id="pp-9">
            <h2><span className="legal-num">9</span>Data Retention</h2>
            <p>We retain personal data only for as long as necessary for the purposes described in this policy, or as required by Applicable Law, regulators, ViewTrade requirements, audit obligations, dispute resolution or legitimate business purposes.</p>
            <p>KYC, AML, identity verification, tax, FATCA/CRS, LRS and account opening records will generally be retained for at least 5 years after account closure or completion of the relevant transaction, or for a longer period if required by law, regulator, ViewTrade or any competent authority.</p>
            <p>Trade, transaction, remittance, withdrawal, statement, account activity and fee records will generally be retained for at least 5 years from the date of transaction or account closure, or for a longer period if required by law, regulator, ViewTrade or any competent authority.</p>
            <p>Communications, support records, complaints, call recordings, WhatsApp/chat logs, emails and consent records will generally be retained for 5 years from the date of communication or account closure, unless a longer period is required for compliance, audit, legal proceedings or dispute resolution.</p>
            <p>Marketing preferences will be retained until you opt out, withdraw consent or close your account, subject to our need to retain suppression lists to honour opt-out requests.</p>
            <p>Anonymised, aggregated or de-identified data may be retained indefinitely because it does not identify you directly.</p>
          </div>

          <div className="legal-section reveal" id="pp-10">
            <h2><span className="legal-num">10</span>Data Security</h2>
            <p>We use reasonable technical, administrative and organisational safeguards to protect personal data against unauthorised access, disclosure, alteration, destruction, misuse or loss. These safeguards may include encryption, access controls, authentication, audit logs, monitoring, secure hosting, vendor controls, internal policies and employee confidentiality obligations.</p>
            <p>No digital platform, transmission method or storage system is completely secure. Therefore, while we take reasonable steps to protect your personal data, we cannot guarantee absolute security. You are responsible for keeping your login credentials, devices, email and mobile number secure.</p>
          </div>

          <div className="legal-section reveal" id="pp-11">
            <h2><span className="legal-num">11</span>Cookies and Tracking Technologies</h2>
            <p>We may use cookies, pixels, SDKs, device identifiers and similar technologies to operate the platform, remember preferences, authenticate sessions, improve security, analyse usage, troubleshoot errors, improve user experience and deliver relevant communication.</p>
            <p>You may disable cookies through your browser or device settings. However, disabling cookies may affect platform functionality, login, security checks, preferences and service availability.</p>
          </div>

          <div className="legal-section reveal" id="pp-12">
            <h2><span className="legal-num">12</span>Marketing Communications</h2>
            <p>We may send you service updates, investor education, product information, promotional communication, platform alerts and other messages by email, SMS, WhatsApp, phone, push notification or in-app notification. You may opt out of promotional communications by using the unsubscribe mechanism or by writing to <a href="mailto:supportglobal@platizio.com">supportglobal@platizio.com</a>.</p>
            <p>Even if you opt out of promotional communication, we may continue to send you essential account, security, legal, regulatory, transactional and service-related communication.</p>
          </div>

          <div className="legal-section reveal" id="pp-13">
            <h2><span className="legal-num">13</span>Your Rights</h2>
            <p>Subject to Applicable Law, you may have the right to access information about your personal data, request correction of inaccurate data, request completion or updating of incomplete data, request erasure of personal data where retention is no longer necessary, withdraw consent where processing is based on consent, nominate another individual to exercise rights in case of death or incapacity, and raise grievances regarding processing of your personal data.</p>
            <p>To exercise your rights, please contact the grievance officer at <a href="mailto:grievances@platizio.com">grievances@platizio.com</a>. We may verify your identity before processing your request. We may reject or limit requests where disclosure or deletion is restricted by law, regulatory requirements, ViewTrade requirements, contract obligations, tax requirements, fraud prevention, audit obligations, legal claims or the rights of another person.</p>
          </div>

          <div className="legal-section reveal" id="pp-14">
            <h2><span className="legal-num">14</span>Withdrawal of Consent</h2>
            <p>You may withdraw consent by contacting us or using any mechanism provided on the platform. Withdrawal of consent may affect your ability to use the services, because certain processing is necessary for KYC, account maintenance, transaction processing, regulatory reporting and support.</p>
            <p>Withdrawal of consent will not affect processing already carried out before withdrawal. We may continue to retain and process data where required or permitted by law, regulator, ViewTrade, courts, tax authorities, audit obligations, fraud prevention or dispute resolution.</p>
          </div>

          <div className="legal-section reveal" id="pp-15">
            <h2><span className="legal-num">15</span>Children and Minors</h2>
            <p>The platform is not directed to individuals under 18 years of age. We do not knowingly collect personal data from minors. If we become aware that personal data of a minor has been collected without lawful basis, we will take reasonable steps to delete or restrict such data, subject to legal and regulatory obligations.</p>
          </div>

          <div className="legal-section reveal" id="pp-16">
            <h2><span className="legal-num">16</span>Third-Party Services and Links</h2>
            <p>The platform may contain links, embedded content, integrations or redirects to websites, apps or services operated by ViewTrade, banks, brokers, custodians, payment partners, market data providers, analytics providers or other third parties. Their privacy practices are governed by their own privacy policies. Platizio is not responsible for third-party privacy practices, security, content or policies.</p>
          </div>

          <div className="legal-section reveal" id="pp-17">
            <h2><span className="legal-num">17</span>Data Breach and Incident Handling</h2>
            <p>If we become aware of a personal data breach that is likely to affect you or that is required to be notified under Applicable Law, we will take reasonable steps to investigate, contain, remediate and notify affected persons and competent authorities as required by law.</p>
          </div>

          <div className="legal-section reveal" id="pp-18">
            <h2><span className="legal-num">18</span>Changes to this Privacy Policy</h2>
            <p>We may update this Privacy Policy from time to time to reflect changes in law, technology, platform features, ViewTrade requirements, data practices or business operations. The updated policy will be made available on the platform. Continued use of the platform after the updated policy is published constitutes acceptance of the updated policy.</p>
            <p>Where changes are material and not required immediately by law, regulator direction or security reasons, we will make reasonable efforts to notify you through the platform, email or other communication channel.</p>
          </div>

          <div className="legal-section reveal" id="pp-19">
            <h2><span className="legal-num">19</span>Contact and Grievance Officer</h2>
            <p>For privacy-related queries, account support or data rights requests, please contact <a href="mailto:supportglobal@platizio.com">supportglobal@platizio.com</a>.</p>
            <p>Grievances will be acknowledged within 24 hours and addressed within 15 working days, subject to Applicable Law and the nature of the issue. If you are not satisfied with the response, you may pursue remedies available under Applicable Law.</p>
          </div>

          {/* Contact Card */}
          <div className="legal-contact reveal">
            <h3>Grievance Officer</h3>
            <p>
              <strong>Anuj Pal</strong> — Operations and Compliance Head<br />
              Platizio Services LLP, Unit No. DGL-229, Second Floor, DLF Galleria Mall,<br />
              Mayur Vihar-1, Delhi, India – 110092<br /><br />
              Email: <a href="mailto:grievances@platizio.com">grievances@platizio.com</a><br />
              Call: +91 9289837100<br />
              Business Hours: Monday to Friday, 9:00 AM to 5:00 PM IST
            </p>
          </div>

        </div>
      </section>
    </>
  )
}
