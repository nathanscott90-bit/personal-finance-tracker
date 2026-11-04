import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import { expect, describe as group, it } from "vitest";
import { identifyStatement } from "@/lib/bankfetch/identify";
import { ensureDefaultCategories } from "@/lib/categories/ensure";
import { openDb } from "@/lib/db/client";
import { accounts, categories, rules, transactions } from "@/lib/db/schema";
import { runCommitFlow } from "@/lib/import/commitFlow";
import { describe } from "@/lib/import/normalizeRow";
import { BUILTIN_PROFILES } from "@/lib/import/profiles";
import { cleanMerchant } from "@/lib/normalize/merchant";
import { ensureBuiltinRules } from "@/lib/rules/builtin";
import { pickRule } from "@/lib/rules/engine";
import { loadPersonalRules } from "@/lib/rules/personal";

const fixture = (name: string) =>
  fs.readFileSync(path.join("tests/fixtures", name), "utf8");

group("Nationwide midata", () => {
  it("names the payee from the Type column when the description is a bare withdrawal", () => {
    expect(describe("Withdrawal 03 March 2026", "Monthly Account Fee")).toBe(
      "Monthly Account Fee",
    );
    expect(describe("PAYMENT TO*****", "Payment to")).toBe("PAYMENT TO*****");
    expect(describe("****", "Bank credit ACME")).toBe("Bank credit ACME");
    expect(describe("GREENLEAF GROCER", "")).toBe("GREENLEAF GROCER");
  });

  it("identifies the account by its last digits", () => {
    expect(identifyStatement(fixture("nationwide-midata.csv"))).toMatchObject({
      key: "nationwide:54321",
      institution: "Nationwide",
    });
  });

  it("imports and categorises the file", () => {
    const db = openDb(":memory:");
    const [acct] = db
      .insert(accounts)
      .values({ name: "Current", type: "checking" })
      .returning()
      .all();
    const res = runCommitFlow(
      db,
      { backup: () => "x", builtins: BUILTIN_PROFILES },
      {
        accountId: acct.id,
        filename: "midata.csv",
        text: fixture("nationwide-midata.csv"),
      },
    );
    expect(res.ok).toBe(true);
    const names = new Map(
      db
        .select()
        .from(categories)
        .all()
        .map((c) => [c.id, c.name]),
    );
    const rows = db.select().from(transactions).all();
    const got = Object.fromEntries(
      rows.map((r) => [
        r.amountCents,
        r.categoryId ? names.get(r.categoryId) : null,
      ]),
    );
    expect(got).toEqual({
      [-1240]: null,
      [-1800]: "Interest & fees",
      250000: null,
      [-4701]: "Travel",
    });
  });
});

group("UK statement merchants", () => {
  it.each([
    ["4321 02MAR26 , GREENLEAF GROCER , TOWNVILLE GB", "Greenleaf Grocer"],
    ["J BLOGGS , VIA MOBILE - PYMT , FP 02/03/26 10 , 1234567", "J Bloggs"],
    ["GREENLEAF GROCER TOWNVILLE GB GOOGLE ****", "Greenleaf Grocer Townville"],
    ["Bank credit ACME WIDGETS LTD", "Acme Widgets Ltd"],
  ])("%s → %s", (raw, expected) => expect(cleanMerchant(raw)).toBe(expected));
});

group("new UK rules", () => {
  const db = openDb(":memory:");
  ensureDefaultCategories(db);
  ensureBuiltinRules(db, []);
  const all = db.select().from(rules).all();
  const names = new Map(
    db
      .select()
      .from(categories)
      .all()
      .map((c) => [c.id, c.name]),
  );
  const cat = (raw: string, cents = -1000) => {
    const r = pickRule(all, {
      id: 1,
      accountId: 1,
      amountCents: cents,
      rawDescription: raw,
      merchant: cleanMerchant(raw),
    });
    return r ? names.get(r.categoryId) : undefined;
  };

  it.each([
    ["ZOOPLUS AG", "Pets"],
    ["PETPLAN", "Pets"],
    ["SMYTHS TOYS", "Childcare & kids"],
    ["LITTLE STARS NURSERY", "Childcare & kids"],
    ["CAFE ROMA 12.50 EUR at 1.17", "Travel"],
    ["LOVEHOLIDAYS", "Travel"],
    ["SEETHELIGHT", "Phone & internet"],
    ["ANTHROPIC", "Subscriptions"],
    ["SIGMA SPORTS", "Hobbies"],
    ["CINEWORLD", "Entertainment"],
    ["THE TEA ROOM", "Coffee & takeout"],
    ["ALIEXPRESS", "General"],
    ["MONTHLY ACCOUNT FEE", "Interest & fees"],
  ])("%s → %s", (raw, expected) => expect(cat(raw)).toBe(expected));

  it("leaves US dollar spending to other rules", () =>
    expect(cat("SOMEAPP 9.99 USD at 1.3")).toBeUndefined());
});

group("my-rules.json", () => {
  const write = (body: string) => {
    const f = path.join(
      fs.mkdtempSync(path.join(os.tmpdir(), "rules-")),
      "r.json",
    );
    fs.writeFileSync(f, body);
    return f;
  };

  it("loads rules, skipping bad lines, and survives a broken file", () => {
    const f = write(
      `﻿${JSON.stringify({
        rules: [
          { pattern: "acme widgets", category: "Paycheck", direction: "in" },
          { pattern: "(", category: "Groceries", matchType: "regex" },
          { nope: 1 },
        ],
      })}`,
    );
    expect(loadPersonalRules(f)).toEqual([
      {
        pattern: "acme widgets",
        category: "Paycheck",
        direction: "in",
        priority: 20,
      },
    ]);
    expect(loadPersonalRules(write("{not json"))).toEqual([]);
    expect(loadPersonalRules(null)).toEqual([]);
  });

  it("turns them into rules by category name, and removes them when gone", () => {
    const db = openDb(":memory:");
    ensureDefaultCategories(db);
    ensureBuiltinRules(db, [
      { pattern: "greenleaf grocer", category: "Food > Groceries" },
      { pattern: "acme widgets", category: "income/paycheck", direction: "in" },
      { pattern: "nowhere", category: "No such category" },
    ]);
    const mine = () =>
      db
        .select({ p: rules.pattern, c: categories.name })
        .from(rules)
        .innerJoin(categories, eq(rules.categoryId, categories.id))
        .all()
        .filter((r) => /greenleaf|acme/.test(r.p));
    expect(mine()).toEqual(
      expect.arrayContaining([
        { p: "greenleaf grocer", c: "Groceries" },
        { p: "acme widgets", c: "Paycheck" },
      ]),
    );
    ensureBuiltinRules(db, []);
    expect(mine()).toEqual([]);
  });
});
