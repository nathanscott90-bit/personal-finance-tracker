import { and, eq, inArray } from "drizzle-orm";
import { findCategoryIdBySeedKey } from "@/lib/categories/ensure";
import { daysBetween } from "@/lib/dates";
import type { Db } from "@/lib/db/client";
import { accounts, transactions } from "@/lib/db/schema";
import type { Bill } from "@/lib/recurring/refresh";
import { getSetting, setSetting } from "@/lib/settings";

export const WORK_EXPENSE_KEY = "work/work-expenses";
export const WORK_REPAID_KEY = "work/work-repayments";
export const WORK_SETTINGS_KEY = "work_settings";

export type WorkSettings = {
  /** The card used for work; null = guess the only/first credit card. */
  cardAccountId: number | null;
  /** Treat every purchase on that card as work. */
  allOnCardIsWork: boolean;
  /** Alert when a work expense is still unpaid after this many days. */
  overdueDays: number;
};

const DEFAULTS: WorkSettings = {
  cardAccountId: null,
  allOnCardIsWork: true,
  overdueDays: 30,
};

export function getWorkSettings(db: Db): WorkSettings {
  return {
    ...DEFAULTS,
    ...getSetting<Partial<WorkSettings>>(db, WORK_SETTINGS_KEY, {}),
  };
}
export function setWorkSettings(db: Db, s: WorkSettings): void {
  setSetting(db, WORK_SETTINGS_KEY, s);
}

export function workCardId(db: Db, s: WorkSettings): number | null {
  const cards = db
    .select({ id: accounts.id, name: accounts.name, type: accounts.type })
    .from(accounts)
    .all()
    .filter((a) => a.type === "credit");
  if (s.cardAccountId !== null && cards.some((c) => c.id === s.cardAccountId))
    return s.cardAccountId;
  return (
    (cards.find((c) => /nationwide/i.test(c.name)) ?? cards[0])?.id ?? null
  );
}

/** Business travel and subsistence: tagged as work on the card even when the
 * "everything is work" switch is off. */
const WORK_MERCHANTS =
  /\b(trainline|southeastern|national rail|lner|gwr|avanti|thameslink|tfl|premier inn|travelodge|ibis|holiday inn|hilton|marriott|ncp|ringgo|paybyphone|justpark|apcoa|dart charge|shell|esso|\bbp\b|texaco|tesco pfs|pfs|petrol|fuel|uber|bolt|addison lee|greggs|pret|costa|caffe nero|starbucks|wh smith|whsmith|subway|mcdonald)\b/i;

/** Expense claims paid back: an employer credit that isn't the salary. */
const REPAYMENT_TEXT = /\b(expenses?|exps?|reimb\w*|claims?)\b/i;

/**
 * Categorise work spending on the work card and employer repayments, leaving
 * anything the user has categorised by hand alone. Returns rows changed.
 */
export function applyWorkTags(db: Db, bills: Bill[]): number {
  const s = getWorkSettings(db);
  const expenseCat = findCategoryIdBySeedKey(db, WORK_EXPENSE_KEY);
  const repaidCat = findCategoryIdBySeedKey(db, WORK_REPAID_KEY);
  if (expenseCat === undefined || repaidCat === undefined) return 0;
  const card = workCardId(db, s);
  let changed = 0;
  const set = (ids: number[], categoryId: number) => {
    if (!ids.length) return;
    db.update(transactions)
      .set({ categoryId })
      .where(inArray(transactions.id, ids))
      .run();
    changed += ids.length;
  };

  if (card !== null) {
    const rows = db
      .select()
      .from(transactions)
      .where(
        and(eq(transactions.accountId, card), eq(transactions.reviewed, false)),
      )
      .all()
      .filter((t) => !t.isTransfer && t.categoryId !== expenseCat);
    set(
      rows
        .filter(
          (t) =>
            // purchases, and refunds of them (card repayments are transfers)
            (s.allOnCardIsWork || WORK_MERCHANTS.test(t.rawDescription)) &&
            !/payment received|thank you|direct debit/i.test(t.rawDescription),
        )
        .map((t) => t.id),
      expenseCat,
    );
  }

  // Employer repayments: credits from the salary payer that aren't the
  // salary amount, or credits that say "expenses".
  const salary = bills.filter((b) => b.isIncome && b.active && !b.dismissed);
  const payers = new Set(salary.map((b) => b.merchant.toLowerCase()));
  const salaryAmounts = salary.flatMap((b) => b.recentAmounts);
  const near = (c: number) =>
    salaryAmounts.some(
      (a) => Math.abs(a - c) <= Math.max(5000, Math.abs(a) * 0.15),
    );
  const credits = db
    .select()
    .from(transactions)
    .where(eq(transactions.reviewed, false))
    .all()
    .filter(
      (t) =>
        t.amountCents > 0 &&
        !t.isTransfer &&
        t.accountId !== card &&
        t.categoryId !== repaidCat,
    );
  set(
    credits
      .filter(
        (t) =>
          REPAYMENT_TEXT.test(t.rawDescription) ||
          (payers.has(t.merchant.toLowerCase()) && !near(t.amountCents)),
      )
      .map((t) => t.id),
    repaidCat,
  );
  return changed;
}

