import Papa from "papaparse";

/** Who a downloaded statement is for, as far as the file itself says. */
export type StatementId = {
  /** Stable across downloads, so the app remembers which account it maps to. */
  key: string;
  /** Safe to show: account numbers are masked to their last four digits. */
  label: string;
  institution: string;
};

const cells = (line: string): string[] =>
  (Papa.parse<string[]>(line, { header: false }).data[0] ?? []).map((c) =>
    String(c ?? "").trim(),
  );

/** NatWest writes values as 'text and may quote them; strip both. */
const clean = (v: string | undefined): string =>
  (v ?? "").replace(/^['"\s]+|['"\s]+$/g, "");

const mask = (n: string): string =>
  `••${n.replace(/\D/g, "").slice(-4) || n.slice(-4)}`;

/**
 * Works out which account a CSV or OFX file belongs to.
 * - Nationwide puts "Account Name:" (already masked) on the first line.
 * - NatWest has an "Account Number" column on every row.
 * - OFX carries an <ACCTID>.
 * Returns null when the file does not say (the app then asks), and an
 * `error` when one file mixes accounts, which cannot be mapped to one.
 */
export function identifyStatement(
  text: string,
): StatementId | { error: string } | null {
  const lines = text.split(/\r?\n/);
  const first = lines.find((l) => l.trim() !== "") ?? "";
  const c0 = cells(first);

  // Nationwide: "Account Name:","FlexPlus ****12345" on a statement
  // download, "Account Number:","****12345" on midata. Keyed by the visible
  // digits so both files of one account map to the same app account.
  if (/^account (name|number):?$/i.test(c0[0] ?? "") && c0[1]) {
    const digits = /\*+(\d{3,})\s*$/.exec(c0[1])?.[1];
    return {
      key: `nationwide:${digits ?? c0[1].toLowerCase()}`,
      label: /^account number/i.test(c0[0]) ? `Account ${c0[1]}` : c0[1],
      institution: "Nationwide",
    };
  }

  const headerAt = lines.findIndex((l) => /account number/i.test(l));
  if (headerAt >= 0) {
    const header = cells(lines[headerAt]).map((h) => h.toLowerCase());
    const iNum = header.indexOf("account number");
    const iName = header.indexOf("account name");
    if (iNum >= 0) {
      const numbers = new Set<string>();
      let name = "";
      for (const line of lines.slice(headerAt + 1)) {
        if (!line.trim()) continue;
        const row = cells(line);
        const n = clean(row[iNum]);
        if (n) numbers.add(n);
        if (!name && iName >= 0) name = clean(row[iName]);
      }
      if (numbers.size > 1)
        return {
          error:
            "This file mixes several accounts. Download one account at a time.",
        };
      const [num] = [...numbers];
      if (num)
        return {
          key: `natwest:${num}`,
          label: `${name || "Account"} ${mask(num)}`,
          institution: "NatWest",
        };
    }
  }

  const ofx = /<ACCTID>\s*([^<\r\n]+)/i.exec(text);
  if (ofx) {
    const id = ofx[1].trim();
    return { key: `ofx:${id}`, label: `Account ${mask(id)}`, institution: "" };
  }
  return null;
}
