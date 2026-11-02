import { resolvePayday } from "@/lib/budget/payday";
import type { Db } from "@/lib/db/client";
import { billAccounts, loadFunding } from "@/lib/funding/load";
import { LOCALE } from "@/lib/locale";
import { formatCents } from "@/lib/money";
import type { Notice } from "@/lib/notify/decide";
import { listBills } from "@/lib/recurring/refresh";
import {
  type Drift,
  getSavingsSettings,
  mainAccountId,
  type Renewal,
  renewals,
  type SavingsSettings,
  type Subscription,
  type Surplus,
  savingsAccountId,
  spendingDrift,
  subscriptions,
  surplus,
} from "@/lib/savings/savings";
import { applyWorkTags, type WorkSummary, workSummary } from "@/lib/work/work";
import {
  lastCompletePeriod,
  type Period,
  periodLabel,
  periodOf,
  previousPeriod,
} from "./period";
import { type Reconciliation, reconcile } from "./reconcile";

export type MonthlyCheck = {
  ready: boolean;
  /** Why not, when not ready. */
  missing: string | null;
  today: string;
  settings: SavingsSettings;
  billsAccountName: string | null;
  current: Period | null;
  last: Period | null;
  lastLabel: string;
  currentLabel: string;
  /** Bills check for the last finished period. */
  bills: Reconciliation | null;
  /** This period so far. */
  billsNow: Reconciliation | null;
  work: WorkSummary;
  subscriptions: Subscription[];
  renewals: Renewal[];
  surplus: Surplus | null;
  drift: Drift[];
};

export function monthlyCheck(db: Db, today: string): MonthlyCheck {
  let { bills } = listBills(db, { today });
  if (applyWorkTags(db, bills) > 0) bills = listBills(db, { today }).bills;
  const settings = getSavingsSettings(db);
  const funding = loadFunding(db, today);
  const payday = resolvePayday(db, bills, today);
  const payDay =
    payday?.config.schedule === "monthly" ? payday.config.day : null;
  const work = workSummary(db, today);
  const subs = subscriptions(db, bills);
  const renews = renewals(db, bills, today);
  const base: MonthlyCheck = {
    ready: false,
    missing: null,
    today,
    settings,
    billsAccountName: funding.billsAccountName,
    current: null,
    last: null,
    lastLabel: "",
    currentLabel: "",
    bills: null,
    billsNow: null,
    work,
    subscriptions: subs,
    renewals: renews,
    surplus: null,
    drift: [],
  };
  if (payDay === null)
    return { ...base, missing: "Set a monthly payday in Settings." };

  const current = periodOf(today, payDay);
  const last = lastCompletePeriod(today, payDay);
  const before = previousPeriod(last, payDay);
  const p3 = previousPeriod(before, payDay);
  const p4 = previousPeriod(p3, payDay);
  const map = billAccounts(db, bills);
  const billsId = funding.billsAccountId;
  const recon = (period: Period, previous: Period) =>
    billsId === null
      ? null
      : reconcile(db, {
          accountId: billsId,
          period,
          previous,
          today,
          bills: bills.filter((b) => map.get(b.id) === billsId),
          toleranceCents: settings.toleranceCents,
        });
  const savingsId = savingsAccountId(db, settings);
  const mainId = mainAccountId(
    db,
    settings,
    bills,
    (b) => map.get(b.id),
    billsId,
  );
  return {
    ...base,
    ready: true,
    current,
    last,
    lastLabel: periodLabel(last, LOCALE),
    currentLabel: periodLabel(current, LOCALE),
    bills: recon(last, before),
    billsNow: recon(current, last),
    surplus: surplus(db, {
      period: last,
      mainId,
      savingsId,
      cushionCents: settings.cushionCents,
      workOwedCents: work.owedCents,
      today,
    }),
    drift: spendingDrift(db, [last, before, p3, p4]),
  };
}

const gbp = (c: number) => formatCents(c, { sign: "never" });
const signed = (c: number) => formatCents(c, { sign: "always" });
const day = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString(LOCALE, {
    day: "numeric",
    month: "short",
  });

