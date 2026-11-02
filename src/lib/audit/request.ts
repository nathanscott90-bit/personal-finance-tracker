import { headers } from "next/headers";
import { getDb } from "@/lib/db/client";
import { type Actor, actorFromHeaders } from "@/lib/household/identity";
import { recordAudit } from "./log";

/**
 * Edge helpers for server actions and pages: who is asking, and "note what
 * they just did". Like `src/lib/loaders.ts`, this is one of the few modules
 * that bakes in `getDb()`, and it is deliberately not a `"use server"` file,
 * so a browser cannot call `audit` directly to forge entries.
 */
export async function currentActor(): Promise<Actor> {
  return actorFromHeaders(getDb(), await headers());
}

/** Never lets a logging failure break the action it describes. */
export async function audit(action: string, summary: string): Promise<void> {
  try {
    recordAudit(getDb(), await currentActor(), action, summary);
  } catch (e) {
    console.error("audit log write failed", e);
  }
}
