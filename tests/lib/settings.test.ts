import { describe, expect, it } from "vitest";
import { openDb } from "@/lib/db/client";
import { deleteSetting, getSetting, setSetting } from "@/lib/settings";

describe("settings", () => {
  it("round-trips JSON values and falls back when missing", () => {
    const db = openDb(":memory:");
    expect(getSetting(db, "payday", { kind: "biweekly" })).toEqual({
      kind: "biweekly",
    });
    setSetting(db, "payday", { kind: "monthly", day: 1 });
    expect(getSetting(db, "payday", null)).toEqual({
      kind: "monthly",
      day: 1,
    });
    setSetting(db, "payday", true);
    expect(getSetting(db, "payday", false)).toBe(true);
  });
  it("deletes a key so the fallback comes back", () => {
    const db = openDb(":memory:");
    setSetting(db, "some_key", "abc");
    expect(getSetting<string | null>(db, "some_key", null)).toBe("abc");
    deleteSetting(db, "some_key");
    expect(getSetting<string | null>(db, "some_key", null)).toBeNull();
    deleteSetting(db, "some_key"); // deleting a missing key is a no-op
    expect(getSetting<string | null>(db, "some_key", null)).toBeNull();
  });
});
