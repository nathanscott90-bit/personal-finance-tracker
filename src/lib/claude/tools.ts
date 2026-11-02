import { and, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { z } from "zod";
import { todayIso } from "@/lib/dates";
import type { Db } from "@/lib/db/client";
import { accounts, categories, transactions } from "@/lib/db/schema";
import { filterByWho } from "@/lib/household/filterLines";
import {
  getPeople,
  ownerLabel,
  ownersFor,
  parseWho,
  WHO,
  whoLabel,
} from "@/lib/household/people";
import { contribution, monthTotals } from "@/lib/insights/aggregate";
import { loadLines } from "@/lib/insights/lines";
import { buildInsightsPage, shiftMonth } from "@/lib/insights/page";
import { latestBalances } from "@/lib/networth/series";
import { listSnapshots } from "@/lib/networth/store";
import { LIABILITY_TYPES } from "@/lib/networth/types";
import { listBills } from "@/lib/recurring/refresh";
import { getSetting, setSetting } from "@/lib/settings";
import { escapeLike } from "@/lib/sqlLike";

/**
 * Read-only tools for Claude (via the local MCP server in scripts/mcp.ts).
 *
 * What leaves the PC is whatever these return, so they return totals and
 * names, never account numbers, sort codes or raw bank descriptions (which
 * can carry references and card digits). Access is off until someone turns
 * it on in Settings; transaction-level search is a second, separate switch.
 */
export type ClaudeAccess = "off" | "summaries" | "transactions";
const ACCESS_KEY = "claude.access";

export function getClaudeAccess(db: Db): ClaudeAccess {
  const v = getSetting<string>(db, ACCESS_KEY, "off");
  return v === "summaries" || v === "transactions" ? v : "off";
}

export function setClaudeAccess(db: Db, v: ClaudeAccess): void {
  setSetting(db, ACCESS_KEY, v);
}

/** Pounds with two decimals, as a number: easier for Claude than pence. */
const gbp = (cents: number) => Math.round(cents) / 100;

const month = z
  .string()
  .regex(/^\d{4}-\d{2}$/)
  .optional()
  .describe("Month as YYYY-MM. Defaults to the current month.");
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const who = z
  .enum(WHO)
  .optional()
  .describe(
    "Whose money: everyone (default), joint, p1, p2, p1-joint or p2-joint. Names for p1/p2 come from household_overview.",
  );

type Tool = {
  name: string;
  description: string;
  /** JSON Schema for the arguments, as MCP clients expect. */
  inputSchema: Record<string, unknown>;
  args: z.ZodType;
  needs: Exclude<ClaudeAccess, "off">;
  run: (db: Db, args: never) => unknown;
};

function jsonSchema(
  props: Record<string, Record<string, unknown>>,
  required: string[] = [],
) {
  return {
    type: "object",
    properties: props,
    required,
    additionalProperties: false,
  };
}
const WHO_SCHEMA = {
  type: "string",
  enum: [...WHO],
  description:
    "Whose money: everyone (default), joint, p1, p2, p1-joint, p2-joint. household_overview gives the names.",
};
const MONTH_SCHEMA = {
  type: "string",
  pattern: "^\\d{4}-\\d{2}$",
  description: "YYYY-MM; defaults to this month",
};

function linesFor(
  db: Db,
  w: string | undefined,
  range?: { from?: string; to?: string },
) {
  return filterByWho(db, loadLines(db, range), parseWho(w));
}

export const TOOLS: Tool[] = [
  {
    name: "household_overview",
    description:
      "The household's people, accounts (name, type, whose, latest balance) and net worth. Start here.",
    inputSchema: jsonSchema({}),
    args: z.object({}),
    needs: "summaries",
    run: (db) => {
      const people = getPeople(db);
      const today = todayIso();
      const balances = latestBalances(listSnapshots(db), today);
      const rows = db.select().from(accounts).all();
      let assets = 0;
      let liabilities = 0;
      const list = rows.map((a) => {
        const b = balances.get(a.id);
        const isLiability = LIABILITY_TYPES.has(a.type);
        if (b) {
          if (isLiability) liabilities += b.balanceCents;
          else assets += b.balanceCents;
        }
        return {
          name: a.name,
          type: a.type,
          whose: ownerLabel(people, a.owner),
          balance: b ? gbp(b.balanceCents) : null,
          balanceAsOf: b?.date ?? null,
          ...(isLiability ? { note: "balance is the amount owed" } : {}),
        };
      });
      return {
        currency: "GBP",
        today,
        people: { p1: people.p1.name, p2: people.p2.name },
        accounts: list,
        netWorth: {
          assets: gbp(assets),
          liabilities: gbp(liabilities),
          net: gbp(assets - liabilities),
        },
      };
    },
  },
  {
    name: "month_summary",
    description:
      "Income, spending (fixed and variable), savings and leftover for one month, with each category against last month and the 3-month average.",
    inputSchema: jsonSchema({ month: MONTH_SCHEMA, who: WHO_SCHEMA }),
    args: z.object({ month, who }),
    needs: "summaries",
    run: (db, a: { month?: string; who?: string }) => {
      const today = todayIso();
      const m = a.month ?? today.slice(0, 7);
      const p = buildInsightsPage(linesFor(db, a.who), m, today);
      return {
        currency: "GBP",
        month: m,
        whose: whoLabel(getPeople(db), parseWho(a.who)),
        monthInProgress: p.partialComparison,
        totals: {
          income: gbp(p.totals.income),
          fixed: gbp(p.totals.fixed),
          variable: gbp(p.totals.variable),
          spent: gbp(p.totals.spent),
          savings: gbp(p.totals.savings),
          leftover: gbp(p.totals.leftover),
        },
        categories: p.breakdown.map((c) => ({
          name: c.name,
          fixed: c.isFixed,
          thisMonth: gbp(c.thisMonth),
          lastMonth: gbp(c.lastMonth),
          average: gbp(c.avg),
          averageOverMonths: c.avgMonths,
          leaves: (c.leaves ?? []).map((l) => ({
            name: l.name,
            thisMonth: gbp(l.thisMonth),
            average: gbp(l.avg),
          })),
        })),
        topMerchants: p.topByDollars.slice(0, 10).map((t) => ({
          merchant: t.merchant,
          total: gbp(t.totalCents),
          count: t.count,
        })),
      };
    },
  },
  {
    name: "spending_by_category",
    description:
      "Total spending per category between two dates (inclusive). Refunds reduce the totals; transfers between your own accounts are excluded.",
    inputSchema: jsonSchema(
      {
        from: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
        to: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
        who: WHO_SCHEMA,
      },
      ["from", "to"],
    ),
    args: z.object({ from: date, to: date, who }),
    needs: "summaries",
    run: (db, a: { from: string; to: string; who?: string }) => {
      const totals = new Map<string, number>();
      let income = 0;
      for (const l of linesFor(db, a.who, { from: a.from, to: a.to })) {
        const c = contribution(l);
        if (c.bucket === "income") {
          income += c.cents;
          continue;
        }
        const key =
          l.parentName === l.leafName
            ? l.leafName
            : `${l.parentName} › ${l.leafName}`;
        totals.set(key, (totals.get(key) ?? 0) + c.cents);
      }
      const rows = [...totals.entries()]
        .map(([category, cents]) => ({ category, total: gbp(cents) }))
        .sort((x, y) => y.total - x.total);
      return {
        currency: "GBP",
        from: a.from,
        to: a.to,
        whose: whoLabel(getPeople(db), parseWho(a.who)),
        income: gbp(income),
        spending: rows,
      };
    },
  },
  {
    name: "monthly_trend",
    description:
      "Income, spending, savings and leftover for each of the last N months (default 6, max 24).",
    inputSchema: jsonSchema({
      months: { type: "integer", minimum: 1, maximum: 24 },
      who: WHO_SCHEMA,
    }),
    args: z.object({ months: z.number().int().min(1).max(24).optional(), who }),
    needs: "summaries",
    run: (db, a: { months?: number; who?: string }) => {
      const n = a.months ?? 6;
      const current = todayIso().slice(0, 7);
      const first = shiftMonth(current, -(n - 1));
      const totals = monthTotals(linesFor(db, a.who, { from: `${first}-01` }));
      return {
        currency: "GBP",
        whose: whoLabel(getPeople(db), parseWho(a.who)),
        months: Array.from({ length: n }, (_, i) => shiftMonth(first, i)).map(
          (m) => {
            const t = totals.get(m);
            return {
              month: m,
              income: gbp(t?.income ?? 0),
              spent: gbp(t?.spent ?? 0),
              savings: gbp(t?.savings ?? 0),
              leftover: gbp(t?.leftover ?? 0),
              inProgress: m === current,
            };
          },
        ),
      };
    },
  },
  {
    name: "upcoming_bills",
    description:
      "Regular bills and subscriptions due in the next N days (default 30), plus the monthly total of all bills.",
    inputSchema: jsonSchema({
      days: { type: "integer", minimum: 1, maximum: 120 },
    }),
    args: z.object({ days: z.number().int().min(1).max(120).optional() }),
    needs: "summaries",
    run: (db, a: { days?: number }) => {
      const days = a.days ?? 30;
      const { bills, monthlyTotalCents } = listBills(db, {
        today: todayIso(),
      });
      return {
        currency: "GBP",
        monthlyBillsTotal: gbp(monthlyTotalCents),
        due: bills
          .filter(
            (b) =>
              !b.isIncome &&
              b.active &&
              b.dueInDays >= 0 &&
              b.dueInDays <= days,
          )
          .sort((x, y) => x.dueInDays - y.dueInDays)
          .map((b) => ({
            merchant: b.merchant,
            category: b.categoryName,
            expected: gbp(Math.abs(b.avgCents)),
            due: b.nextExpected,
            cadence: b.cadence,
            recentAmounts: b.recentAmounts.map((c) => gbp(Math.abs(c))),
          })),
      };
    },
  },
  {
    name: "search_transactions",
    description:
      "Individual transactions (date, merchant, amount, category, account), newest first. Only available when the household has allowed transaction-level access.",
    inputSchema: jsonSchema({
      query: { type: "string", description: "Merchant name contains" },
      from: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
      to: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
      who: WHO_SCHEMA,
      limit: { type: "integer", minimum: 1, maximum: 100 },
    }),
    args: z.object({
      query: z.string().max(80).optional(),
      from: date.optional(),
      to: date.optional(),
      who,
      limit: z.number().int().min(1).max(100).optional(),
    }),
    needs: "transactions",
    run: (
      db,
      a: {
        query?: string;
        from?: string;
        to?: string;
        who?: string;
        limit?: number;
      },
    ) => {
      const owners = ownersFor(parseWho(a.who));
      const people = getPeople(db);
      const pattern = a.query ? `%${escapeLike(a.query)}%` : undefined;
      const rows = db
        .select({
          date: transactions.date,
          merchant: transactions.merchant,
          amountCents: transactions.amountCents,
          category: categories.name,
          account: accounts.name,
          owner: accounts.owner,
          isTransfer: transactions.isTransfer,
          pending: transactions.pending,
        })
        .from(transactions)
        .innerJoin(accounts, eq(accounts.id, transactions.accountId))
        .leftJoin(categories, eq(categories.id, transactions.categoryId))
        .where(
          and(
            a.from ? gte(transactions.date, a.from) : undefined,
            a.to ? lte(transactions.date, a.to) : undefined,
            pattern
              ? sql`${transactions.merchant} LIKE ${pattern} ESCAPE '\\'`
              : undefined,
            owners ? inArray(accounts.owner, owners) : undefined,
          ),
        )
        .orderBy(desc(transactions.date), desc(transactions.id))
        .limit(a.limit ?? 50)
        .all();
      return {
        currency: "GBP",
        note: "Negative amounts are money out.",
        transactions: rows.map((r) => ({
          date: r.date,
          merchant: r.merchant,
          amount: gbp(r.amountCents),
          category: r.isTransfer ? "Transfer" : (r.category ?? "Uncategorized"),
          account: r.account,
          whose: ownerLabel(people, r.owner),
          ...(r.pending ? { pending: true } : {}),
        })),
      };
    },
  },
];

export type ToolResult =
  | { ok: true; data: unknown }
  | { ok: false; error: string };

/** The tools Claude is offered right now, given the access setting. */
export function availableTools(db: Db): Tool[] {
  const access = getClaudeAccess(db);
  if (access === "off") return [];
  return TOOLS.filter(
    (t) => t.needs === "summaries" || access === "transactions",
  );
}

export function callTool(db: Db, name: string, rawArgs: unknown): ToolResult {
  const tool = TOOLS.find((t) => t.name === name);
  if (!tool) return { ok: false, error: `Unknown tool: ${name}` };
  const access = getClaudeAccess(db);
  if (access === "off")
    return {
      ok: false,
      error: "Claude access is turned off in Finance → Settings → Claude.",
    };
  if (tool.needs === "transactions" && access !== "transactions")
    return {
      ok: false,
      error:
        "Transaction-level access is off. The household can allow it in Finance → Settings → Claude.",
    };
  const parsed = tool.args.safeParse(rawArgs ?? {});
  if (!parsed.success)
    return {
      ok: false,
      error: `Invalid arguments: ${parsed.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`,
    };
  try {
    return { ok: true, data: tool.run(db, parsed.data as never) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
