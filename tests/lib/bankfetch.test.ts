import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { browserCandidates, findBrowser } from "@/lib/bankfetch/browser";
import { identifyStatement } from "@/lib/bankfetch/identify";
import {
  getBankDownloadLast,
  importDownloadedFile,
  mappedAccountCount,
  recordBankDownload,
} from "@/lib/bankfetch/importer";
import { openDb } from "@/lib/db/client";
import { accounts, transactions } from "@/lib/db/schema";
import { BUILTIN_PROFILES } from "@/lib/import/profiles";

const fixture = (n: string) =>
  fs.readFileSync(path.join(__dirname, "..", "fixtures", n));
const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0))
    fs.rmSync(d, { recursive: true, force: true });
});
function tmpFile(name: string, data: Buffer | string): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "pft-bank-"));
  dirs.push(d);
  const f = path.join(d, name);
  fs.writeFileSync(f, data);
  return f;
}
const deps = { backup: () => "none", builtins: BUILTIN_PROFILES };

describe("browser choice", () => {
  it("prefers Chrome over Edge on Windows", () => {
    const env = {
      ProgramFiles: "C:\\Program Files",
      "ProgramFiles(x86)": "C:\\Program Files (x86)",
      LOCALAPPDATA: "C:\\Users\\n\\AppData\\Local",
    };
    const list = browserCandidates("win32", env);
    expect(list[0]).toMatch(/Google.*chrome\.exe$/);
    const firstEdge = list.findIndex((p) => /msedge\.exe$/.test(p));
    expect(list.slice(0, firstEdge).every((p) => /chrome\.exe$/.test(p))).toBe(
      true,
    );
    // Edge is only used when no Chrome is installed.
    expect(findBrowser((p) => /msedge\.exe$/.test(p), list)).toMatch(/msedge/);
    expect(findBrowser((p) => /chrome\.exe$/.test(p), list)).toMatch(/chrome/);
    expect(findBrowser(() => false, list)).toBeNull();
  });
  it("lets FINANCE_BROWSER override the search", () => {
    expect(
      browserCandidates("win32", { FINANCE_BROWSER: "D:\\x.exe" }),
    ).toEqual(["D:\\x.exe"]);
  });
});

describe("identifyStatement", () => {
  it("reads the NatWest account number, masked in the label", () => {
    const id = identifyStatement(fixture("natwest.csv").toString("utf8"));
    expect(id).toMatchObject({
      key: "natwest:600000-12345678",
      institution: "NatWest",
    });
    expect(id && "label" in id && id.label).toBe("Bills ••5678");
  });
  it("reads Nationwide's account line, current and credit card", () => {
    expect(
      identifyStatement(fixture("nationwide-current.csv").toString("latin1")),
    ).toMatchObject({ key: "nationwide:flexplus ****12345" });
    expect(
      identifyStatement(fixture("nationwide-credit.csv").toString("latin1")),
    ).toMatchObject({ institution: "Nationwide" });
  });
  it("reads an OFX account and refuses files that mix accounts", () => {
    expect(
      identifyStatement(fixture("sample.ofx").toString("utf8")),
    ).toMatchObject({ key: "ofx:987654321" });
    const mixed =
      "Date,Description,Value,Account Number\n01/10/2026,A,1,'111111'\n02/10/2026,B,2,'222222'\n";
    expect(identifyStatement(mixed)).toHaveProperty("error");
    expect(identifyStatement("Date,Amount\n01/10/2026,5\n")).toBeNull();
  });
});

