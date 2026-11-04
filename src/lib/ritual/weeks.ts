import { addDays, daysBetween } from "@/lib/dates";
import type { ReviewStatus, Staleness } from "./types";

function dow(iso: string): number {
  // 0 = Monday … 6 = Sunday
  const [y, m, d] = iso.split("-").map(Number);
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
}
export function weekStart(iso: string): string {
  return addDays(iso, -dow(iso));
}

export function reviewStatus(
  rows: { weekStart: string; completedAt: string }[],
  today: string,
): ReviewStatus {
  const currentWeekStart = weekStart(today);
  const last =
    rows
      .map((r) => r.completedAt.slice(0, 10))
      .sort()
      .at(-1) ?? null;
  const daysSince = last === null ? null : daysBetween(last, today);
  const doneThisWeek = rows.some((r) => r.weekStart === currentWeekStart);
  return {
    doneThisWeek,
    lastCompleted: last,
    daysSince,
    due: !doneThisWeek && (daysSince === null || daysSince >= 7),
    currentWeekStart,
  };
}

export function staleness(daysSince: number | null): Staleness {
  if (daysSince === null) return "never";
  if (daysSince <= 7) return "fresh";
  if (daysSince <= 14) return "aging";
  return "stale";
}
