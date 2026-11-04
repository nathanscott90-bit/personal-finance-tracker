"use server";
import { revalidatePath } from "next/cache";
import { type AuditEntry, listAudit } from "@/lib/audit/log";
import { audit, currentActor } from "@/lib/audit/request";
import { getDb } from "@/lib/db/client";
import type { Actor } from "@/lib/household/identity";
import { getPeople, type People, setPeople } from "@/lib/household/people";

export async function getPeopleAction(): Promise<People> {
  return getPeople(getDb());
}

export async function savePeopleAction(
  input: unknown,
): Promise<{ ok: true; people: People } | { ok: false; error: string }> {
  const r = setPeople(getDb(), input);
  if ("error" in r) return { ok: false, error: r.error };
  await audit("Updated household", `${r.p1.name} and ${r.p2.name}`);
  for (const path of ["/settings", "/accounts", "/transactions", "/insights"])
    revalidatePath(path);
  return { ok: true, people: r };
}

/** Who this request is from, for the "You are …" line and the setup card. */
export async function whoAmIAction(): Promise<Actor> {
  return currentActor();
}

export async function listActivityAction(limit = 50): Promise<AuditEntry[]> {
  return listAudit(getDb(), limit);
}
