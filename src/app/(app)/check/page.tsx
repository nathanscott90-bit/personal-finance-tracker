import Link from "next/link";
import { getMonthlyCheck } from "@/actions/monthly";
import { CheckSettingsForm } from "@/components/finance/check/CheckSettingsForm";
import { RenewalDate } from "@/components/finance/check/RenewalDate";
import { Card } from "@/components/ui/card";
import { LOCALE } from "@/lib/locale";
import { formatCents } from "@/lib/money";
import type { Reconciliation, ReconStatus } from "@/lib/monthly/reconcile";

export const dynamic = "force-dynamic";

const day = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString(LOCALE, {
    day: "numeric",
    month: "short",
  });
const gbp = (c: number | null) =>
  c === null ? "—" : formatCents(c, { sign: "never" });
const signed = (c: number) =>
  c === 0 ? "—" : formatCents(c, { sign: "always" });

const STATUS: Record<ReconStatus, { label: string; cls: string }> = {
  match: { label: "As budgeted", cls: "text-ink-3" },
  minor: { label: "Minor difference", cls: "text-ink-3" },
  higher: { label: "Higher", cls: "text-negative" },
  lower: { label: "Lower", cls: "text-positive" },
  missing: { label: "Not taken", cls: "text-warning" },
  "not-yet": { label: "Not yet", cls: "text-ink-3" },
  new: { label: "New this month", cls: "text-warning" },
};

