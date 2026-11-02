export type DateFormat = "MDY" | "DMY" | "YMD";

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function valid(y: number, m: number, d: number): boolean {
  if (m < 1 || m > 12 || d < 1) return false;
  const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  const dim = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return d <= dim[m - 1];
}

export function isIsoDate(s: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  return !!m && valid(+m[1], +m[2], +m[3]);
}

const MONTHS: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

/**
 * "28 Sep 2024", "28-Sep-24", "28 Sept 2024", "28 September 2024",
 * "28/Sep/2024" — the day-name-year layout UK banks (NatWest, Nationwide)
 * export. Unambiguous, so it is read the same whatever the profile's format.
 */
const TEXT_MONTH_RE =
  /^(\d{1,2})[\s/\-.]+([A-Za-z]{3,9})\.?[\s/\-.,]+(\d{2,4})$/;

export function isTextMonthDate(raw: string): boolean {
  const m = TEXT_MONTH_RE.exec(raw.trim());
  return !!m && m[2].slice(0, 3).toLowerCase() in MONTHS;
}

export function parseDateWithFormat(
  raw: string,
  format: DateFormat,
): string | null {
  const s = raw.trim();
  const tm = TEXT_MONTH_RE.exec(s);
  if (tm) {
    const mo = MONTHS[tm[2].slice(0, 3).toLowerCase()];
    if (!mo) return null;
    let y = +tm[3];
    if (y < 100) y += 2000;
    const d = +tm[1];
    if (!valid(y, mo, d)) return null;
    return `${y}-${pad(mo)}-${pad(d)}`;
  }
  let parts: number[];
  if (/^\d{8}$/.test(s)) {
    parts =
      format === "YMD"
        ? [+s.slice(0, 4), +s.slice(4, 6), +s.slice(6, 8)]
        : [+s.slice(0, 2), +s.slice(2, 4), +s.slice(4, 8)];
  } else {
    const m = /^(\d{1,4})[/\-.](\d{1,2})[/\-.](\d{1,4})$/.exec(s);
    if (!m) return null;
    parts = [+m[1], +m[2], +m[3]];
  }
  let y: number;
  let mo: number;
  let d: number;
  if (format === "YMD") [y, mo, d] = parts;
  else if (format === "MDY") [mo, d, y] = parts;
  else [d, mo, y] = parts;
  if (y < 100) y += 2000;
  if (!valid(y, mo, d)) return null;
  return `${y}-${pad(mo)}-${pad(d)}`;
}

function toUtc(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

export function daysBetween(a: string, b: string): number {
  return Math.round((toUtc(b) - toUtc(a)) / 86_400_000);
}

export function addDays(iso: string, n: number): string {
  const t = new Date(toUtc(iso) + n * 86_400_000);
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

export function monthOf(iso: string): string {
  return iso.slice(0, 7);
}

export function monthEnd(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${month}-${pad(lastDay)}`;
}

/** The calendar day an instant falls on in the machine's local zone. */
export function localDay(t: Date): string {
  return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`;
}

/**
 * A local `YYYY-MM-DDTHH:MM:SS` stamp. Stored timestamps are compared by
 * their first ten characters against a local date, so they are written in
 * local time rather than the schema's UTC default.
 */
export function localStamp(t: Date = new Date()): string {
  return `${localDay(t)}T${pad(t.getHours())}:${pad(t.getMinutes())}:${pad(t.getSeconds())}`;
}

export function todayIso(): string {
  return localDay(new Date());
}
