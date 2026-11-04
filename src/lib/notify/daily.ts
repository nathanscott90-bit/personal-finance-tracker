import { dataAgeDays } from "@/lib/bankfetch/freshness";
import { localDay } from "@/lib/dates";
import type { Db } from "@/lib/db/client";
import type { FetchFn } from "@/lib/enablebanking/client";
import { getEbStatus, getSessions } from "@/lib/enablebanking/store";
import { type EbSyncOutcome, runEbSync } from "@/lib/enablebanking/sync";
import { loadFunding } from "@/lib/funding/load";
import { monthlyCheck, monthlyNotices } from "@/lib/monthly/check";
import { refreshRecurring } from "@/lib/recurring/refresh";
import { getSavingsSettings } from "@/lib/savings/savings";
import { decideNotices, type Notice } from "./decide";
import { deliver, getNotifyConfig, type Sender } from "./send";

/**
 * The unattended daily job: pull from the banks, recompute, and send only
 * what needs the user. Safe to run several times a day — a notice is never
 * repeated.
 */
export async function runDaily(
  db: Db,
  deps: { fetchFn: FetchFn; send?: Sender; now?: Date },
): Promise<{
  sync: EbSyncOutcome | null;
  notices: Notice[];
  sent: Notice[];
  failed: string[];
}> {
  const now = deps.now ?? new Date();
  const today = localDay(now);
  const sync = getSessions(db).length
    ? await runEbSync(db, deps.fetchFn, now)
    : null;
  refreshRecurring(db, { today });
  // Work tagging runs inside the check, before funding reads the bills.
  const check = monthlyCheck(db, today);
  const funding = loadFunding(db, today);
  const status = getEbStatus(db);
  const notices = decideNotices({
    today,
    funding,
    settings: getNotifyConfig(db),
    // Bill rises are reported by the bills check below.
    billChanges: [],
    expiring: sync?.expiring ?? [],
    syncError: sync?.ok === false ? sync.error : null,
    lastGoodSyncAt: status.lastSyncAt,
    dataAgeDays: dataAgeDays(db, today),
    manualDownloads: getSessions(db).length === 0,
  }).concat(monthlyNotices(check, getSavingsSettings(db).renewalLeadDays));
  const { sent, failed } = await deliver(db, notices, deps.send);
  return { sync, notices, sent, failed };
}
