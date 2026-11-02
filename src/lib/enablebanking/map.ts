import { createHash } from "node:crypto";
import type { SfinAccount, SfinTransaction } from "@/lib/simplefin/types";
import type {
  EbBalance,
  EbSessionAccount,
  EbTransaction,
  StoredSession,
} from "./types";

/** Prefix that keeps Enable Banking account ids apart from SimpleFIN's in the shared link table. */
export const EB_PREFIX = "eb:";

const unixDay = (iso: string | null | undefined): number => {
  if (!iso) return 0;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return 0;
  return Date.UTC(+m[1], +m[2] - 1, +m[3]) / 1000;
};

const clean = (s: string | null | undefined) =>
  (s ?? "").replace(/\s+/g, " ").trim();

function signedAmount(t: EbTransaction): string | null {
  const raw = clean(t.transaction_amount?.amount);
  if (!/^-?\d+(\.\d+)?$/.test(raw)) return null;
  const abs = raw.replace(/^-/, "");
  // The indicator is authoritative; a bank that also signs the amount is
  // read the same way.
  if (t.credit_debit_indicator === "DBIT") return `-${abs}`;
  if (t.credit_debit_indicator === "CRDT") return abs;
  return raw;
}

/**
 * Enable Banking transactions in the shape the SimpleFIN sync already
 * stores, so dedupe, pending handling, transfers and rules are shared.
 */
export function toSfinTransactions(
  uid: string,
  txns: EbTransaction[],
): {
  txns: SfinTransaction[];
  skipped: number;
} {
  const out: SfinTransaction[] = [];
  const seen = new Map<string, number>();
  let skipped = 0;
  for (const t of txns) {
    const amount = signedAmount(t);
    const pending = (t.status ?? "BOOK").toUpperCase() === "PDNG";
    const booked = t.booking_date ?? t.value_date ?? t.transaction_date;
    const when = t.transaction_date ?? t.value_date ?? t.booking_date;
    if (amount === null || !(booked || when)) {
      skipped++;
      continue;
    }
    const counterparty =
      t.credit_debit_indicator === "CRDT"
        ? clean(t.debtor?.name)
        : clean(t.creditor?.name);
    const remittance = clean((t.remittance_information ?? []).join(" "));
    const code = clean(t.bank_transaction_code?.description);
    const description = counterparty || remittance || code;
    const memo = counterparty ? remittance : "";

    let id = clean(t.transaction_id) || clean(t.entry_reference);
    if (!id) {
      // No id from the bank (common for pending rows): derive one from the
      // facts, numbering identical rows so genuine repeats survive.
      const base = createHash("sha256")
        .update(`${uid}|${when}|${amount}|${description}|${memo}|${pending}`)
        .digest("hex")
        .slice(0, 24);
      const n = seen.get(base) ?? 0;
      seen.set(base, n + 1);
      id = `h${base}${n ? `-${n}` : ""}`;
    }
    out.push({
      id: `${EB_PREFIX}${uid}:${id}`,
      posted: pending ? 0 : unixDay(booked),
      amount,
      description: description || null,
      memo: memo || null,
      pending,
      transacted_at: unixDay(when) || null,
    });
  }
  return { txns: out, skipped };
}

/** Booked balances first: the plan works from what has cleared. */
const BALANCE_ORDER = [
  "CLBD",
  "ITBD",
  "OPBD",
  "XPCD",
  "CLAV",
  "ITAV",
  "OPAV",
  "PRCD",
  "INFO",
];

export function pickBalance(
  balances: EbBalance[],
  now: Date,
): { amount: string; unix: number } | null {
  const usable = balances.filter((b) =>
    /^-?\d+(\.\d+)?$/.test(clean(b.balance_amount?.amount)),
  );
  if (!usable.length) return null;
  const rank = (b: EbBalance) => {
    const i = BALANCE_ORDER.indexOf((b.balance_type ?? "").toUpperCase());
    return i === -1 ? BALANCE_ORDER.length : i;
  };
  const b = [...usable].sort((x, y) => rank(x) - rank(y))[0];
  const raw = clean(b.balance_amount.amount);
  const abs = raw.replace(/^-/, "");
  const amount =
    b.credit_debit_indicator === "DBIT"
      ? `-${abs}`
      : b.credit_debit_indicator === "CRDT"
        ? abs
        : raw;
  const unix =
    unixDay(b.reference_date) ||
    (b.last_change_date_time
      ? Math.floor(new Date(b.last_change_date_time).getTime() / 1000)
      : 0) ||
    Math.floor(now.getTime() / 1000);
  return { amount, unix };
}

export function accountType(
  a: EbSessionAccount,
): StoredSession["accounts"][number]["type"] {
  const t = (a.cash_account_type ?? "").toUpperCase();
  const text = `${a.name ?? ""} ${a.product ?? ""} ${a.details ?? ""}`;
  if (t === "CARD" || /credit\s*card|\bcard\b/i.test(text)) return "credit";
  if (t === "SVGS" || /saver|savings|isa\b/i.test(text)) return "savings";
  return "checking";
}

export function accountName(bank: string, a: EbSessionAccount): string {
  const label =
    clean(a.name) || clean(a.product) || clean(a.details) || "Account";
  const ident =
    clean(a.account_id?.iban) || clean(a.account_id?.other?.identification);
  const last4 = ident ? ` ••${ident.slice(-4)}` : "";
  const named = label.toLowerCase().includes(bank.toLowerCase())
    ? label
    : `${bank} ${label}`;
  return `${named}${last4}`.slice(0, 60);
}

export function toSfinAccount(
  bank: string,
  acct: StoredSession["accounts"][number],
  txns: SfinTransaction[],
  balance: { amount: string; unix: number } | null,
): SfinAccount {
  return {
    id: `${EB_PREFIX}${acct.uid}`,
    org: { name: bank },
    name: acct.name,
    currency: acct.currency,
    balance: balance?.amount ?? "",
    "balance-date": balance?.unix ?? 0,
    transactions: txns,
  };
}
