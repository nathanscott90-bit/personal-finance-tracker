import { describe, expect, it } from "vitest";
import { ensureDefaultCategories } from "@/lib/categories/ensure";
import { openDb } from "@/lib/db/client";
import { categories, rules } from "@/lib/db/schema";
import { cleanMerchant } from "@/lib/normalize/merchant";
import { ensureBuiltinRules } from "@/lib/rules/builtin";
import { pickRule } from "@/lib/rules/engine";
import { isOwnTransfer } from "@/lib/transfers/detect";

const db = openDb(":memory:");
ensureDefaultCategories(db);
ensureBuiltinRules(db);
const all = db.select().from(rules).all();
const cats = new Map(
  db
    .select()
    .from(categories)
    .all()
    .map((c) => [c.id, c.name]),
);

function categorise(raw: string, amountCents = -1000): string | undefined {
  const r = pickRule(all, {
    id: 1,
    accountId: 1,
    amountCents,
    rawDescription: raw,
    merchant: cleanMerchant(raw),
  });
  return r ? cats.get(r.categoryId) : undefined;
}

describe("UK categorisation", () => {
  it.each([
    ["SPECIALIST LINES LTD SALARY", "Paycheck", 385000],
    ["CANTERBURY CITY COUNCIL", "Council tax", -19850],
    ["OCTOPUS ENERGY", "Utilities", -14200],
    ["SOUTHERN WATER", "Utilities", -3900],
    ["TV LICENCE MBP", "Subscriptions", -1452],
    ["VIRGIN MEDIA", "Phone & internet", -5500],
    ["TESCO MOBILE", "Phone & internet", -1200],
    ["TESCO STORES 2345", "Groceries", -5420],
    ["TESCO PFS 4567", "Fuel", -6000],
    ["SAINSBURYS S/MKTS", "Groceries", -3210],
    ["NATIONWIDE BS MORTGAGE", "Rent/Mortgage", -95000],
    ["AVIVA INSURANCE", "Insurance", -2800],
    ["DVLA-AB12CDE", "Car payment & insurance", -1650],
    ["GREGGS", "Coffee & takeout", -450],
    ["AMAZON.CO.UK*AB12C", "General", -2499],
    ["NETFLIX.COM", "Subscriptions", -1099],
    ["ZWIFT", "Gym & memberships", -1799],
  ])("%s → %s", (raw, expected, cents) =>
    expect(categorise(raw, cents)).toBe(expected),
  );

  it("does not treat a UK debit-card purchase as a credit-card repayment", () =>
    expect(categorise("CARD PAYMENT TO TESCO STORES")).toBe("Groceries"));
  it("repayment to a card that isn't imported", () =>
    expect(categorise("BARCLAYCARD")).toBe("Card payments"));
});

describe("UK own-transfer wording", () => {
  it.each([
    "Transfer to 600000 12345678",
    "FROM A/C 12345678 NATIONWIDE",
    "TFR TO SAVINGS",
  ])("%s is an own transfer", (d) =>
    expect(isOwnTransfer(d, "checking")).toBe(true),
  );
  it("card side of a repayment", () =>
    expect(isOwnTransfer("PAYMENT RECEIVED - THANK YOU", "credit")).toBe(true));
  it("a direct debit to a supplier is not", () =>
    expect(isOwnTransfer("OCTOPUS ENERGY", "checking")).toBe(false));
});
