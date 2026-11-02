import { describe, expect, it } from "vitest";
import { openDb } from "@/lib/db/client";
import type { FundingPage } from "@/lib/funding/load";
import { fundingPlan } from "@/lib/funding/plan";
import { billIncreases, decideNotices } from "@/lib/notify/decide";
import { deliver, getNotifyConfig } from "@/lib/notify/send";

function page(today: string, balanceCents: number): FundingPage {
  return {
    accounts: [],
    billsAccountId: 2,
    billsAccountName: "NatWest Bills",
    guessed: false,
    bufferCents: 0,
    payDay: 28,
    paydayInferred: false,
    missing: null,
    balanceStaleDays: null,
    billCount: 2,
    plan: fundingPlan({
      today,
      balanceCents,
      balanceDate: today,
      payDay: 28,
      bills: [
        {
          name: "Mortgage",
          cadence: "monthly",
          nextExpected: "2026-11-01",
          amountCents: -95000,
          variable: false,
        },
        {
          name: "Octopus Energy",
          cadence: "monthly",
          nextExpected: "2026-11-12",
          amountCents: -14200,
          variable: true,
        },
      ],
    }),
  };
}
const base = {
  billChanges: [],
  expiring: [],
  syncError: null,
  lastGoodSyncAt: null,
};

describe("decideNotices", () => {
  it("says nothing mid-month when nothing is wrong", () =>
    expect(
      decideNotices({
        ...base,
        today: "2026-10-10",
        funding: page("2026-10-10", 0),
        settings: { standingOrderCents: 0, reminderDays: 2 },
      }),
    ).toEqual([]));

  it("reminds of the exact transfer two days before payday", () => {
    const n = decideNotices({
      ...base,
      today: "2026-10-26",
      funding: page("2026-10-26", 0),
      settings: { standingOrderCents: 0, reminderDays: 2 },
    });
    expect(n).toHaveLength(1);
    expect(n[0].key).toBe("transfer:2026-10-28");
    expect(n[0].title).toBe("Move £1,092.00 to NatWest Bills");
  });

  it("with a standing order that covers it: silence", () =>
    expect(
      decideNotices({
        ...base,
        today: "2026-10-26",
        funding: page("2026-10-26", 0),
        settings: { standingOrderCents: 120000, reminderDays: 2 },
      }),
    ).toEqual([]));

  it("with a standing order that falls short: only the difference", () => {
    const n = decideNotices({
      ...base,
      today: "2026-10-26",
      funding: page("2026-10-26", 0),
      settings: { standingOrderCents: 100000, reminderDays: 2 },
    });
    expect(n.map((x) => x.title)).toEqual([
      "Add £92.00 to NatWest Bills this month",
    ]);
  });

  it("warns about consent and failing sync", () => {
    const n = decideNotices({
      ...base,
      today: "2026-10-10",
      funding: page("2026-10-10", 500000),
      settings: { standingOrderCents: 0, reminderDays: 2 },
      expiring: [
        { bank: "NatWest", validUntil: "2026-10-20T00:00:00Z", expired: false },
      ],
      syncError: "NatWest Bills: Enable Banking 500",
      lastGoodSyncAt: "2026-10-05T07:00:00Z",
    });
    expect(n.map((x) => x.title)).toEqual([
      "NatWest connection needs renewing",
      "Bank sync is failing",
    ]);
  });
});

describe("billIncreases", () => {
  it("flags a recent rise over 10%", () =>
    expect(
      billIncreases(
        [
          {
            merchant: "Octopus Energy",
            recentAmounts: [-14200, -15900],
            lastSeen: "2026-10-12",
            isIncome: false,
          },
          {
            merchant: "Virgin Media",
            recentAmounts: [-5500, -5600],
            lastSeen: "2026-10-12",
            isIncome: false,
          },
        ],
        "2026-10-14",
      ).map((c) => c.name),
    ).toEqual(["Octopus Energy"]));
});

describe("deliver", () => {
  it("never sends the same notice twice", async () => {
    const db = openDb(":memory:");
    const got: string[] = [];
    const send = async (_c: unknown, n: { key: string }) => {
      got.push(n.key);
    };
    const n = {
      key: "transfer:2026-10-28",
      title: "t",
      message: "m",
      priority: "default" as const,
    };
    await deliver(db, [n], send);
    await deliver(db, [n], send);
    expect(got).toEqual(["transfer:2026-10-28"]);
  });
  it("creates a private random topic once", () => {
    const db = openDb(":memory:");
    const a = getNotifyConfig(db).topic;
    expect(a).toMatch(/^finance-[0-9a-f]{24}$/);
    expect(getNotifyConfig(db).topic).toBe(a);
  });
});
