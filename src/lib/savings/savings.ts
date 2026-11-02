import { and, desc, eq, gte, lte } from "drizzle-orm";
import { addDays, daysBetween } from "@/lib/dates";
import type { Db } from "@/lib/db/client";
import {
  accounts,
  balanceSnapshots,
  categories,
  transactions,
} from "@/lib/db/schema";
import { loadLines } from "@/lib/insights/lines";
import type { Period } from "@/lib/monthly/period";
import type { Bill } from "@/lib/recurring/refresh";
import { getSetting, setSetting } from "@/lib/settings";

export const SAVINGS_SETTINGS_KEY = "savings_settings";
export const RENEWALS_KEY = "renewal_dates";

export type SavingsSettings = {
  /** Where surplus goes; null = guess a Nationwide savings account. */
  savingsAccountId: number | null;
  /** Main (salary) account; null = guess. */
  mainAccountId: number | null;
  /** Kept in the main account as a cushion before suggesting a sweep. */
  cushionCents: number;
  /** Bills check: differences up to this are "minor" and don't alert. */
  toleranceCents: number;
  /** Remind this many days before a renewal. */
  renewalLeadDays: number;
};

const DEFAULTS: SavingsSettings = {
  savingsAccountId: null,
  mainAccountId: null,
  cushionCents: 25000,
  toleranceCents: 200,
  renewalLeadDays: 28,
};

export function getSavingsSettings(db: Db): SavingsSettings {
  return {
    ...DEFAULTS,
    ...getSetting<Partial<SavingsSettings>>(db, SAVINGS_SETTINGS_KEY, {}),
  };
}
export function setSavingsSettings(db: Db, s: SavingsSettings): void {
  setSetting(db, SAVINGS_SETTINGS_KEY, s);
}

type Acct = {
  id: number;
  name: string;
  type: string;
  institution: string | null;
};

export function savingsAccountId(db: Db, s: SavingsSettings): number | null {
  const all = db.select().from(accounts).all() as Acct[];
  if (
    s.savingsAccountId !== null &&
    all.some((a) => a.id === s.savingsAccountId)
  )
    return s.savingsAccountId;
  const savers = all.filter((a) => a.type === "savings");
  return (
    (
      savers.find((a) =>
        /nationwide/i.test(`${a.name} ${a.institution ?? ""}`),
      ) ?? savers[0]
    )?.id ?? null
  );
}

/** The account the salary lands in. */
export function mainAccountId(
  db: Db,
  s: SavingsSettings,
  bills: Bill[],
  incomeAccount: (b: Bill) => number | undefined,
  billsAccountId: number | null,
): number | null {
  const all = db.select().from(accounts).all() as Acct[];
  if (s.mainAccountId !== null && all.some((a) => a.id === s.mainAccountId))
    return s.mainAccountId;
  const salary = bills
    .filter((b) => b.isIncome && b.active && !b.dismissed)
    .sort((a, b) => b.monthlyCents - a.monthlyCents)[0];
  const fromSalary = salary ? incomeAccount(salary) : undefined;
  if (fromSalary !== undefined) return fromSalary;
  return (
    all.find((a) => a.type === "checking" && a.id !== billsAccountId)?.id ??
    null
  );
}

// ── Subscriptions ────────────────────────────────────────────────────────

const SUB_KEYS = new Set(["bills/subscriptions", "bills/gym-memberships"]);

export type Subscription = {
  name: string;
  cadence: string;
  latestCents: number;
  annualCents: number;
  /** Rise over the last few charges (shown on the page). */
  riseCents: number;
  /** The latest charge is higher than the one before it (alert once). */
  justRose: boolean;
  lastSeen: string;
};

/** The merchant's recent charges, newest first, from any account. */
function recentCharges(db: Db, merchant: string): number[] {
  return db
    .select({
      c: transactions.amountCents,
      m: transactions.merchant,
      t: transactions.isTransfer,
    })
    .from(transactions)
    .orderBy(desc(transactions.date), desc(transactions.id))
    .all()
    .filter(
      (x) => !x.t && x.c < 0 && x.m.toLowerCase() === merchant.toLowerCase(),
    )
    .slice(0, 4)
    .map((x) => -x.c);
}

