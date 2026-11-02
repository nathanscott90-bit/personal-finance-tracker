import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { addDays, localDay } from "@/lib/dates";
import type { Db } from "@/lib/db/client";
import { accounts, simplefinAccounts } from "@/lib/db/schema";
import { CURRENCY } from "@/lib/locale";
import {
  mapAccount,
  setEnabled,
  upsertLinkedAccounts,
} from "@/lib/simplefin/store";
import { plainReason, syncPayload } from "@/lib/simplefin/sync";
import type { SfinAccount, SyncResult } from "@/lib/simplefin/types";
import {
  createSession,
  EbError,
  type FetchFn,
  getBalances,
  getTransactions,
  startAuth,
} from "./client";
import {
  accountName,
  accountType,
  EB_PREFIX,
  pickBalance,
  toSfinAccount,
  toSfinTransactions,
} from "./map";
import {
  getEbConfig,
  getPendingAuth,
  getSessions,
  recordAttempt,
  setPendingAuth,
  upsertSession,
} from "./store";
import type { StoredSession } from "./types";

/** History asked for on an account's first sync; banks may cap it lower. */
const FIRST_SYNC_DAYS = 365;
/** Fallback when a bank refuses the long window. */
const SHORT_SYNC_DAYS = 89;
/** Re-read this far back each time so late-posting rows are caught. */
const OVERLAP_DAYS = 10;
/** Ask banks for this long a consent; each bank caps it at its own maximum. */
const CONSENT_DAYS = 180;

export async function beginConnect(
  db: Db,
  fetchFn: FetchFn,
  bank: string,
  country = "GB",
  now = new Date(),
): Promise<string> {
  const cfg = getEbConfig(db);
  if (!cfg) throw new Error("Add your Enable Banking application first.");
  const state = randomUUID();
  const validUntil = new Date(
    now.getTime() + CONSENT_DAYS * 86_400_000,
  ).toISOString();
  const url = await startAuth(cfg, fetchFn, {
    bank,
    country,
    state,
    validUntil,
  });
  setPendingAuth(db, { state, bank, country, createdAt: now.toISOString() });
  return url;
}

/** Pull `code` (and `state`) out of whatever the user pastes: the full
 * address they landed on, or just the code. */
export function parseRedirect(
  input: string,
): { code: string; state: string | null } | null {
  const s = input.trim();
  if (!s) return null;
  try {
    const u = new URL(s);
    const code = u.searchParams.get("code");
    if (code) return { code, state: u.searchParams.get("state") };
    const err =
      u.searchParams.get("error_description") ?? u.searchParams.get("error");
    if (err) throw new Error(`The bank said: ${err}`);
    return null;
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("The bank said")) throw e;
    const m = /[?&]code=([^&\s]+)/.exec(s);
    if (m) return { code: decodeURIComponent(m[1]), state: null };
    return /^[A-Za-z0-9._~-]{8,}$/.test(s) ? { code: s, state: null } : null;
  }
}

/**
 * Link every account in a session to a local account: the one it was linked
 * to before, an existing account of the same name, or a new one. No
 * questions asked; the user can rename or relink later.
 */
function autoMap(db: Db, s: StoredSession): void {
  upsertLinkedAccounts(
    db,
    s.accounts.map(
      (a): SfinAccount => ({
        id: `${EB_PREFIX}${a.uid}`,
        org: { name: s.bank },
        name: a.name,
        currency: a.currency,
        balance: "",
        "balance-date": 0,
      }),
    ),
  );
  for (const a of s.accounts) {
    const sfinId = `${EB_PREFIX}${a.uid}`;
    const link = db
      .select()
      .from(simplefinAccounts)
      .where(eq(simplefinAccounts.sfinId, sfinId))
      .get();
    if (!link || link.accountId !== null) continue;
    const existing = db
      .select({ id: accounts.id })
      .from(accounts)
      .where(eq(accounts.name, a.name))
      .get();
    const id =
      existing?.id ??
      db
        .insert(accounts)
        .values({ name: a.name, type: a.type, institution: s.bank })
        .returning({ id: accounts.id })
        .get().id;
    mapAccount(db, sfinId, id);
    setEnabled(db, sfinId, true);
  }
}

