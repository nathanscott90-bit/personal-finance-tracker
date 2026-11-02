/**
 * Decrypts an off-PC backup (`.finbak`) made by Settings → Off-PC backup.
 *
 *   npm run restore -- <file.finbak>            writes data/restored-<stamp>.db
 *   npm run restore -- <file.finbak> --replace  backs up the current database,
 *                                               then puts the restored one in
 *                                               its place (stop the app first)
 *
 * The passphrase is read from FINANCE_BACKUP_PASSPHRASE, or asked for.
 */
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import readline from "node:readline/promises";
import { backupDb } from "../src/lib/db/backup";
import { dbPath } from "../src/lib/db/client";
import { decryptBuffer } from "../src/lib/db/offsite";

const appRunning = () =>
  new Promise<boolean>((res) =>
    http
      .get("http://127.0.0.1:3000", () => res(true))
      .on("error", () => res(false)),
  );

async function main() {
  const args = process.argv.slice(2);
  const file = args.find((a) => !a.startsWith("--"));
  const replace = args.includes("--replace");
  if (!file) {
    console.error("Usage: npm run restore -- <file.finbak> [--replace]");
    process.exit(2);
  }
  let pass = process.env.FINANCE_BACKUP_PASSPHRASE;
  if (!pass) {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    pass = await rl.question("Backup passphrase: ");
    rl.close();
  }
  const plain = decryptBuffer(fs.readFileSync(file), pass);
  if (!plain.subarray(0, 15).equals(Buffer.from("SQLite format 3")))
    throw new Error("Decrypted, but the contents are not a database.");

  const live = dbPath();
  if (!replace) {
    const stamp = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15);
    const out = path.join(path.dirname(live), `restored-${stamp}.db`);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, plain);
    console.log(`Restored to ${out}`);
    console.log(
      "To use it: stop Finance, then run this again with --replace, or rename it to finance.db yourself.",
    );
    return;
  }
  if (await appRunning())
    throw new Error(
      "Finance is running. Stop it first (end the 'Finance server' task in Task Scheduler, or close the launcher).",
    );
  if (fs.existsSync(live))
    console.log(`Current database saved to ${backupDb(live)}`);
  for (const side of [`${live}-wal`, `${live}-shm`])
    fs.rmSync(side, { force: true });
  fs.writeFileSync(live, plain);
  console.log(`Replaced ${live}. Start Finance again.`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