function BillsTable({ r, title }: { r: Reconciliation; title: string }) {
  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-headline font-semibold">{title}</h2>
        <div className="tnum text-caption text-ink-2">
          {day(r.period.start)} – {day(r.period.end)}
        </div>
      </div>
      <table className="tnum w-full text-body">
        <thead>
          <tr className="border-b border-line text-left text-caption text-ink-2">
            <th className="py-2 pr-3 font-normal">Bill</th>
            <th className="py-2 pr-3 text-right font-normal">Budgeted</th>
            <th className="py-2 pr-3 text-right font-normal">Actual</th>
            <th className="py-2 pr-3 text-right font-normal">Difference</th>
            <th className="py-2 font-normal">Status</th>
          </tr>
        </thead>
        <tbody>
          {r.rows.map((row) => (
            <tr key={row.name} className="border-b border-line last:border-0">
              <td className="py-2 pr-3">
                {row.name}
                {row.periodic && (
                  <span className="ml-1.5 text-caption text-ink-3">
                    usual amount
                  </span>
                )}
              </td>
              <td className="py-2 pr-3 text-right">{gbp(row.budgetCents)}</td>
              <td className="py-2 pr-3 text-right">{gbp(row.actualCents)}</td>
              <td
                className={`py-2 pr-3 text-right ${row.diffCents > 0 ? "text-negative" : row.diffCents < 0 ? "text-positive" : "text-ink-3"}`}
              >
                {signed(row.diffCents)}
              </td>
              <td className={`py-2 text-caption ${STATUS[row.status].cls}`}>
                {STATUS[row.status].label}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-line font-semibold">
            <td className="py-2 pr-3">Total</td>
            <td className="py-2 pr-3 text-right">{gbp(r.budgetCents)}</td>
            <td className="py-2 pr-3 text-right">{gbp(r.actualCents)}</td>
            <td
              className={`py-2 pr-3 text-right ${r.diffCents > 0 ? "text-negative" : r.diffCents < 0 ? "text-positive" : ""}`}
            >
              {signed(r.diffCents)}
            </td>
            <td />
          </tr>
        </tfoot>
      </table>
      <p className="mt-2 text-micro text-ink-3">
        Budget = what each payee took the period before (as in a monthly
        spreadsheet). Quarterly or annual bills use their usual amount.
      </p>
    </Card>
  );
}

export default async function CheckPage() {
  const { check: c, work, accounts } = await getMonthlyCheck();
  return (
    <>
      <div className="mb-6">
        <h1 className="text-title font-semibold">Monthly check</h1>
        <p className="text-caption text-ink-2">
          Bills, work expenses and savings for the last pay period. A summary is
          sent to your phone each payday.
        </p>
      </div>
      {!c.ready ? (
        <Card>
          <p className="text-body">{c.missing}</p>
        </Card>
      ) : (
        <div className="grid gap-6">
          {/* Headline numbers */}
          <div className="grid grid-cols-12 gap-6">
            <Card className="col-span-12 md:col-span-4">
              <div className="text-caption text-ink-2">
                Bills, {c.lastLabel}
              </div>
              <div className="tnum text-display font-semibold">
                {c.bills ? signed(c.bills.diffCents) : "—"}
              </div>
              <div className="tnum text-caption text-ink-2">
                {c.bills
                  ? `${gbp(c.bills.actualCents)} vs ${gbp(c.bills.budgetCents)} budgeted · ${c.bills.discrepancies.length} to look at`
                  : "Choose a bills account on Bills"}
              </div>
            </Card>
            <Card className="col-span-12 md:col-span-4">
              <div className="text-caption text-ink-2">Could go to savings</div>
              <div className="tnum text-display font-semibold">
                {c.surplus ? gbp(c.surplus.sweepCents) : "—"}
              </div>
              <div className="tnum text-caption text-ink-2">
                {c.surplus?.savingsName
                  ? `to ${c.surplus.savingsName} · saved ${gbp(c.surplus.savedLast12Cents)} in 12 months`
                  : "Link a Nationwide savings account to track it"}
              </div>
            </Card>
            <Card className="col-span-12 md:col-span-4">
              <div className="text-caption text-ink-2">Work expenses owed</div>
              <div
                className={`tnum text-display font-semibold ${c.work.overdue ? "text-negative" : ""}`}
              >
                {gbp(c.work.owedCents)}
              </div>
              <div className="tnum text-caption text-ink-2">
                {c.work.oldestUnpaid
                  ? `oldest ${day(c.work.oldestUnpaid.date)} · ${c.work.oldestUnpaidDays} days`
                  : "nothing outstanding"}
              </div>
            </Card>
          </div>

          {c.bills && (
            <BillsTable r={c.bills} title={`Bills check · ${c.lastLabel}`} />
          )}
          {c.billsNow?.rows.some((r) => r.actualCents !== null) && (
            <BillsTable
              r={c.billsNow}
              title={`This month so far · ${c.currentLabel}`}
            />
          )}

          <div className="grid grid-cols-12 gap-6">
            {/* Surplus */}
            <Card className="col-span-12 md:col-span-6">
              <h2 className="mb-2 text-headline font-semibold">
                Savings sweep
              </h2>
              {c.surplus?.balanceCents == null ? (
                <p className="text-caption text-ink-2">
                  No balance yet for the main account.
                </p>
              ) : (
                <dl className="tnum grid grid-cols-[1fr_auto] gap-y-1 text-body">
                  <dt className="text-ink-2">
                    {c.surplus.mainName} on{" "}
                    {day(c.surplus.balanceDate ?? c.today)}
                  </dt>
                  <dd className="text-right">{gbp(c.surplus.balanceCents)}</dd>
                  <dt className="text-ink-2">Keep as a cushion</dt>
                  <dd className="text-right">−{gbp(c.surplus.cushionCents)}</dd>
                  <dt className="text-ink-2">
                    Personal card spending to pay off
                  </dt>
                  <dd className="text-right">
                    −
                    {gbp(
                      Math.max(
                        0,
                        c.surplus.cardOwedCents - c.surplus.workOwedCents,
                      ),
                    )}
                  </dd>
                  <dt className="border-t border-line pt-1 font-semibold">
                    Move to savings
                  </dt>
                  <dd className="border-t border-line pt-1 text-right font-semibold">
                    {gbp(c.surplus.sweepCents)}
                  </dd>
                </dl>
              )}
              <p className="mt-2 text-micro text-ink-3">
                Worked out on the last day of the pay period, before salary
                lands. Work spending on the card is left out; your employer
                repays it.
              </p>
            </Card>

            {/* Drift */}
            <Card className="col-span-12 md:col-span-6">
              <h2 className="mb-2 text-headline font-semibold">
                Spending vs usual
              </h2>
              {c.drift.length === 0 ? (
                <p className="text-caption text-ink-2">
                  Nothing well above your usual in {c.lastLabel}.
                </p>
              ) : (
                <ul className="tnum grid gap-2 text-body">
                  {c.drift.map((d) => (
                    <li key={d.name} className="flex justify-between gap-3">
                      <span>{d.name}</span>
                      <span>
                        {gbp(d.thisCents)}{" "}
                        <span className="text-caption text-ink-3">
                          usually {gbp(d.usualCents)}
                        </span>{" "}
                        <span className="text-negative">
                          +{gbp(d.overCents)}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-2 text-micro text-ink-3">
                Day-to-day categories over 30% and £50 above their 3-month
                average.
              </p>
            </Card>
          </div>

          <div className="grid grid-cols-12 gap-6">
            {/* Subscriptions */}
            <Card className="col-span-12 md:col-span-6">
              <h2 className="mb-1 text-headline font-semibold">
                Subscriptions
              </h2>
              <p className="mb-3 tnum text-caption text-ink-2">
                {gbp(c.subscriptions.reduce((n, s) => n + s.annualCents, 0))} a
                year
              </p>
              {c.subscriptions.length === 0 ? (
                <p className="text-caption text-ink-2">None found yet.</p>
              ) : (
                <ul className="tnum grid gap-2 text-body">
                  {c.subscriptions.map((s) => (
                    <li key={s.name} className="flex justify-between gap-3">
                      <span>
                        {s.name}
                        {s.riseCents > 0 && (
                          <span className="ml-1.5 text-caption text-negative">
                            up {gbp(s.riseCents)}
                          </span>
                        )}
                      </span>
                      <span>
                        {gbp(s.latestCents)}{" "}
                        <span className="text-caption text-ink-3">
                          {s.cadence} · {gbp(s.annualCents)}/yr
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            {/* Renewals */}
            <Card className="col-span-12 md:col-span-6">
              <h2 className="mb-1 text-headline font-semibold">Renewals</h2>
              <p className="mb-3 text-caption text-ink-2">
                You're reminded {c.settings.renewalLeadDays} days before, the
                best time to switch or haggle. Add dates for monthly contracts.
              </p>
              {c.renewals.length === 0 ? (
                <p className="text-caption text-ink-2">
                  No insurance, energy or broadband bills found yet.
                </p>
              ) : (
                <ul className="tnum grid gap-2 text-body">
                  {c.renewals.map((r) => (
                    <li
                      key={r.name}
                      className="flex flex-wrap items-center justify-between gap-2"
                    >
                      <span>
                        {r.name}{" "}
                        <span className="text-caption text-ink-3">
                          {gbp(r.annualCents)}/yr
                        </span>
                      </span>
                      {r.source === "annual-bill" ? (
                        <span
                          className={`text-caption ${r.daysAway !== null && r.daysAway <= c.settings.renewalLeadDays ? "text-warning" : "text-ink-2"}`}
                        >
                          {r.date ? day(r.date) : ""}
                        </span>
                      ) : (
                        <RenewalDate merchant={r.name} date={r.date} />
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          {/* Work */}
          <Card>
            <h2 className="mb-1 text-headline font-semibold">Work expenses</h2>
            <p className="mb-3 text-caption text-ink-2">
              {c.work.cardName ? `On ${c.work.cardName}. ` : ""}
              Kept out of your household spending. Repayments from your employer
              are matched automatically, oldest first.
              {c.work.lastRepaidDate &&
                ` Last repayment ${gbp(c.work.repaidLastCents)} on ${day(c.work.lastRepaidDate)}.`}
            </p>
            {c.work.items.length === 0 ? (
              <p className="text-caption text-ink-2">
                Nothing waiting to be repaid.
              </p>
            ) : (
              <ul className="tnum grid gap-1 text-body">
                {c.work.items.map((i) => (
                  <li key={i.id} className="flex justify-between gap-3">
                    <span>
                      <span className="text-caption text-ink-2">
                        {day(i.date)}
                      </span>{" "}
                      {i.merchant}
                    </span>
                    <span>
                      {gbp(i.unpaidCents)}
                      {i.unpaidCents < i.cents && (
                        <span className="text-caption text-ink-3">
                          {" "}
                          of {gbp(i.cents)}
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-2 text-micro text-ink-3">
              Wrongly tagged? Change its category on{" "}
              <Link href="/transactions" className="text-accent">
                Transactions
              </Link>
              ; your choice is kept.
            </p>
          </Card>

          <Card>
            <h2 className="mb-3 text-headline font-semibold">Settings</h2>
            <CheckSettingsForm
              accounts={accounts}
              cardAccountId={work.cardAccountId}
              allOnCardIsWork={work.allOnCardIsWork}
              savingsAccountId={c.settings.savingsAccountId}
              mainAccountId={c.settings.mainAccountId}
              cushionCents={c.settings.cushionCents}
              toleranceCents={c.settings.toleranceCents}
            />
          </Card>
        </div>
      )}
    </>
  );
}
