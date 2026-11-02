"use server";
import { revalidatePath } from "next/cache";
import { audit } from "@/lib/audit/request";
import { todayIso } from "@/lib/dates";
import { getDb } from "@/lib/db/client";
import {
  type FundingPage,
  fundingSettingsSchema,
  loadFunding,
  saveFundingSettings,
} from "@/lib/funding/load";
import { formatCents } from "@/lib/money";

export async function getFunding(): Promise<FundingPage> {
  return loadFunding(getDb(), todayIso());
}

export async function saveFundingSettingsAction(input: {
  billsAccountId: number;
  bufferCents: number;
}) {
  const p = fundingSettingsSchema.safeParse(input);
  if (!p.success)
    return {
      ok: false as const,
      error: "Pick an account and a buffer of £0 or more.",
    };
  saveFundingSettings(getDb(), p.data);
  await audit(
    "Changed bills transfer settings",
    `buffer ${formatCents(p.data.bufferCents)}`,
  );
  for (const path of ["/home", "/bills"]) revalidatePath(path);
  return { ok: true as const };
}
