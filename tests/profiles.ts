import { defineProfile, UK_PROFILES } from "@/lib/import/profiles";
import type { BankProfile } from "@/lib/import/types";

/**
 * US bank layouts, kept only to exercise the importer's general features
 * (sign conventions, separate debit/credit columns, headerless files). The app
 * itself recognises UK banks only.
 */
export const US_PROFILES: BankProfile[] = [
  defineProfile(
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
  defineProfile(
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
  defineProfile(
    "Bank of America",
    ["Date", "Description", "Amount", "Running Bal."],
    {
      dateCol: "Date",
      descCol: "Description",
      amountCol: "Amount",
      balanceCol: "Running Bal.",
      signConvention: "outflow_negative",
    },
  ),
  defineProfile(
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
  defineProfile("American Express", ["Date", "Description", "Amount"], {
    dateCol: "Date",
    descCol: "Description",
    amountCol: "Amount",
    signConvention: "outflow_positive",
  }),
  defineProfile(
    "Discover",
    ["Trans. Date", "Post Date", "Description", "Amount", "Category"],
    {
      dateCol: "Trans. Date",
      descCol: "Description",
      amountCol: "Amount",
      signConvention: "outflow_positive",
    },
  ),
  defineProfile(
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
  defineProfile(
    "Wells Fargo (headerless)",
    ["col1", "col2", "col3", "col4", "col5"],
    {
      dateCol: "col1",
      descCol: "col5",
      amountCol: "col2",
      signConvention: "outflow_negative",
    },
  ),
];

/** What the import tests run against: the UK formats plus the US sample layouts. */
export const TEST_PROFILES: BankProfile[] = [...UK_PROFILES, ...US_PROFILES];
