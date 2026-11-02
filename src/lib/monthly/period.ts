import { addDays, monthEnd } from "@/lib/dates";
import { previousWorkingDay } from "@/lib/funding/workingDays";

/** A pay period: from one payday up to the day before the next. */
export type Period = { start: string; end: string };

function payday(month: string, day: number): string {
  const last = Number(monthEnd(month).slice(8));
  return previousWorkingDay(
    `${month}-${String(Math.min(day, last)).padStart(2, "0")}`,
  );
}
function shift(month: string, n: number): string {
  const [y, m] = month.split("-").map(Number);
  const t = y * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`;
}

/** The pay period containing `date`. */
export function periodOf(date: string, day: number): Period {
  const m = date.slice(0, 7);
  for (let i = 1; i >= -2; i--) {
    const start = payday(shift(m, i), day);
    if (start <= date) {
      const next = payday(shift(m, i + 1), day);
      return { start, end: addDays(next, -1) };
    }
  }
  throw new Error(`no pay period for ${date}`);
}

/** The period before `p`. */
export function previousPeriod(p: Period, day: number): Period {
  return periodOf(addDays(p.start, -1), day);
}

/** The most recent fully finished period as of `today`. */
export function lastCompletePeriod(today: string, day: number): Period {
  return previousPeriod(periodOf(today, day), day);
}

/** "Sep–Oct" style label from the period's start month to its end month. */
export function periodLabel(p: Period, locale: string): string {
  const f = (iso: string) =>
    new Date(`${iso}T00:00:00`).toLocaleDateString(locale, { month: "short" });
  const a = f(p.start);
  const b = f(p.end);
  return a === b ? a : `${a}–${b}`;
}
