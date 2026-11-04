import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { detectProfile } from "@/lib/import/detect";
import { BUILTIN_PROFILES, headerSignature } from "@/lib/import/profiles";
import { TEST_PROFILES, US_PROFILES } from "../../profiles";

const headersOf = (file: string) =>
  fs
    .readFileSync(path.join(__dirname, "..", "..", "fixtures", file), "utf8")
    .split(/\r?\n/)
    .find((l) => l.trim() !== "")
    ?.split(",")
    .map((h) => h.replace(/"/g, "")) ?? [];

describe("headerSignature", () => {
  it("is order- and case-insensitive", () => {
    expect(headerSignature(["Date", " Amount"])).toBe(
      headerSignature(["amount", "date"]),
    );
  });
  it("builtin signatures are unique", () => {
    const sigs = TEST_PROFILES.map((p) => p.headerSignature);
    expect(new Set(sigs).size).toBe(sigs.length);
  });
});

describe("built-in formats", () => {
  it("are UK banks only", () => {
    expect(BUILTIN_PROFILES.map((p) => p.name)).toEqual([
      "NatWest",
      "Nationwide (current account)",
      "Nationwide (current account, older export)",
      "Nationwide (credit card)",
      "Nationwide (midata)",
    ]);
  });
  it("leave a US bank's file to the mapping wizard", () => {
    expect(US_PROFILES.length).toBeGreaterThan(0);
    for (const f of ["chase.csv", "bofa.csv", "amex.csv"])
      expect(detectProfile(headersOf(f), BUILTIN_PROFILES)).toBeNull();
  });
});
