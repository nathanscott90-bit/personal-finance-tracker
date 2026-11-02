import type { Db } from "@/lib/db/client";
import { deleteSetting, getSetting, setSetting } from "@/lib/settings";
import type { EbConfig, StoredSession } from "./types";

export const EB_KEYS = {
  config: "eb_config",
  sessions: "eb_sessions",
  pending: "eb_pending_auth",
  lastSyncAt: "eb_last_sync_at",
  lastAttemptAt: "eb_last_attempt_at",
  lastError: "eb_last_error",
  warnings: "eb_last_warnings",
} as const;

/** Where the bank sends the user back. Must match the redirect URL registered
 * with Enable Banking. Production apps need HTTPS; the page will not load on
 * a home PC, which is fine — the app reads the code from the pasted address. */
export const DEFAULT_REDIRECT =
  "https://localhost:3000/api/enablebanking/callback";

export function getEbConfig(db: Db): EbConfig | null {
  const c = getSetting<EbConfig | null>(db, EB_KEYS.config, null);
  return c?.appId && c.privateKey ? c : null;
}
export function setEbConfig(db: Db, c: EbConfig): void {
  setSetting(db, EB_KEYS.config, c);
}

export function getSessions(db: Db): StoredSession[] {
  return getSetting<StoredSession[]>(db, EB_KEYS.sessions, []);
}
export function setSessions(db: Db, s: StoredSession[]): void {
  setSetting(db, EB_KEYS.sessions, s);
}
/** One consent per bank: a new one replaces the old. */
export function upsertSession(db: Db, s: StoredSession): void {
  setSessions(db, [...getSessions(db).filter((x) => x.bank !== s.bank), s]);
}

export type PendingAuth = {
  state: string;
  bank: string;
  country: string;
  createdAt: string;
};
export function getPendingAuth(db: Db): PendingAuth | null {
  return getSetting<PendingAuth | null>(db, EB_KEYS.pending, null);
}
export function setPendingAuth(db: Db, p: PendingAuth | null): void {
  if (p) setSetting(db, EB_KEYS.pending, p);
  else deleteSetting(db, EB_KEYS.pending);
}

export function getEbStatus(db: Db) {
  return {
    lastSyncAt: getSetting<string | null>(db, EB_KEYS.lastSyncAt, null),
    lastAttemptAt: getSetting<string | null>(db, EB_KEYS.lastAttemptAt, null),
    lastError: getSetting<string | null>(db, EB_KEYS.lastError, null),
    warnings: getSetting<string[]>(db, EB_KEYS.warnings, []),
  };
}
export function recordAttempt(
  db: Db,
  now: Date,
  r: { ok: boolean; error?: string | null; warnings: string[] },
): void {
  setSetting(db, EB_KEYS.lastAttemptAt, now.toISOString());
  setSetting(db, EB_KEYS.warnings, r.warnings);
  if (r.ok) {
    setSetting(db, EB_KEYS.lastSyncAt, now.toISOString());
    deleteSetting(db, EB_KEYS.lastError);
  } else if (r.error) setSetting(db, EB_KEYS.lastError, r.error);
}
