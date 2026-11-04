import { desc } from "drizzle-orm";
import { dataAgeDays } from "@/lib/bankfetch/freshness";
import { addDays, daysBetween } from "@/lib/dates";
import type { Db } from "@/lib/db/client";
import { accounts, balanceSnapshots, categories } from "@/lib/db/schema";
import {
  billAccounts,
  type FundingPage,
  loadFunding,
} from "@/lib/funding/load";
import { monthlyCheck, monthlyNotices } from "@/lib/monthly/check";
import { decideNotices, type Notice } from "@/lib/notify/decide";
import { getNotifyConfig } from "@/lib/notify/send";
import { listBills } from "@/lib/recurring/refresh";
import { getSavingsSettings } from "@/lib/savings/savings";

export type PhoneSummary = {
  today: string;
  funding: FundingPage;
  /** Things that need the user, most urgent first. */
  actions: Notice[];
  upcoming: {
    name: string;
    date: string;
    amountCents: number;
    account: string | null;
  }[];
  balances: {
    name: string;
    balanceCents: number;
    date: string;
    type: string;
  }[];
  /** Days since the app last had bank data; null when it has none. */
  dataAgeDays: number | null;
  month: {
    label: string;
    billsDiffCents: number | null;
    discrepancies: number;
    sweepCents: number;
    savingsName: string | null;
    workOwedCents: number;
  } | null;
};

const UPCOMING_DAYS = 14;

export function phoneSummary(db: Db, today: string): PhoneSummary {
  const funding = loadFunding(db, today);
  const { bills } = listBills(db, { today });
  const map = billAccounts(db, bills);
  const accts = db.select().from(accounts).all();
  const nameOf = new Map(accts.map((a) => [a.id, a.name]));

  const cfg = getNotifyConfig(db);
  const check = monthlyCheck(db, today);
  // The phone view always shows the next transfer, not only in the run-up.
  const actions = decideNotices({
    today,
    funding,
    settings: { ...cfg, reminderDays: 31 },
    billChanges: [],
    dataAgeDays: dataAgeDays(db, today),
  })
    .concat(
      // Only what's live now; the month-end summary lives on the check page.
      monthlyNotices(check, getSavingsSettings(db).renewalLeadDays).filter(
        (n) => !n.key.startsWith("period:"),
      ),
    )
    // The transfer itself has its own card on the phone view.
    .filter((n) => !n.key.startsWith("transfer:"))
    .sort(
      (a, b) =>
        (a.priority === "high" ? 0 : 1) - (b.priority === "high" ? 0 : 1),
    );

  const until = addDays(today, UPCOMING_DAYS);
  // Committed payments only: a regular takeaway or weekly shop isn't a bill.
  const parentKey = new Map<number, string | null>();
  const cats = db.select().from(categories).all();
  const byId = new Map(cats.map((c) => [c.id, c]));
  for (const c of cats)
    parentKey.set(
      c.id,
      c.parentId === null ? c.seedKey : (byId.get(c.parentId)?.seedKey ?? null),
    );
  const DISCRETIONARY = new Set(["food", "shopping", "fun", "gifts"]);
  const upcoming = bills
    .filter(
      (b) =>
        !(
          b.categoryId !== null &&
          DISCRETIONARY.has(parentKey.get(b.categoryId) ?? "")
        ) &&
        b.active &&
        !b.dismissed &&
        !b.isIncome &&
        // Overdue ones stay listed: expected but not yet taken.
        b.nextExpected <= until,
    )
    .map((b) => ({
      name: b.merchant,
      date: b.nextExpected,
      amountCents: b.recentAmounts.at(-1) ?? b.avgCents,
      account: nameOf.get(map.get(b.id) ?? -1) ?? null,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const snaps = db
    .select()
    .from(balanceSnapshots)
    .orderBy(desc(balanceSnapshots.date))
    .all();
  const latest = new Map<number, { balanceCents: number; date: string }>();
  for (const s of snaps)
    if (s.date <= today && !latest.has(s.accountId))
      latest.set(s.accountId, { balanceCents: s.balanceCents, date: s.date });
  const balances = accts.flatMap((a) => {
    const l = latest.get(a.id);
    return l ? [{ name: a.name, type: a.type, ...l }] : [];
  });

  return {
    today,
    funding,
    actions,
    upcoming,
    balances,
    dataAgeDays: dataAgeDays(db, today),
    month: check.ready
      ? {
          label: check.lastLabel,
          billsDiffCents: check.bills?.diffCents ?? null,
          discrepancies: check.bills?.discrepancies.length ?? 0,
          sweepCents: check.surplus?.sweepCents ?? 0,
          savingsName: check.surplus?.savingsName ?? null,
          workOwedCents: check.work.owedCents,
        }
      : null,
  };
}

export function daysAway(today: string, iso: string): string {
  const d = daysBetween(today, iso);
  if (d < 0) return `overdue ${-d} day${d === -1 ? "" : "s"}`;
  return d === 0 ? "today" : d === 1 ? "tomorrow" : `in ${d} days`;
}
