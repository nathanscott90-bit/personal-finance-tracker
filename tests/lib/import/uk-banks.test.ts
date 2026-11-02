import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { parseDateWithFormat } from "@/lib/dates";
import { decodeStatement } from "@/lib/import/decode";
import { detectDateFormat } from "@/lib/import/detect";
import { buildPreview, detectHeaderRow } from "@/lib/import/preview";
import { BUILTIN_PROFILES } from "@/lib/import/profiles";

const read = (f: string) =>
  decodeStatement(fs.readFileSync(`tests/fixtures/${f}`));

describe("UK date formats", () => {
  it.each([
    ["28 Sep 2026", "2026-09-28"],
    ["28-Sep-26", "2026-09-28"],
    ["28 Sept 2026", "2026-09-28"],
    ["1 September 2026", "2026-09-01"],
    ["28/Sep/2026", "2026-09-28"],
  ])("reads %s day-first whatever the profile says", (raw, iso) => {
    expect(parseDateWithFormat(raw, "MDY")).toBe(iso);
    expect(parseDateWithFormat(raw, "DMY")).toBe(iso);
  });
  it("rejects impossible text dates", () =>
    expect(parseDateWithFormat("31 Feb 2026", "DMY")).toBeNull());
  it("month-name samples settle the format as day-first", () =>
    expect(detectDateFormat(["03 Oct 2026"])).toEqual({
      format: "DMY",
      ambiguous: false,
    }));
  it("undecidable numeric dates fall back to day-first in en-GB", () =>
    expect(detectDateFormat(["03/04/2026"])).toEqual({
      format: "DMY",
      ambiguous: true,
    }));
});

describe("decodeStatement", () => {
  it("reads Windows-1252 £ correctly", () => {
    const bytes = Uint8Array.from([0xa3, 0x31, 0x30]); // "£10" in cp1252
    expect(decodeStatement(bytes)).toBe("£10");
  });
  it("leaves UTF-8 alone", () => {
    expect(decodeStatement(new TextEncoder().encode("£10 café"))).toBe(
      "£10 café",
    );
  });
});

describe("NatWest", () => {
  const p = buildPreview("natwest.csv", read("natwest.csv"), BUILTIN_PROFILES);
  it("is recognised", () => {
    expect(p.detectedProfile).toBe(true);
    expect(p.profile?.name).toBe("NatWest");
  });
  it("parses both date styles, signs and balances", () => {
    expect(p.errors).toEqual([]);
    expect(p.rows.map((r) => r.date)).toEqual([
      "2026-09-28",
      "2026-10-01",
      "2026-10-01",
    ]);
    expect(p.rows.map((r) => r.amountCents)).toEqual([165000, -14200, -19850]);
    expect(p.rows[0].balanceCents).toBe(172045);
  });
  it("drops the leading apostrophe NatWest adds to text", () => {
    expect(p.rows[1].rawDescription).toBe("OCTOPUS ENERGY");
  });
});

describe("Nationwide current account", () => {
  const text = read("nationwide-current.csv");
  it("skips the account preamble above the header", () => {
    expect(detectHeaderRow(text, BUILTIN_PROFILES)).toBe(4);
  });
  const p = buildPreview("statement.csv", text, BUILTIN_PROFILES);
  it("is recognised", () =>
    expect(p.profile?.name).toBe("Nationwide (current account)"));
  it("reads paid out / paid in with £ amounts", () => {
    expect(p.errors).toEqual([]);
    expect(p.rows.map((r) => r.amountCents)).toEqual([-5420, 385000, -165000]);
    expect(p.rows.map((r) => r.date)).toEqual([
      "2026-09-26",
      "2026-09-28",
      "2026-09-28",
    ]);
    expect(p.rows[2].balanceCents).toBe(271230);
  });
});

describe("Nationwide credit card", () => {
  const p = buildPreview(
    "card.csv",
    read("nationwide-credit.csv"),
    BUILTIN_PROFILES,
  );
  it("is recognised and signed from the card's point of view", () => {
    expect(p.profile?.name).toBe("Nationwide (credit card)");
    expect(p.rows.map((r) => r.amountCents)).toEqual([-2499, 28741]);
  });
});

describe("unknown bank with a preamble", () => {
  it("finds the header line and seeds the wizard with it", () => {
    const text =
      "Statement for Mr N\nSort code,600000\n\nWhen,What,Out,In\n03/10/2026,Coffee,3.20,\n";
    const p = buildPreview("x.csv", text, BUILTIN_PROFILES);
    expect(p.skipRows).toBe(3);
    expect(p.headers).toEqual(["When", "What", "Out", "In"]);
  });
});
