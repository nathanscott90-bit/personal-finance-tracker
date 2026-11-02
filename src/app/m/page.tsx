import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { PhoneSyncButton } from "@/components/finance/phone/PhoneSyncButton";
import { todayIso } from "@/lib/dates";
import { getDb } from "@/lib/db/client";
import { LOCALE } from "@/lib/locale";
import {
  ensurePhase2,
  ensurePhase3,
  ensurePhase7,
  ensurePhase9,
} from "@/lib/maintenance/rerun";
import { formatCents } from "@/lib/money";
import { daysAway, phoneSummary } from "@/lib/phone/summary";
import { relativeSince } from "@/lib/simplefin/relative";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Finance",
  appleWebApp: { capable: true, title: "Finance", statusBarStyle: "default" },
};
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#f5f5f7",
};

const day = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString(LOCALE, {
    weekday: "short",
    day: "numeric",
    month: "short",
  });

export default function PhonePage() {
  const db = getDb();
  ensurePhase2(db);
  ensurePhase3(db);
  ensurePhase7(db);
  ensurePhase9(db);
  const today = todayIso();
  const s = phoneSummary(db, today);
  const plan = s.funding.plan;
  const card = "rounded-card bg-card p-5 shadow-sm";
  return (
    <main className="mx-auto grid max-w-md gap-4 bg-background p-4 pb-10">
      <header className="flex items-center justify-between pt-2">
        <h1 className="text-title font-semibold">Finance</h1>
        <div className="flex items-center gap-2 text-caption text-ink-2">
          {s.lastSyncAt
            ? `Updated ${relativeSince(s.lastSyncAt, new Date())}`
            : ""}
          {s.banksConnected && <PhoneSyncButton />}
        </div>
      </header>

      {s.actions.length > 0 ? (
        <section className="grid gap-2">
          {s.actions.map((a) => (
            <div
              key={a.key}
              className={`${card} border-l-4 ${a.priority === "high" ? "border-negative" : "border-accent"}`}
            >
              <div className="text-body font-semibold">{a.title}</div>
              <div className="mt-1 text-caption text-ink-2">{a.message}</div>
            </div>
          ))}
        </section>
      ) : (
        !(plan && plan.transferCents > 0) && (
          <div className={`${card} text-body text-ink-2`}>
            Nothing needs doing.
          </div>
        )
      )}

      {plan && (
        <section className={card}>
          <div className="text-caption text-ink-2">
            {s.funding.billsAccountName} · next payday {day(plan.payday)}
          </div>
          <div className="tnum mt-1 text-display font-semibold">
            {formatCents(plan.transferCents, { sign: "never" })}
          </div>
          <div className="tnum text-caption text-ink-2">
            {plan.transferCents > 0
              ? `move on payday · covers ${formatCents(plan.payPeriod.outCents, { sign: "never" })} of bills`
              : "no transfer needed this month"}{" "}
            · balance {formatCents(plan.balanceCents)}
          </div>
        </section>
      )}
      {!plan && s.funding.missing && (
        <section className={`${card} text-caption text-ink-2`}>
          Finish setting up on the PC: Settings → Bank connection and Payday.
        </section>
      )}

      {s.month && (
        <section className={card}>
          <h2 className="mb-2 text-headline font-semibold">
            {s.month.label} check
          </h2>
          <dl className="tnum grid grid-cols-[1fr_auto] gap-y-1.5 text-body">
            {s.month.billsDiffCents !== null && (
              <>
                <dt className="text-ink-2">Bills vs budget</dt>
                <dd
                  className={`text-right ${s.month.billsDiffCents > 0 ? "text-negative" : ""}`}
                >
                  {formatCents(s.month.billsDiffCents, { sign: "always" })}
                  {s.month.discrepancies > 0 && (
                    <span className="text-caption text-ink-3">
                      {" "}
                      · {s.month.discrepancies} to look at
                    </span>
                  )}
                </dd>
              </>
            )}
            {s.month.savingsName && (
              <>
                <dt className="text-ink-2">To {s.month.savingsName}</dt>
                <dd className="text-right">
                  {formatCents(s.month.sweepCents, { sign: "never" })}
                </dd>
              </>
            )}
            <dt className="text-ink-2">Work expenses owed</dt>
            <dd className="text-right">
              {formatCents(s.month.workOwedCents, { sign: "never" })}
            </dd>
          </dl>
          <Link
            href="/check"
            className="mt-2 inline-block text-caption text-accent"
          >
            Full check
          </Link>
        </section>
      )}

      {s.upcoming.length > 0 && (
        <section className={card}>
          <h2 className="mb-2 text-headline font-semibold">Next 2 weeks</h2>
          <ul className="grid gap-2">
            {s.upcoming.map((b) => (
              <li
                key={`${b.name}-${b.date}`}
                className="flex items-baseline justify-between gap-3"
              >
                <div className="min-w-0">
                  <div className="truncate text-body">{b.name}</div>
                  <div
                    className={`text-micro ${b.date < today ? "text-warning" : "text-ink-3"}`}
                  >
                    {day(b.date)} · {daysAway(today, b.date)}
                    {b.account ? ` · ${b.account}` : ""}
                  </div>
                </div>
                <div className="tnum text-body">
                  {formatCents(b.amountCents, { sign: "never" })}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {s.balances.length > 0 && (
        <section className={card}>
          <h2 className="mb-2 text-headline font-semibold">Balances</h2>
          <ul className="grid gap-2">
            {s.balances.map((b) => (
              <li
                key={b.name}
                className="flex items-baseline justify-between gap-3"
              >
                <div className="min-w-0">
                  <div className="truncate text-body">{b.name}</div>
                  <div className="text-micro text-ink-3">{day(b.date)}</div>
                </div>
                <div
                  className={`tnum text-body ${b.type === "credit" && b.balanceCents > 0 ? "text-negative" : ""}`}
                >
                  {b.type === "credit" && b.balanceCents > 0 ? "owe " : ""}
                  {formatCents(b.balanceCents, {
                    sign: b.type === "credit" ? "never" : "auto",
                  })}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <Link href="/home" className="text-center text-caption text-accent">
        Full app
      </Link>
    </main>
  );
}
