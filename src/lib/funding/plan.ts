import { addDays, monthEnd } from "@/lib/dates";
import { occurrences } from "@/lib/forecast/events";
import type { Cadence } from "@/lib/recurring/detect";
import { previousWorkingDay } from "./workingDays";

/** A recurring payment out of (or into) the bills account. */
export type FundingBill = {
  name: string;
  cadence: Cadence;
  /** Next date the bill is expected (may be on or before the balance date if overdue). */
  nextExpected: string;
  /** Signed: negative for a payment out, positive for money in. */
  amountCents: number;
  /** True when recent payments differ, so the amount is an estimate. */
  variable: boolean;
};

export type FundingEvent = {
  date: string;
  name: string;
  amountCents: number;
  variable: boolean;
  /** Expected on or before the balance date but not yet seen. */
  overdue: boolean;
  /** Running balance after this event. */
  afterCents: number;
};

export type FundingWindow = {
  from: string;
  /** Inclusive last day of the window. */
  to: string;
  startCents: number;
  events: FundingEvent[];
  outCents: number;
  inCents: number;
  lowestCents: number;
  lowestDate: string;
  /** Money needed at the start of the window to stay at or above the buffer. */
  neededCents: number;
};

export type FundingPlan = {
  balanceCents: number;
  balanceDate: string;
  bufferCents: number;
  /** Payday the transfer is made (working-day adjusted). */
  payday: string;
  /** The payday after, up to which the transfer has to last. */
  followingPayday: string;
  /** Bills still to come before `payday`; any shortfall needs topping up now. */
  beforePayday: FundingWindow;
  /** Bills from `payday` to the day before `followingPayday`. */
  payPeriod: FundingWindow;
  /** The transfer to make on `payday`. */
  transferCents: number;
  /** True when any bill in either window is an estimate. */
  includesEstimates: boolean;
};

function clampDay(month: string, day: number): string {
  const last = Number(monthEnd(month).slice(8));
  return `${month}-${String(Math.min(day, last)).padStart(2, "0")}`;
}

