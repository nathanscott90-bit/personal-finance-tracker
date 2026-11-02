import { Card } from "@/components/ui/card";
import type { AuditEntry } from "@/lib/audit/log";
import { LOCALE } from "@/lib/locale";

const when = (iso: string) =>
  new Date(iso).toLocaleString(LOCALE, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

/** The most recent changes and who made them. */
export function ActivityCard({ entries }: { entries: AuditEntry[] }) {
  return (
    <Card>
      <h2 className="mb-1 text-headline font-semibold">Recent activity</h2>
      <p className="mb-4 text-caption text-ink-2">
        Changes made in the app and who made them. &ldquo;This PC&rdquo; means
        the desktop itself; bank syncs and the daily job are not listed.
      </p>
      {entries.length === 0 ? (
        <p className="text-caption text-ink-3">Nothing yet.</p>
      ) : (
        <ul className="divide-y divide-line">
          {entries.map((e) => (
            <li
              key={e.id}
              className="grid gap-0.5 py-2 sm:grid-cols-[8rem_7rem_1fr] sm:gap-3"
            >
              <span className="tnum text-micro text-ink-3">{when(e.at)}</span>
              <span className="text-caption font-medium text-ink-2">
                {e.actor}
              </span>
              <span className="text-caption text-ink-2">
                <b className="font-medium text-ink">{e.action}</b> · {e.summary}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
