"use server";
import { dataAgeDays } from "@/lib/bankfetch/freshness";
import {
  type BankDownloadLast,
  getBankDownloadLast,
  mappedAccountCount,
} from "@/lib/bankfetch/importer";
import { todayIso } from "@/lib/dates";
import { getDb } from "@/lib/db/client";

export type BankDownloadView = {
  last: BankDownloadLast | null;
  accountsRemembered: number;
  /** Days since the app last had bank data; null when it has none. */
  ageDays: number | null;
};

export async function getBankDownloadAction(): Promise<BankDownloadView> {
  const db = getDb();
  return {
    last: getBankDownloadLast(db),
    accountsRemembered: mappedAccountCount(db),
    ageDays: dataAgeDays(db, todayIso()),
  };
}
