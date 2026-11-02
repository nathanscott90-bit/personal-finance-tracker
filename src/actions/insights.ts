"use server";
import { z } from "zod";
import { todayIso } from "@/lib/dates";
import { getDb } from "@/lib/db/client";
import { filterByWho } from "@/lib/household/filterLines";
import { parseWho } from "@/lib/household/people";
import {
  type AvgMonths,
  buildInsightsPage,
  type InsightsPage,
} from "@/lib/insights/page";
import { cachedLines } from "@/lib/loaders";

export type { AvgMonths, InsightsPage };

const monthSchema = z.string().regex(/^\d{4}-\d{2}$/);
const avgSchema = z.union([z.literal("3"), z.literal("6"), z.literal("12")]);

export async function getInsights(
  month?: string,
  avg?: string,
  who?: string,
): Promise<InsightsPage> {
  const today = todayIso();
  const m = monthSchema.safeParse(month).success
    ? (month as string)
    : today.slice(0, 7);
  const a = avgSchema.safeParse(avg);
  const lines = filterByWho(getDb(), cachedLines(), parseWho(who));
  return buildInsightsPage(lines, m, today, {
    avgMonths: a.success ? (Number(a.data) as AvgMonths) : 3,
  });
}
