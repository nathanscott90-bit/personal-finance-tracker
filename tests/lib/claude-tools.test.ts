import { describe, expect, it } from "vitest";
import {
  ensureDefaultCategories,
  findCategoryId,
} from "@/lib/categories/ensure";
import {
  availableTools,
  callTool,
  setClaudeAccess,
  TOOLS,
} from "@/lib/claude/tools";
import { openDb } from "@/lib/db/client";
import { accounts, balanceSnapshots, transactions } from "@/lib/db/schema";
import { setPeople } from "@/lib/household/people";

function setup() {
  const db = openDb(":memory:");
  ensureDefaultCategories(db);
  const [joint, card] = db
    .insert(accounts)
    .values([
      { name: "Joint current", type: "checking", owner: "joint" },
      { name: "Nat card", type: "credit", owner: "p1" },
    ])
    .returning()
    .all();
  db.insert(balanceSnapshots)
    .values([
      { accountId: joint.id, date: "2026-01-01", balanceCents: 150_000 },
      { accountId: card.id, date: "2026-01-01", balanceCents: 20_000 },
    ])
    .run();
  const groceries = findCategoryId(db, "Groceries") as number;
  db.insert(transactions)
    .values([
      {
        accountId: joint.id,
        date: "2026-10-02",
        amountCents: -10_000,
        rawDescription: "TESCO STORES 1234 CARD 9876",
        merchant: "Tesco",
        dedupeHash: "c1",
        categoryId: groceries,
      },
      {
        accountId: card.id,
        date: "2026-10-03",
        amountCents: -2_550,
        rawDescription: "TESCO EXPRESS",
        merchant: "Tesco",
        dedupeHash: "c2",
        categoryId: groceries,
      },
    ])
    .run();
  setPeople(db, {
    p1: { name: "Nat", login: null },
    p2: { name: "Sam", login: null },
  });
  return db;
}

describe("Claude tools", () => {
  it("offer nothing and refuse calls until access is turned on", () => {
    const db = setup();
    expect(availableTools(db)).toEqual([]);
    const r = callTool(db, "household_overview", {});
    expect(r).toMatchObject({ ok: false });
  });

  it("with summaries, give totals but not individual transactions", () => {
    const db = setup();
    setClaudeAccess(db, "summaries");
    expect(availableTools(db).map((t) => t.name)).not.toContain(
      "search_transactions",
    );
    const o = callTool(db, "household_overview", {});
    expect(o.ok).toBe(true);
    if (!o.ok) return;
    expect(o.data).toMatchObject({
      people: { p1: "Nat", p2: "Sam" },
      netWorth: { assets: 1500, liabilities: 200, net: 1300 },
    });
    expect(JSON.stringify(o.data)).not.toContain("9876");

    const s = callTool(db, "spending_by_category", {
      from: "2026-10-01",
      to: "2026-10-31",
      who: "joint",
    });
    expect(s.ok && s.data).toMatchObject({ spending: [{ total: 100 }] });

    expect(callTool(db, "search_transactions", {})).toMatchObject({
      ok: false,
    });
  });

  it("with transactions, search by merchant and whose money, never raw text", () => {
    const db = setup();
    setClaudeAccess(db, "transactions");
    const r = callTool(db, "search_transactions", { query: "tes", who: "p1" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const rows = (
      r.data as { transactions: { amount: number; whose: string }[] }
    ).transactions;
    expect(rows).toEqual([
      expect.objectContaining({ amount: -25.5, whose: "Nat" }),
    ]);
    expect(JSON.stringify(r.data)).not.toContain("CARD 9876");
  });

  it("reject bad arguments and unknown tools", () => {
    const db = setup();
    setClaudeAccess(db, "transactions");
    expect(
      callTool(db, "spending_by_category", { from: "October" }),
    ).toMatchObject({ ok: false });
    expect(callTool(db, "drop_tables", {})).toMatchObject({ ok: false });
  });

  it("every tool runs on an empty database", () => {
    const db = openDb(":memory:");
    setClaudeAccess(db, "transactions");
    for (const t of TOOLS) {
      const args =
        t.name === "spending_by_category"
          ? { from: "2026-01-01", to: "2026-01-31" }
          : {};
      expect(callTool(db, t.name, args)).toMatchObject({ ok: true });
    }
  });
});
