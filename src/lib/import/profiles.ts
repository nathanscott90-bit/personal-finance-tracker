import type { BankProfile } from "./types";

export function headerSignature(headers: string[]): string {
  return headers
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean)
    .sort()
    .join("|");
}

/** Builds a profile from a bank's CSV header and column choices. */
export const defineProfile = (
  name: string,
  headers: string[],
  cols: Partial<BankProfile> &
    Pick<BankProfile, "dateCol" | "descCol" | "signConvention">,
): BankProfile => ({
  name,
  headerSignature: headerSignature(headers),
  dateFormat: "MDY",
  skipRows: 0,
  builtin: true,
  amountCol: null,
  debitCol: null,
  creditCol: null,
  balanceCol: null,
  ...cols,
});

/**
 * UK banks. Column layouts are those of each bank's own CSV download; dates
 * may be "28/09/2024" or "28 Sep 2024" (both parse as day-first). Nationwide
 * puts account details above the header, which the importer skips by itself.
 */
export const UK_PROFILES: BankProfile[] = [
  defineProfile(
    "NatWest",
    [
      "Date",
      "Type",
      "Description",
      "Value",
      "Balance",
      "Account Name",
      "Account Number",
    ],
    {
      dateCol: "Date",
      descCol: "Description",
      amountCol: "Value",
      balanceCol: "Balance",
      signConvention: "outflow_negative",
      dateFormat: "DMY",
    },
  ),
  defineProfile(
    "Nationwide (current account)",
    [
      "Date",
      "Transaction type",
      "Description",
      "Paid out",
      "Paid in",
      "Balance",
    ],
    {
      dateCol: "Date",
      descCol: "Description",
      debitCol: "Paid out",
      creditCol: "Paid in",
      balanceCol: "Balance",
      signConvention: "debit_credit_cols",
      dateFormat: "DMY",
    },
  ),
  defineProfile(
    "Nationwide (current account, older export)",
    ["Date", "Transactions", "Credits", "Debits", "Balance"],
    {
      dateCol: "Date",
      descCol: "Transactions",
      debitCol: "Debits",
      creditCol: "Credits",
      balanceCol: "Balance",
      signConvention: "debit_credit_cols",
      dateFormat: "DMY",
    },
  ),
  defineProfile(
    "Nationwide (credit card)",
    ["Date", "Transactions", "Location", "Paid out", "Paid in"],
    {
      dateCol: "Date",
      descCol: "Transactions",
      debitCol: "Paid out",
      creditCol: "Paid in",
      signConvention: "debit_credit_cols",
      dateFormat: "DMY",
    },
  ),
  // Nationwide's midata download: a year of history (up to a month ago) with
  // every digit in the descriptions replaced by "*", one signed amount column,
  // and the payee of a transfer or credit in the Type column.
  defineProfile(
    "Nationwide (midata)",
    ["Date", "Type", "Merchant/Description", "Debit/Credit", "Balance"],
    {
      dateCol: "Date",
      descCol: "Merchant/Description",
      typeCol: "Type",
      amountCol: "Debit/Credit",
      balanceCol: "Balance",
      signConvention: "outflow_negative",
      dateFormat: "DMY",
    },
  ),
];

/** The formats the app recognises by themselves: UK banks. Any other bank is taught once through the mapping wizard. */
export const BUILTIN_PROFILES: BankProfile[] = [...UK_PROFILES];