export function subscriptions(db: Db, bills: Bill[]): Subscription[] {
  const seed = new Map(
    db
      .select({ id: categories.id, k: categories.seedKey })
      .from(categories)
      .all()
      .map((c) => [c.id, c.k]),
  );
  const perYear: Record<string, number> = {
    weekly: 52,
    biweekly: 26,
    monthly: 12,
    quarterly: 4,
    annual: 1,
  };
  return (
    bills
      .filter(
        (b) =>
          b.active &&
          !b.dismissed &&
          !b.isIncome &&
          b.categoryId !== null &&
          SUB_KEYS.has(seed.get(b.categoryId) ?? ""),
      )
      .map((b) => {
        // Price rises split a bill's amount cluster, so read the merchant's own
        // history rather than the cluster's.
        const charges = recentCharges(db, b.merchant);
        const latest = charges[0] ?? Math.abs(b.avgCents);
        const oldest = charges.at(-1) ?? latest;
        return {
          name: b.merchant,
          cadence: b.cadence,
          latestCents: latest,
          annualCents: latest * (perYear[b.cadence] ?? 12),
          riseCents: Math.max(0, latest - oldest),
          justRose: charges.length > 1 && latest > charges[1],
          lastSeen: b.lastSeen,
        };
      })
      // One row per merchant (a rise can leave two bill rows behind).
      .filter(
        (s, i, all) =>
          all.findIndex(
            (x) => x.name.toLowerCase() === s.name.toLowerCase(),
          ) === i,
      )
      .sort((a, b) => b.annualCents - a.annualCents)
  );
}

// ── Renewals ─────────────────────────────────────────────────────────────

const RENEWABLE_KEYS = new Set([
  "home/insurance",
  "home/utilities",
  "bills/phone-internet",
  "transport/car-payment-insurance",
]);

export type Renewal = {
  name: string;
  /** Next renewal date, or null when not known (monthly contract, not set). */
  date: string | null;
  source: "annual-bill" | "set" | "unknown";
  latestCents: number;
  annualCents: number;
  daysAway: number | null;
};

export function getRenewalDates(db: Db): Record<string, string> {
  return getSetting<Record<string, string>>(db, RENEWALS_KEY, {});
}
export function setRenewalDate(
  db: Db,
  merchant: string,
  date: string | null,
): void {
  const all = getRenewalDates(db);
  if (date) all[merchant.toLowerCase()] = date;
  else delete all[merchant.toLowerCase()];
  setSetting(db, RENEWALS_KEY, all);
}

/** A set renewal date rolls forward a year at a time once passed. */
function rollForward(date: string, today: string): string {
  let d = date;
  for (let i = 0; i < 10 && d < today; i++) {
    const [y, m, day] = d.split("-").map(Number);
    d = `${y + 1}-${String(m).padStart(2, "0")}-${String(m === 2 && day === 29 ? 28 : day).padStart(2, "0")}`;
  }
  return d;
}

export function renewals(db: Db, bills: Bill[], today: string): Renewal[] {
  const seed = new Map(
    db
      .select({ id: categories.id, k: categories.seedKey })
      .from(categories)
      .all()
      .map((c) => [c.id, c.k]),
  );
  const set = getRenewalDates(db);
  const perYear: Record<string, number> = {
    weekly: 52,
    biweekly: 26,
    monthly: 12,
    quarterly: 4,
    annual: 1,
  };
  const out: Renewal[] = [];
  const seen = new Set<string>();
  for (const b of bills) {
    if (!b.active || b.dismissed || b.isIncome) continue;
    if (seen.has(b.merchant.toLowerCase())) continue;
    seen.add(b.merchant.toLowerCase());
    const k = b.categoryId === null ? "" : (seed.get(b.categoryId) ?? "");
    const latest = Math.abs(b.recentAmounts.at(-1) ?? b.avgCents);
    const manual = set[b.merchant.toLowerCase()];
    let date: string | null = null;
    let source: Renewal["source"] = "unknown";
    if (manual) {
      date = rollForward(manual, today);
      source = "set";
    } else if (b.cadence === "annual") {
      date = b.nextExpected;
      source = "annual-bill";
    } else if (!RENEWABLE_KEYS.has(k) || /\bwater\b/i.test(b.merchant))
      continue;
    out.push({
      name: b.merchant,
      date,
      source,
      latestCents: latest,
      annualCents: latest * (perYear[b.cadence] ?? 12),
      daysAway: date ? daysBetween(today, date) : null,
    });
  }
  return out.sort(
    (a, b) =>
      (a.date ?? "9999").localeCompare(b.date ?? "9999") ||
      a.name.localeCompare(b.name),
  );
}

// ── Surplus ──────────────────────────────────────────────────────────────

