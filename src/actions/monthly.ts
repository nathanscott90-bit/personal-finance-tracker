"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { audit } from "@/lib/audit/request";
import { isIsoDate, todayIso } from "@/lib/dates";
import { getDb } from "@/lib/db/client";
import { accounts } from "@/lib/db/schema";
import { monthlyCheck } from "@/lib/monthly/check";
import { listBills } from "@/lib/recurring/refresh";
import {
  getSavingsSettings,
  setRenewalDate,
  setSavingsSettings,
} from "@/lib/savings/savings";
import {
  applyWorkTags,
  getWorkSettings,
  setWorkSettings,
} from "@/lib/work/work";

function refresh() {
  for (const p of ["/check", "/home", "/m", "/insights", "/budget"])
    revalidatePath(p);
}

export async function getMonthlyCheck() {
  const db = getDb();
  return {
    check: monthlyCheck(db, todayIso()),
    work: getWorkSettings(db),
    accounts: db
      .select({ id: accounts.id, name: accounts.name, type: accounts.type })
      .from(accounts)
      .all(),
  };
}

const id = z.number().int().positive().nullable();
const cents = z.number().int().min(0).max(100_000_00);

export async function saveCheckSettingsAction(input: {
  cardAccountId: number | null;
  allOnCardIsWork: boolean;
  savingsAccountId: number | null;
  mainAccountId: number | null;
  cushionCents: number;
  toleranceCents: number;
}) {
  const p = z
    .object({
      cardAccountId: id,
      allOnCardIsWork: z.boolean(),
      savingsAccountId: id,
      mainAccountId: id,
      cushionCents: cents,
      toleranceCents: cents,
    })
    .safeParse(input);
  if (!p.success) return { ok: false as const, error: "Check the amounts." };
  const db = getDb();
  const prevWork = getWorkSettings(db);
  setWorkSettings(db, {
    ...prevWork,
    cardAccountId: p.data.cardAccountId,
    allOnCardIsWork: p.data.allOnCardIsWork,
  });
  setSavingsSettings(db, {
    ...getSavingsSettings(db),
    savingsAccountId: p.data.savingsAccountId,
    mainAccountId: p.data.mainAccountId,
    cushionCents: p.data.cushionCents,
    toleranceCents: p.data.toleranceCents,
  });
  await audit(
    "Changed monthly check settings",
    "Accounts, cushion and tolerance",
  );
  applyWorkTags(db, listBills(db).bills);
  refresh();
  return { ok: true as const };
}

export async function setRenewalDateAction(input: {
  merchant: string;
  date: string | null;
}) {
  const p = z
    .object({
      merchant: z.string().min(1).max(120),
      date: z.string().refine(isIsoDate).nullable(),
    })
    .safeParse(input);
  if (!p.success) return { ok: false as const, error: "Pick a date." };
  setRenewalDate(getDb(), p.data.merchant, p.data.date);
  await audit(
    "Set renewal date",
    `${p.data.merchant}: ${p.data.date ?? "cleared"}`,
  );
  refresh();
  return { ok: true as const };
}
