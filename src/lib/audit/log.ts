import { desc, lte, sql } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { auditLog } from "@/lib/db/schema";
import type { Actor } from "@/lib/household/identity";

/** Entries kept; older ones are pruned as new ones arrive. */
export const AUDIT_KEEP = 5000;

export type AuditEntry = {
  id: number;
  at: string;
  actor: string;
  login: string | null;
  action: string;
  summary: string;
};

export function recordAudit(
  db: Db,
  actor: Actor,
  action: string,
  summary: string,
  at?: string,
): void {
  db.insert(auditLog)
    .values({
      actor: actor.name,
      login: actor.login,
      action: action.slice(0, 60),
      summary: summary.slice(0, 300),
      ...(at ? { at } : {}),
    })
    .run();
  // Cheap: one indexed lookup of the cut-off id, then a ranged delete.
  const cutoff = db
    .select({ id: auditLog.id })
    .from(auditLog)
    .orderBy(desc(auditLog.id))
    .limit(1)
    .offset(AUDIT_KEEP)
    .get();
  if (cutoff) db.delete(auditLog).where(lte(auditLog.id, cutoff.id)).run();
}

export function listAudit(db: Db, limit = 50): AuditEntry[] {
  return db
    .select()
    .from(auditLog)
    .orderBy(desc(auditLog.id))
    .limit(Math.max(1, Math.min(limit, 500)))
    .all();
}

export function countAudit(db: Db): number {
  return db.select({ n: sql<number>`count(*)` }).from(auditLog).get()?.n ?? 0;
}
