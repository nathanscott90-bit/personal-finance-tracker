import { describe, expect, it } from "vitest";
import { PAYDAY_KEY } from "@/lib/budget/payday";
import {
  ensureDefaultCategories,
  findCategoryId,
} from "@/lib/categories/ensure";
import { openDb } from "@/lib/db/client";
import { accounts, balanceSnapshots, transactions } from "@/lib/db/schema";
import { saveFundingSettings } from "@/lib/funding/load";
import { loadLines } from "@/lib/insights/lines";
import { monthlyCheck, monthlyNotices } from "@/lib/monthly/check";
import {
  lastCompletePeriod,
  periodOf,
  previousPeriod,
} from "@/lib/monthly/period";
import { refreshRecurring } from "@/lib/recurring/refresh";
import { setRenewalDate } from "@/lib/savings/savings";
import { setSetting } from "@/lib/settings";
import { getWorkSettings, setWorkSettings } from "@/lib/work/work";

describe("pay periods (28th, working-day adjusted)", () => {
  it("runs from payday to the day before the next", () => {
    expect(periodOf("2026-10-25", 28)).toEqual({
      start: "2026-09-28",
      end: "2026-10-27",
    });
    expect(periodOf("2026-10-28", 28)).toEqual({
      start: "2026-10-28",
      end: "2026-11-26",
    });
  });
  it("moves with weekends and bank holidays", () => {
    // 28 Nov 2026 is a Saturday → Fri 27; 28 Dec is a bank holiday → Thu 24.
    expect(periodOf("2026-12-01", 28)).toEqual({
      start: "2026-11-27",
      end: "2026-12-23",
    });
    expect(previousPeriod(periodOf("2026-12-01", 28), 28).start).toBe(
      "2026-10-28",
    );
  });
  it("last complete period", () =>
    expect(lastCompletePeriod("2026-10-29", 28)).toEqual({
      start: "2026-09-28",
      end: "2026-10-27",
    }));
});

type Row = {
  accountId: number;
  date: string;
  amountCents: number;
  merchant: string;
  categoryId?: number;
  isTransfer?: boolean;
};

function household() {
  const db = openDb(":memory:");
  ensureDefaultCategories(db);
  const [nw, nat, card, saver] = db
    .insert(accounts)
    .values([
      {
        name: "Nationwide FlexPlus",
        type: "checking",
        institution: "Nationwide",
      },
      { name: "NatWest Bills", type: "checking", institution: "NatWest" },
      {
        name: "Nationwide Credit Card",
        type: "credit",
        institution: "Nationwide",
      },
      {
        name: "Nationwide Member Saver",
        type: "savings",
        institution: "Nationwide",
      },
    ])
    .returning()
    .all();
  const pay = findCategoryId(db, "Paycheck") as number;
  const takeaway = findCategoryId(db, "Coffee & takeout") as number;
  const subs = findCategoryId(db, "Subscriptions") as number;
  const rows: Row[] = [];
  const months = ["06", "07", "08", "09", "10"];
  for (const m of months) {
    rows.push(
      {
        accountId: nw.id,
        date: `2026-${m}-26`,
        amountCents: 385000,
        merchant: "Specialist Lines",
        categoryId: pay,
      },
      {
        accountId: nat.id,
        date: `2026-${m}-01`,
        amountCents: -95000,
        merchant: "Halifax Mortgage",
      },
      {
        accountId: nat.id,
        date: `2026-${m}-03`,
        amountCents: -19850,
        merchant: "Canterbury City Council",
      },
      // Octopus rises in October
      {
        accountId: nat.id,
        date: `2026-${m}-12`,
        amountCents: m === "10" ? -15600 : -14200,
        merchant: "Octopus Energy",
      },
      // Virgin moves by 50p: minor
      {
        accountId: nat.id,
        date: `2026-${m}-18`,
        amountCents: m === "10" ? -5550 : -5500,
        merchant: "Virgin Media",
      },
      {
        accountId: nw.id,
        date: `2026-${m}-15`,
        amountCents: m === "10" ? -1299 : -1099,
        merchant: "Netflix",
        categoryId: subs,
      },
      {
        accountId: nw.id,
        date: `2026-${m}-10`,
        amountCents: m === "10" ? -24000 : -6000,
        merchant: "Deliveroo",
        categoryId: takeaway,
      },
    );
  }
  // October: a new payment from NatWest, and no water bill this time
  rows.push({
    accountId: nat.id,
    date: "2026-10-20",
    amountCents: -4500,
    merchant: "Kent Window Cleaning",
  });
  for (const m of ["06", "07", "08", "09"])
    rows.push({
      accountId: nat.id,
      date: `2026-${m}-20`,
      amountCents: -3910,
      merchant: "Southern Water",
    });
  // Work card: travel, then one repayment that covers the first trip
  rows.push(
    {
      accountId: card.id,
      date: "2026-08-04",
      amountCents: -12000,
      merchant: "Trainline",
    },
    {
      accountId: card.id,
      date: "2026-08-05",
      amountCents: -8900,
      merchant: "Premier Inn",
    },
    {
      accountId: card.id,
      date: "2026-09-10",
      amountCents: -4550,
      merchant: "Shell",
    },
    {
      accountId: nw.id,
      date: "2026-09-05",
      amountCents: 12000,
      merchant: "Specialist Lines",
    },
  );
  // Savings transfer in October
  rows.push({
    accountId: saver.id,
    date: "2026-10-01",
    amountCents: 20000,
    merchant: "Transfer",
    isTransfer: true,
  });
  db.insert(transactions)
    .values(
      rows.map((r, i) => ({
        rawDescription: r.merchant,
        dedupeHash: `h${i}`,
        ...r,
      })),
    )
    .run();
  db.insert(balanceSnapshots)
    .values([
      { accountId: nw.id, date: "2026-10-27", balanceCents: 120000 },
      { accountId: card.id, date: "2026-10-27", balanceCents: 25450 },
      { accountId: nat.id, date: "2026-10-27", balanceCents: 5000 },
    ])
    .run();
  setSetting(db, PAYDAY_KEY, { schedule: "monthly", day: 28 });
  saveFundingSettings(db, { billsAccountId: nat.id, bufferCents: 0 });
  return { db, nw, nat, card, saver };
}

