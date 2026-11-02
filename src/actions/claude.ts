"use server";
import path from "node:path";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { audit } from "@/lib/audit/request";
import {
  type ClaudeAccess,
  getClaudeAccess,
  setClaudeAccess,
} from "@/lib/claude/tools";
import { getDb } from "@/lib/db/client";

export type ClaudeView = {
  access: ClaudeAccess;
  /** Claude Desktop config for this PC, ready to paste. */
  config: string;
};

export async function getClaudeAction(): Promise<ClaudeView> {
  const root = process.cwd();
  const config = {
    mcpServers: {
      finance: {
        command: process.execPath,
        args: [
          path.join(root, "node_modules", "tsx", "dist", "cli.mjs"),
          path.join(root, "scripts", "mcp.ts"),
        ],
      },
    },
  };
  return {
    access: getClaudeAccess(getDb()),
    config: JSON.stringify(config, null, 2),
  };
}

const LABEL: Record<ClaudeAccess, string> = {
  off: "Off",
  summaries: "Summaries only",
  transactions: "Summaries and transactions",
};

export async function setClaudeAccessAction(
  input: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const p = z.enum(["off", "summaries", "transactions"]).safeParse(input);
  if (!p.success) return { ok: false, error: "Unknown setting." };
  setClaudeAccess(getDb(), p.data);
  await audit("Changed Claude access", LABEL[p.data]);
  revalidatePath("/settings");
  return { ok: true };
}
