/**
 * A local, read-only MCP server so Claude Desktop (on this PC) can answer
 * questions about the household's money. Claude Desktop starts it; see
 * Settings → Claude for the config to paste, and docs/CLAUDE-CONNECTOR.md.
 *
 * Speaks MCP over stdio (newline-delimited JSON-RPC 2.0). Hand-written rather
 * than built on the MCP SDK so the app gains no dependencies; it only needs
 * initialize, ping, tools/list and tools/call.
 *
 * Safety: the database is opened read-only, so nothing Claude asks can change
 * it, and the tools in src/lib/claude/tools.ts return summaries, not account
 * numbers or raw bank text. Nothing is offered until the household turns
 * access on in Settings.
 */
import path from "node:path";
import readline from "node:readline";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { availableTools, callTool, TOOLS } from "../src/lib/claude/tools";
import type { Db } from "../src/lib/db/client";
import * as schema from "../src/lib/db/schema";

// stdout carries the protocol; anything else printed there would corrupt it.
console.log = console.info = console.warn = console.error;

// Claude Desktop starts us from its own folder; the data lives next to us.
process.chdir(path.resolve(path.dirname(process.argv[1] ?? "."), ".."));
const file =
  process.env.FINANCE_DB ?? path.join(process.cwd(), "data", "finance.db");

let db: Db | null = null;
function getReadOnlyDb(): Db {
  if (!db)
    db = drizzle(new Database(file, { readonly: true, fileMustExist: true }), {
      schema,
    }) as unknown as Db;
  return db;
}

const SUPPORTED = ["2025-06-18", "2025-03-26", "2024-11-05"];

type Msg = {
  jsonrpc: "2.0";
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
};

function send(body: Record<string, unknown>) {
  process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", ...body })}\n`);
}

function listTools() {
  const live = availableTools(getReadOnlyDb());
  // With access off, still list the summary tools so Claude can explain why
  // a call fails, rather than the connector looking broken.
  const tools = live.length
    ? live
    : TOOLS.filter((t) => t.needs === "summaries");
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: t.inputSchema,
    annotations: { readOnlyHint: true, openWorldHint: false },
  }));
}

function handle(m: Msg): Record<string, unknown> | null {
  switch (m.method) {
    case "initialize": {
      const asked = String(m.params?.protocolVersion ?? "");
      return {
        protocolVersion: SUPPORTED.includes(asked) ? asked : SUPPORTED[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "household-finance", version: "1.0.0" },
        instructions:
          "Read-only access to a UK household's finances (GBP). Call household_overview first for the people and accounts. Amounts are pounds; negative means money out. Do not guess figures that the tools do not return.",
      };
    }
    case "ping":
      return {};
    case "tools/list":
      return { tools: listTools() };
    case "tools/call": {
      const name = String(m.params?.name ?? "");
      const r = callTool(getReadOnlyDb(), name, m.params?.arguments);
      return r.ok
        ? { content: [{ type: "text", text: JSON.stringify(r.data, null, 2) }] }
        : { content: [{ type: "text", text: r.error }], isError: true };
    }
    default:
      return null;
  }
}

const rl = readline.createInterface({ input: process.stdin });
rl.on("line", (line) => {
  if (!line.trim()) return;
  let m: Msg;
  try {
    m = JSON.parse(line);
  } catch {
    send({ id: null, error: { code: -32700, message: "Parse error" } });
    return;
  }
  // Notifications (no id) need no reply.
  if (m.id === undefined || m.id === null) return;
  try {
    const result = handle(m);
    if (result === null)
      send({
        id: m.id,
        error: { code: -32601, message: `Method not found: ${m.method}` },
      });
    else send({ id: m.id, result });
  } catch (e) {
    send({
      id: m.id,
      error: {
        code: -32603,
        message: e instanceof Error ? e.message : String(e),
      },
    });
  }
});
rl.on("close", () => process.exit(0));
