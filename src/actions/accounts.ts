"use server";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { deleteAccountIfEmpty } from "@/lib/accounts/delete";
import {
  type AccountResult,
  listAccountDependents,
} from "@/lib/accounts/dependents";
import { accountIdSchema, accountInput } from "@/lib/accounts/schema";
import { updateAccountRecord } from "@/lib/accounts/update";
import { accountLabel } from "@/lib/audit/describe";
import { audit } from "@/lib/audit/request";
import { getDb } from "@/lib/db/client";
import { accounts } from "@/lib/db/schema";
import { getPeople, ownerLabel } from "@/lib/household/people";

export type { AccountInput } from "@/lib/accounts/schema";

const PATHS = [
  "/accounts",
  "/home",
  "/networth",
  "/debt",
  "/transactions",
  "/settings",
  "/import",
];
function revalidateAll() {
  for (const p of PATHS) revalidatePath(p);
}

export async function listAccounts() {
  const db = getDb();
  const rows = db.select().from(accounts).all();
  // One grouped pass for every account, rather than four queries apiece.
  const deps = listAccountDependents(db);
  return rows.map((a) => {
    const dependents = deps.get(a.id) ?? {
      transactions: 0,
      snapshots: 0,
      rules: 0,
      linked: false,
    };
    return { ...a, txnCount: dependents.transactions, dependents };
  });
}

export async function createAccount(
  input: unknown,
): Promise<AccountResult & { id?: number }> {
  const p = accountInput.safeParse(input);
  if (!p.success) return { ok: false, error: "Check the account details." };
  const [row] = getDb()
    .insert(accounts)
    .values(p.data)
    .returning({ id: accounts.id })
    .all();
  await audit("Added account", `${p.data.name} (${p.data.type})`);
  revalidateAll();
  return { ok: true, id: row.id };
}

export async function updateAccount(
  id: unknown,
  input: unknown,
): Promise<AccountResult> {
  const i = accountIdSchema.safeParse(id);
  const p = accountInput.safeParse(input);
  if (!i.success || !p.success)
    return { ok: false, error: "Check the account details." };
  const db = getDb();
  const before = db
    .select({ name: accounts.name, owner: accounts.owner })
    .from(accounts)
    .where(eq(accounts.id, i.data))
    .get();
  const result = updateAccountRecord(db, i.data, p.data);
  if (result.ok && before) {
    const people = getPeople(db);
    const changes = [
      before.name !== p.data.name ? `renamed to ${p.data.name}` : null,
      before.owner !== p.data.owner
        ? `now ${ownerLabel(people, p.data.owner)}`
        : null,
    ].filter(Boolean);
    await audit(
      "Edited account",
      `${before.name}${changes.length ? ` · ${changes.join(", ")}` : ""}`,
    );
    revalidateAll();
  }
  return result;
}

export async function deleteAccount(id: unknown): Promise<AccountResult> {
  const i = accountIdSchema.safeParse(id);
  if (!i.success) return { ok: false, error: "Unknown account." };
  const db = getDb();
  const name = accountLabel(db, i.data);
  const result = deleteAccountIfEmpty(db, i.data);
  if (result.ok) {
    await audit("Deleted account", name);
    revalidateAll();
  }
  return result;
}
