import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { z } from "zod";
import type { Db } from "@/lib/db/client";
import { getSetting, setSetting } from "@/lib/settings";

/**
 * Encrypted copies of the database in a folder of your choosing, normally
 * one a cloud drive syncs (OneDrive, Google Drive, Dropbox) or a USB disk, so
 * a dead or stolen PC does not take the data with it. The cloud provider only
 * ever holds ciphertext.
 *
 * File format (`.finbak`): "FINBAK01" | salt (16) | iv (12) | tag (16) | data.
 * The key is scrypt(passphrase, salt); the data is AES-256-GCM over a
 * consistent SQLite snapshot (`VACUUM INTO`). Restore with `npm run restore`.
 */
const MAGIC = Buffer.from("FINBAK01", "ascii");
const SCRYPT = { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
export const BACKUP_EXT = ".finbak";
const NAME = /^finance-\d{8}-\d{6}\.finbak$/;

const CONFIG_KEY = "backup.offsite";
const PASS_KEY = "backup.offsite.passphrase";
const LAST_KEY = "backup.offsite.last";

/** How long after a good backup the daily job waits before the next one. */
export const OFFSITE_EVERY_MS = 20 * 60 * 60 * 1000;

export type OffsiteConfig = { dir: string; keep: number };
export type OffsiteLast = {
  at: string;
  ok: boolean;
  file?: string;
  bytes?: number;
  error?: string;
};

export const offsiteInput = z.object({
  dir: z.string().trim().min(1, "Choose a folder.").max(400),
  keep: z.number().int().min(1).max(365).default(30),
  /** Omit or leave empty to keep the stored one. */
  passphrase: z
    .string()
    .max(200)
    .optional()
    .transform((v) => (v && v.length > 0 ? v : undefined))
    .refine((v) => v === undefined || v.length >= 12, {
      message: "Use a passphrase of at least 12 characters.",
    }),
});

function deriveKey(passphrase: string, salt: Buffer): Buffer {
  return crypto.scryptSync(passphrase.normalize("NFKC"), salt, 32, SCRYPT);
}

export function encryptBuffer(plain: Buffer, passphrase: string): Buffer {
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(
    "aes-256-gcm",
    deriveKey(passphrase, salt),
    iv,
  );
  cipher.setAAD(MAGIC);
  const data = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.concat([MAGIC, salt, iv, cipher.getAuthTag(), data]);
}

/** Throws "Wrong passphrase or damaged file." when it cannot authenticate. */
export function decryptBuffer(blob: Buffer, passphrase: string): Buffer {
  if (
    blob.length < MAGIC.length + 44 ||
    !blob.subarray(0, MAGIC.length).equals(MAGIC)
  )
    throw new Error("Not a Finance backup file.");
  const o = MAGIC.length;
  const salt = blob.subarray(o, o + 16);
  const iv = blob.subarray(o + 16, o + 28);
  const tag = blob.subarray(o + 28, o + 44);
  const data = blob.subarray(o + 44);
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    deriveKey(passphrase, salt),
    iv,
  );
  decipher.setAAD(MAGIC);
  decipher.setAuthTag(tag);
  try {
    return Buffer.concat([decipher.update(data), decipher.final()]);
  } catch {
    throw new Error("Wrong passphrase or damaged file.");
  }
}

export function getOffsiteConfig(db: Db): OffsiteConfig | null {
  return getSetting<OffsiteConfig | null>(db, CONFIG_KEY, null);
}

export function hasOffsitePassphrase(db: Db): boolean {
  return getSetting<string | null>(db, PASS_KEY, null) !== null;
}

export function getOffsiteLast(db: Db): OffsiteLast | null {
  return getSetting<OffsiteLast | null>(db, LAST_KEY, null);
}

/** Validates the folder (it must exist and be writable) and stores the settings. */
export function saveOffsiteConfig(
  db: Db,
  input: unknown,
): { ok: true } | { ok: false; error: string } {
  const p = offsiteInput.safeParse(input);
  if (!p.success)
    return {
      ok: false,
      error: p.error.issues[0]?.message ?? "Check the settings.",
    };
  const dir = path.resolve(p.data.dir);
  try {
    if (!fs.statSync(dir).isDirectory())
      return { ok: false, error: "That path is a file, not a folder." };
    fs.accessSync(dir, fs.constants.W_OK);
  } catch {
    return {
      ok: false,
      error: "That folder does not exist or cannot be written to.",
    };
  }
  if (!p.data.passphrase && !hasOffsitePassphrase(db))
    return { ok: false, error: "Set a passphrase." };
  if (p.data.passphrase) setSetting(db, PASS_KEY, p.data.passphrase);
  setSetting(db, CONFIG_KEY, { dir, keep: p.data.keep });
  return { ok: true };
}

/** A consistent copy of the live database, safe while the app is writing. */
function snapshot(file: string): Buffer {
  const tmp = path.join(
    os.tmpdir(),
    `finance-snap-${process.pid}-${crypto.randomBytes(4).toString("hex")}.db`,
  );
  const src = new Database(file, { readonly: true, fileMustExist: true });
  try {
    src.prepare("VACUUM INTO ?").run(tmp);
  } finally {
    src.close();
  }
  try {
    return fs.readFileSync(tmp);
  } finally {
    fs.rmSync(tmp, { force: true });
  }
}

function stampOf(now: Date): string {
  return now
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\..+/, "")
    .replace("T", "-");
}

/**
 * Writes one encrypted backup and prunes the folder to the newest `keep`.
 * Records the outcome either way, so Settings can show it.
 */
export function runOffsiteBackup(
  db: Db,
  file: string,
  now = new Date(),
): OffsiteLast {
  const config = getOffsiteConfig(db);
  const pass = getSetting<string | null>(db, PASS_KEY, null);
  let last: OffsiteLast;
  if (!config || !pass) {
    last = { at: now.toISOString(), ok: false, error: "Not set up." };
  } else {
    try {
      const blob = encryptBuffer(snapshot(file), pass);
      const dest = path.join(
        config.dir,
        `finance-${stampOf(now)}${BACKUP_EXT}`,
      );
      // Write then rename, so a sync client never uploads half a file.
      const part = `${dest}.part`;
      fs.writeFileSync(part, blob);
      fs.renameSync(part, dest);
      const all = fs
        .readdirSync(config.dir)
        .filter((f) => NAME.test(f))
        .sort()
        .reverse();
      for (const old of all.slice(config.keep))
        fs.rmSync(path.join(config.dir, old), { force: true });
      last = {
        at: now.toISOString(),
        ok: true,
        file: dest,
        bytes: blob.length,
      };
    } catch (e) {
      last = {
        at: now.toISOString(),
        ok: false,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  }
  setSetting(db, LAST_KEY, last);
  return last;
}

/** For the daily job: back up when set up and the last good one is old enough. */
export function offsiteDue(db: Db, now = new Date()): boolean {
  if (!getOffsiteConfig(db) || !hasOffsitePassphrase(db)) return false;
  const last = getOffsiteLast(db);
  if (!last?.ok) return true;
  return now.getTime() - new Date(last.at).getTime() >= OFFSITE_EVERY_MS;
}
