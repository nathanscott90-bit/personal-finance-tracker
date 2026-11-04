import fs from "node:fs";
import path from "node:path";
import { and, eq, isNotNull, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import { z } from "zod";
import { findCategoryIdBySeedKey } from "@/lib/categories/ensure";
import { type Db, dbPath } from "@/lib/db/client";
import { categories } from "@/lib/db/schema";
import type { BuiltinRule } from "./builtin";

/**
 * Your own rules, kept in `data/my-rules.json` next to the database: local
 * shops, your employer, your mortgage. They live there, not in the code,
 * because the code is shared and they say a lot about you.
 *
 *   { "rules": [
 *       { "pattern": "corner cafe", "category": "Coffee & takeout" },
 *       { "pattern": "acme ltd", "category": "Paycheck", "direction": "in" }
 *   ] }
 *
 * `category` is a category's name as the app shows it ("Groceries", or
 * "Food > Groceries" if two share a name) or a default's seed key
 * ("food/groceries"). The other fields work as in the built-in rules; they
 * run before them (priority 20) unless given a priority. Applied on every
 * import and by Settings → Data → Re-apply; removing a line removes its rule.
 */
export function personalRulesFile(): string | null {
  if (process.env.FINANCE_MY_RULES) return process.env.FINANCE_MY_RULES;
  // Tests stay independent of a developer's own file.
  if (process.env.VITEST) return null;
  return path.join(path.dirname(dbPath()), "my-rules.json");
}

const ruleSchema = z.object({
  pattern: z.string().trim().min(2).max(400),
  category: z.string().trim().min(1).max(80),
  field: z.enum(["merchant", "raw"]).optional(),
  matchType: z.enum(["contains", "regex"]).optional(),
  direction: z.enum(["in", "out", "any"]).optional(),
  priority: z.number().int().min(0).max(100).optional(),
});

export const PERSONAL_DEFAULT_PRIORITY = 20;

/** Never throws: a bad file or line is reported and skipped, so imports keep working. */
export function loadPersonalRules(
  file: string | null = personalRulesFile(),
): BuiltinRule[] {
  if (!file || !fs.existsSync(file)) return [];
  let data: unknown;
  try {
    data = JSON.parse(fs.readFileSync(file, "utf8").replace(/^﻿/, ""));
  } catch (e) {
    console.warn(`my-rules.json ignored: ${(e as Error).message}`);
    return [];
  }
  const list = Array.isArray(data)
    ? data
    : (data as { rules?: unknown })?.rules;
  if (!Array.isArray(list)) return [];
  return list.flatMap((raw, i): BuiltinRule[] => {
    const p = ruleSchema.safeParse(raw);
    if (!p.success) {
      console.warn(`my-rules.json line ${i + 1} ignored: not a valid rule`);
      return [];
    }
    if (p.data.matchType === "regex")
      try {
        new RegExp(p.data.pattern, "i");
      } catch {
        console.warn(`my-rules.json line ${i + 1} ignored: bad pattern`);
        return [];
      }
    return [
      { ...p.data, priority: p.data.priority ?? PERSONAL_DEFAULT_PRIORITY },
    ];
  });
}

/** The leaf a personal rule names: a seed key, "Parent > Leaf", or a leaf name. */
export function resolvePersonalCategory(
  db: Db,
  name: string,
): number | undefined {
  if (/^[a-z0-9-]+\/[a-z0-9-]+$/.test(name)) {
    const id = findCategoryIdBySeedKey(db, name);
    if (id !== undefined) return id;
  }
  const [parentName, leafName] = name.includes(">")
    ? name.split(">").map((s) => s.trim())
    : [null, name.trim()];
  const parent = alias(categories, "parent");
  const rows = db
    .select({ id: categories.id, parent: parent.name })
    .from(categories)
    .innerJoin(parent, eq(parent.id, categories.parentId))
    .where(
      and(
        isNotNull(categories.parentId),
        eq(categories.archived, false),
        sql`lower(${categories.name}) = lower(${leafName})`,
      ),
    )
    .all();
  const match = parentName
    ? rows.find((r) => r.parent.toLowerCase() === parentName.toLowerCase())
    : rows[0];
  return match?.id;
}
