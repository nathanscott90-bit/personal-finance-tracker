import { addDays } from "@/lib/dates";

/** Easter Sunday (Gregorian), via the anonymous Gregorian algorithm. */
function easterSunday(year: number): string {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function weekday(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 Sun … 6 Sat
}

/** First `dow` (0 Sun … 6 Sat) on or after `iso`. */
function onOrAfter(iso: string, dow: number): string {
  return addDays(iso, (dow - weekday(iso) + 7) % 7);
}

/** Last `dow` on or before `iso`. */
function onOrBefore(iso: string, dow: number): string {
  return addDays(iso, -((weekday(iso) - dow + 7) % 7));
}

/** Weekend holiday rolls to the next weekday not already a holiday. */
function substitute(iso: string, taken: Set<string>): string {
  let d = iso;
  while (weekday(d) === 0 || weekday(d) === 6 || taken.has(d))
    d = addDays(d, 1);
  return d;
}

/**
 * One-off bank holidays proclaimed for England and Wales outside the regular
 * pattern, plus moved ones. Add new proclamations here.
 */
const SPECIAL: Record<number, { add?: string[]; remove?: string[] }> = {
  2020: { add: ["2020-05-08"], remove: ["2020-05-04"] },
  2022: {
    add: ["2022-06-02", "2022-06-03", "2022-09-19"],
    remove: ["2022-05-30"],
  },
  2023: { add: ["2023-05-08"] },
};

const cache = new Map<number, Set<string>>();

/** Bank holidays in England and Wales for `year` (ISO dates). */
export function bankHolidays(year: number): Set<string> {
  const hit = cache.get(year);
  if (hit) return hit;
  const easter = easterSunday(year);
  const taken = new Set<string>();
  const add = (d: string) => {
    taken.add(d);
    return d;
  };
  add(substitute(`${year}-01-01`, taken));
  add(addDays(easter, -2)); // Good Friday
  add(addDays(easter, 1)); // Easter Monday
  add(onOrAfter(`${year}-05-01`, 1)); // early May
  add(onOrBefore(`${year}-05-31`, 1)); // spring
  add(onOrBefore(`${year}-08-31`, 1)); // summer
  add(substitute(`${year}-12-25`, taken)); // Christmas
  add(substitute(`${year}-12-26`, taken)); // Boxing Day
  const special = SPECIAL[year];
  for (const d of special?.remove ?? []) taken.delete(d);
  for (const d of special?.add ?? []) taken.add(d);
  cache.set(year, taken);
  return taken;
}

export function isWorkingDay(iso: string): boolean {
  const dow = weekday(iso);
  if (dow === 0 || dow === 6) return false;
  return !bankHolidays(Number(iso.slice(0, 4))).has(iso);
}

/** `iso` itself if a working day, otherwise the working day before it — the
 * usual UK rule for salaries due on a weekend or bank holiday. */
export function previousWorkingDay(iso: string): string {
  let d = iso;
  while (!isWorkingDay(d)) d = addDays(d, -1);
  return d;
}
