import type { Db } from "@/lib/db/client";
import { accounts } from "@/lib/db/schema";
import { ownersFor, type Who } from "./people";

/** Keep only rows from accounts the "whose money" filter selects. */
export function filterByWho<T extends { accountId: number }>(
  db: Db,
  rows: T[],
  who: Who,
): T[] {
  const owners = ownersFor(who);
  if (!owners) return rows;
  const keep = new Set(
    db
      .select({ id: accounts.id, owner: accounts.owner })
      .from(accounts)
      .all()
      .filter((a) => owners.includes(a.owner))
      .map((a) => a.id),
  );
  return rows.filter((r) => keep.has(r.accountId));
}