function shiftMonth(month: string, n: number): string {
  const [y, m] = month.split("-").map(Number);
  const t = y * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`;
}

/**
 * Monthly paydays on `day`, moved to the previous working day when that day
 * is a weekend or an England and Wales bank holiday. Returns the first one on
 * or after `today` and the one after it.
 */
export function paydaysFrom(today: string, day: number): [string, string] {
  const month = today.slice(0, 7);
  const out: string[] = [];
  for (let i = -1; out.length < 2 && i < 4; i++) {
    const d = previousWorkingDay(clampDay(shiftMonth(month, i), day));
    if (d >= today) out.push(d);
  }
  return [out[0], out[1]];
}

/** Dated events for `bills` falling in [from, to], overdue bills caught up on `from`. */
function eventsIn(
  bills: FundingBill[],
  from: string,
  to: string,
  balanceDate: string,
  catchUpOverdue: boolean,
): Omit<FundingEvent, "afterCents">[] {
  const out: Omit<FundingEvent, "afterCents">[] = [];
  for (const b of bills) {
    const overdue = b.nextExpected <= balanceDate;
    const dates = new Set<string>();
    if (overdue && catchUpOverdue) dates.add(from);
    for (const d of occurrences(
      b.nextExpected,
      b.cadence,
      addDays(from, -1),
      to,
    )) {
      // An overdue bill's own (past) date is replaced by the catch-up above.
      if (d > balanceDate) dates.add(d);
    }
    for (const date of dates)
      out.push({
        date,
        name: b.name,
        amountCents: b.amountCents,
        variable: b.variable,
        overdue: overdue && date === from && catchUpOverdue,
      });
  }
  // Money in before money out on the same day; then larger payments first,
  // which gives the more cautious running low.
  return out.sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      b.amountCents - a.amountCents ||
      a.name.localeCompare(b.name),
  );
}

function runWindow(
  events: Omit<FundingEvent, "afterCents">[],
  from: string,
  to: string,
  startCents: number,
  bufferCents: number,
  /** Count the opening balance towards the low point. Off before payday, so
   * a balance already under the buffer only needs topping up now if a bill
   * actually falls due before payday; the payday transfer carries the rest. */
  includeStart = true,
): FundingWindow {
  let bal = startCents;
  let lowest = includeStart ? startCents : Number.POSITIVE_INFINITY;
  let lowestDate = from;
  let outCents = 0;
  let inCents = 0;
  const withBal: FundingEvent[] = [];
  for (const e of events) {
    bal += e.amountCents;
    if (e.amountCents < 0) outCents += -e.amountCents;
    else inCents += e.amountCents;
    withBal.push({ ...e, afterCents: bal });
    if (bal < lowest) {
      lowest = bal;
      lowestDate = e.date;
    }
  }
  return {
    from,
    to,
    startCents,
    events: withBal,
    outCents,
    inCents,
    lowestCents: Number.isFinite(lowest) ? lowest : startCents,
    lowestDate,
    neededCents: Number.isFinite(lowest)
      ? Math.max(0, bufferCents - lowest)
      : 0,
  };
}

/**
 * How much to move into the bills account on payday so that, taking every
 * bill on its own date, the balance never drops below `bufferCents` before
 * the following payday. Payments are ordered by date, so a large bill early
 * in the period is covered even when the month-end total would look fine.
 *
 * The transfer is assumed to arrive before any bill on payday itself
 * (Faster Payments between UK banks are near-instant).
 */
export function fundingPlan(i: {
  today: string;
  balanceCents: number;
  balanceDate: string;
  bills: FundingBill[];
  payDay: number;
  bufferCents?: number;
}): FundingPlan {
  const bufferCents = i.bufferCents ?? 0;
  const start = i.balanceDate < i.today ? i.balanceDate : i.today;
  const [payday, followingPayday] = paydaysFrom(i.today, i.payDay);

  // Before payday: from the day after the balance was read, up to the day
  // before payday. Overdue bills are assumed still to come, the next day.
  const beforeFrom = addDays(start, 1);
  const beforeTo = addDays(payday, -1);
  const beforeEvents =
    beforeFrom <= beforeTo
      ? eventsIn(i.bills, beforeFrom, beforeTo, i.balanceDate, true)
      : [];
  const beforePayday = runWindow(
    beforeEvents,
    beforeFrom,
    beforeTo,
    i.balanceCents,
    bufferCents,
    false,
  );

  // Pay period. If any overdue bill could not be placed before payday (payday
  // is tomorrow or today), it is caught up on payday instead.
  const lastBefore = beforePayday.events.at(-1)?.afterCents ?? i.balanceCents;
  // Any top-up needed before payday is assumed made, so it carries into the
  // pay period.
  const periodStart = lastBefore + beforePayday.neededCents;
  const catchUpOnPayday = beforeFrom > beforeTo;
  const periodEvents = eventsIn(
    i.bills,
    payday,
    addDays(followingPayday, -1),
    i.balanceDate,
    catchUpOnPayday,
  );
  const payPeriod = runWindow(
    periodEvents,
    payday,
    addDays(followingPayday, -1),
    periodStart,
    bufferCents,
  );

  const includesEstimates = [...beforePayday.events, ...payPeriod.events].some(
    (e) => e.variable,
  );

  return {
    balanceCents: i.balanceCents,
    balanceDate: i.balanceDate,
    bufferCents,
    payday,
    followingPayday,
    beforePayday,
    payPeriod,
    transferCents: payPeriod.neededCents,
    includesEstimates,
  };
}

/** Amount to use for a bill and whether it is an estimate. Uses the most
 * recent payment (direct debits move with tariffs), flagging the bill as
 * variable when its recent payments differ by more than 5%. */
export function billAmount(
  recentAmounts: number[],
  avgCents: number,
): { amountCents: number; variable: boolean } {
  const recent = recentAmounts.filter((a) => a !== 0);
  if (recent.length === 0) return { amountCents: avgCents, variable: false };
  const abs = recent.map(Math.abs);
  const max = Math.max(...abs);
  const min = Math.min(...abs);
  return {
    amountCents: recent[recent.length - 1],
    variable: max > 0 && (max - min) / max > 0.05,
  };
}
