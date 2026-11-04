import { describe, expect, it } from "vitest";
import { relativeSince } from "@/lib/relative";

const now = new Date("2026-09-07T12:00:00.000Z");

describe("relativeSince", () => {
  it("words the gap", () => {
    expect(relativeSince("2026-09-07T11:59:30.000Z", now)).toBe("just now");
    expect(relativeSince("2026-09-07T11:59:00.000Z", now)).toBe("1 minute ago");
    expect(relativeSince("2026-09-07T11:48:00.000Z", now)).toBe(
      "12 minutes ago",
    );
    expect(relativeSince("2026-09-07T10:00:00.000Z", now)).toBe("2 hours ago");
    expect(relativeSince("2026-09-04T12:00:00.000Z", now)).toBe("3 days ago");
  });
});
