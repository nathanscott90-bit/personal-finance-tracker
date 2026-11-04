import { addDays, daysBetween } from "@/lib/dates";
import type { FundingPage } from "@/lib/funding/load";
import { LOCALE } from "@/lib/locale";
import { formatCents } from "@/lib/money";

export type Notice = {
  /** Stable identity: the same notice is never sent twice. */
  key: string;
  title: string;
  message: string;
  priority: "default" | "high";
};

/** Bills are not called "missing" when the data is older than this. */
const STALE_AFTER_DAYS = 3;
/** Weekly reminder to download once the data is this old. */
const NUDGE_AFTER_DAYS = 7;

export type NotifySettings = {
  /** Monthly standing order into the bills account; 0 = none. */
  standingOrderCents: number;
  /** Days before payday to send the transfer reminder. */
  reminderDays: number;
};

export type BillChange = {
  name: string;
  previousCents: number;
  latestCents: number;
  date: string;
};

const day = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString(LOCALE, {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
const gbp = (c: number) => formatCents(c, { sign: "never" });

/**
 * Everything worth telling the user today. Silence is the default: a month
 * that needs nothing doing produces nothing.
 */
export function decideNotices(i: {
  today: string;
  funding: FundingPage;
  settings: NotifySettings;
  billChanges: BillChange[];
  expiring: { bank: string; validUntil: string; expired: boolean }[];
  syncError: string | null;
  lastGoodSyncAt: string | null;
  /** Days since the app last got bank data; null when it has none yet. */
  dataAgeDays?: number | null;
  /** True when data arrives by manual download rather than automatic sync. */
  manualDownloads?: boolean;
}): Notice[] {
  const out: Notice[] = [];
  const { funding: f, today } = i;
  const plan = f.plan;
  const acct = f.billsAccountName ?? "the bills account";

  if (plan) {
    const until = daysBetween(today, plan.payday);
    if (until >= 0 && until <= i.settings.reminderDays) {
      const so = i.settings.standingOrderCents;
      const extra = plan.transferCents - so;
      if (so === 0 && plan.transferCents > 0)
        out.push({
          key: `transfer:${plan.payday}`,
          title: `Move ${gbp(plan.transferCents)} to ${acct}`,
          message: `On payday, ${day(plan.payday)}. Covers ${gbp(plan.payPeriod.outCents)} of bills up to ${day(addDays(plan.followingPayday, -1))}.${plan.includesEstimates ? " Some bills are estimates." : ""}`,
          priority: "default",
        });
      else if (so > 0 && extra > 0)
        out.push({
          key: `extra:${plan.payday}`,
          title: `Add ${gbp(extra)} to ${acct} this month`,
          message: `Your ${gbp(so)} standing order won't cover bills up to ${day(addDays(plan.followingPayday, -1))}. Move ${gbp(extra)} extra on ${day(plan.payday)}.`,
          priority: "default",
        });
    }
    if (plan.beforePayday.neededCents > 0)
      out.push({
        key: `topup:${plan.payday}:${plan.beforePayday.neededCents}`,
        title: `${acct} is short by ${gbp(plan.beforePayday.neededCents)}`,
        message: `Bills due before payday would take it to ${formatCents(plan.beforePayday.lowestCents)} on ${day(plan.beforePayday.lowestDate)}. Top up before then.`,
        priority: "high",
      });
    // A payment that has not appeared may simply not have been downloaded yet.
    const dataIsStale = (i.dataAgeDays ?? 0) > STALE_AFTER_DAYS;
    for (const e of plan.beforePayday.events.filter(
      (x) => x.overdue && !dataIsStale,
    ))
      out.push({
        key: `missing:${e.name}:${plan.payday}`,
        title: `${e.name} hasn't been taken`,
        message: `It was expected by now. Worth checking it hasn't been cancelled or failed.`,
        priority: "default",
      });
  }

  for (const c of i.billChanges)
    out.push({
      key: `increase:${c.name}:${c.date}`,
      title: `${c.name} went up to ${gbp(-c.latestCents)}`,
      message: `Was ${gbp(-c.previousCents)}. Future transfers now allow for the new amount.`,
      priority: "default",
    });

  for (const e of i.expiring)
    out.push({
      key: `consent:${e.bank}:${e.validUntil}:${e.expired ? "x" : "w"}`,
      title: e.expired
        ? `${e.bank} connection has expired`
        : `${e.bank} connection needs renewing`,
      message: e.expired
        ? "Open the app → Settings → Bank connection → Reconnect. Takes a minute."
        : `Access ends ${day(e.validUntil.slice(0, 10))}. Open the app → Settings → Bank connection → Reconnect.`,
      priority: e.expired ? "high" : "default",
    });

  if (
    i.manualDownloads &&
    i.dataAgeDays != null &&
    i.dataAgeDays >= NUDGE_AFTER_DAYS
  )
    out.push({
      key: `download:${Math.floor(Date.parse(`${today}T00:00:00Z`) / (7 * 86_400_000))}`,
      title: "Time for a bank download",
      message: `Your bank data is ${i.dataAgeDays} days old. Run Bank download on the PC (about two minutes).`,
      priority: "default",
    });

  if (i.syncError) {
    const stale =
      !i.lastGoodSyncAt ||
      daysBetween(i.lastGoodSyncAt.slice(0, 10), today) >= 2;
    if (stale)
      out.push({
        key: `syncfail:${today}`,
        title: "Bank sync is failing",
        message: i.syncError.slice(0, 300),
        priority: "default",
      });
  }
  return out;
}

/** Recent bills on the bills account whose latest charge is >10% above the one before. */
export function billIncreases(
  bills: {
    merchant: string;
    recentAmounts: number[];
    lastSeen: string;
    isIncome: boolean;
  }[],
  today: string,
): BillChange[] {
  const out: BillChange[] = [];
  for (const b of bills) {
    if (b.isIncome || b.recentAmounts.length < 2) continue;
    if (daysBetween(b.lastSeen, today) > 10) continue;
    const latest = b.recentAmounts[b.recentAmounts.length - 1];
    const prev = b.recentAmounts[b.recentAmounts.length - 2];
    if (latest < 0 && prev < 0 && Math.abs(latest) > Math.abs(prev) * 1.1)
      out.push({
        name: b.merchant,
        previousCents: prev,
        latestCents: latest,
        date: b.lastSeen,
      });
  }
  return out;
}
