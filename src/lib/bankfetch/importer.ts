import fs from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { guessAccountType } from "@/lib/accounts/type-guess";
import type { Db } from "@/lib/db/client";
import { accounts } from "@/lib/db/schema";
import { undoImport } from "@/lib/import/commit";
import { type CommitFlowDeps, runCommitFlow } from "@/lib/import/commitFlow";
import { decodeStatement } from "@/lib/import/decode";
import { refreshRecurring } from "@/lib/recurring/refresh";
import { deleteSetting, getSetting, setSetting } from "@/lib/settings";
import { identifyStatement } from "./identify";

const MAP_KEY = "bankfetch.accounts";
const LAST_KEY = "bankfetch.last";

/** What the person picks when the app does not yet know an account. */
export type Pick = { accountId: number } | { create: { name: string } } | null;

export type Chooser = (q: {
  label: string;
  institution: string;
  candidates: { id: number; name: string }[];
}) => Promise<Pick>;

export type ImportOutcome = {
  name: string;
  ok: boolean;
  message: string;
  added: number;
  skipped: number;
  /** The import this created, so the session can be undone. */
  importId?: number;
};

export type BankDownloadLast = {
  at: string;
  files: number;
  added: number;
  /** Imports made in that session; emptied once undone. */
  importIds?: number[];
};

function accountMap(db: Db): Record<string, number> {
  return getSetting<Record<string, number>>(db, MAP_KEY, {});
}

export function getBankDownloadLast(db: Db): BankDownloadLast | null {
  return getSetting<BankDownloadLast | null>(db, LAST_KEY, null);
}

export function mappedAccountCount(db: Db): number {
  return Object.keys(accountMap(db)).length;
}

export function recordBankDownload(
  db: Db,
  files: number,
  added: number,
  now = new Date(),
  importIds: number[] = [],
): void {
  setSetting(db, LAST_KEY, {
    at: now.toISOString(),
    files,
    added,
    importIds,
  });
}

/** Undoes every import from the last Bank download session. Null if none. */
export function undoLastBankDownload(
  db: Db,
): { imports: number; removed: number } | null {
  const last = getBankDownloadLast(db);
  const ids = last?.importIds ?? [];
  if (!last || ids.length === 0) return null;
  let removed = 0;
  for (const id of ids) removed += undoImport(db, id);
  refreshRecurring(db);
  setSetting(db, LAST_KEY, { ...last, added: 0, importIds: [] });
  return { imports: ids.length, removed };
}

/** Forgets which app account each bank account maps to; the next download asks again. */
export function resetBankAccountMap(db: Db): void {
  deleteSetting(db, MAP_KEY);
}

function accountExists(db: Db, id: number): boolean {
  return !!db
    .select({ id: accounts.id })
    .from(accounts)
    .where(eq(accounts.id, id))
    .get();
}

/**
 * Imports one downloaded statement through the same pipeline as the Import
 * page (profile detection, duplicate skipping, transfers, rules, balances).
 * The first time a bank account is seen, `choose` says which app account it
 * is; that is remembered, so later downloads need no questions.
 */
export async function importDownloadedFile(
  db: Db,
  file: string,
  displayName: string,
  deps: CommitFlowDeps,
  choose: Chooser,
): Promise<ImportOutcome> {
  const name = displayName || path.basename(file);
  const fail = (message: string): ImportOutcome => ({
    name,
    ok: false,
    message,
    added: 0,
    skipped: 0,
  });
  let text: string;
  try {
    text = decodeStatement(fs.readFileSync(file));
  } catch (e) {
    return fail(`Could not read the file: ${(e as Error).message}`);
  }
  const id = identifyStatement(text);
  if (id && "error" in id) return fail(id.error);

  const map = accountMap(db);
  let accountId = id ? map[id.key] : undefined;
  if (accountId !== undefined && !accountExists(db, accountId))
    accountId = undefined; // the mapped account was deleted

  if (accountId === undefined) {
    const candidates = db
      .select({ id: accounts.id, name: accounts.name })
      .from(accounts)
      .all();
    const pick = await choose({
      label: id?.label ?? name,
      institution: id?.institution ?? "",
      candidates,
    });
    if (!pick) return fail("Skipped: no account chosen.");
    if ("accountId" in pick) {
      if (!accountExists(db, pick.accountId))
        return fail("That account no longer exists.");
      accountId = pick.accountId;
    } else {
      const created = db
        .insert(accounts)
        .values({
          name: pick.create.name.slice(0, 60),
          type: guessAccountType(pick.create.name),
          institution: id?.institution || null,
        })
        .returning({ id: accounts.id })
        .get();
      accountId = created.id;
    }
    if (id) setSetting(db, MAP_KEY, { ...map, [id.key]: accountId });
  }

  const res = runCommitFlow(db, deps, { accountId, filename: name, text });
  if (!res.ok && res.error === "This exact file was already imported.")
    return {
      name,
      ok: true,
      message: "already imported earlier, nothing to add",
      added: 0,
      skipped: 0,
    };
  if (!res.ok)
    return fail(
      res.error === "No rows parsed"
        ? "Could not read any transactions. If this bank's format is new, import it once on the Import page so the app learns it."
        : res.error,
    );
  return {
    name,
    ok: true,
    message: `${res.newCount} new, ${res.dupCount} already had`,
    added: res.newCount,
    skipped: res.dupCount,
    importId: res.importId,
  };
}