export type Surplus = {
  mainName: string | null;
  savingsName: string | null;
  balanceCents: number | null;
  balanceDate: string | null;
  cardOwedCents: number;
  workOwedCents: number;
  cushionCents: number;
  /** What can go to savings: balance − cushion − personal card spend owed. */
  sweepCents: number;
  /** Moved into savings during the period. */
  savedThisPeriodCents: number;
  savedLast12Cents: number;
};

function latestBalance(db: Db, accountId: number, onOrBefore: string) {
  return db
    .select()
    .from(balanceSnapshots)
    .where(
      and(
        eq(balanceSnapshots.accountId, accountId),
        lte(balanceSnapshots.date, onOrBefore),
      ),
    )
    .orderBy(desc(balanceSnapshots.date))
    .limit(1)
    .get();
}

function inflows(db: Db, accountId: number, from: string, to: string): number {
  return db
    .select({ c: transactions.amountCents })
    .from(transactions)
    .where(
      and(
        eq(transactions.accountId, accountId),
        gte(transactions.date, from),
        lte(transactions.date, to),
      ),
    )
    .all()
    .reduce((n, t) => n + Math.max(0, t.c), 0);
}

/**
 * What was left in the main account at the end of `period` (the balance on
 * its last day, before the salary lands), less a cushion and less whatever is
 * owed on credit cards for personal spending — the work part is excluded
 * because the employer pays it back.
 */
export function surplus(
  db: Db,
  i: {
    period: Period;
    mainId: number | null;
    savingsId: number | null;
    cushionCents: number;
    workOwedCents: number;
    today: string;
  },
): Surplus {
  const name = (id: number | null) =>
    id === null
      ? null
      : (db
          .select({ n: accounts.name })
          .from(accounts)
          .where(eq(accounts.id, id))
          .get()?.n ?? null);
  const bal =
    i.mainId === null ? undefined : latestBalance(db, i.mainId, i.period.end);
  const cards = db
    .select()
    .from(accounts)
    .all()
    .filter((a) => a.type === "credit");
  // Liability snapshots hold what is owed as a positive number.
  const cardOwed = cards.reduce(
    (n, c) =>
      n + Math.max(0, latestBalance(db, c.id, i.period.end)?.balanceCents ?? 0),
    0,
  );
  const personalCard = Math.max(0, cardOwed - i.workOwedCents);
  const sweep = bal
    ? Math.max(0, bal.balanceCents - i.cushionCents - personalCard)
    : 0;
  return {
    mainName: name(i.mainId),
    savingsName: name(i.savingsId),
    balanceCents: bal?.balanceCents ?? null,
    balanceDate: bal?.date ?? null,
    cardOwedCents: cardOwed,
    workOwedCents: i.workOwedCents,
    cushionCents: i.cushionCents,
    // Round down to whole pounds: a cleaner number to type into the bank.
    sweepCents: Math.floor(sweep / 100) * 100,
    savedThisPeriodCents:
      i.savingsId === null
        ? 0
        : inflows(db, i.savingsId, i.period.start, i.period.end),
    savedLast12Cents:
      i.savingsId === null
        ? 0
        : inflows(db, i.savingsId, addDays(i.today, -365), i.today),
  };
}

// ── Spending drift ───────────────────────────────────────────────────────

export type Drift = {
  name: string;
  thisCents: number;
  usualCents: number;
  overCents: number;
};

/**
 * Day-to-day categories that ran well above their usual level in `period`
 * (usual = average of the three periods before). Fixed bills and savings are
 * left out: the bills check covers those.
 */
export function spendingDrift(db: Db, periods: Period[]): Drift[] {
  const [cur, ...prior] = periods;
  if (!cur || prior.length === 0) return [];
  const spend = (p: Period) => {
    const m = new Map<string, number>();
    for (const l of loadLines(db, { from: p.start, to: p.end })) {
      if (l.parentKind !== "expense" || l.isFixed) continue;
      if (l.parentSeedKey === "savings" || l.parentSeedKey === "debt") continue;
      // By leaf: a takeaway spike shouldn't hide inside the weekly shop.
      m.set(l.leafName, (m.get(l.leafName) ?? 0) - l.amountCents);
    }
    return m;
  };
  const now = spend(cur);
  const before = prior.map(spend);
  const out: Drift[] = [];
  for (const [name, cents] of now) {
    const usual = Math.round(
      before.reduce((n, m) => n + (m.get(name) ?? 0), 0) / before.length,
    );
    const over = cents - usual;
    if (usual > 0 && cents > usual * 1.3 && over >= 5000)
      out.push({ name, thisCents: cents, usualCents: usual, overCents: over });
  }
  return out.sort((a, b) => b.overCents - a.overCents);
}
