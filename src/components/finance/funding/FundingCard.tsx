import Link from "next/link";
import { AmountText } from "@/components/finance/AmountText";
import { Card } from "@/components/ui/card";
import type { FundingPage } from "@/lib/funding/load";
import type { FundingEvent, FundingWindow } from "@/lib/funding/plan";
import { LOCALE } from "@/lib/locale";
import { formatCents } from "@/lib/money";
import { FundingSettingsForm } from "./FundingSettingsForm";

const day = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString(LOCALE, {
    weekday: "short",
    day: "numeric",
    month: "short",
  });

const MISSING: Record<NonNullable<FundingPage["missing"]>, React.ReactNode> = {
  account: "Choose the account your household bills are paid from.",
  balance:
    "No balance yet for the bills account. Import a statement that includes a balance column (NatWest's does), or sync it.",
  payday: (
    <>
      Set your payday in{" "}
      <Link href="/settings" className="text-accent">
        Settings
      </Link>{" "}
      so the transfer can be dated.
    </>
  ),
  "monthly-payday": (
    <>
      Funding is worked out per monthly pay period. Set a monthly payday in{" "}
      <Link href="/settings" className="text-accent">
        Settings
      </Link>
      .
    </>
  ),
};

function Schedule({
  w,
  label,
  offsetCents = 0,
}: {
  w: FundingWindow;
  label: string;
  /** Added to each running balance (the payday transfer, for the pay period). */
  offsetCents?: number;
}) {
  if (w.events.length === 0) return null;
  return (
    <div className="mt-3">
      <div className="mb-1 text-micro font-medium uppercase tracking-wide text-ink-3">
        {label}
      </div>
      <table className="tnum w-full text-caption">
        <tbody>
          {w.events.map((e: FundingEvent) => (
            <tr
              key={`${e.date}-${e.name}-${e.amountCents}`}
              className="border-b border-line last:border-0"
            >
              <td className="py-1 pr-3 text-ink-2">{day(e.date)}</td>
              <td className="py-1 pr-3">
                {e.name}
                {e.variable && (
                  <span className="ml-1.5 text-ink-3">estimate</span>
                )}
                {e.overdue && (
                  <span className="ml-1.5 text-warning">not yet taken</span>
                )}
              </td>
              <td className="py-1 pr-3 text-right">
                {formatCents(e.amountCents, { sign: "always" })}
              </td>
              <td
                className={`py-1 text-right ${e.afterCents + offsetCents < 0 ? "text-negative" : "text-ink-2"}`}
              >
                {formatCents(e.afterCents + offsetCents)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function FundingCard({
  f,
  className,
}: {
  f: FundingPage;
  className?: string;
}) {
  const plan = f.plan;
  const settings = (
    <details className="mt-4" open={f.billsAccountId === null}>
      <summary className="cursor-pointer text-caption text-accent">
        {f.billsAccountId === null ? "Set up" : "Change account or buffer"}
      </summary>
      <div className="mt-3">
        <FundingSettingsForm
          accounts={f.accounts}
          billsAccountId={f.billsAccountId}
          bufferCents={f.bufferCents}
        />
      </div>
    </details>
  );

  if (!plan) {
    return (
      <Card className={className}>
        <div className="text-caption text-ink-2">
          Bills account
          {f.billsAccountName ? ` · ${f.billsAccountName}` : ""}
        </div>
        <p className="mt-1 text-body">{MISSING[f.missing ?? "account"]}</p>
        {settings}
      </Card>
    );
  }

  const topUp = plan.beforePayday.neededCents;
  // Worth naming only when money arrives after the low point; otherwise the
  // low point is simply the last bill.
  const pinch = plan.payPeriod.events.find(
    (e) => e.afterCents === plan.payPeriod.lowestCents,
  );
  const pinchMatters =
    !!pinch &&
    plan.payPeriod.events.at(-1) !== pinch &&
    plan.payPeriod.inCents > 0;
  const overdue = plan.beforePayday.events.filter((e) => e.overdue);

  return (
    <Card className={className}>
      <div className="text-caption text-ink-2">
        Transfer to {f.billsAccountName} on {day(plan.payday)}
        {f.guessed && <span className="text-ink-3"> · account guessed</span>}
      </div>
      <AmountText
        cents={plan.transferCents}
        sign="never"
        colorize={false}
        size="display"
        className="font-semibold"
      />
      <div className="tnum mt-1 text-caption text-ink-2">
        Covers {formatCents(plan.payPeriod.outCents, { sign: "never" })} of
        bills from {day(plan.payday)} to the day before your next payday (
        {day(plan.followingPayday)})
        {plan.payPeriod.inCents > 0 &&
          `, less ${formatCents(plan.payPeriod.inCents, { sign: "never" })} coming in`}
        . Balance {formatCents(plan.balanceCents)} on {day(plan.balanceDate)}.
        {pinch && pinchMatters && plan.transferCents > 0 && (
          <>
            {" "}
            Lowest point is after {pinch.name} on {day(pinch.date)}.
          </>
        )}
        {plan.bufferCents > 0 &&
          ` Includes a ${formatCents(plan.bufferCents, { sign: "never" })} buffer.`}
      </div>

      {topUp > 0 && (
        <p className="tnum mt-3 text-body text-negative">
          Top up {formatCents(topUp, { sign: "never" })} before{" "}
          {day(plan.beforePayday.lowestDate)}: bills due before payday would
          take the account to {formatCents(plan.beforePayday.lowestCents)}.
        </p>
      )}
      {overdue.length > 0 && (
        <p className="mt-2 text-caption text-warning">
          Expected but not yet seen: {overdue.map((e) => e.name).join(", ")}.
          Counted as still to come.
        </p>
      )}
      {f.balanceStaleDays !== null && (
        <p className="mt-2 text-caption text-warning">
          The balance is {f.balanceStaleDays} days old. Import or sync the
          latest statement for an exact figure.
        </p>
      )}
      {plan.includesEstimates && (
        <p className="mt-2 text-caption text-ink-3">
          Some bills vary; their latest amount is used as the estimate.
        </p>
      )}

      <details className="mt-3">
        <summary className="cursor-pointer text-caption text-accent">
          Payment schedule ({f.billCount} bill{f.billCount === 1 ? "" : "s"})
        </summary>
        <Schedule w={plan.beforePayday} label="Before payday" />
        <Schedule
          w={plan.payPeriod}
          label="Pay period, after the transfer"
          offsetCents={plan.transferCents}
        />
      </details>
      {settings}
    </Card>
  );
}
