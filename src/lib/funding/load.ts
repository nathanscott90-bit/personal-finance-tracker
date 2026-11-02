import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { resolvePayday } from "@/lib/budget/payday";
import { daysBetween } from "@/lib/dates";
import type { Db } from "@/lib/db/client";
import { accounts, balanceSnapshots, transactions } from "@/lib/db/schema";
import { type Bill, listBills } from "@/lib/recurring/refresh";
import { getSetting, setSetting } from "@/lib/settings";
import {
  billAmount,
  type FundingBill,
  type FundingPlan,
  fundingPlan,
} from "./plan";

export const FUNDING_KEY = "bills_funding";

export const fundingSettingsSchema = z.object({
  billsAccountId: z.number().int().positive(),
  bufferCents: z.number().int().min(0).max(100_000_00),
});
export type FundingSettings = z.infer<typeof fundingSettingsSchema>;

/** A balance older than this is shown as stale. */
const STALE_DAYS = 7;

export type FundingPage = {
  accounts: { id: number; name: string }[];
  billsAccountId: number | null;
  billsAccountName: string | null;
  /** True when the bills account was guessed rather than chosen. */
  guessed: boolean;
  bufferCents: number;
  payDay: number | null;
  paydayInferred: boolean;
  /** Why there is no plan, when there isn't one. */
  missing: "account" | "balance" | "payday" | "monthly-payday" | null;
  balanceStaleDays: number | null;
  plan: FundingPlan | null;
  /** Bills paid from the account, for the "what's included" list. */
  billCount: number;
};

/**
 * The account each bill is paid from: the account of the latest matching,
 * non-transfer payment. Recurring rows don't record an account, so this is
 * read from where the money actually went.
 */
export function billAccounts(db: Db, bills: Bill[]): Map<number, number> {
  const out = new Map<number, number>();
  for (const b of bills) {
    const row = db
      .select({ accountId: transactions.accountId })
      .from(transactions)
      .where(
        and(
          sql`lower(${transactions.merchant}) = ${b.merchant.toLowerCase()}`,
          eq(transactions.isTransfer, false),
          b.avgCents < 0
            ? sql`${transactions.amountCents} < 0`
            : sql`${transactions.amountCents} > 0`,
        ),
      )
      .orderBy(desc(transactions.date), desc(transactions.id))
      .limit(1)
      .get();
    if (row) out.set(b.id, row.accountId);
  }
  return out;
}

/**
 * Best guess at the bills account when none is chosen: a current account
 * whose name says "bill", then the current account that pays the most
 * recurring bills while receiving no salary.
 */
export function guessBillsAccount(
  db: Db,
  bills: Bill[],
  map: Map<number, number>,
): number | null {
  const current = db
    .select({ id: accounts.id, name: accounts.name, type: accounts.type })
    .from(accounts)
    .all()
    .filter((a) => a.type === "checking");
  const named = current.find((a) => /\bbills?\b/i.test(a.name));
  if (named) return named.id;
  const salaryAccounts = new Set(
    bills.filter((b) => b.isIncome).map((b) => map.get(b.id)),
  );
  const counts = new Map<number, number>();
  for (const b of bills) {
    if (b.isIncome || !b.active || b.dismissed) continue;
    const acct = map.get(b.id);
    if (acct === undefined || salaryAccounts.has(acct)) continue;
    counts.set(acct, (counts.get(acct) ?? 0) + 1);
  }
  const best = [...counts.entries()]
    .filter(([id]) => current.some((a) => a.id === id))
    .sort((a, b) => b[1] - a[1])[0];
  return best ? best[0] : null;
}

export function getFundingSettings(db: Db): Partial<FundingSettings> {
  const parsed = fundingSettingsSchema
    .partial()
    .safeParse(getSetting<unknown>(db, FUNDING_KEY, {}));
  return parsed.success ? parsed.data : {};
}

export function saveFundingSettings(db: Db, s: FundingSettings): void {
  setSetting(db, FUNDING_KEY, fundingSettingsSchema.parse(s));
}

export function loadFunding(db: Db, today: string): FundingPage {
  const { bills } = listBills(db, { today });
  const map = billAccounts(db, bills);
  const settings = getFundingSettings(db);
  const allAccounts = db
    .select({ id: accounts.id, name: accounts.name })
    .from(accounts)
    .all();
  const chosen =
    settings.billsAccountId !== undefined &&
    allAccounts.some((a) => a.id === settings.billsAccountId)
      ? settings.billsAccountId
      : null;
  const billsAccountId = chosen ?? guessBillsAccount(db, bills, map);
  const bufferCents = settings.bufferCents ?? 0;
  const payday = resolvePayday(db, bills, today);
  const payDay =
    payday?.config.schedule === "monthly" ? payday.config.day : null;

  const base: FundingPage = {
    accounts: allAccounts,
    billsAccountId,
    billsAccountName:
      allAccounts.find((a) => a.id === billsAccountId)?.name ?? null,
    guessed: chosen === null && billsAccountId !== null,
    bufferCents,
    payDay,
    paydayInferred: payday?.inferred ?? false,
    missing: null,
    balanceStaleDays: null,
    plan: null,
    billCount: 0,
  };
  if (billsAccountId === null) return { ...base, missing: "account" };
  if (!payday) return { ...base, missing: "payday" };
  if (payDay === null) return { ...base, missing: "monthly-payday" };

  const snap = db
    .select({
      date: balanceSnapshots.date,
      balanceCents: balanceSnapshots.balanceCents,
    })
    .from(balanceSnapshots)
    .where(
      and(
        eq(balanceSnapshots.accountId, billsAccountId),
        sql`${balanceSnapshots.date} <= ${today}`,
      ),
    )
    .orderBy(desc(balanceSnapshots.date))
    .limit(1)
    .get();
  if (!snap) return { ...base, missing: "balance" };

  const fundingBills: FundingBill[] = bills
    .filter((b) => b.active && !b.dismissed && map.get(b.id) === billsAccountId)
    .map((b) => {
      const { amountCents, variable } = billAmount(b.recentAmounts, b.avgCents);
      return {
        name: b.merchant,
        cadence: b.cadence,
        nextExpected: b.nextExpected,
        amountCents,
        variable,
      };
    });

  const plan = fundingPlan({
    today,
    balanceCents: snap.balanceCents,
    balanceDate: snap.date,
    bills: fundingBills,
    payDay,
    bufferCents,
  });
  const age = daysBetween(snap.date, today);
  return {
    ...base,
    plan,
    billCount: fundingBills.length,
    balanceStaleDays: age > STALE_DAYS ? age : null,
  };
}
