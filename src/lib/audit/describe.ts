import { eq } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { accounts, categories, recurring, transactions } from "@/lib/db/schema";
import { formatCents } from "@/lib/money";

/** "Tesco · −£12.30 · 2026-10-03", or "transaction #12" once it is gone. */
export function txnLabel(db: Db, id: number): string {
  const t = db
    .select({
      merchant: transactions.merchant,
      amountCents: transactions.amountCents,
      date: transactions.date,
    })
    .from(transactions)
    .where(eq(transactions.id, id))
    .get();
  return t
    ? `${t.merchant} · ${formatCents(t.amountCents)} · ${t.date}`
    : `transaction #${id}`;
}

export function categoryLabel(db: Db, id: number | null): string {
  if (id === null) return "Uncategorized";
  return (
    db
      .select({ name: categories.name })
      .from(categories)
      .where(eq(categories.id, id))
      .get()?.name ?? `category #${id}`
  );
}

export function accountLabel(db: Db, id: number): string {
  return (
    db
      .select({ name: accounts.name })
      .from(accounts)
      .where(eq(accounts.id, id))
      .get()?.name ?? `account #${id}`
  );
}

export function billLabel(db: Db, id: number): string {
  return (
    db
      .select({ merchant: recurring.merchant })
      .from(recurring)
      .where(eq(recurring.id, id))
      .get()?.merchant ?? `bill #${id}`
  );
}
