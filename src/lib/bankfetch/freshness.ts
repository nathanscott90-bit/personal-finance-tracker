import { max } from "drizzle-orm";
import { daysBetween, localDay } from "@/lib/dates";
import type { Db } from "@/lib/db/client";
import { transactions } from "@/lib/db/schema";
import { getEbStatus } from "@/lib/enablebanking/store";
import { getBankDownloadLast } from "./importer";

/**
 * How many days old the app's bank data is: since the last bank download or
 * automatic sync, else since the newest transaction. Null when there is no
 * data at all (a brand-new install, where nagging would be noise).
 */
export function dataAgeDays(db: Db, today: string): number | null {
  const stamps = [
    getBankDownloadLast(db)?.at,
    getEbStatus(db).lastSyncAt ?? undefined,
  ]
    .filter((s): s is string => !!s)
    .map((s) => localDay(new Date(s)))
    .sort();
  const newest = stamps[stamps.length - 1];
  if (newest) return Math.max(0, daysBetween(newest, today));
  const latestTxn = db
    .select({ d: max(transactions.date) })
    .from(transactions)
    .get()?.d;
  return latestTxn ? Math.max(0, daysBetween(latestTxn, today)) : null;
}
