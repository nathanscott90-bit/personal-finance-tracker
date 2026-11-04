import { describe, expect, it } from "vitest";
import { canSaveProfile } from "@/lib/import/profileGuard";
import { TEST_PROFILES } from "../../profiles";

describe("canSaveProfile", () => {
  it("refuses builtins and anything sharing a builtin header signature", () => {
    const chase = TEST_PROFILES[0];
    expect(canSaveProfile(chase, TEST_PROFILES)).toBe(false);
    expect(
      canSaveProfile({ ...chase, builtin: false, name: "Mine" }, TEST_PROFILES),
    ).toBe(false);
  });
  it("allows a custom signature", () => {
    const chase = TEST_PROFILES[0];
    expect(
      canSaveProfile(
        {
          ...chase,
          builtin: false,
          name: "My CU",
          headerSignature: "in|out|what|when",
        },
        TEST_PROFILES,
      ),
    ).toBe(true);
  });
});
