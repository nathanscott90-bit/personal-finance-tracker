import Papa from "papaparse";
import { type DateFormat, isTextMonthDate } from "@/lib/dates";
import { parseCsv } from "./csv";
import { DEFAULT_DATE_FORMAT, detectDateFormat, detectProfile } from "./detect";
import { normalizeRow } from "./normalizeRow";
import { parseOfx } from "./ofx";
import { headerSignature } from "./profiles";
import type { BankProfile, ParsedRow, RawRow, RowError } from "./types";

export type PreviewResult = {
  kind: "csv" | "ofx";
  headers: string[];
  profile: BankProfile | null;
  detectedProfile: boolean;
  dateFormat: { format: DateFormat; ambiguous: boolean };
  rows: ParsedRow[];
  errors: RowError[];
  sampleRaw: RawRow[];
  headerless: boolean;
  /** Preamble lines skipped above the header (detected or overridden). */
  skipRows: number;
  outflowCheck: { negativeCount: number; positiveCount: number };
};

const looksLikeDate = (s: string) =>
  /^\s*"?\d{1,4}[/\-.]\d{1,2}[/\-.]\d{1,4}"?\s*$/.test(s) ||
  /^\s*"?\d{8}"?\s*$/.test(s) ||
  isTextMonthDate(s.trim().replace(/^"|"$/g, ""));

const MAX_PREAMBLE = 15;

function cells(line: string): string[] {
  return (Papa.parse<string[]>(line, { header: false }).data[0] ?? []).map(
    (c) => String(c ?? "").trim(),
  );
}

/**
 * How many lines of preamble sit above the column header. Some UK banks
 * (Nationwide) put the account name and balances on the first few lines.
 * A line whose cells match a known profile wins; otherwise the first line
 * with three or more filled cells that is followed by a dated row.
 */
export function detectHeaderRow(text: string, profiles: BankProfile[]): number {
  const lines = text.split(/\r?\n/).slice(0, MAX_PREAMBLE + 2);
  const firstFilled = lines.findIndex((l) => l.trim() !== "");
  if (firstFilled < 0) return 0;
  if (detectProfile(cells(lines[firstFilled]), profiles)) return firstFilled;
  for (let i = 0; i <= MAX_PREAMBLE && i < lines.length; i++) {
    if (lines[i].trim() === "") continue;
    if (detectProfile(cells(lines[i]), profiles)) return i;
  }
  const first = cells(lines[firstFilled]).filter(Boolean);
  if (first.length >= 3) return firstFilled;
  for (
    let i = firstFilled + 1;
    i <= MAX_PREAMBLE && i < lines.length - 1;
    i++
  ) {
    const c = cells(lines[i]).filter(Boolean);
    const next = lines.slice(i + 1).find((l) => l.trim() !== "");
    if (c.length >= 3 && next && looksLikeDate(cells(next)[0] ?? "")) return i;
  }
  return 0;
}

export function isOfx(filename: string, text: string): boolean {
  return (
    /\.(ofx|qfx)$/i.test(filename) ||
    /^\s*(OFXHEADER|<\?xml[^>]*>\s*<\?OFX|<OFX>)/i.test(text)
  );
}

/** PDF statements are not parsed in Phase 1; refuse them with a helpful message. */
export function isPdf(filename: string, text: string): boolean {
  return /\.pdf$/i.test(filename) || text.startsWith("%PDF");
}

export const PDF_MESSAGE =
  "PDF statements aren't supported yet. Export the account activity as CSV or QFX from your bank's website and drop that here.";

function outflowCheck(rows: ParsedRow[]) {
  return {
    negativeCount: rows.filter((r) => r.amountCents < 0).length,
    positiveCount: rows.filter((r) => r.amountCents > 0).length,
  };
}

export function buildPreview(
  filename: string,
  text: string,
  profiles: BankProfile[],
  override?: Partial<BankProfile>,
): PreviewResult {
  if (isPdf(filename, text)) throw new Error(PDF_MESSAGE);
  if (isOfx(filename, text)) {
    const { rows } = parseOfx(text);
    return {
      kind: "ofx",
      headers: [],
      profile: null,
      detectedProfile: true,
      dateFormat: { format: "YMD", ambiguous: false },
      rows,
      errors: [],
      sampleRaw: [],
      headerless: false,
      skipRows: 0,
      outflowCheck: outflowCheck(rows),
    };
  }

  const skip = override?.skipRows ?? detectHeaderRow(text, profiles);
  const body = skip > 0 ? text.split(/\r?\n/).slice(skip).join("\n") : text;
  const firstLine = body.split(/\r?\n/).find((l) => l.trim() !== "") ?? "";
  const firstCell = firstLine.split(",")[0] ?? "";
  const headerless = looksLikeDate(firstCell);
  let parsed = parseCsv(body);
  if (headerless) {
    const n = (Papa.parse<string[]>(firstLine, { header: false }).data[0] ?? [])
      .length;
    const cols = Array.from({ length: n }, (_, i) => `col${i + 1}`);
    parsed = parseCsv(`${cols.join(",")}\n${body}`);
  }
  const { headers, rows: raw } = parsed;

  const detected = detectProfile(headers, profiles);
  let profile: BankProfile | null = detected;
  if (override && (override.dateCol || detected)) {
    const base: BankProfile = detected ?? {
      name: override.name ?? filename,
      headerSignature: headerSignature(headers),
      dateCol: "",
      descCol: "",
      amountCol: null,
      debitCol: null,
      creditCol: null,
      balanceCol: null,
      dateFormat: DEFAULT_DATE_FORMAT,
      signConvention: "outflow_negative",
      skipRows: skip,
      builtin: false,
    };
    profile = {
      ...base,
      skipRows: skip,
      ...override,
      headerSignature: headerSignature(headers),
      builtin: false,
    };
  }

  if (!profile?.dateCol) {
    return {
      kind: "csv",
      headers,
      profile: null,
      detectedProfile: false,
      dateFormat: { format: DEFAULT_DATE_FORMAT, ambiguous: true },
      rows: [],
      errors: [],
      sampleRaw: raw.slice(0, 20),
      headerless,
      skipRows: skip,
      outflowCheck: { negativeCount: 0, positiveCount: 0 },
    };
  }

  const dateFormat =
    (profile.builtin || detected?.builtin) && !override?.dateFormat
      ? {
          format: (detected ?? profile).dateFormat,
          ambiguous: false,
        }
      : override?.dateFormat
        ? { format: override.dateFormat, ambiguous: false }
        : detectDateFormat(raw.map((r) => r[profile.dateCol] ?? ""));
  const effective = {
    ...profile,
    dateFormat: dateFormat.format,
    skipRows: skip,
  };

  const rows: ParsedRow[] = [];
  const errors: RowError[] = [];
  raw.forEach((r, i) => {
    const res = normalizeRow(r, effective, i);
    if (res.ok) rows.push(res.row);
    else errors.push(res.error);
  });

  return {
    kind: "csv",
    headers,
    profile: effective,
    detectedProfile: !!detected,
    dateFormat,
    rows,
    errors,
    sampleRaw: raw.slice(0, 20),
    headerless,
    skipRows: skip,
    outflowCheck: outflowCheck(rows),
  };
}
