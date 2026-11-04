/**
 * The unattended daily job (Windows Task Scheduler runs it; see
 * setup-windows.ps1): recompute, send any alerts, back up off the PC.
 * `npm run daily`
 */
import fs from "node:fs";
import path from "node:path";
import { dbPath, openDb } from "../src/lib/db/client";
import { offsiteDue, runOffsiteBackup } from "../src/lib/db/offsite";
import { runDaily } from "../src/lib/notify/daily";

async function main() {
  const db = openDb(dbPath());
  const started = new Date();
  const r = await runDaily(db);
  // Off-PC backup, at most once every 20 hours.
  let backupNote = "";
  if (offsiteDue(db, started)) {
    const b = runOffsiteBackup(db, dbPath(), started);
    backupNote = b.ok ? "backup ok" : `backup FAILED ${b.error}`;
  }
  const line = [
    started.toISOString(),
    `alerts ${r.sent.map((n) => n.key).join(",") || "none"}`,
    r.failed.length ? `send failures ${r.failed.join("; ")}` : "",
    backupNote,
  ]
    .filter(Boolean)
    .join(" | ");
  console.log(line);
  const log = path.join(path.dirname(dbPath()), "daily.log");
  fs.appendFileSync(log, `${line}\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
