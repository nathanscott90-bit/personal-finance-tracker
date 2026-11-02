"use server";
import { revalidatePath } from "next/cache";
import { todayIso } from "@/lib/dates";
import { getDb } from "@/lib/db/client";
import {
  type FundingPage,
  fundingSettingsSchema,
  loadFunding,
  saveFundingSettings,
} from "@/lib/funding/load";

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
  for (const path of ["/home", "/bills"]) revalidatePath(path);
  return { ok: true as const };
}