describe("importDownloadedFile", () => {
  it("asks once, remembers the account, then skips duplicates", async () => {
    const db = openDb(":memory:");
    const [mine] = db
      .insert(accounts)
      .values({ name: "NatWest Bills", type: "checking" })
      .returning()
      .all();
    let asked = 0;
    const choose = async () => {
      asked += 1;
      return { accountId: mine.id };
    };
    const f1 = tmpFile("a.csv", fixture("natwest.csv"));
    const r1 = await importDownloadedFile(db, f1, "a.csv", deps, choose);
    expect(r1.ok).toBe(true);
    expect(r1.added).toBeGreaterThan(0);
    expect(asked).toBe(1);
    expect(mappedAccountCount(db)).toBe(1);
    const count = db.select().from(transactions).all().length;
    expect(count).toBe(r1.added);

    // The same file again is recognised and does nothing.
    const same = tmpFile("same.csv", fixture("natwest.csv"));
    const r1b = await importDownloadedFile(db, same, "same.csv", deps, choose);
    expect(r1b).toMatchObject({ ok: true, added: 0 });
    expect(r1b.message).toContain("already imported");

    // A later download that overlaps: only the new row is added.
    const later = `${fixture("natwest.csv").toString("utf8").trimEnd()}\n05/10/2026,POS,"'COSTA COFFEE",-3.40,1376.55,'Bills','600000-12345678',\n`;
    const f2 = tmpFile("b.csv", later);
    const r2 = await importDownloadedFile(db, f2, "b.csv", deps, choose);
    expect(asked).toBe(1); // remembered, no question
    expect(r2.added).toBe(1);
    expect(r2.skipped).toBe(r1.added);
    expect(db.select().from(transactions).all()).toHaveLength(count + 1);
  });

  it("can create the account, and decodes Nationwide's Windows-1252 file", async () => {
    const db = openDb(":memory:");
    const f = tmpFile("n.csv", fixture("nationwide-current.csv"));
    const r = await importDownloadedFile(db, f, "n.csv", deps, async (q) => ({
      create: { name: `${q.institution} ${q.label}` },
    }));
    expect(r.ok).toBe(true);
    const a = db.select().from(accounts).all();
    expect(a).toHaveLength(1);
    expect(a[0]).toMatchObject({
      name: "Nationwide FlexPlus ****12345",
      institution: "Nationwide",
      type: "checking",
      owner: "joint",
    });
    expect(
      db
        .select()
        .from(transactions)
        .where(eq(transactions.accountId, a[0].id))
        .all().length,
    ).toBe(r.added);
  });

  it("skips when no account is chosen, and says so for an unreadable file", async () => {
    const db = openDb(":memory:");
    const f = tmpFile("n.csv", fixture("natwest.csv"));
    const skipped = await importDownloadedFile(
      db,
      f,
      "n.csv",
      deps,
      async () => null,
    );
    expect(skipped).toMatchObject({
      ok: false,
      message: expect.stringContaining("Skipped"),
    });
    const junk = tmpFile("j.csv", "hello\nworld\n");
    const bad = await importDownloadedFile(
      db,
      junk,
      "j.csv",
      deps,
      async () => ({
        create: { name: "X" },
      }),
    );
    expect(bad.ok).toBe(false);
    expect(db.select().from(transactions).all()).toHaveLength(0);
  });

  it("records the last download for Settings", () => {
    const db = openDb(":memory:");
    expect(getBankDownloadLast(db)).toBeNull();
    recordBankDownload(db, 2, 17, new Date("2026-11-04T09:00:00Z"));
    expect(getBankDownloadLast(db)).toEqual({
      at: "2026-11-04T09:00:00.000Z",
      files: 2,
      added: 17,
      importIds: [],
    });
  });
});

describe("dataAgeDays", () => {
  it("uses the last download, then the newest transaction, else null", async () => {
    const { dataAgeDays } = await import("@/lib/bankfetch/freshness");
    const db = openDb(":memory:");
    expect(dataAgeDays(db, "2026-11-10")).toBeNull();
    const [a] = db
      .insert(accounts)
      .values({ name: "A", type: "checking" })
      .returning()
      .all();
    db.insert(transactions)
      .values({
        accountId: a.id,
        date: "2026-11-01",
        amountCents: -100,
        rawDescription: "X",
        merchant: "X",
        dedupeHash: "fresh1",
      })
      .run();
    expect(dataAgeDays(db, "2026-11-10")).toBe(9); // newest transaction
    recordBankDownload(db, 1, 1, new Date("2026-11-08T12:00:00"));
    expect(dataAgeDays(db, "2026-11-10")).toBe(2); // last download wins
  });
});

describe("undo and reset", () => {
  it("undoes the last session and forgets account choices", async () => {
    const { resetBankAccountMap, undoLastBankDownload } = await import(
      "@/lib/bankfetch/importer"
    );
    const db = openDb(":memory:");
    expect(undoLastBankDownload(db)).toBeNull();
    const f = tmpFile("n.csv", fixture("natwest.csv"));
    const r = await importDownloadedFile(db, f, "n.csv", deps, async () => ({
      create: { name: "NatWest Bills" },
    }));
    expect(r.importId).toBeDefined();
    recordBankDownload(db, 1, r.added, new Date(), [r.importId as number]);
    expect(db.select().from(transactions).all()).toHaveLength(r.added);

    expect(undoLastBankDownload(db)).toEqual({ imports: 1, removed: r.added });
    expect(db.select().from(transactions).all()).toHaveLength(0);
    expect(undoLastBankDownload(db)).toBeNull(); // only once

    expect(mappedAccountCount(db)).toBe(1);
    resetBankAccountMap(db);
    expect(mappedAccountCount(db)).toBe(0);
  });
});
