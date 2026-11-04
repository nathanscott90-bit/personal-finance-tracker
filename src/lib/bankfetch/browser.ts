import { type ChildProcess, spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { type Browser, chromium } from "playwright-core";

/**
 * Starts an ordinary Chrome window and attaches to it, so the person using it
 * logs in exactly as they always do. Nothing here types a username, password
 * or approval code: the script only listens for the files the person
 * downloads. Chrome is launched as a normal program (not by Playwright), so
 * the bank sees a normal browser.
 */

/** Where a browser might be, most preferred first: Chrome, then Edge. */
export function browserCandidates(
  platform: NodeJS.Platform = process.platform,
  env: Record<string, string | undefined> = process.env,
): string[] {
  if (env.FINANCE_BROWSER) return [env.FINANCE_BROWSER];
  if (platform === "win32") {
    const roots = [
      env.ProgramFiles,
      env["ProgramFiles(x86)"],
      env.LOCALAPPDATA,
    ].filter((r): r is string => !!r);
    const under = (...rest: string[]) =>
      roots.map((r) => path.win32.join(r, ...rest));
    return [
      ...under("Google", "Chrome", "Application", "chrome.exe"),
      ...under("Microsoft", "Edge", "Application", "msedge.exe"),
    ];
  }
  if (platform === "darwin")
    return [
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    ];
  return [
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/usr/bin/microsoft-edge",
  ];
}

export function findBrowser(
  exists: (p: string) => boolean = fs.existsSync,
  candidates: string[] = browserCandidates(),
): string | null {
  return candidates.find((c) => exists(c)) ?? null;
}

export type BrowserSession = {
  browser: Browser;
  /** Resolves when the window is closed by the person or by `close()`. */
  closed: Promise<void>;
  close: () => Promise<void>;
};

function probe(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get(
      { host: "127.0.0.1", port, path: "/json/version", timeout: 1000 },
      (res) => {
        res.resume();
        resolve(res.statusCode === 200);
      },
    );
    req.on("error", () => resolve(false));
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
  });
}

export async function openBrowser(opts: {
  exe: string;
  profileDir: string;
  urls: string[];
  /** Extra Chrome flags (the tests pass --headless=new). */
  extraArgs?: string[];
  /** Fixed debugging port; tests only. Normally a random one is chosen. */
  port?: number;
}): Promise<BrowserSession> {
  fs.mkdirSync(opts.profileDir, { recursive: true });
  // A random loopback port, used only while this window is open.
  const port = opts.port ?? 49152 + crypto.randomInt(16000);
  const child: ChildProcess = spawn(
    opts.exe,
    [
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${opts.profileDir}`,
      "--no-first-run",
      "--no-default-browser-check",
      ...(opts.extraArgs ?? []),
      ...opts.urls,
    ],
    { stdio: "ignore" },
  );
  const failed: { error?: Error } = {};
  child.on("error", (e) => {
    failed.error = e;
  });

  const deadline = Date.now() + 30_000;
  while (!(await probe(port))) {
    if (failed.error)
      throw new Error(`Could not start the browser: ${failed.error.message}`);
    if (Date.now() > deadline)
      throw new Error(
        "The browser did not start in time. If a window from the last run is still open, close it and try again.",
      );
    await new Promise((r) => setTimeout(r, 300));
  }
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);

  let finish!: () => void;
  const closed = new Promise<void>((r) => {
    finish = r;
  });
  const exited = new Promise<void>((r) => {
    child.on("exit", () => r());
  });
  browser.on("disconnected", finish);
  child.on("exit", finish);

  const close = async () => {
    try {
      const cdp = await browser.newBrowserCDPSession();
      await cdp.send("Browser.close");
    } catch {
      // Already gone.
    }
    // Give Chrome a moment to quit by itself, then make sure it has.
    await Promise.race([exited, new Promise((r) => setTimeout(r, 3000))]);
    if (child.exitCode === null) child.kill();
    await Promise.race([exited, new Promise((r) => setTimeout(r, 3000))]);
  };
  return { browser, closed, close };
}
