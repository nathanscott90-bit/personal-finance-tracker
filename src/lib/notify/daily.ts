import { dataAgeDays } from "@/lib/bankfetch/freshness";
import { localDay } from "@/lib/dates";
import type { Db } from "@/lib/db/client";
import { loadFunding } from "@/lib/funding/load";
import { monthlyCheck, monthlyNotices } from "@/lib/monthly/check";
import { refreshRecurring } from "@/lib/recurring/refresh";
import { getSavingsSettings } from "@/lib/savings/savings";
import { decideNotices, type Notice } from "./decide";
import { deliver, getNotifyConfig, type Sender } from "./send";

/**
 * The unattended daily job: recompute and send only what needs the user.
 * Safe to run several times a day: a notice is never repeated. Bank data
 * arrives when the person runs Bank download, so this job reminds them if it
 * has been a while.
 */
export async function runDaily(
  db: Db,
  deps: { send?: Sender; now?: Date } = {},
): Promise<{
  notices: Notice[];
  sent: Notice[];
  failed: string[];
}> {
  const now = deps.now ?? new Date();
  const today = localDay(now);
  refreshRecurring(db, { today });
  // Work tagging runs inside the check, before funding reads the bills.
  const check = monthlyCheck(db, today);
  const funding = loadFunding(db, today);
  const notices = decideNotices({
    today,
    funding,
    settings: getNotifyConfig(db),
    // Bill rises are reported by the bills check below.
    billChanges: [],
    dataAgeDays: dataAgeDays(db, today),
  }).concat(monthlyNotices(check, getSavingsSettings(db).renewalLeadDays));
  const { sent, failed } = await deliver(db, notices, deps.send);
  return { notices, sent, failed };
}
