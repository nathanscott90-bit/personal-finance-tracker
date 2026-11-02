"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { getNotifyConfig, ntfySend, setNotifyConfig } from "@/lib/notify/send";

export async function getNotifySettings() {
  return getNotifyConfig(getDb());
}

export async function saveNotifySettingsAction(input: {
  standingOrderCents: number;
  reminderDays: number;
  enabled: boolean;
}) {
  const p = z
    .object({
      standingOrderCents: z.number().int().min(0).max(100_000_00),
      reminderDays: z.number().int().min(0).max(10),
      enabled: z.boolean(),
    })
    .safeParse(input);
  if (!p.success) return { ok: false as const, error: "Check the amounts." };
  const db = getDb();
  setNotifyConfig(db, { ...getNotifyConfig(db), ...p.data });
  revalidatePath("/settings");
  return { ok: true as const };
}

export async function sendTestNotificationAction() {
  const cfg = getNotifyConfig(getDb());
  try {
    await ntfySend(cfg, {
      key: "test",
      title: "Finance is set up",
      message: "You'll only hear from it when something needs doing.",
      priority: "default",
    });
    return { ok: true as const };
  } catch (e) {
    return {
      ok: false as const,
      error: e instanceof Error ? e.message : "Couldn't reach ntfy",
    };
  }
}
