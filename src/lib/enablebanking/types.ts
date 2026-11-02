/** Shapes from the Enable Banking API (enablebanking.com/docs/api). Fields a
 * bank has nothing for may be missing or null. */

export type EbAmount = { amount: string; currency: string };

export type EbParty = { name?: string | null } | null;

export type EbTransaction = {
  entry_reference?: string | null;
  transaction_id?: string | null;
  transaction_amount: EbAmount;
  /** "CRDT" money in, "DBIT" money out. */
  credit_debit_indicator: "CRDT" | "DBIT" | string;
  /** "BOOK" booked, "PDNG" pending (others treated as booked). */
  status?: string | null;
  booking_date?: string | null;
  value_date?: string | null;
  transaction_date?: string | null;
  remittance_information?: string[] | null;
  creditor?: EbParty;
  debtor?: EbParty;
  bank_transaction_code?: { description?: string | null } | null;
};

export type EbBalance = {
  name?: string | null;
  balance_amount: EbAmount;
  balance_type: string;
  reference_date?: string | null;
  last_change_date_time?: string | null;
  credit_debit_indicator?: "CRDT" | "DBIT" | string | null;
};

export type EbSessionAccount = {
  uid: string;
  account_id?: {
    iban?: string | null;
    other?: { identification?: string | null } | null;
  } | null;
  name?: string | null;
  product?: string | null;
  currency?: string | null;
  cash_account_type?: string | null;
  details?: string | null;
};

export type EbSession = {
  session_id: string;
  accounts: EbSessionAccount[];
  aspsp: { name: string; country: string };
  access: { valid_until: string };
};

export type EbAspsp = {
  name: string;
  country: string;
  logo?: string | null;
  psu_types?: string[] | null;
  maximum_consent_validity?: number | null;
};

/** What this app keeps about one bank connection (one consent). */
export type StoredSession = {
  sessionId: string;
  bank: string;
  country: string;
  validUntil: string;
  accounts: {
    uid: string;
    name: string;
    currency: string;
    type: "checking" | "savings" | "credit";
  }[];
};

export type EbConfig = {
  appId: string;
  privateKey: string;
  redirectUrl: string;
};