describe("monthlyCheck", () => {
  const today = "2026-10-29";

  it("reconciles last period's bills against the month before", () => {
    const { db } = household();
    refreshRecurring(db, { today });
    const c = monthlyCheck(db, today);
    expect(c.ready).toBe(true);
    expect(c.last).toEqual({ start: "2026-09-28", end: "2026-10-27" });
    const b = c.bills;
    if (!b) throw new Error("no bills check");
    const by = Object.fromEntries(b.rows.map((r) => [r.name, r]));
    expect(by["Octopus Energy"]).toMatchObject({
      budgetCents: 14200,
      actualCents: 15600,
      diffCents: 1400,
      status: "higher",
    });
    expect(by["Virgin Media"]).toMatchObject({
      diffCents: 50,
      status: "minor",
    });
    expect(by["Halifax Mortgage"].status).toBe("match");
    expect(by["Southern Water"]).toMatchObject({
      status: "missing",
      actualCents: null,
    });
    expect(by["Kent Window Cleaning"]).toMatchObject({
      status: "new",
      budgetCents: null,
    });
    expect(b.discrepancies.map((r) => r.name).sort()).toEqual([
      "Kent Window Cleaning",
      "Octopus Energy",
      "Southern Water",
    ]);
    expect(b.diffCents).toBe(1400 + 50 + 4500 - 3910);
  });

  it("tracks work spending and what's still owed, oldest first", () => {
    const { db } = household();
    refreshRecurring(db, { today });
    const c = monthlyCheck(db, today);
    // £120 + £89 + £45.50 spent, £120 repaid → £134.50 owed
    expect(c.work.owedCents).toBe(8900 + 4550);
    expect(c.work.oldestUnpaid?.merchant).toBe("Premier Inn");
    expect(c.work.overdue).toBe(true);
    expect(getWorkSettings(db).allOnCardIsWork).toBe(true);
  });

  it("keeps work money out of household spending and income", () => {
    const { db } = household();
    refreshRecurring(db, { today });
    monthlyCheck(db, today);
    const lines = loadLines(db, { from: "2026-08-01", to: "2026-09-30" });
    expect(lines.some((l) => l.merchant === "Trainline")).toBe(false);
    expect(lines.filter((l) => l.amountCents === 12000)).toHaveLength(0);
  });

  it("only tags travel when the card isn't all work", () => {
    const { db, card } = household();
    setWorkSettings(db, {
      cardAccountId: card.id,
      allOnCardIsWork: false,
      overdueDays: 30,
    });
    db.insert(transactions)
      .values({
        accountId: card.id,
        date: "2026-10-02",
        amountCents: -3000,
        merchant: "Argos",
        rawDescription: "ARGOS",
        dedupeHash: "argos",
      })
      .run();
    refreshRecurring(db, { today });
    const c = monthlyCheck(db, today);
    expect(c.work.items.some((i) => i.merchant === "Argos")).toBe(false);
  });

  it("suggests a sweep from what's left before payday, net of personal card spend", () => {
    const { db } = household();
    refreshRecurring(db, { today });
    const s = monthlyCheck(db, today).surplus;
    // £1,200 − £250 cushion − (card £254.50 − work £134.50 = £120 personal)
    expect(s?.sweepCents).toBe(120000 - 25000 - 12000);
    expect(s?.savingsName).toBe("Nationwide Member Saver");
    expect(s?.savedThisPeriodCents).toBe(20000);
  });

  it("flags categories well above usual", () => {
    const { db } = household();
    refreshRecurring(db, { today });
    const d = monthlyCheck(db, today).drift;
    expect(d.map((x) => x.name)).toEqual(["Coffee & takeout"]);
    expect(d[0].overCents).toBe(24000 - 6000);
  });

  it("lists subscriptions with rises, and renewals from set dates", () => {
    const { db } = household();
    refreshRecurring(db, { today });
    setRenewalDate(db, "Octopus Energy", "2026-11-15");
    const c = monthlyCheck(db, today);
    const netflix = c.subscriptions.find((s) => s.name === "Netflix");
    expect(netflix).toMatchObject({
      latestCents: 1299,
      riseCents: 200,
      justRose: true,
      annualCents: 1299 * 12,
    });
    expect(c.renewals.find((r) => r.name === "Octopus Energy")).toMatchObject({
      date: "2026-11-15",
      source: "set",
    });
  });

  it("produces one month-end summary and the live alerts", () => {
    const { db } = household();
    refreshRecurring(db, { today });
    const n = monthlyNotices(monthlyCheck(db, today), 28);
    const summary = n.find((x) => x.key === "period:2026-09-28");
    expect(summary?.title).toBe("Sept–Oct check");
    expect(summary?.message).toContain("Octopus Energy +£14.00");
    expect(summary?.message).toContain("Southern Water not taken");
    expect(summary?.message).toContain(
      "Move £830.00 to Nationwide Member Saver",
    );
    expect(summary?.message).toContain("Work expenses owed: £134.50");
    expect(n.some((x) => x.key.startsWith("work-overdue:"))).toBe(true);
    expect(n.some((x) => x.key.startsWith("renew:"))).toBe(false);
  });

  it("alerts within the month when a bills payment comes in above budget", () => {
    const { db, nat } = household();
    db.insert(transactions)
      .values({
        accountId: nat.id,
        date: "2026-11-01",
        amountCents: -98000,
        merchant: "Halifax Mortgage",
        rawDescription: "HALIFAX MORTGAGE",
        dedupeHash: "nov-mort",
      })
      .run();
    refreshRecurring(db, { today: "2026-11-02" });
    const n = monthlyNotices(monthlyCheck(db, "2026-11-02"), 28);
    expect(
      n.find((x) => x.key.startsWith("disc:Halifax Mortgage"))?.title,
    ).toBe("Halifax Mortgage £980.00, +£30.00 on last month");
  });
});

describe("bills check edge cases", () => {
  it("a payee that skipped last month is budgeted at its last payment, not new", () => {
    const { db, nat } = household();
    db.insert(transactions)
      .values({
        accountId: nat.id,
        date: "2026-11-20",
        amountCents: -3910,
        merchant: "Southern Water",
        rawDescription: "SOUTHERN WATER",
        dedupeHash: "sw-nov",
      })
      .run();
    refreshRecurring(db, { today: "2026-11-25" });
    const now = monthlyCheck(db, "2026-11-25").billsNow;
    expect(now?.rows.find((r) => r.name === "Southern Water")).toMatchObject({
      budgetCents: 3910,
      status: "match",
      periodic: true,
    });
  });
});