/** The month-end summary and the in-month alerts the check produces. */
export function monthlyNotices(
  c: MonthlyCheck,
  renewalLeadDays: number,
): Notice[] {
  if (!c.ready || !c.last || !c.current) return [];
  const out: Notice[] = [];

  // One summary per period, on payday or the first day after it the job runs.
  if (c.today >= c.current.start) {
    const parts: string[] = [];
    if (c.bills) {
      const top = c.bills.discrepancies
        .slice(0, 3)
        .map((r) =>
          r.status === "missing"
            ? `${r.name} not taken`
            : r.status === "new"
              ? `${r.name} ${gbp(r.actualCents ?? 0)} (new)`
              : `${r.name} ${signed(r.diffCents)}`,
        );
      parts.push(
        `Bills ${gbp(c.bills.actualCents)} vs ${gbp(c.bills.budgetCents)} budgeted (${signed(c.bills.diffCents)}).${top.length ? ` ${top.join("; ")}.` : " All as expected."}`,
      );
    }
    if (c.surplus && c.surplus.sweepCents > 0 && c.surplus.savingsName)
      parts.push(
        `Move ${gbp(c.surplus.sweepCents)} to ${c.surplus.savingsName}.`,
      );
    if (c.work.owedCents > 0)
      parts.push(`Work expenses owed: ${gbp(c.work.owedCents)}.`);
    if (c.drift.length)
      parts.push(
        `Above usual: ${c.drift
          .slice(0, 2)
          .map((d) => `${d.name} +${gbp(d.overCents)}`)
          .join(", ")}.`,
      );
    if (parts.length)
      out.push({
        key: `period:${c.last.start}`,
        title: `${c.lastLabel} check`,
        message: parts.join(" "),
        priority: "default",
      });
  }

  // As it happens: a bills-account payment above budget, or one not budgeted.
  for (const r of c.billsNow?.rows ?? []) {
    if (r.status !== "higher" && r.status !== "new") continue;
    out.push({
      key: `disc:${r.name}:${c.current.start}:${r.actualCents}`,
      title:
        r.status === "new"
          ? `New payment from ${c.billsAccountName ?? "bills"}: ${r.name} ${gbp(r.actualCents ?? 0)}`
          : `${r.name} ${gbp(r.actualCents ?? 0)}, ${signed(r.diffCents)} on last month`,
      message:
        r.status === "new"
          ? "Not seen last month. Next month's transfer allows for it if it repeats."
          : `Budgeted ${gbp(r.budgetCents ?? 0)}. Next month's transfer uses the new amount.`,
      priority: "default",
    });
  }

  if (c.work.overdue && c.work.oldestUnpaid)
    out.push({
      key: `work-overdue:${c.work.oldestUnpaid.id}`,
      title: `Work expenses unpaid: ${gbp(c.work.owedCents)}`,
      message: `Oldest is ${c.work.oldestUnpaid.merchant} on ${day(c.work.oldestUnpaid.date)}, ${c.work.oldestUnpaidDays} days ago. Worth chasing the claim.`,
      priority: "default",
    });

  for (const r of c.renewals)
    if (
      r.date &&
      r.daysAway !== null &&
      r.daysAway >= 0 &&
      r.daysAway <= renewalLeadDays
    )
      out.push({
        key: `renew:${r.name}:${r.date}`,
        title: `${r.name} renews ${day(r.date)}`,
        message: `About ${gbp(r.annualCents)} a year. Get quotes now: switching or haggling before renewal usually saves the most.`,
        priority: "default",
      });

  for (const s of c.subscriptions)
    if (s.justRose && s.lastSeen >= c.current.start)
      out.push({
        key: `subrise:${s.name}:${s.lastSeen}`,
        title: `${s.name} went up ${gbp(s.riseCents)}`,
        message: `Now ${gbp(s.latestCents)} (${gbp(s.annualCents)} a year). Still worth it?`,
        priority: "default",
      });
  return out;
}
