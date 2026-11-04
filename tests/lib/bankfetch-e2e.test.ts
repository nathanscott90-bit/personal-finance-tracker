import fs from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { openBrowser } from "@/lib/bankfetch/browser";
import { type CaughtFile, watchDownloads } from "@/lib/bankfetch/catcher";
import { importDownloadedFile } from "@/lib/bankfetch/importer";
import { openDb } from "@/lib/db/client";
import { accounts, transactions } from "@/lib/db/schema";
import { BUILTIN_PROFILES } from "@/lib/import/profiles";

/**
 * Runs a real Chrome against a pretend bank (login form, accounts page,
 * "Download transactions" link). Opt-in, because it needs a browser:
 *
 *   FINANCE_E2E_BROWSER=/path/to/chrome npx vitest run tests/lib/bankfetch-e2e.test.ts
 *
 * On a headless Linux box also set FINANCE_E2E_ARGS="--headless=new --no-sandbox".
 */
const exe = process.env.FINANCE_E2E_BROWSER;
const extraArgs = (process.env.FINANCE_E2E_ARGS ?? "")
  .split(" ")
  .filter(Boolean);
const csv = fs.readFileSync(
  path.join(__dirname, "..", "fixtures", "natwest.csv"),
);

function mockBank(): Promise<http.Server> {
  const server = http.createServer((req, res) => {
    const loggedIn = /session=ok/.test(req.headers.cookie ?? "");
    if (req.url === "/" && req.method === "GET") {
      res.setHeader("content-type", "text/html");
      res.end(
        `<form method="post" action="/login"><input name="user" aria-label="Customer number"><input name="pass" type="password" aria-label="Password"><button>Log in</button></form>`,
      );
    } else if (req.url === "/login" && req.method === "POST") {
      req.resume();
      res.writeHead(302, {
        "set-cookie": "session=ok; Path=/",
        location: "/accounts",
      });
      res.end();
    } else if (req.url === "/accounts" && loggedIn) {
      res.setHeader("content-type", "text/html");
      res.end(
        `<h1>Your accounts</h1><a id="csv" href="/download.csv">Download transactions (CSV)</a> <a id="pdf" href="/statement.pdf">Statement (PDF)</a>`,
      );
    } else if (req.url === "/download.csv" && loggedIn) {
      res.writeHead(200, {
        "content-type": "text/csv",
        "content-disposition": 'attachment; filename="Transactions.csv"',
      });
      res.end(csv);
    } else if (req.url === "/statement.pdf" && loggedIn) {
      res.writeHead(200, {
        "content-type": "application/pdf",
        "content-disposition": 'attachment; filename="Statement.pdf"',
      });
      res.end("%PDF-1.4 fake");
    } else {
      res.writeHead(403);
      res.end("no");
    }
  });
  return new Promise((r) => server.listen(0, "127.0.0.1", () => r(server)));
}

describe.skipIf(!exe)("bank download with a real browser", () => {
  it("catches a download after a manual login and imports it", async () => {
    const server = await mockBank();
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/`;
    const work = fs.mkdtempSync(path.join(os.tmpdir(), "pft-e2e-"));
    const inbox = path.join(work, "inbox");
    const db = openDb(":memory:");
    const caught: CaughtFile[] = [];
    const imports: Promise<unknown>[] = [];
    const session = await openBrowser({
      exe: exe as string,
      profileDir: path.join(work, "profile"),
      urls: [url],
      extraArgs,
    });
    try {
      const context = session.browser.contexts()[0];
      watchDownloads(context, inbox, (f) => {
        caught.push(f);
        if (f.importable)
          imports.push(
            importDownloadedFile(
              db,
              f.file,
              f.name,
              { backup: () => "none", builtins: BUILTIN_PROFILES },
              async (q) => ({
                create: { name: `${q.institution} ${q.label}` },
              }),
            ),
          );
      });
      // The "person": log in, then click the download links.
      const page = context.pages()[0];
      await page.waitForURL(url);
      await page.getByLabel("Customer number").fill("12345678");
      await page.getByLabel("Password").fill("not-a-real-password");
      await page.getByRole("button", { name: "Log in" }).click();
      await page.waitForURL(/accounts/);
      console.log(
        "navigator.webdriver:",
        await page.evaluate(() => navigator.webdriver),
      );
      await page.click("#csv");
      await page.click("#pdf");
      await expect.poll(() => caught.length, { timeout: 15_000 }).toBe(2);
      await Promise.all(imports);

      const csvFile = caught.find((c) => c.name === "Transactions.csv");
      const pdfFile = caught.find((c) => c.name === "Statement.pdf");
      expect(csvFile?.importable).toBe(true);
      expect(pdfFile?.importable).toBe(false);
      expect(fs.existsSync(csvFile?.file ?? "")).toBe(true);
      expect(pdfFile?.file).toContain(`${path.sep}other${path.sep}`);
      expect(fs.readFileSync(pdfFile?.file ?? "", "utf8")).toBe(
        "%PDF-1.4 fake",
      );
      expect(db.select().from(accounts).all()).toHaveLength(1);
      expect(db.select().from(transactions).all()).toHaveLength(3);
    } finally {
      await session.close();
      server.close();
      fs.rmSync(work, {
        recursive: true,
        force: true,
        maxRetries: 10,
        retryDelay: 200,
      });
    }
  }, 60_000);
});
