import Link from "next/link";
import { listAccounts } from "@/actions/accounts";
import { getAlerts } from "@/actions/alerts";
import { getBankDownloadAction } from "@/actions/bankdownload";
import { upcomingBills } from "@/actions/bills";
import { getBudgetPage } from "@/actions/budget";
import { getForecast } from "@/actions/forecast";
import { getFunding } from "@/actions/funding";
import { getInsights } from "@/actions/insights";
import { getReviewStatusAction } from "@/actions/weekly";
import { AmountText } from "@/components/finance/AmountText";
import { AlertList } from "@/components/finance/alerts/AlertList";
import { SafeToSpendCard } from "@/components/finance/budget/SafeToSpendCard";
import { DeltaCaption } from "@/components/finance/DeltaCaption";
import { FundingCard } from "@/components/finance/funding/FundingCard";
import { WeeklyReviewCard } from "@/components/finance/ritual/WeeklyReviewCard";
import { Card } from "@/components/ui/card";
import { getDb } from "@/lib/db/client";
import { LOCALE } from "@/lib/locale";
import { queueCount } from "@/lib/review/queue";
import { groupTransactionsHref } from "@/lib/transactions/links";

const monthLabel = (m: string) =>
  new Date(`${m}-15T00:00:00`).toLocaleDateString(LOCALE, { month: "long" });

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const accounts = await listAccounts();
  if (accounts.length === 0) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center">
        <Card className="max-w-md text-center">
          <h1 className="mb-2 text-title font-semibold">No accounts yet</h1>
          <p className="mb-6 text-body text-ink-2">
            Add an account, then bring in your statements. Everything stays on
            this computer.
          </p>
          <Link
            href="/accounts"
            className="inline-block rounded-control bg-accent px-5 py-2.5 text-body font-medium text-white"
          >
            Add an account
          </Link>
        </Card>
      </div>
    );
  }
  const toReview = queueCount(getDb());
  const due = await upcomingBills(7);
  const dueTotalCents = due.reduce((s, b) => s + Math.abs(b.avgCents), 0);
  const insights = await getInsights();
  const budget = await getBudgetPage();
  const forecast =
    budget.hasBudget && budget.safeToSpend ? await getForecast(30) : null;
  const dipNote =
    forecast?.hasCash && forecast.belowFloorOn !== null
      ? { cents: forecast.lowestCents, date: forecast.lowestDate }
      : undefined;
  const reviewStatus = await getReviewStatusAction();
  const funding = await getFunding();
  const { anomalies, dismissedKeys } = await getAlerts();
  const topCategories = insights.breakdown
    .filter((r): r is typeof r & { id: number } => r.id !== null)
    .slice(0, 3);
  const topShare = Math.max(...topCategories.map((r) => r.share), 0.0001);
  const { ageDays } = await getBankDownloadAction();
  return (
    <>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-title font-semibold">Home</h1>
        {ageDays !== null && (
          <Link
            href="/settings"
            className={`text-caption hover:underline ${ageDays >= 7 ? "text-warning" : "text-ink-2"}`}
          >
            {ageDays === 0
              ? "Bank data from today"
              : `Bank data ${ageDays} day${ageDays === 1 ? "" : "s"} old`}
            {ageDays >= 7 ? ". Time for a bank download" : ""}
          </Link>
        )}
      </div>
      <div className="grid grid-cols-12 gap-6">
        <FundingCard f={funding} className="col-span-12" />
        {!budget.hasBudget ? (
          <Card className="col-span-8">
            <h2 className="mb-1 text-headline font-semibold">
              Set up your {monthLabel(budget.month)} budget
            </h2>
            <Link
              href="/budget/setup"
              className="mt-3 inline-block rounded-control bg-accent px-5 py-2.5 text-body font-medium text-white"
            >
              {budget.hasHistory
                ? "Start from your averages"
                : "Set up a budget"}
            </Link>
          </Card>
        ) : (
          budget.safeToSpend && (
            <div className="col-span-8 grid gap-2">
              <SafeToSpendCard
                safe={budget.safeToSpend}
                payday={budget.payday}
                className="col-span-12"
                dipNote={dipNote}
              />
              <Link href="/budget" className="text-caption text-accent">
                Open budget
              </Link>
            </div>
          )
        )}
        <WeeklyReviewCard status={reviewStatus} className="col-span-4" />
        <Card className="col-span-4">
          <div className="text-caption text-ink-2">Spent this month</div>
          <AmountText
            cents={insights.totals.spent}
            sign="never"
            colorize={false}
            size="display"
            className="font-semibold"
          />
          <DeltaCaption
            now={insights.totals.spent}
            before={insights.lastTotals.spent}
            partial={insights.partialComparison}
            higherIsBetter={false}
          />
        </Card>
        <Card className="col-span-4">
          <div className="text-caption text-ink-2">To review</div>
          <div className="tnum text-display font-semibold">{toReview}</div>
          <Link href="/review" className="text-caption text-accent">
            Open review
          </Link>
        </Card>
        <Card className="col-span-4">
          <div className="text-caption text-ink-2">Bills due in 7 days</div>
          <div className="tnum text-display font-semibold">{due.length}</div>
          <AmountText
            cents={dueTotalCents}
            sign="never"
            colorize={false}
            size="caption"
            className="tnum text-ink-2"
          />
          <Link href="/bills" className="mt-1 block text-caption text-accent">
            Open bills
          </Link>
        </Card>
        {anomalies.length > 0 && (
          <Card className="col-span-12">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-headline font-semibold">Worth a look</h2>
              <Link href="/alerts" className="text-caption text-accent">
                See all {anomalies.length}
              </Link>
            </div>
            <AlertList
              anomalies={anomalies.slice(0, 4)}
              dismissedKeys={dismissedKeys}
              grouped={false}
              bare
            />
          </Card>
        )}
        <Card className="col-span-6">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-headline font-semibold">
              Bills due in the next 7 days
            </h2>
            <Link href="/bills" className="text-caption text-accent">
              See all
            </Link>
          </div>
          {due.length === 0 ? (
            <p className="text-caption text-ink-2">Nothing due this week.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {due.slice(0, 4).map((b) => (
                <li
                  key={b.id}
                  className="flex items-center justify-between text-caption"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="truncate text-ink">{b.merchant}</span>
                    {b.confidence === "likely" && (
                      <span
                        className="shrink-0 rounded-pill border border-dashed border-warning px-1.5 text-micro font-semibold text-warning"
                        title="Two identical charges a month apart; a third confirms it"
                      >
                        likely
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 text-ink-2">
                    {b.dueInDays === 0
                      ? "due today"
                      : `due in ${b.dueInDays} day${b.dueInDays === 1 ? "" : "s"}`}
                  </span>
                  <AmountText
                    cents={b.avgCents}
                    sign="never"
                    colorize={false}
                    className="shrink-0 text-ink font-medium"
                  />
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card className="col-span-6">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-headline font-semibold">
              Top categories this month
            </h2>
            <Link href="/insights" className="text-caption text-accent">
              See all
            </Link>
          </div>
          {topCategories.length === 0 ? (
            <p className="text-caption text-ink-2">
              No spending yet this month.
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {topCategories.map((r) => (
                <li key={r.name}>
                  <Link
                    href={groupTransactionsHref(r.id, insights.month)}
                    className="mb-1 flex items-center justify-between rounded-sm text-caption hover:text-accent hover:underline"
                  >
                    <span>{r.name}</span>
                    <AmountText
                      cents={r.thisMonth}
                      sign="never"
                      colorize={false}
                    />
                  </Link>
                  <div className="h-1.5 w-full overflow-hidden rounded-pill bg-subtle">
                    <div
                      className="h-full rounded-pill"
                      style={{
                        width: `${(r.share / topShare) * 100}%`,
                        backgroundColor: r.color,
                      }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
