"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { audit } from "@/lib/audit/request";
import { getDb } from "@/lib/db/client";
import { listAspsps } from "@/lib/enablebanking/client";
import { normalisePem } from "@/lib/enablebanking/jwt";
import {
  DEFAULT_REDIRECT,
  getEbConfig,
  getEbStatus,
  getSessions,
  setEbConfig,
  setSessions,
} from "@/lib/enablebanking/store";
import {
  beginConnect,
  completeConnect,
  runEbSync,
} from "@/lib/enablebanking/sync";

function refresh() {
  for (const p of [
    "/settings",
    "/home",
    "/bills",
    "/transactions",
    "/accounts",
  ])
    revalidatePath(p);
}
const fail = (e: unknown) => ({
  ok: false as const,
  error: e instanceof Error ? e.message : "Something went wrong",
});

export type BankConnectionView = {
  configured: boolean;
  appId: string | null;
  redirectUrl: string;
  banks: { bank: string; validUntil: string; accounts: string[] }[];
  lastSyncAt: string | null;
  lastError: string | null;
};

export async function getBankConnection(): Promise<BankConnectionView> {
  const db = getDb();
  const cfg = getEbConfig(db);
  const status = getEbStatus(db);
  return {
    configured: !!cfg,
    appId: cfg?.appId ?? null,
    redirectUrl: cfg?.redirectUrl ?? DEFAULT_REDIRECT,
    banks: getSessions(db).map((s) => ({
      bank: s.bank,
      validUntil: s.validUntil,
      accounts: s.accounts.map((a) => a.name),
    })),
    lastSyncAt: status.lastSyncAt,
    lastError: status.lastError,
  };
}

export async function saveEbConfigAction(input: {
  appId: string;
  privateKey: string;
  redirectUrl?: string;
}) {
  const p = z
    .object({
      appId: z.string().trim().min(8).max(100),
      privateKey: z.string().min(100),
      redirectUrl: z.string().url().optional(),
    })
    .safeParse(input);
  if (!p.success)
    return {
      ok: false as const,
      error: "Paste the Application ID and the whole private key file.",
    };
  const privateKey = normalisePem(p.data.privateKey);
  if (!/-----BEGIN (RSA )?PRIVATE KEY-----/.test(privateKey))
    return {
      ok: false as const,
      error: "That doesn't look like a private key (.pem) file.",
    };
  try {
    const { ebJwt } = await import("@/lib/enablebanking/jwt");
    ebJwt(p.data.appId, privateKey);
  } catch {
    return { ok: false as const, error: "The private key couldn't be read." };
  }
  setEbConfig(getDb(), {
    appId: p.data.appId.trim(),
    privateKey,
    redirectUrl: p.data.redirectUrl ?? DEFAULT_REDIRECT,
  });
  await audit("Saved bank connection settings", "Enable Banking app details");
  refresh();
  return { ok: true as const };
}

export async function listBanksAction() {
  const cfg = getEbConfig(getDb());
  if (!cfg) return { ok: false as const, error: "Add the application first." };
  try {
    const banks = await listAspsps(cfg, fetch, "GB");
    return { ok: true as const, banks: banks.map((b) => b.name).sort() };
  } catch (e) {
    return fail(e);
  }
}

export async function startConnectAction(bank: string) {
  try {
    return {
      ok: true as const,
      url: await beginConnect(getDb(), fetch, bank, "GB"),
    };
  } catch (e) {
    return fail(e);
  }
}

export async function finishConnectAction(pasted: string) {
  const db = getDb();
  try {
    const r = await completeConnect(db, fetch, pasted);
    const sync = await runEbSync(db, fetch);
    await audit("Connected bank", `${r.bank}: ${r.accounts.length} accounts`);
    refresh();
    const added = sync.results.reduce((n, x) => n + x.added, 0);
    return { ok: true as const, bank: r.bank, accounts: r.accounts, added };
  } catch (e) {
    return fail(e);
  }
}

export async function ebSyncNowAction() {
  try {
    const r = await runEbSync(getDb(), fetch);
    refresh();
    return {
      ok: r.ok,
      added: r.results.reduce((n, x) => n + x.added, 0),
      error: r.error,
    };
  } catch (e) {
    return fail(e);
  }
}

export async function forgetBankAction(bank: string) {
  const db = getDb();
  setSessions(
    db,
    getSessions(db).filter((s) => s.bank !== bank),
  );
  refresh();
  return { ok: true as const };
}