export async function completeConnect(
  db: Db,
  fetchFn: FetchFn,
  pasted: string,
): Promise<{ bank: string; accounts: string[] }> {
  const cfg = getEbConfig(db);
  if (!cfg) throw new Error("Add your Enable Banking application first.");
  const parsed = parseRedirect(pasted);
  if (!parsed) throw new Error("No authorisation code found in that address.");
  const pending = getPendingAuth(db);
  if (parsed.state && pending && parsed.state !== pending.state)
    throw new Error(
      "That link is from an older attempt. Start the connection again.",
    );
  const session = await createSession(cfg, fetchFn, parsed.code);
  const bank = session.aspsp?.name ?? pending?.bank ?? "Bank";
  const stored: StoredSession = {
    sessionId: session.session_id,
    bank,
    country: session.aspsp?.country ?? pending?.country ?? "GB",
    validUntil: session.access?.valid_until ?? "",
    accounts: (session.accounts ?? []).map((a) => ({
      uid: a.uid,
      name: accountName(bank, a),
      currency: (a.currency ?? CURRENCY).toUpperCase(),
      type: accountType(a),
    })),
  };
  upsertSession(db, stored);
  setPendingAuth(db, null);
  autoMap(db, stored);
  return { bank, accounts: stored.accounts.map((a) => a.name) };
}

export type EbSyncOutcome = {
  ok: boolean;
  results: SyncResult[];
  warnings: string[];
  error: string | null;
  /** Consents within 14 days of expiry (or expired): renew from Settings. */
  expiring: { bank: string; validUntil: string; expired: boolean }[];
};

function lastSynced(db: Db, uid: string): string | null {
  return (
    db
      .select({ at: simplefinAccounts.lastSyncedAt })
      .from(simplefinAccounts)
      .where(eq(simplefinAccounts.sfinId, `${EB_PREFIX}${uid}`))
      .get()?.at ?? null
  );
}

export async function runEbSync(
  db: Db,
  fetchFn: FetchFn,
  now = new Date(),
): Promise<EbSyncOutcome> {
  const out: EbSyncOutcome = {
    ok: true,
    results: [],
    warnings: [],
    error: null,
    expiring: [],
  };
  const cfg = getEbConfig(db);
  const sessions = getSessions(db);
  if (!cfg || sessions.length === 0) {
    return { ...out, ok: false, error: "No bank is connected yet." };
  }
  const today = localDay(now);
  const failures: string[] = [];
  for (const s of sessions) {
    const expired = !!s.validUntil && new Date(s.validUntil) <= now;
    if (
      s.validUntil &&
      new Date(s.validUntil).getTime() - now.getTime() < 14 * 86_400_000
    )
      out.expiring.push({ bank: s.bank, validUntil: s.validUntil, expired });
    if (expired) {
      failures.push(`${s.bank}: bank access has expired — reconnect it.`);
      continue;
    }
    const payloadAccounts: SfinAccount[] = [];
    for (const a of s.accounts) {
      try {
        const prev = lastSynced(db, a.uid);
        const from = prev
          ? addDays(prev.slice(0, 10), -OVERLAP_DAYS)
          : addDays(today, -FIRST_SYNC_DAYS);
        let raw: Awaited<ReturnType<typeof getTransactions>>;
        try {
          raw = await getTransactions(cfg, fetchFn, a.uid, from);
        } catch (e) {
          // Many banks only serve 90 days without a fresh login.
          if (
            !prev &&
            e instanceof EbError &&
            e.status >= 400 &&
            e.status < 500
          )
            raw = await getTransactions(
              cfg,
              fetchFn,
              a.uid,
              addDays(today, -SHORT_SYNC_DAYS),
            );
          else throw e;
        }
        const { txns, skipped } = toSfinTransactions(a.uid, raw);
        if (skipped)
          out.warnings.push(
            `${a.name}: ${skipped} unreadable transaction(s) skipped`,
          );
        let balance: ReturnType<typeof pickBalance> = null;
        try {
          balance = pickBalance(await getBalances(cfg, fetchFn, a.uid), now);
        } catch (e) {
          out.warnings.push(`${a.name}: no balance — ${plainReason(e)}`);
        }
        payloadAccounts.push(toSfinAccount(s.bank, a, txns, balance));
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        failures.push(`${a.name}: ${msg}`);
        if (e instanceof EbError && (e.status === 401 || e.status === 403))
          out.expiring.push({
            bank: s.bank,
            validUntil: s.validUntil,
            expired: true,
          });
      }
    }
    if (payloadAccounts.length) {
      const r = syncPayload(
        db,
        { accounts: payloadAccounts },
        {
          now,
          importTag: `eb-${now.toISOString()}`,
        },
      );
      out.results.push(...r.results);
      out.warnings.push(...r.warnings);
    }
  }
  if (failures.length) {
    out.ok = out.results.length > 0;
    out.error = failures.join(" · ");
    out.warnings.push(...failures);
  }
  recordAttempt(db, now, {
    ok: failures.length === 0,
    error: out.error,
    warnings: out.warnings,
  });
  return out;
}
