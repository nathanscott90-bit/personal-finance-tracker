import { describe, expect, it } from "vitest";
import {
  AUDIT_KEEP,
  countAudit,
  listAudit,
  recordAudit,
} from "@/lib/audit/log";
import {
  ensureDefaultCategories,
  findCategoryId,
} from "@/lib/categories/ensure";
import { openDb } from "@/lib/db/client";
import { accounts, transactions } from "@/lib/db/schema";
import { filterByWho } from "@/lib/household/filterLines";
import { actorFromHeaders, THIS_PC } from "@/lib/household/identity";
import {
  DEFAULT_PEOPLE,
  getPeople,
  ownersFor,
  parseWho,
  personForLogin,
  setPeople,
  whoLabel,
} from "@/lib/household/people";
import { loadLines } from "@/lib/insights/lines";
import { summarize } from "@/lib/transactions/summary";

const headers = (h: Record<string, string>) => ({
  get: (k: string) => h[k.toLowerCase()] ?? null,
});

function household() {
  const db = openDb(":memory:");
  ensureDefaultCategories(db);
  const [joint, mine, hers] = db
    .insert(accounts)
    .values([
      { name: "Joint", type: "checking", owner: "joint" },
      { name: "Nat card", type: "credit", owner: "p1" },
      { name: "Sam current", type: "checking", owner: "p2" },
    ])
    .returning()
    .all();
  const groceries = findCategoryId(db, "Groceries") as number;
  db.insert(transactions)
    .values([
      {
        accountId: joint.id,
        date: "2026-10-02",
        amountCents: -10_000,
        rawDescription: "TESCO",
        merchant: "Tesco",
        dedupeHash: "h1",
        categoryId: groceries,
      },
      {
        accountId: mine.id,
        date: "2026-10-03",
        amountCents: -2_500,
        rawDescription: "STEAM",
        merchant: "Steam",
        dedupeHash: "h2",
        categoryId: groceries,
      },
      {
        accountId: hers.id,
        date: "2026-10-04",
        amountCents: -4_000,
        rawDescription: "BOOTS",
        merchant: "Boots",
        dedupeHash: "h3",
        categoryId: groceries,
      },
    ])
    .run();
  setPeople(db, {
    p1: { name: "Nat", login: "Nat@Example.com" },
    p2: { name: "Sam", login: "sam@example.com" },
  });
  return db;
}

describe("people", () => {
  it("falls back to defaults and stores names with lower-cased logins", () => {
    const db = openDb(":memory:");
    expect(getPeople(db)).toEqual(DEFAULT_PEOPLE);
    const r = setPeople(db, {
      p1: { name: " Nat ", login: "Nat@Example.com" },
      p2: { name: "Sam", login: "" },
    });
    expect(r).toEqual({
      p1: { name: "Nat", login: "nat@example.com" },
      p2: { name: "Sam", login: null },
    });
    expect(getPeople(db).p1.login).toBe("nat@example.com");
  });
  it("rejects the same login for both people, and empty names", () => {
    const db = openDb(":memory:");
    expect(
      setPeople(db, {
        p1: { name: "A", login: "x@y.com" },
        p2: { name: "B", login: "X@y.com" },
      }),
    ).toHaveProperty("error");
    expect(
      setPeople(db, { p1: { name: "", login: null }, p2: { name: "B" } }),
    ).toHaveProperty("error");
    expect(getPeople(db)).toEqual(DEFAULT_PEOPLE);
  });
  it("maps filters to owners and labels them", () => {
    expect(ownersFor("everyone")).toBeNull();
    expect(ownersFor("joint")).toEqual(["joint"]);
    expect(ownersFor("p2-joint")).toEqual(["p2", "joint"]);
    expect(parseWho("p1")).toBe("p1");
    expect(parseWho("nonsense")).toBe("everyone");
    expect(parseWho(undefined)).toBe("everyone");
    const people = {
      p1: { name: "Nat", login: null },
      p2: { name: "Sam", login: null },
    };
    expect(whoLabel(people, "p1-joint")).toBe("Nat + joint");
    expect(whoLabel(people, "joint")).toBe("Joint");
    expect(
      personForLogin({ ...people, p2: { name: "Sam", login: "s@x" } }, "S@X"),
    ).toBe("p2");
  });
});

describe("identity from Tailscale headers", () => {
  it("is This PC with no header, the household name when mapped, else Tailscale's name", () => {
    const db = household();
    expect(actorFromHeaders(db, headers({}))).toEqual({
      name: THIS_PC,
      login: null,
      person: null,
    });
    expect(
      actorFromHeaders(
        db,
        headers({ "tailscale-user-login": "SAM@example.com" }),
      ),
    ).toEqual({ name: "Sam", login: "sam@example.com", person: "p2" });
    expect(
      actorFromHeaders(
        db,
        headers({
          "tailscale-user-login": "guest@example.com",
          "tailscale-user-name": "Guest%20User",
        }),
      ),
    ).toEqual({ name: "Guest User", login: "guest@example.com", person: null });
  });
});

describe("whose money filters", () => {
  it("limits transaction totals to the chosen owners", () => {
    const db = household();
    expect(summarize(db).spentCents).toBe(16_500);
    expect(summarize(db, { who: "joint" }).spentCents).toBe(10_000);
    expect(summarize(db, { who: "p1" }).spentCents).toBe(2_500);
    expect(summarize(db, { who: "p2-joint" }).spentCents).toBe(14_000);
    expect(summarize(db, { who: "everyone" }).spentCents).toBe(16_500);
  });
  it("filters insight lines the same way", () => {
    const db = household();
    const lines = loadLines(db);
    expect(filterByWho(db, lines, "everyone")).toHaveLength(3);
    expect(
      filterByWho(db, lines, "p1-joint")
        .map((l) => l.merchant)
        .sort(),
    ).toEqual(["Steam", "Tesco"]);
  });
});

describe("audit log", () => {
  it("records newest first and prunes past the cap", () => {
    const db = openDb(":memory:");
    const actor = {
      name: "Sam",
      login: "sam@example.com",
      person: "p2" as const,
    };
    recordAudit(db, actor, "Categorised", "Tesco → Groceries");
    recordAudit(
      db,
      { name: THIS_PC, login: null, person: null },
      "Added account",
      "Joint",
    );
    const [latest, first] = listAudit(db, 10);
    expect(latest).toMatchObject({ actor: THIS_PC, action: "Added account" });
    expect(first).toMatchObject({ actor: "Sam", login: "sam@example.com" });
    for (let i = 0; i < AUDIT_KEEP + 5; i++)
      recordAudit(db, actor, "x", String(i));
    expect(countAudit(db)).toBe(AUDIT_KEEP);
    expect(listAudit(db, 1)[0].summary).toBe(String(AUDIT_KEEP + 4));
  });
});
