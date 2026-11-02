import { describe, expect, it } from "vitest";
import {
  billAmount,
  type FundingBill,
  fundingPlan,
  paydaysFrom,
} from "@/lib/funding/plan";
import {
  bankHolidays,
  isWorkingDay,
  previousWorkingDay,
} from "@/lib/funding/workingDays";

describe("England and Wales bank holidays", () => {
  it("2026", () =>
    expect([...bankHolidays(2026)].sort()).toEqual([
      "2026-01-01",
      "2026-04-03",
      "2026-04-06",
      "2026-05-04",
      "2026-05-25",
      "2026-08-31",
      "2026-12-25",
      "2026-12-28",
    ]));
  it("2027 (Christmas on a Saturday)", () =>
    expect([...bankHolidays(2027)].sort()).toEqual([
      "2027-01-01",
      "2027-03-26",
      "2027-03-29",
      "2027-05-03",
      "2027-05-31",
      "2027-08-30",
      "2027-12-27",
      "2027-12-28",
    ]));
  it("weekends are not working days", () => {
    expect(isWorkingDay("2026-11-28")).toBe(false); // Saturday
    expect(isWorkingDay("2026-11-27")).toBe(true);
  });
  it("a Sunday 28th pays on Friday 26th", () =>
    expect(previousWorkingDay("2027-02-28")).toBe("2027-02-26"));
  it("a bank-holiday 28th rolls back past the weekend", () =>
    // Mon 28 Dec 2026 is the Boxing Day substitute → Thu 24 Dec
    expect(previousWorkingDay("2026-12-28")).toBe("2026-12-24"));
});

describe("paydaysFrom", () => {
  it("the 28th, working-day adjusted", () => {
    expect(paydaysFrom("2026-10-25", 28)).toEqual(["2026-10-28", "2026-11-27"]);
    expect(paydaysFrom("2026-10-28", 28)).toEqual(["2026-10-28", "2026-11-27"]);
    expect(paydaysFrom("2026-10-29", 28)).toEqual(["2026-11-27", "2026-12-24"]);
  });
  it("an adjusted payday before the 28th still counts in its own month", () =>
    expect(paydaysFrom("2026-11-27", 28)).toEqual([
      "2026-11-27",
      "2026-12-24",
    ]));
});

const bill = (
  name: string,
  nextExpected: string,
  amountCents: number,
  cadence: FundingBill["cadence"] = "monthly",
  variable = false,
): FundingBill => ({ name, nextExpected, amountCents, cadence, variable });

