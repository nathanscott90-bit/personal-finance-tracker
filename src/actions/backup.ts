"use server";
import path from "node:path";
import { revalidatePath } from "next/cache";
import { audit } from "@/lib/audit/request";
import { dbPath, getDb } from "@/lib/db/client";
import {
  getOffsiteConfig,
  getOffsiteLast,
  hasOffsitePassphrase,
  type OffsiteConfig,
  type OffsiteLast,
  runOffsiteBackup,
  saveOffsiteConfig,
} from "@/lib/db/offsite";

export type OffsiteView = {
  config: OffsiteConfig | null;
  passphraseSet: boolean;
  last: OffsiteLast | null;
};

export async function getOffsiteAction(): Promise<OffsiteView> {
  const db = getDb();
  return {
    config: getOffsiteConfig(db),
    passphraseSet: hasOffsitePassphrase(db),
    last: getOffsiteLast(db),
  };
}

export async function saveOffsiteAction(input: {
  dir: string;
  keep: number;
  passphrase?: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const r = saveOffsiteConfig(getDb(), input);
  if (r.ok) {
    await audit(
      "Changed off-PC backup",
      input.passphrase ? "Folder and passphrase" : "Folder",
    );
    revalidatePath("/settings");
  }
  return r;
}

export async function runOffsiteNowAction(): Promise<OffsiteLast> {
  const last = runOffsiteBackup(getDb(), dbPath());
  await audit(
    "Ran off-PC backup",
    last.ok ? path.basename(last.file ?? "backup") : `failed: ${last.error}`,
  );
  revalidatePath("/settings");
  return last;
}
