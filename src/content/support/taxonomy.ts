/**
 * Snapshot of the ticket taxonomy that lives in the support database.
 *
 * Source of truth is Postgres — public.ticket_categories and
 * public.ticket_subcategories in project qtjnlkobvnhhgsnyufzv. This file is a
 * committed copy so that:
 *
 *   1. CI can validate the decision tree offline, with no database credentials.
 *   2. The /help page can render category labels without a round trip.
 *   3. A change to the taxonomy shows up as a reviewable diff rather than as a
 *      silent behaviour change the next time someone deploys.
 *
 * Captured 2026-08-13. Drift is caught at ingestion rather than by a separate
 * check: support_nodes carries a composite foreign key on
 * (subcategory_id, category_id), so a snapshot that no longer matches the
 * database fails the upsert instead of quietly shipping a tree that routes
 * tickets into a subcategory that moved or no longer exists.
 */

export interface TicketCategory {
  id: string
  label: string
}

export interface TicketSubcategory {
  id: string
  categoryId: string
  label: string
}

export const TICKET_CATEGORIES: TicketCategory[] = [
  { id: 'account-kyc', label: 'Account & KYC' },
  { id: 'funding', label: 'Funding & Remittance' },
  { id: 'trading', label: 'Trading & Orders' },
  { id: 'withdrawals', label: 'Withdrawals' },
  { id: 'transfers', label: 'Transferring Securities' },
  { id: 'reports-tax', label: 'Statements, Reports & Tax' },
  { id: 'platform', label: 'Platform & Login' },
  { id: 'other', label: 'Something else' },
]

export const TICKET_SUBCATEGORIES: TicketSubcategory[] = [
  { id: 'account-closure', categoryId: 'account-kyc', label: 'Account closure' },
  { id: 'account-opening', categoryId: 'account-kyc', label: 'Account opening' },
  { id: 'kyc-documents', categoryId: 'account-kyc', label: 'KYC documents or verification' },
  { id: 'nominee', categoryId: 'account-kyc', label: 'Nominee or beneficiary' },
  { id: 'profile-update', categoryId: 'account-kyc', label: 'Profile or address update' },

  { id: 'add-funds-lrs', categoryId: 'funding', label: 'Adding funds / LRS remittance' },
  { id: 'bank-nre-nro', categoryId: 'funding', label: 'Bank, NRE or NRO question' },
  { id: 'funds-not-credited', categoryId: 'funding', label: 'Funds not credited' },
  { id: 'tcs-query', categoryId: 'funding', label: 'TCS query' },

  { id: 'dividends-corporate-actions', categoryId: 'trading', label: 'Dividends or corporate actions' },
  { id: 'fractional-shares', categoryId: 'trading', label: 'Fractional shares' },
  { id: 'order-cancellation', categoryId: 'trading', label: 'Order cancellation' },
  { id: 'order-not-executed', categoryId: 'trading', label: 'Order not executed' },

  { id: 'settlement-unsettled-cash', categoryId: 'withdrawals', label: 'Settlement or unsettled cash' },
  { id: 'withdrawal-bank-account', categoryId: 'withdrawals', label: 'Bank account for withdrawal' },
  { id: 'withdrawal-not-received', categoryId: 'withdrawals', label: 'Withdrawal not received' },

  { id: 'esop-rsu-transfer', categoryId: 'transfers', label: 'ESOP / RSU transfer' },
  { id: 'transfer-in', categoryId: 'transfers', label: 'Transfer in from another broker' },
  { id: 'transfer-out', categoryId: 'transfers', label: 'Transfer out to another broker' },

  { id: 'pnl-report', categoryId: 'reports-tax', label: 'Profit & Loss report' },
  { id: 'statement-trade-confirmation', categoryId: 'reports-tax', label: 'Statement or trade confirmation' },
  { id: 'tax-documents', categoryId: 'reports-tax', label: 'Tax documents (Schedule FA, Form 67)' },

  { id: 'app-website-issue', categoryId: 'platform', label: 'App or website issue' },
  { id: 'login-password-otp', categoryId: 'platform', label: 'Login, password or OTP' },
  { id: 'notifications', categoryId: 'platform', label: 'Notifications' },

  { id: 'general-query', categoryId: 'other', label: 'General query' },
]
