import { parseDateWithFormat } from "@/lib/dates";
import { parseAmountToCents } from "@/lib/money";
import { cleanMerchant } from "@/lib/normalize/merchant";
import type { BankProfile, ParsedRow, RawRow, RowError } from "./types";

/**
 * The description, or the transaction type when the description names no one:
 * Nationwide puts the payee of a transfer or credit in its Type column ("Bank
 * credit ACME LTD") with only a reference in the description, and a fee or
 * cash withdrawal is just "Withdrawal 31 October 2026" either way.
 */
export function describe(description: string, type: string): string {
  if (!type) return description;
  const namesNoOne =
    !/[a-z]{2}/i.test(description) || /^withdrawal\b/i.test(description);
  return namesNoOne ? type : description;
}

type Result = { ok: true; row: ParsedRow } | { ok: false; error: RowError };

export function normalizeRow(
  row: RawRow,
  profile: BankProfile,
  rowIndex: number,
): Result {
  const fail = (reason: string): Result => ({
    ok: false,
    error: { rowIndex, reason },
  });
  const date = parseDateWithFormat(
    row[profile.dateCol] ?? "",
    profile.dateFormat,
  );
  if (!date) return fail(`Bad date "${row[profile.dateCol] ?? ""}"`);

  let amountCents: number | null = null;
  if (profile.signConvention === "debit_credit_cols") {
    const debit = parseAmountToCents(row[profile.debitCol ?? ""] ?? "");
    const credit = parseAmountToCents(row[profile.creditCol ?? ""] ?? "");
    if (debit !== null && debit !== 0) amountCents = -Math.abs(debit);
    else if (credit !== null && credit !== 0) amountCents = Math.abs(credit);
    else if (debit !== null || credit !== null) amountCents = 0;
  } else {
    const a = parseAmountToCents(row[profile.amountCol ?? ""] ?? "");
    if (a !== null)
      amountCents = profile.signConvention === "outflow_positive" ? -a : a;
  }
  if (amountCents === null) return fail("Missing amount");

  // NatWest prefixes text cells with an apostrophe to stop Excel
  // reformatting them ("'TESCO STORES 1234").
  const rawDescription = describe(
    (row[profile.descCol] ?? "").trim().replace(/^'+/, "").trim(),
    profile.typeCol ? (row[profile.typeCol] ?? "").trim() : "",
  );
  if (!rawDescription) return fail("Missing description");
  const balanceRaw = profile.balanceCol ? row[profile.balanceCol] : undefined;
  const balanceCents = balanceRaw ? parseAmountToCents(balanceRaw) : null;
  return {
    ok: true,
    row: {
      date,
      amountCents,
      rawDescription,
      merchant: cleanMerchant(rawDescription),
      balanceCents,
    },
  };
}
