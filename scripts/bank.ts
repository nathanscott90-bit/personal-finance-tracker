/**
 * Bank download: opens Chrome at your bank, you log in as normal, and every
 * statement you download (CSV/OFX) is imported straight away.
 *
 *   npm run bank                  open NatWest and Nationwide
 *   npm run bank -- natwest       just one (natwest | nationwide | a web address)
 *   npm run bank -- --forget      delete the saved browser profile and exit
 *   npm run bank -- --undo        undo everything imported in the last session
 *   npm run bank -- --reset-accounts   forget which account each bank account is
 *
 * It never types your login or approval codes and never stores them. See
 * docs/BANK-DOWNLOAD.md.
 */
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { findBrowser, openBrowser } from "../src/lib/bankfetch/browser";
import { watchDownloads } from "../src/lib/bankfetch/catcher";
import {
  type Chooser,
  importDownloadedFile,
  recordBankDownload,
  resetBankAccountMap,
  undoLastBankDownload,
} from "../src/lib/bankfetch/importer";
import { backupDb } from "../src/lib/db/backup";
import { dbPath, openDb } from "../src/lib/db/client";
import { BUILTIN_PROFILES } from "../src/lib/import/profiles";

const SITES: Record<string, string> = {
  natwest: "https://www.natwest.com/",
  nationwide: "https://www.nationwide.co.uk/",
};

async function main() {
  const args = process.argv.slice(2);
  const dataDir = path.dirname(dbPath());
  const profileDir = path.join(dataDir, "browser-profile");
  const inboxDir = path.join(dataDir, "inbox");

  if (args.includes("--forget")) {
    fs.rmSync(profileDir, { recursive: true, force: true });
    console.log("Deleted the saved browser profile (logins and cookies).");
    return;
  }

  if (args.includes("--undo") || args.includes("--reset-accounts")) {
    const db = openDb(dbPath());
    if (args.includes("--undo")) {
      const u = undoLastBankDownload(db);
      console.log(
        u
          ? `Undone: ${u.removed} transactions from ${u.imports} import${u.imports === 1 ? "" : "s"}.`
          : "Nothing to undo from the last Bank download.",
      );
    }
    if (args.includes("--reset-accounts")) {
      resetBankAccountMap(db);
      console.log(
        "Forgotten. The next download will ask which account each one is.",
      );
    }
    return;
  }

  const wanted = args.filter((a) => !a.startsWith("--"));
  const urls = wanted.length
    ? wanted.map((w) => SITES[w.toLowerCase()] ?? w)
    : Object.values(SITES);
  for (const u of urls)
    if (!/^(https:\/\/|http:\/\/(127\.0\.0\.1|localhost)[:/])/i.test(u)) {
      console.error(
        `"${u}" is not natwest, nationwide or an https:// address.`,
      );
      process.exit(2);
    }

  const exe = findBrowser();
  if (!exe) {
    console.error(
      "Google Chrome was not found (Edge is the fallback). Install Chrome, or set FINANCE_BROWSER to the browser's .exe path.",
    );
    process.exit(1);
  }

  const db = openDb(dbPath());
  const deps = {
    backup: () => backupDb(dbPath()),
    builtins: BUILTIN_PROFILES,
  };

  // One stdin reader, shared by the account questions and "press Enter to finish".
  const rl = readline.createInterface({ input: process.stdin });
  let waiter: ((s: string) => void) | null = null;
  let finish!: () => void;
  const finished = new Promise<void>((r) => {
    finish = r;
  });
  rl.on("line", (line) => {
    const t = line.trim();
    if (waiter) {
      const w = waiter;
      waiter = null;
      w(t);
    } else if (t === "" || /^(done|q|quit|exit)$/i.test(t)) finish();
  });
  const ask = (q: string) =>
    new Promise<string>((res) => {
      process.stdout.write(q);
      waiter = res;
    });

  const choose: Chooser = async ({ label, institution, candidates }) => {
    console.log(
      `\nNew account: "${label}"${institution ? ` (${institution})` : ""}`,
    );
    console.log("Which of your accounts in the app is it?");
    candidates.forEach((c, i) => {
      console.log(`  ${i + 1}) ${c.name}`);
    });
    console.log("  n) Add it as a new account");
    console.log("  s) Skip this file");
    for (;;) {
      const a = (await ask("> ")).toLowerCase();
      if (a === "s") return null;
      if (a === "n")
        return {
          create: { name: `${institution} ${label}`.trim() },
        };
      const n = Number(a);
      if (Number.isInteger(n) && n >= 1 && n <= candidates.length)
        return { accountId: candidates[n - 1].id };
      console.log("Type a number, n or s.");
    }
  };

  console.log(`Opening ${path.basename(exe)}…`);
  const session = await openBrowser({
    exe,
    profileDir,
    urls,
    extraArgs: (process.env.FINANCE_BROWSER_ARGS ?? "")
      .split(" ")
      .filter(Boolean),
    port: process.env.FINANCE_DEBUG_PORT
      ? Number(process.env.FINANCE_DEBUG_PORT)
      : undefined,
  });
  const context = session.browser.contexts()[0];
  if (!context) throw new Error("The browser opened without a window.");

  let files = 0;
  let added = 0;
  const importIds: number[] = [];
  let queue: Promise<void> = Promise.resolve();
  watchDownloads(
    context,
    inboxDir,
    (f) => {
      if (!f.importable) {
        console.log(
          `Saved ${f.name} (not a CSV/OFX statement, so not imported): ${f.file}`,
        );
        return;
      }
      // One at a time, so questions never interleave.
      queue = queue.then(async () => {
        const r = await importDownloadedFile(db, f.file, f.name, deps, choose);
        files += 1;
        added += r.added;
        if (r.importId !== undefined && r.added > 0) importIds.push(r.importId);
        console.log(
          r.ok ? `✓ ${r.name}: ${r.message}` : `✗ ${r.name}: ${r.message}`,
        );
      });
      return queue;
    },
    (e) =>
      console.error(
        `Could not capture that download (${e instanceof Error ? e.message : e}). Download it again, or save it and use the Import page.`,
      ),
  );

  console.log(`
A Chrome window is open.
  1. Log in to your bank as you normally do (including any phone approval).
  2. Open an account, choose Download / Export transactions, pick CSV (or OFX)
     and the dates you want, then download.
  3. Each file is imported as soon as it arrives. Repeat for each account.
Press Enter here when you are finished (or just close the window).
`);

  await Promise.race([session.closed, finished]);
  await queue;
  await session.close();
  rl.close();
  if (files > 0) recordBankDownload(db, files, added, new Date(), importIds);
  console.log(
    files
      ? `\nDone: ${added} new transactions from ${files} file${files === 1 ? "" : "s"}.`
      : "\nDone. No statements were downloaded.",
  );
  process.exit(0);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
