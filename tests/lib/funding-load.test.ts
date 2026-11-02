import { describe, expect, it } from "vitest";
import { PAYDAY_KEY } from "@/lib/budget/payday";
import {
  ensureDefaultCategories,
  findCategoryId,
} from "@/lib/categories/ensure";
import { openDb } from "@/lib/db/client";
import { accounts, balanceSnapshots, transactions } from "@/lib/db/schema";
import { loadFunding, saveFundingSettings } from "@/lib/funding/load";
import { refreshRecurring } from "@/lib/recurring/refresh";
import { setSetting } from "@/lib/settings";

/**
 * Nationwide (salary) → NatWest Bills (direct debits), four months of history.
 */
function seed() {
  const db = openDb(":memory:");
  ensureDefaultCategories(db);
  const [nationwide, natwest] = db
    .insert(accounts)
    .values([
      { name: "Nationwide FlexPlus", type: "checking" },
      { name: "NatWest", type: "checking" },
    ])
    .returning()
    .all();
  const pay = findCategoryId(db, "Paycheck") as number;
  const rows: {
    accountId: number;
    date: string;
    amountCents: number;
    merchant: string;
    categoryId?: number;
  }[] = [];
  for (const m of ["06", "07", "08", "09"]) {
    rows.push(
      {
        accountId: nationwide.id,
        date: `2026-${m}-26`,
        amountCents: 385000,
        merchant: "Specialist Lines",
        categoryId: pay,
      },
      {
        accountId: natwest.id,
        date: `2026-${m}-01`,
        amountCents: -95000,
        merchant: "Nationwide Mortgage",
      },
      {
        accountId: natwest.id,
        date: `2026-${m}-03`,
        amountCents: -19850,
        merchant: "Canterbury City Council",
      },
      {
        accountId: natwest.id,
        date: `2026-${m}-12`,
        amountCents: m === "09" ? -15600 : -14200,
        merchant: "Octopus Energy",
      },
      // a monthly card-spend pattern on Nationwide, not a NatWest bill
      {
        accountId: nationwide.id,
        date: `2026-${m}-15`,
        amountCents: -1099,
        merchant: "Netflix",
      },
    );
  }
  db.insert(transactions)
    .values(
      rows.map((r, i) => ({
        rawDescription: r.merchant,
        dedupeHash: `r${i}`,
        ...r,
      })),
    )
    .run();
  db.insert(balanceSnapshots)
    .values({ accountId: natwest.id, date: "2026-10-20", balanceCents: 4000 })
    .run();
  return { db, nationwide, natwest };
}

describe("loadFunding", () => {
  it("finds the bills account, its bills, and the payday transfer", () => {
    const { db, natwest } = seed();
    const today = "2026-10-25";
    refreshRecurring(db, { today });
    setSetting(db, PAYDAY_KEY, { schedule: "monthly", day: 28 });
    const f = loadFunding(db, today);
    expect(f.missing).toBeNull();
    // guessed: pays the bills, receives no salary
    expect(f.billsAccountId).toBe(natwest.id);
    expect(f.guessed).toBe(true);
    expect(f.billCount).toBe(3);
    const plan = f.plan;
    if (!plan) throw new Error("no plan");
    expect(plan.payday).toBe("2026-10-28");
    // October bills were never imported (data ends in September), so they are
    // treated as still to come before payday.
    expect(plan.beforePayday.events.map((e) => e.name).sort()).toEqual([
      "Canterbury City Council",
      "Nationwide Mortgage",
      "Octopus Energy",
    ]);
    // November: 950 + 198.50 + 156 (latest Octopus amount, flagged variable)
    expect(plan.payPeriod.outCents).toBe(95000 + 19850 + 15600);
    expect(plan.includesEstimates).toBe(true);
    // Netflix is paid from Nationwide, so it is not in the NatWest plan.
    expect(
      plan.payPeriod.events.some((e) => e.name.toLowerCase() === "netflix"),
    ).toBe(false);
  });

  it("uses the chosen account and buffer", () => {
    const { db, natwest } = seed();
    const today = "2026-10-25";
    refreshRecurring(db, { today });
    setSetting(db, PAYDAY_KEY, { schedule: "monthly", day: 28 });
    saveFundingSettings(db, { billsAccountId: natwest.id, bufferCents: 5000 });
    const f = loadFunding(db, today);
    expect(f.guessed).toBe(false);
    expect(f.bufferCents).toBe(5000);
  });

  it("explains what's missing", () => {
    const { db } = seed();
    refreshRecurring(db, { today: "2026-10-25" });
    setSetting(db, PAYDAY_KEY, { schedule: "weekly", anchor: "2026-10-02" });
    expect(loadFunding(db, "2026-10-25").missing).toBe("monthly-payday");
  });

  it("flags a stale balance", () => {
    const { db } = seed();
    refreshRecurring(db, { today: "2026-11-05" });
    setSetting(db, PAYDAY_KEY, { schedule: "monthly", day: 28 });
    expect(loadFunding(db, "2026-11-05").balanceStaleDays).toBe(16);
  });
});

describe("phoneSummary", () => {
  it("lists what's coming and the balances, without the transfer duplicated as an action", async () => {
    const { phoneSummary } = await import("@/lib/phone/summary");
    const { db } = seed();
    const today = "2026-10-25";
    refreshRecurring(db, { today });
    setSetting(db, PAYDAY_KEY, { schedule: "monthly", day: 28 });
    const s = phoneSummary(db, today);
    expect(s.funding.plan).not.toBeNull();
    expect(s.actions.some((a) => a.key.startsWith("transfer:"))).toBe(false);
    expect(s.upcoming.map((u) => u.name)).toContain("Nationwide Mortgage");
    expect(s.balances.map((b) => b.name)).toEqual(["NatWest"]);
  });
  it("copes with an empty database", async () => {
    const { phoneSummary } = await import("@/lib/phone/summary");
    const db = openDb(":memory:");
    ensureDefaultCategories(db);
    expect(() => phoneSummary(db, "2026-10-25")).not.toThrow();
  });
});
