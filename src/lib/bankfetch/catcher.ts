import fs from "node:fs";
import path from "node:path";
import type { BrowserContext, Page } from "playwright-core";

export const STATEMENT_EXT = /\.(csv|ofx|qfx)$/i;

export type CaughtFile = {
  /** Where it was saved. */
  file: string;
  /** What the bank called it. */
  name: string;
  /** True for CSV/OFX/QFX; anything else (a PDF statement) is just kept. */
  importable: boolean;
};

const safe = (n: string) =>
  n.replace(/[^\w.\- ]+/g, "_").slice(0, 80) || "file";
const stamp = () =>
  new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "");

/**
 * Saves every file the person downloads in this browser into `inboxDir`
 * (statements next to each other, anything else in `other/`) and reports it.
 * Nothing the person downloads is lost, and nothing is clicked for them.
 */
export function watchDownloads(
  context: BrowserContext,
  inboxDir: string,
  onFile: (f: CaughtFile) => void | Promise<void>,
  onError: (e: unknown) => void = () => {},
): void {
  fs.mkdirSync(path.join(inboxDir, "other"), { recursive: true });
  const wire = (page: Page) => {
    page.on("download", async (d) => {
      try {
        const name = d.suggestedFilename();
        const importable = STATEMENT_EXT.test(name);
        const dest = path.join(
          inboxDir,
          importable ? "" : "other",
          `${stamp()}-${safe(name)}`,
        );
        await d.saveAs(dest);
        await onFile({ file: dest, name, importable });
      } catch (e) {
        onError(e);
      }
    });
  };
  for (const p of context.pages()) wire(p);
  context.on("page", wire);
}
