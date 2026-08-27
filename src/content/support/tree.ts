import type { SupportTreeNode } from './tree.types'

/**
 * The support assistant's decision tree — FIRST PASS, for review.
 *
 * Derived mechanically from three things that already existed: the 8
 * ticket_categories and 26 ticket_subcategories in the support database, and the
 * 71 answers in src/content/faqs.tsx. Every one of those 71 answers is reachable
 * from exactly one place here, so nothing in the FAQ became unreachable when the
 * assistant took over the front door.
 *
 * Levels:
 *   1. Category    — id matches a ticket_categories id
 *   2. Subcategory — id matches a ticket_subcategories id
 *   3. Issue       — the actual problem, answered from the FAQ
 *
 * `escalateOnly` leaves are deliberate: three subcategories (app-website-issue,
 * notifications, and login failures) have no FAQ coverage at all, because they
 * are not answerable by content. A customer whose OTP is not arriving needs a
 * person, not a paragraph. Rather than invent filler answers, those nodes offer
 * the ticket and callback exits straight away.
 *
 * EDITING NOTES FOR CONTENT / COMPLIANCE
 * - `label` is the button text. Keep it short and in the customer's words, not
 *   ours: "I sent money and it hasn't arrived", not "Remittance reconciliation".
 * - `prompt` is what the assistant says. Only branches need one.
 * - `answers` are FAQ item ids from src/content/faqs.tsx. Changing an answer
 *   there changes it here — there is deliberately no second copy of the text.
 * - Never change an existing `id`. chat_messages.node_id references them, so a
 *   rename silently orphans that node's analytics history.
 * - Adding a node is safe. `npm run validate:support` checks every invariant.
 */