describe("fundingPlan", () => {
  const bills = [
    bill("Mortgage", "2026-11-01", -95000),
    bill("Council tax", "2026-11-01", -19850),
    bill("Octopus Energy", "2026-11-05", -14200, "monthly", true),
    bill("Virgin Media", "2026-11-20", -5500),
    bill("Car insurance", "2026-12-10", -48000, "annual"),
  ];

  it("transfer covers bills from payday to the day before the next payday", () => {
    const p = fundingPlan({
      today: "2026-10-25",
      balanceCents: 2000,
      balanceDate: "2026-10-25",
      bills,
      payDay: 28,
    });
    expect(p.payday).toBe("2026-10-28");
    expect(p.followingPayday).toBe("2026-11-27");
    expect(p.beforePayday.events).toEqual([]);
    expect(p.payPeriod.events.map((e) => e.name)).toEqual([
      "Council tax",
      "Mortgage",
      "Octopus Energy",
      "Virgin Media",
    ]);
    // 950 + 198.50 + 142 + 55 = 1,345.50 out, less £20 already there
    expect(p.payPeriod.outCents).toBe(134550);
    expect(p.transferCents).toBe(134550 - 2000);
    expect(p.includesEstimates).toBe(true);
  });

  it("an annual bill lands in the month it is due", () => {
    // By 27 Nov the November bills have been paid, so each is next due in December.
    const december = [
      bill("Mortgage", "2026-12-01", -95000),
      bill("Council tax", "2026-12-01", -19850),
      bill("Octopus Energy", "2026-12-05", -14200, "monthly", true),
      bill("Virgin Media", "2026-12-20", -5500),
      bill("Car insurance", "2026-12-10", -48000, "annual"),
    ];
    const p = fundingPlan({
      today: "2026-11-27",
      balanceCents: 0,
      balanceDate: "2026-11-27",
      bills: december,
      payDay: 28,
    });
    expect(p.payday).toBe("2026-11-27");
    expect(p.followingPayday).toBe("2026-12-24");
    expect(p.payPeriod.events.map((e) => e.name)).toContain("Car insurance");
    expect(p.transferCents).toBe(95000 + 19850 + 14200 + 5500 + 48000);
  });

  it("timing matters: an early bill sets the transfer even when money arrives later", () => {
    const p = fundingPlan({
      today: "2026-10-25",
      balanceCents: 0,
      balanceDate: "2026-10-25",
      bills: [
        bill("Mortgage", "2026-11-01", -95000),
        bill("Refund from partner", "2026-11-15", 50000),
        bill("Phone", "2026-11-20", -3000),
      ],
      payDay: 28,
    });
    // Month total is only £480, but £950 goes out before the £500 arrives.
    expect(p.payPeriod.outCents - p.payPeriod.inCents).toBe(48000);
    expect(p.transferCents).toBe(95000);
    expect(p.payPeriod.lowestDate).toBe("2026-11-01");
  });

  it("flags a shortfall before payday separately", () => {
    const p = fundingPlan({
      today: "2026-10-20",
      balanceCents: 5000,
      balanceDate: "2026-10-20",
      bills: [bill("Water", "2026-10-22", -8000)],
      payDay: 28,
    });
    expect(p.beforePayday.neededCents).toBe(3000);
    // The period after payday starts from zero once the shortfall is topped up.
    expect(p.payPeriod.startCents).toBe(0);
    expect(p.transferCents).toBe(8000);
  });

  it("an overdue bill is assumed still to come and is flagged", () => {
    const p = fundingPlan({
      today: "2026-10-25",
      balanceCents: 10000,
      balanceDate: "2026-10-24",
      bills: [bill("Water", "2026-10-20", -3000)],
      payDay: 28,
    });
    expect(p.beforePayday.events).toEqual([
      expect.objectContaining({
        name: "Water",
        date: "2026-10-25",
        overdue: true,
        afterCents: 7000,
      }),
    ]);
    // and its next month still lands in the pay period
    expect(p.payPeriod.events.map((e) => e.date)).toEqual(["2026-11-20"]);
  });

  it("a buffer raises the transfer by exactly the buffer", () => {
    const base = {
      today: "2026-10-25",
      balanceCents: 0,
      balanceDate: "2026-10-25",
      bills,
      payDay: 28,
    };
    expect(fundingPlan({ ...base, bufferCents: 5000 }).transferCents).toBe(
      fundingPlan(base).transferCents + 5000,
    );
  });

  it("nothing to transfer when the balance already covers the period", () => {
    const p = fundingPlan({
      today: "2026-10-25",
      balanceCents: 500000,
      balanceDate: "2026-10-25",
      bills,
      payDay: 28,
    });
    expect(p.transferCents).toBe(0);
  });
});

describe("billAmount", () => {
  it("uses the latest payment and flags variation over 5%", () => {
    expect(billAmount([-12000, -14200], -13100)).toEqual({
      amountCents: -14200,
      variable: true,
    });
    expect(billAmount([-5500, -5500, -5500], -5500)).toEqual({
      amountCents: -5500,
      variable: false,
    });
  });
  it("falls back to the average with no history", () =>
    expect(billAmount([], -4000)).toEqual({
      amountCents: -4000,
      variable: false,
    }));
});
