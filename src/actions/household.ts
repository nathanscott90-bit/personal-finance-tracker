"use server";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { type AuditEntry, listAudit } from "@/lib/audit/log";
import { audit, currentActor } from "@/lib/audit/request";
import { getDb } from "@/lib/db/client";
import type { Actor } from "@/lib/household/identity";
import { getPeople, type People, setPeople } from "@/lib/household/people";
import { requestOrigin } from "@/lib/wall/origin";
import {
  clearToken,
  generateToken,
  storeToken,
  tokenInfo,
} from "@/lib/wall/token";

/** Where this request came in: the tunnel hostname when proxied, else the LAN/localhost origin. */
async function currentOrigin(): Promise<string> {
  const h = await headers();
  return requestOrigin({
    url: `http://${h.get("host") ?? "localhost:3000"}`,
    headers: h,
  });
}

export async function getHouseholdAction(): Promise<{
  tokenSet: boolean;
  createdAt: string | null;
  origin: string;
}> {
  const info = tokenInfo(getDb());
  return {
    tokenSet: info.set,
    createdAt: info.createdAt,
    origin: await currentOrigin(),
  };
}

/** Generates (or rotates) the display token. The token is returned exactly once and never stored in clear. */
export async function generateWallTokenAction(): Promise<
  { ok: true; token: string; enrollUrl: string } | { ok: false; error: string }
> {
  const token = generateToken();
  storeToken(getDb(), token, new Date());
  await audit("Issued display token", "Every enrolled display must re-enrol");
  revalidatePath("/settings");
  const origin = await currentOrigin();
  return {
    ok: true,
    token,
    enrollUrl: `${origin}/wall/enroll?token=${encodeURIComponent(token)}`,
  };
}

export async function revokeWallTokenAction(): Promise<{ ok: true }> {
  clearToken(getDb());
  await audit("Revoked display token", "Displays cut off");
  revalidatePath("/settings");
  return { ok: true };
}

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
