# Asking Claude about your money

Claude Desktop on the PC can answer questions such as "how much did we spend
on eating out this year?", "which bills went up?" or "what's left for the rest
of the month on the joint account?" by reading the app's figures through a
local connector (an MCP server, `scripts/mcp.ts`).

## What Claude can and cannot see

| Setting (Settings → Claude) | Claude can read |
|---|---|
| **Off** (default) | Nothing. Calls are refused. |
| **Summaries** | Accounts (name, type, whose, balance), net worth, monthly totals, spending by category, trends, upcoming bills |
| **Summaries and transactions** | The above, plus individual transactions: date, merchant, amount, category, account |

Never: account numbers, sort codes, raw bank descriptions (which can contain
references and card digits), bank connection keys or settings.

The connector opens the database **read-only**, so nothing Claude does can
change your data. Whatever it reads is sent to Anthropic to produce the
answer, under your Claude account's privacy settings. If either of you is
uncomfortable with that, leave it off; the app works the same without it.

## Setting it up (on the PC)

1. Install Claude Desktop and sign in.
2. Finance → **Settings → Claude**: pick a level, then **Copy config**.
3. Claude Desktop → Settings → Developer → **Edit Config**. Paste the
   `finance` entry inside `mcpServers` (merge with anything already there),
   save, and restart Claude Desktop.
4. Ask: "Using my finance tools, give me an overview of our household."

The config points at this PC's Node and the app folder, so copy it again if
you move the folder.

## Limits

- It runs on the PC, so it works in Claude Desktop there, not in the Claude
  phone app. Exposing it to the phone would mean publishing a remote
  connector, which this design deliberately avoids.
- Answers are only as good as the categories. Clear the Review queue first.

## Tools

`household_overview`, `month_summary`, `spending_by_category`,
`monthly_trend`, `upcoming_bills`, and (when allowed) `search_transactions`.
Each takes an optional `who` filter: `everyone`, `joint`, `p1`, `p2`,
`p1-joint`, `p2-joint`. Definitions live in `src/lib/claude/tools.ts`.
