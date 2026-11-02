import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import { type Db, openDb } from "@/lib/db/client";
import {
  decryptBuffer,
  encryptBuffer,
  getOffsiteLast,
  offsiteDue,
  runOffsiteBackup,
  saveOffsiteConfig,
} from "@/lib/db/offsite";
import { accounts } from "@/lib/db/schema";

const PASS = "correct horse battery staple";
const dirs: string[] = [];
const dbs: Db[] = [];
function tmp(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "pft-offsite-"));
  dirs.push(d);
  return d;
}
afterEach(() => {
  for (const db of dbs.splice(0))
    (db as unknown as { $client: Database.Database }).$client.close();
  for (const d of dirs.splice(0))
    fs.rmSync(d, { recursive: true, force: true });
});

describe("backup encryption", () => {
  it("round-trips, and refuses a wrong passphrase or a damaged file", () => {
    const plain = Buffer.from("SQLite format 3\0household");
    const blob = encryptBuffer(plain, PASS);
    expect(blob.includes(plain)).toBe(false);
    expect(decryptBuffer(blob, PASS).equals(plain)).toBe(true);
    expect(() => decryptBuffer(blob, "not the passphrase")).toThrow(
      "Wrong passphrase",
    );
    const damaged = Buffer.from(blob);
    damaged[damaged.length - 1] ^= 1;
    expect(() => decryptBuffer(damaged, PASS)).toThrow("Wrong passphrase");
    expect(() => decryptBuffer(Buffer.from("junk"), PASS)).toThrow(
      "Not a Finance backup",
    );
  });
});

describe("off-PC backup", () => {
  it("validates the folder and passphrase", () => {
    const db = openDb(":memory:");
    const out = tmp();
    expect(saveOffsiteConfig(db, { dir: out, keep: 5 })).toEqual({
      ok: false,
      error: "Set a passphrase.",
    });
    expect(
      saveOffsiteConfig(db, { dir: out, keep: 5, passphrase: "short" }),
    ).toMatchObject({ ok: false });
    expect(
      saveOffsiteConfig(db, {
        dir: path.join(out, "missing"),
        keep: 5,
        passphrase: PASS,
      }),
    ).toMatchObject({ ok: false });
    expect(
      saveOffsiteConfig(db, { dir: out, keep: 5, passphrase: PASS }),
    ).toEqual({ ok: true });
    // Changing the folder later keeps the stored passphrase.
    expect(saveOffsiteConfig(db, { dir: out, keep: 3 })).toEqual({ ok: true });
  });

  it("writes a decryptable snapshot, prunes to keep, and schedules the next", () => {
    const work = tmp();
    const out = tmp();
    const file = path.join(work, "finance.db");
    const db = openDb(file);
    dbs.push(db);
    db.insert(accounts).values({ name: "Joint", type: "checking" }).run();
    expect(offsiteDue(db)).toBe(false); // not set up
    saveOffsiteConfig(db, { dir: out, keep: 2, passphrase: PASS });
    expect(offsiteDue(db)).toBe(true);

    const t0 = new Date("2026-11-01T07:30:00Z");
    for (let i = 0; i < 3; i++) {
      const r = runOffsiteBackup(db, file, new Date(t0.getTime() + i * 1000));
      expect(r.ok).toBe(true);
    }
    const files = fs.readdirSync(out).sort();
    expect(files).toEqual([
      "finance-20261101-073001.finbak",
      "finance-20261101-073002.finbak",
    ]);
    const plain = decryptBuffer(
      fs.readFileSync(path.join(out, files[1])),
      PASS,
    );
    const restored = path.join(work, "restored.db");
    fs.writeFileSync(restored, plain);
    const check = new Database(restored, { readonly: true });
    expect(check.prepare("select name from accounts").all()).toEqual([
      { name: "Joint" },
    ]);
    check.close();

    expect(getOffsiteLast(db)?.ok).toBe(true);
    const last = new Date(t0.getTime() + 2000);
    expect(offsiteDue(db, new Date(last.getTime() + 60 * 60 * 1000))).toBe(
      false,
    );
    expect(offsiteDue(db, new Date(last.getTime() + 21 * 60 * 60 * 1000))).toBe(
      true,
    );
  });

  it("records a failure when the folder has gone", () => {
    const work = tmp();
    const out = tmp();
    const file = path.join(work, "finance.db");
    const db = openDb(file);
    dbs.push(db);
    saveOffsiteConfig(db, { dir: out, keep: 2, passphrase: PASS });
    fs.rmSync(out, { recursive: true, force: true });
    const r = runOffsiteBackup(db, file);
    expect(r.ok).toBe(false);
    expect(getOffsiteLast(db)?.ok).toBe(false);
    expect(offsiteDue(db)).toBe(true);
  });
});
