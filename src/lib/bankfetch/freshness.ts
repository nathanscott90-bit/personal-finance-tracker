import { max } from "drizzle-orm";
import { daysBetween, localDay } from "@/lib/dates";
import type { Db } from "@/lib/db/client";
import { transactions } from "@/lib/db/schema";
import { getBankDownloadLast } from "./importer";

/**
 * How many days old the app's bank data is: since the last bank download,
 * else since the newest transaction. Null when there is no
 * data at all (a brand-new install, where nagging would be noise).
 */
export function dataAgeDays(db: Db, today: string): number | null {
  const last = getBankDownloadLast(db)?.at;
  if (last) return Math.max(0, daysBetween(localDay(new Date(last)), today));
  const latestTxn = db
    .select({ d: max(transactions.date) })
    .from(transactions)
    .get()?.d;
  return latestTxn ? Math.max(0, daysBetween(latestTxn, today)) : null;
}
