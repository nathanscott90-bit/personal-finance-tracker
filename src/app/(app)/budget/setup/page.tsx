import { getBudgetSetup } from "@/actions/budget";
import { BudgetSetup } from "@/components/finance/budget/BudgetSetup";
import { LOCALE } from "@/lib/locale";

export const dynamic = "force-dynamic";

const monthLabel = (m: string) =>
  new Date(`${m}-15T00:00:00`).toLocaleDateString(LOCALE, {
    month: "long",
    year: "numeric",
  });

export default async function BudgetSetupPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const { month } = await searchParams;
  const s = await getBudgetSetup(month);
  return (
    <>
      <div className="mb-6">
        <h1 className="text-title font-semibold">
          Set up {monthLabel(s.month)}
        </h1>
        <p className="mt-1 text-caption text-ink-2">
          {s.avgMonths === 0
            ? "No finished month of data yet, so the amounts start at zero."
            : `Prefilled from your last ${s.avgMonths} complete month${s.avgMonths === 1 ? "" : "s"}`}
        </p>
      </div>
      <BudgetSetup setup={s} />
    </>
  );
}
