/**
 * The unattended daily job (Windows Task Scheduler runs it; see
 * setup-windows.ps1): sync the banks, recompute, send any alerts.
 * `npm run daily`
 */
import fs from "node:fs";
import path from "node:path";
import { dbPath, openDb } from "../src/lib/db/client";
import { runDaily } from "../src/lib/notify/daily";

async function main() {
  const db = openDb(dbPath());
  const started = new Date();
  const r = await runDaily(db, { fetchFn: fetch });
  const line = [
    started.toISOString(),
    r.sync
      ? `sync ${r.sync.ok ? "ok" : "FAILED"} +${r.sync.results.reduce((n, x) => n + x.added, 0)}`
      : "no bank connected",
    `alerts ${r.sent.map((n) => n.key).join(",") || "none"}`,
    r.failed.length ? `send failures ${r.failed.join("; ")}` : "",
    r.sync?.error ? `error ${r.sync.error}` : "",
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
