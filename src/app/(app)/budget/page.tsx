import Link from "next/link";
import { getBudgetPage } from "@/actions/budget";
import {
  BudgetTable,
  CopyLastMonthButton,
} from "@/components/finance/budget/BudgetTable";
import { MonthPicker } from "@/components/finance/MonthPicker";
import { Card } from "@/components/ui/card";
import { LOCALE } from "@/lib/locale";

export const dynamic = "force-dynamic";

const monthLabel = (m: string) =>
  new Date(`${m}-15T00:00:00`).toLocaleDateString(LOCALE, {
    month: "long",
    year: "numeric",
  });

function SetupCard({
  month,
  prevHasBudget,
  hasHistory,
}: {
  month: string;
  prevHasBudget: boolean;
  hasHistory: boolean;
}) {
  return (
    <Card>
      <h1 className="mb-1 text-headline font-semibold">Budget</h1>
      <p className="text-body text-ink-2">
        No budget for {monthLabel(month)} yet.
      </p>
      {!hasHistory && (
        <p className="mt-2 text-caption text-ink-2">
          There is no finished month of data yet, so the amounts start at zero.
          Fill them in by hand, or bring in more statements first (Settings →
          Bank download).
        </p>
      )}
      <div className="mt-4 flex items-center gap-3">
        <Link
          href={`/budget/setup?month=${month}`}
          className="inline-block rounded-control bg-accent px-5 py-2.5 text-body font-medium text-white"
        >
          {hasHistory ? "Start from your averages" : "Set up a budget"}
        </Link>
        {prevHasBudget && <CopyLastMonthButton month={month} />}
      </div>
    </Card>
  );
}

export default async function BudgetPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const { month } = await searchParams;
  const p = await getBudgetPage(month);
  if (!p.hasBudget)
    return (
      <SetupCard
        month={p.month}
        prevHasBudget={p.prevHasBudget}
        hasHistory={p.hasHistory}
      />
    );
  return (
    <>
      <div className="mb-6 flex items-end justify-between">
        <h1 className="text-title font-semibold">Budget</h1>
        <MonthPicker month={p.month} months={p.months} basePath="/budget" />
      </div>
      <BudgetTable page={p} />
    </>
  );
}