export type WorkItem = {
  id: number;
  date: string;
  merchant: string;
  cents: number;
  unpaidCents: number;
};

export type WorkSummary = {
  cardName: string | null;
  owedCents: number;
  items: WorkItem[];
  /** Oldest expense not yet covered by repayments. */
  oldestUnpaid: WorkItem | null;
  oldestUnpaidDays: number | null;
  overdue: boolean;
  repaidLastCents: number;
  lastRepaidDate: string | null;
};

/**
 * What the employer owes: work spending less repayments, with repayments
 * applied to the oldest expenses first.
 */
export function workSummary(db: Db, today: string): WorkSummary {
  const s = getWorkSettings(db);
  const expenseCat = findCategoryIdBySeedKey(db, WORK_EXPENSE_KEY);
  const repaidCat = findCategoryIdBySeedKey(db, WORK_REPAID_KEY);
  const card = workCardId(db, s);
  const cardName =
    card === null
      ? null
      : (db
          .select({ n: accounts.name })
          .from(accounts)
          .where(eq(accounts.id, card))
          .get()?.n ?? null);
  const empty: WorkSummary = {
    cardName,
    owedCents: 0,
    items: [],
    oldestUnpaid: null,
    oldestUnpaidDays: null,
    overdue: false,
    repaidLastCents: 0,
    lastRepaidDate: null,
  };
  if (expenseCat === undefined || repaidCat === undefined) return empty;
  const all = db
    .select()
    .from(transactions)
    .where(inArray(transactions.categoryId, [expenseCat, repaidCat]))
    .all()
    .filter((t) => !t.isTransfer)
    .sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id);
  const spends = all.filter((t) => t.categoryId === expenseCat);
  const repaid = all.filter((t) => t.categoryId === repaidCat);
  // Card refunds count as money back too.
  let pool =
    repaid.reduce((n, t) => n + t.amountCents, 0) +
    spends
      .filter((t) => t.amountCents > 0)
      .reduce((n, t) => n + t.amountCents, 0);
  const items: WorkItem[] = [];
  for (const t of spends.filter((x) => x.amountCents < 0)) {
    const cents = -t.amountCents;
    const covered = Math.min(pool, cents);
    pool -= covered;
    items.push({
      id: t.id,
      date: t.date,
      merchant: t.merchant,
      cents,
      unpaidCents: cents - covered,
    });
  }
  const unpaid = items.filter((x) => x.unpaidCents > 0);
  const oldest = unpaid[0] ?? null;
  const days = oldest ? daysBetween(oldest.date, today) : null;
  const last = repaid.at(-1) ?? null;
  return {
    cardName,
    owedCents: unpaid.reduce((n, x) => n + x.unpaidCents, 0),
    items: unpaid.reverse(),
    oldestUnpaid: oldest,
    oldestUnpaidDays: days,
    overdue: days !== null && days > s.overdueDays,
    repaidLastCents: last?.amountCents ?? 0,
    lastRepaidDate: last?.date ?? null,
  };
}
