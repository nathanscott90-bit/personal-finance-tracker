import { and, desc, eq, gte, lte } from "drizzle-orm";
import { addDays } from "@/lib/dates";
import type { Db } from "@/lib/db/client";
import { transactions } from "@/lib/db/schema";
import { occurrences } from "@/lib/forecast/events";
import type { Bill } from "@/lib/recurring/refresh";
import type { Period } from "./period";

export type ReconStatus =
  | "match"
  | "minor"
  | "higher"
  | "lower"
  | "missing"
  | "not-yet"
  | "new";

export type ReconRow = {
  name: string;
  /** Budget: what the same payee took last period (or its usual amount for a
   * quarterly/annual bill due this period). Positive pence. Null = no budget. */
  budgetCents: number | null;
  /** What actually went out this period. Positive pence. Null = not taken. */
  actualCents: number | null;
  diffCents: number;
  status: ReconStatus;
  dates: string[];
  /** Budget came from the bill's usual amount, not last period. */
  periodic: boolean;
};

export type Reconciliation = {
  period: Period;
  rows: ReconRow[];
  budgetCents: number;
  actualCents: number;
  diffCents: number;
  /** Rows outside the tolerance (higher, lower, missing, new). */
  discrepancies: ReconRow[];
  /** Period still running: missing bills show as "not yet". */
  inProgress: boolean;
};

type Out = { id: number; date: string; merchant: string; cents: number };

function outgoings(db: Db, accountId: number, p: Period): Out[] {
  return db
    .select({
      id: transactions.id,
      date: transactions.date,
      merchant: transactions.merchant,
      amountCents: transactions.amountCents,
      isTransfer: transactions.isTransfer,
      pending: transactions.pending,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.accountId, accountId),
        gte(transactions.date, p.start),
        lte(transactions.date, p.end),
      ),
    )
    .all()
    .filter((t) => !t.isTransfer && t.amountCents < 0)
    .map((t) => ({
      id: t.id,
      date: t.date,
      merchant: t.merchant,
      cents: -t.amountCents,
    }));
}

const key = (m: string) => m.trim().toLowerCase();

function group(
  list: Out[],
): Map<string, { name: string; cents: number; dates: string[] }> {
  const g = new Map<string, { name: string; cents: number; dates: string[] }>();
  for (const o of list) {
    const k = key(o.merchant);
    const cur = g.get(k) ?? { name: o.merchant, cents: 0, dates: [] };
    cur.cents += o.cents;
    cur.dates.push(o.date);
    g.set(k, cur);
  }
  return g;
}

/**
 * Budget vs actual for every payment out of the bills account in `period`,
 * the way it is done by hand: the budget for each payee is what it took last
 * period. A quarterly or annual bill due this period that did not appear last
 * period is budgeted at its usual amount instead.
 */
export function reconcile(
  db: Db,
  i: {
    accountId: number;
    period: Period;
    previous: Period;
    today: string;
    bills: Bill[];
    toleranceCents: number;
  },
): Reconciliation {
  const now = group(outgoings(db, i.accountId, i.period));
  const before = group(outgoings(db, i.accountId, i.previous));
  const inProgress = i.today <= i.period.end;

  const budget = new Map<
    string,
    { name: string; cents: number; periodic: boolean }
  >();
  for (const [k, v] of before)
    budget.set(k, { name: v.name, cents: v.cents, periodic: false });
  // Periodic bills due this period that last period didn't include.
  for (const b of i.bills) {
    if (!b.active || b.dismissed || b.isIncome) continue;
    if (
      b.cadence === "weekly" ||
      b.cadence === "biweekly" ||
      b.cadence === "monthly"
    )
      continue;
    const k = key(b.merchant);
    if (budget.has(k)) continue;
    // Is an occurrence due inside this period (counting one already taken)?
    const due = occurrences(
      b.lastSeen,
      b.cadence,
      addDays(i.period.start, -1),
      i.period.end,
    );
    if (!due.length) continue;
    const usual = Math.abs(b.recentAmounts.at(-1) ?? b.avgCents);
    budget.set(k, { name: b.merchant, cents: usual, periodic: true });
  }

  // A payee missing from last period but paid from this account before (a
  // skipped month, an annual bill) is budgeted at its last payment, not "new".
  for (const [k, v] of now) {
    if (budget.has(k)) continue;
    const earlier = db
      .select({
        cents: transactions.amountCents,
        merchant: transactions.merchant,
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.accountId, i.accountId),
          gte(transactions.date, addDays(i.previous.start, -400)),
          lte(transactions.date, addDays(i.previous.start, -1)),
        ),
      )
      .orderBy(desc(transactions.date))
      .all()
      .find((t) => t.cents < 0 && key(t.merchant) === k);
    if (earlier)
      budget.set(k, { name: v.name, cents: -earlier.cents, periodic: true });
  }

  const rows: ReconRow[] = [];
  const keys = new Set([...budget.keys(), ...now.keys()]);
  for (const k of keys) {
    const bud = budget.get(k);
    const act = now.get(k);
    const budgetCents = bud?.cents ?? null;
    const actualCents = act?.cents ?? null;
    const diff = (actualCents ?? 0) - (budgetCents ?? 0);
    let status: ReconStatus;
    if (budgetCents === null) status = "new";
    else if (actualCents === null) status = inProgress ? "not-yet" : "missing";
    else if (diff === 0) status = "match";
    else if (Math.abs(diff) <= i.toleranceCents) status = "minor";
    else status = diff > 0 ? "higher" : "lower";
    rows.push({
      name: act?.name ?? bud?.name ?? k,
      budgetCents,
      actualCents,
      diffCents: status === "not-yet" ? 0 : diff,
      status,
      dates: act?.dates ?? [],
      periodic: bud?.periodic ?? false,
    });
  }
  const order = (r: ReconRow) => r.dates[0] ?? "9999";
  rows.sort(
    (a, b) => order(a).localeCompare(order(b)) || a.name.localeCompare(b.name),
  );

  const sum = (f: (r: ReconRow) => number | null) =>
    rows.reduce((s, r) => s + (f(r) ?? 0), 0);
  const budgetCents = sum((r) => r.budgetCents);
  const actualCents = sum((r) => r.actualCents);
  return {
    period: i.period,
    rows,
    budgetCents,
    actualCents,
    // Sum of row differences: a bill not yet due adds nothing while the
    // period runs.
    diffCents: rows.reduce((n, r) => n + r.diffCents, 0),
    discrepancies: rows.filter((r) =>
      ["higher", "lower", "missing", "new"].includes(r.status),
    ),
    inProgress,
  };
}