export const SUPPORT_TREE: SupportTreeNode[] = [
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: 'account-kyc',
    categoryId: 'account-kyc',
    label: 'Account & KYC',
    prompt: 'What would you like help with?',
    aliases: ['open account', 'kyc', 'verification', 'signup', 'registration'],
    children: [
      {
        id: 'account-opening',
        subcategoryId: 'account-opening',
        label: 'Opening an account',
        prompt: 'What would you like to know?',
        children: [
          { id: 'eligibility-resident', label: 'Am I eligible to invest?', answers: ['gs-1', 'gs-2'] },
          { id: 'eligibility-nri', label: "I'm an NRI or foreign national", answers: ['gs-3'] },
          { id: 'eligibility-entity', label: 'Opening for an HUF or company', answers: ['gs-9'] },
          { id: 'opening-steps', label: 'How signup and KYC work', answers: ['gs-5'] },
          { id: 'opening-timeline', label: 'How long approval takes', answers: ['gs-6'] },
          { id: 'opening-charges', label: 'Opening or maintenance charges', answers: ['gs-8'] },
          { id: 'funding-before-approval', label: 'Adding funds before KYC is approved', answers: ['gs-7'] },
        ],
      },
      {
        id: 'kyc-documents',
        subcategoryId: 'kyc-documents',
        label: 'KYC documents or verification',
        prompt: 'What is happening with your KYC?',
        children: [
          { id: 'kyc-required-docs', label: 'Which documents I need', answers: ['gs-4'] },
          // No FAQ covers a rejected or stalled KYC, and it needs a person to
          // look at the actual submission.
          { id: 'kyc-rejected', label: 'My KYC was rejected or is stuck', escalateOnly: true },
        ],
      },
      {
        id: 'nominee',
        subcategoryId: 'nominee',
        label: 'Nominee or beneficiary',
        prompt: 'What do you need?',
        children: [
          { id: 'nominee-add', label: 'Adding or changing a nominee', answers: ['ma-3'] },
        ],
      },
      {
        id: 'profile-update',
        subcategoryId: 'profile-update',
        label: 'Profile or address update',
        prompt: 'What would you like to change?',
        children: [
          { id: 'profile-contact', label: 'My email, mobile or login', answers: ['ma-1'] },
          { id: 'profile-address', label: 'My address or ID details', answers: ['ma-2'] },
        ],
      },
      {
        id: 'account-closure',
        subcategoryId: 'account-closure',
        label: 'Account closure',
        prompt: 'What would you like to do?',
        children: [
          { id: 'closure-how', label: 'Closing my account', answers: ['ma-5'] },
          { id: 'closure-data', label: 'Deleting my personal data', answers: ['ma-6'] },
        ],
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────
  {
    id: 'funding',
    categoryId: 'funding',
    label: 'Funding & Remittance',
    prompt: 'What is happening with your funds?',
    aliases: ['add money', 'deposit', 'remittance', 'lrs', 'transfer money in'],
    children: [
      {
        id: 'add-funds-lrs',
        subcategoryId: 'add-funds-lrs',
        label: 'Adding funds / LRS remittance',
        prompt: 'What would you like to know?',
        children: [
          { id: 'funding-how', label: 'How to add money', answers: ['fa-1'] },
          { id: 'funding-limit', label: 'How much I can send in a year', answers: ['fa-3'] },
          { id: 'funding-methods', label: 'Can I use UPI, a forex card or Wise?', answers: ['fa-8'] },
        ],
      },
      {
        id: 'funds-not-credited',
        subcategoryId: 'funds-not-credited',
        label: 'Funds not credited',
        prompt: 'How long ago did your bank debit the amount?',
        children: [
          { id: 'funding-timeline', label: 'I want to know how long it should take', answers: ['fa-2'] },
          // Tracing an actual remittance needs the SWIFT copy and a human.
          { id: 'funding-missing', label: "It has been longer than that and hasn't arrived", escalateOnly: true },
        ],
      },
      {
        id: 'tcs-query',
        subcategoryId: 'tcs-query',
        label: 'TCS query',
        prompt: 'What would you like to know about TCS?',
        children: [
          { id: 'tcs-what', label: 'What TCS is and how much I will pay', answers: ['fa-5'] },
        ],
      },
      {
        id: 'bank-nre-nro',
        subcategoryId: 'bank-nre-nro',
        label: 'Bank, NRE or NRO question',
        prompt: 'Which account are you asking about?',
        children: [
          { id: 'bank-which', label: 'Which banks I can use', answers: ['fa-4'] },
          { id: 'bank-nre-nro-source', label: 'Using an NRE or NRO account', answers: ['fa-6'] },
          { id: 'bank-third-party', label: "Using someone else's bank account", answers: ['fa-7'] },
        ],
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────
  {
    id: 'trading',
    categoryId: 'trading',
    label: 'Trading & Orders',
    prompt: 'What is this about?',
    aliases: ['buy', 'sell', 'order', 'stocks', 'etf', 'shares'],
    children: [
      {
        id: 'order-not-executed',
        subcategoryId: 'order-not-executed',
        label: 'Placing or executing an order',
        prompt: 'What would you like to know?',
        children: [
          { id: 'trading-what-available', label: 'What I can invest in', answers: ['tr-1'] },
          { id: 'trading-order-types', label: 'Order types I can place', answers: ['tr-6'] },
          { id: 'trading-derivatives', label: 'Derivatives, futures and options', answers: ['tr-2'] },
          { id: 'trading-intraday', label: 'Intraday trading and margin', answers: ['tr-3'] },
          { id: 'trading-ipos', label: 'Investing in US IPOs', answers: ['tr-10'] },
          { id: 'order-stuck', label: "My order didn't go through", escalateOnly: true },
        ],
      },
      {
        id: 'order-cancellation',
        subcategoryId: 'order-cancellation',
        label: 'Order cancellation',
        prompt: 'What do you need?',
        children: [
          { id: 'order-cancel', label: 'Cancelling a pending order', answers: ['tr-7'] },
        ],
      },
      {
        id: 'fractional-shares',
        subcategoryId: 'fractional-shares',
        label: 'Fractional shares',
        prompt: 'What would you like to know?',
        children: [
          { id: 'fractional-what', label: 'How fractional investing works', answers: ['tr-4'] },
          { id: 'fractional-dividends', label: 'Dividends on fractional shares', answers: ['tr-5'] },
        ],
      },
      {
        id: 'dividends-corporate-actions',
        subcategoryId: 'dividends-corporate-actions',
        label: 'Dividends or corporate actions',
        prompt: 'What is this about?',
        children: [
          { id: 'dividends-receiving', label: 'How dividends reach me', answers: ['tr-5'] },
          { id: 'idle-cash-interest', label: 'Interest on idle cash', answers: ['tr-8'] },
          { id: 'share-certificate', label: 'Share certificates and proof of ownership', answers: ['tr-9'] },
        ],
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────
  {
    id: 'withdrawals',
    categoryId: 'withdrawals',
    label: 'Withdrawals',
    prompt: 'What is happening with your withdrawal?',
    aliases: ['withdraw', 'take money out', 'payout', 'redeem'],
    children: [
      {
        id: 'withdrawal-not-received',
        subcategoryId: 'withdrawal-not-received',
        label: 'Making or tracking a withdrawal',
        prompt: 'What do you need?',
        children: [
          { id: 'withdrawal-how', label: 'How to withdraw money', answers: ['wd-1'] },
          { id: 'withdrawal-delayed', label: "My withdrawal hasn't reached my bank", answers: ['wd-7'] },
        ],
      },
      {
        id: 'settlement-unsettled-cash',
        subcategoryId: 'settlement-unsettled-cash',
        label: 'Settlement or unsettled cash',
        prompt: 'What would you like to know?',
        children: [
          { id: 'withdrawal-after-sale', label: 'When I can withdraw after selling', answers: ['wd-2'] },
          { id: 'unsettled-cash', label: 'Unsettled cash vs buying power', answers: ['wd-3'] },
        ],
      },
      {
        id: 'withdrawal-bank-account',
        subcategoryId: 'withdrawal-bank-account',
        label: 'Bank account for withdrawal',
        prompt: 'What is your question?',
        children: [
          { id: 'withdrawal-currency', label: 'Whether I receive INR or USD', answers: ['wd-4'] },
          { id: 'withdrawal-charges', label: 'Withdrawal charges', answers: ['wd-5'] },
          { id: 'withdrawal-other-bank', label: 'Withdrawing to a different bank', answers: ['wd-6'] },
        ],
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────
  {
    id: 'transfers',
    categoryId: 'transfers',
    label: 'Transferring Securities',
    prompt: 'Which direction?',
    aliases: ['transfer shares', 'move holdings', 'another broker', 'esop', 'rsu'],
    children: [
      {
        id: 'transfer-in',
        subcategoryId: 'transfer-in',
        label: 'Transfer in from another broker',
        prompt: 'What would you like to know?',
        children: [
          { id: 'transfer-in-possible', label: 'Moving holdings from another broker', answers: ['tf-1'] },
          { id: 'transfer-in-methods', label: 'Transfer methods used', answers: ['tf-2'] },
          { id: 'transfer-in-timeline', label: 'How long it takes and what it costs', answers: ['tf-3'] },
          { id: 'transfer-in-cost-basis', label: 'Whether cost basis carries over', answers: ['tf-4'] },
          // Neither in nor out, but transfers is the right category and this is
          // the closest existing subcategory.
          { id: 'transfer-internal', label: 'Between two Platizio accounts', answers: ['tf-6'] },
        ],
      },
      {
        id: 'transfer-out',
        subcategoryId: 'transfer-out',
        label: 'Transfer out to another broker',
        prompt: 'What do you need?',
        children: [
          { id: 'transfer-out-how', label: 'Moving holdings out of Platizio', answers: ['tf-5'] },
        ],
      },
      {
        id: 'esop-rsu-transfer',
        subcategoryId: 'esop-rsu-transfer',
        label: 'ESOP / RSU transfer',
        prompt: 'What is your question?',
        children: [
          { id: 'esop-move', label: 'Moving ESOP or RSU shares or proceeds', answers: ['er-1'] },
          { id: 'esop-deadline', label: 'Time limit to reinvest proceeds', answers: ['er-2'] },
          { id: 'esop-tax', label: 'Tax on an ESOP or RSU transfer', answers: ['er-3'] },
        ],
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────
  {
    id: 'reports-tax',
    categoryId: 'reports-tax',
    label: 'Statements, Reports & Tax',
    prompt: 'What are you looking for?',
    aliases: ['statement', 'p&l', 'profit and loss', 'tax', 'schedule fa', 'form 67'],
    children: [
      {
        id: 'pnl-report',
        subcategoryId: 'pnl-report',
        label: 'Profit & Loss report',
        prompt: 'What would you like to know?',
        children: [
          { id: 'pnl-download', label: 'Downloading a P&L report', answers: ['pr-6'] },
          { id: 'pnl-realised', label: 'Realised vs unrealised profit and loss', answers: ['pr-1'] },
          { id: 'pnl-cost-basis', label: 'What cost basis means', answers: ['pr-2'] },
          { id: 'pnl-fifo', label: 'Whether shares are sold FIFO or LIFO', answers: ['pr-3'] },
          { id: 'pnl-fx-rate', label: 'Which exchange rate is used for INR returns', answers: ['pr-4'] },
        ],
      },
      {
        id: 'statement-trade-confirmation',
        subcategoryId: 'statement-trade-confirmation',
        label: 'Statement or trade confirmation',
        prompt: 'What do you need?',
        children: [
          { id: 'statements-where', label: 'Where to find statements and confirmations', answers: ['pr-5', 'sp-3'] },
        ],
      },
      {
        id: 'tax-documents',
        subcategoryId: 'tax-documents',
        label: 'Tax documents (Schedule FA, Form 67)',
        // Deliberately explains process only. Nothing here constitutes tax
        // advice, and the assistant's advice guardrail applies on top.
        prompt: 'Which part of tax are you asking about?',
        children: [
          { id: 'tax-capital-gains', label: 'How capital gains are taxed in India', answers: ['tx-1'] },
          { id: 'tax-dividends', label: 'How dividends are taxed', answers: ['tx-2'] },
          { id: 'tax-dtaa', label: 'What the DTAA does for me', answers: ['tx-3'] },
          { id: 'tax-filing-docs', label: 'Documents I need to file in India', answers: ['tx-4'] },
          { id: 'tax-schedule-fa', label: 'Why Schedule FA uses a calendar year', answers: ['tx-5'] },
          { id: 'tax-us-liability', label: 'Whether I owe tax in the US', answers: ['tx-6'] },
          { id: 'tax-fx-depreciation', label: 'Tax on rupee depreciation', answers: ['tx-7'] },
        ],
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Every leaf here is escalateOnly. That is not an oversight: the FAQ has no
  // coverage for platform faults, and it should not — a broken page or a missing
  // OTP is diagnosed, not documented. These nodes exist so the customer reaches
  // a human in two taps instead of hunting for an answer that cannot exist.
  {
    id: 'platform',
    categoryId: 'platform',
    label: 'Platform & Login',
    prompt: 'What is going wrong?',
    aliases: ['login', 'password', 'otp', 'app', 'website', 'error', 'not working'],
    children: [
      {
        id: 'login-password-otp',
        subcategoryId: 'login-password-otp',
        label: 'Login, password or OTP',
        prompt: 'What is happening?',
        children: [
          { id: 'password-reset', label: 'I want to reset my password', answers: ['ma-4'] },
          { id: 'login-blocked', label: "I can't log in, or my OTP isn't arriving", escalateOnly: true, priority: 'URGENT' },
        ],
      },
      {
        id: 'app-website-issue',
        subcategoryId: 'app-website-issue',
        label: 'App or website issue',
        prompt: 'Tell us what you were doing when it broke.',
        children: [
          { id: 'app-broken', label: "Something isn't working", escalateOnly: true },
        ],
      },
      {
        id: 'notifications',
        subcategoryId: 'notifications',
        label: 'Notifications',
        prompt: 'What is the problem?',
        children: [
          { id: 'notifications-missing', label: "I'm not receiving notifications or emails", escalateOnly: true },
        ],
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────
  {
    id: 'other',
    categoryId: 'other',
    label: 'Something else',
    prompt: 'What would you like to know?',
    aliases: ['safety', 'regulation', 'custody', 'viewtrade', 'contact', 'complaint'],
    children: [
      {
        id: 'general-query',
        subcategoryId: 'general-query',
        label: 'General query',
        prompt: 'Pick the closest one.',
        children: [
          { id: 'safety-broker', label: 'Who ViewTrade is and their role', answers: ['sc-1'] },
          { id: 'safety-ownership', label: 'In whose name my securities are held', answers: ['sc-2'] },
          { id: 'safety-insurance', label: 'Whether my investments are insured', answers: ['sc-3'] },
          { id: 'safety-continuity', label: 'What happens if Platizio stops operating', answers: ['sc-4'] },
          { id: 'safety-segregation', label: 'Whether client funds are kept separate', answers: ['sc-5'] },
          { id: 'safety-data', label: 'How my personal data is protected', answers: ['sc-6'] },
          { id: 'contact-support', label: 'How to contact support', answers: ['sp-1'] },
          { id: 'contact-broker', label: 'Contacting ViewTrade directly', answers: ['sp-2'] },
          { id: 'something-else', label: 'None of these', escalateOnly: true },
        ],
      },
    ],
  },
]
