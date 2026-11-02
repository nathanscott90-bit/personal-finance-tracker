import type { BankProfile } from "./types";

export function headerSignature(headers: string[]): string {
  return headers
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean)
    .sort()
    .join("|");
}

const P = (
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
  P(
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
  P(
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
  P(
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
  P(
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
];

export const BUILTIN_PROFILES: BankProfile[] = [
  ...UK_PROFILES,
  P(
    "Chase (card)",
    [
      "Transaction Date",
      "Post Date",
      "Description",
      "Category",
      "Type",
      "Amount",
      "Memo",
    ],
    {
      dateCol: "Transaction Date",
      descCol: "Description",
      amountCol: "Amount",
      signConvention: "outflow_negative",
    },
  ),
  P(
    "Chase (checking)",
    [
      "Details",
      "Posting Date",
      "Description",
      "Amount",
      "Type",
      "Balance",
      "Check or Slip #",
    ],
    {
      dateCol: "Posting Date",
      descCol: "Description",
      amountCol: "Amount",
      balanceCol: "Balance",
      signConvention: "outflow_negative",
    },
  ),
  P("Bank of America", ["Date", "Description", "Amount", "Running Bal."], {
    dateCol: "Date",
    descCol: "Description",
    amountCol: "Amount",
    balanceCol: "Running Bal.",
    signConvention: "outflow_negative",
  }),
  P(
    "Capital One",
    [
      "Transaction Date",
      "Posted Date",
      "Card No.",
      "Description",
      "Category",
      "Debit",
      "Credit",
    ],
    {
      dateCol: "Transaction Date",
      descCol: "Description",
      debitCol: "Debit",
      creditCol: "Credit",
      signConvention: "debit_credit_cols",
      dateFormat: "YMD",
    },
  ),
  P("American Express", ["Date", "Description", "Amount"], {
    dateCol: "Date",
    descCol: "Description",
    amountCol: "Amount",
    signConvention: "outflow_positive",
  }),
  P(
    "Discover",
    ["Trans. Date", "Post Date", "Description", "Amount", "Category"],
    {
      dateCol: "Trans. Date",
      descCol: "Description",
      amountCol: "Amount",
      signConvention: "outflow_positive",
    },
  ),
  P(
    "Citi",
    ["Status", "Date", "Description", "Debit", "Credit", "Member Name"],
    {
      dateCol: "Date",
      descCol: "Description",
      debitCol: "Debit",
      creditCol: "Credit",
      signConvention: "debit_credit_cols",
    },
  ),
  P("Wells Fargo (headerless)", ["col1", "col2", "col3", "col4", "col5"], {
    dateCol: "col1",
    descCol: "col5",
    amountCol: "col2",
    signConvention: "outflow_negative",
  }),
];
