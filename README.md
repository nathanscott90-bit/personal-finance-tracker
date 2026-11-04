# Household Finance

A private finance app for a two-person household in the UK. It pulls
transactions from your banks (or statements you drop in), cleans and
categorises them, and shows budgets, bills, safe-to-spend, net worth, debt
payoff, a cash-flow forecast and alerts. Both of you use it from your own
phones and laptops; it knows whose account is whose and who changed what.

Everything stays on your PC: one SQLite file, no cloud service, no account.
The only things that leave the machine are phone alerts (ntfy), encrypted
backups to a folder you choose, and, only if you turn it on, summaries you let
Claude read. Your bank login is never used by the app.

**Setting it up on Windows:** see [SETUP-UK.md](SETUP-UK.md). For phones,
and backups: [docs/HOUSEHOLD.md](docs/HOUSEHOLD.md).

## What it does

| Area | What you get |
|---|---|
| Bank data | **Bank download**: Chrome opens at NatWest and Nationwide, you log in yourself, and each CSV/OFX you download is imported automatically (profile detection, de-duplication, undo). Statements can also be dropped on the Import page |
| Cleanup | Merchant clean-up, transfer detection between your own accounts, rules, refund matching, splits, a review queue |
| Two people | Each account marked **joint** or one person's own; a **whose money** filter on Transactions and Insights; an activity log of who changed what |
| Spending | Insights by category and merchant, month against average, cash-flow waterfall |
| Planning | Budgets with rollover, safe to spend until payday, goals, irregular expenses spread monthly, debt payoff (avalanche vs snowball), 90-day forecast |
| Bills | Detected bills and subscriptions, price rises, missing payments, renewal reminders, the payday transfer amount |
| Habits | Weekly review, monthly check (replaces the spreadsheet), phone alerts only when something needs doing |
| Safety | Snapshot before every import, encrypted daily off-PC backup, one-command restore |
| Claude (optional) | Ask Claude Desktop questions about your money through a read-only connector ([docs/CLAUDE-CONNECTOR.md](docs/CLAUDE-CONNECTOR.md)) |

## Commands

Requires Node 24, then `npm install`.

| Command | What it does |
|---|---|
| `npm run app` | Builds if needed, serves on `127.0.0.1:3000` and opens a desktop-style window |
| `npm run dev` | Development server with hot reload |
| `npm run bank` | Opens Chrome at your banks; imports each statement you download (the "Bank download" desktop shortcut) |
| `npm run daily` | The unattended job: alerts, weekly download reminder, off-PC backup (scheduled by setup) |
| `npm run backup` | Snapshot into `data/backups/` |
| `npm run restore -- <file.finbak> [--replace]` | Decrypt an off-PC backup |
| `npm run seed` | **Wipes** the dev database and generates 3 months of fake data |
| `npm test` / `npm run lint` | Vitest / Biome |

## Where the data lives

`data/finance.db` (gitignored). Every import first copies it to
`data/backups/` (newest 20 kept) and can be undone from the toast that
follows. Settings → Off-PC backup adds an encrypted daily copy somewhere
else. Never put `data/finance.db` itself in a synced folder.

`data/my-rules.json` (optional) holds your own categorising rules: local
shops, employer, mortgage. They stay out of the code because the code is
public. Each line is a pattern and a category name as the app shows it:

```json
{ "rules": [
  { "pattern": "corner cafe", "category": "Coffee & takeout" },
  { "pattern": "acme ltd", "category": "Paycheck", "direction": "in" }
] }
```

Applied on every import and by Settings → Data → Re-apply. Bad lines are
skipped with a warning, never an error.

## Security in one paragraph

The app has no login of its own and listens only on `127.0.0.1`. Your
devices reach it through Tailscale, which only lets in devices signed in to
your tailnet, and tells the app which of you is asking. Do not expose port
3000 to a network directly. Never commit `data/` or `.env.local`. Details:
[SECURITY.md](SECURITY.md).

## For developers

[CONTRIBUTING.md](CONTRIBUTING.md) and
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) map the code;
[docs/PLAN.md](docs/PLAN.md) is the original design. Only UK bank formats
(NatWest, Nationwide) are recognised automatically; any other bank is taught
once through the column-mapping step on the Import page. Never post real bank
data in issues or pull requests.

## License

[MIT](LICENSE)
