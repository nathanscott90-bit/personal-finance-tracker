# Household upgrade: what changed and how to install it

## New

1. **Two people.** Settings → People names you both. Each account is marked
   Joint or one person's own. Transactions and Insights get a "whose money"
   filter (everyone, joint, one person, one person + joint), and exports
   follow it.
2. **Tailscale only.** Cloudflare Tunnel/Access is gone. The app listens on
   127.0.0.1; Tailscale Serve publishes it at
   `https://<pc>.<tailnet>.ts.net` to your own devices only. Your partner
   signs in with their own Tailscale account.
3. **Who changed what.** Tailscale tells the app who is asking. The sidebar
   shows "Using as …", and Settings → Recent activity lists changes by person
   (categorising, reviews, accounts, imports, budgets, bills, settings).
4. **Always on, off-PC backups.** Setup stops the PC sleeping on mains power.
   Settings → Off-PC backup writes an encrypted copy daily to a OneDrive /
   Google Drive / USB folder; `npm run restore` brings it back.
5. **Claude (optional, off by default).** A read-only connector so Claude
   Desktop on the PC can answer questions about your money. Summaries only,
   or summaries plus transactions; never account numbers or raw bank text.
6. **Housekeeping.** Removed 15 stray Python `.whl` files; README and
   SECURITY.md rewritten for this UK household version.

## Install over your current copy

1. Back up first: Settings → Data → Download a backup.
2. Copy these files over your Finance folder (your `data` folder is not
   touched). The database upgrades itself on first start (migration 0011:
   account owner + activity log; existing accounts become Joint).
3. In the folder, run:

   ```
   npm ci
   npm run lint
   npx tsc --noEmit
   npm test
   ```

4. Run **setup.cmd** again (it re-registers the server on 127.0.0.1, sets up
   Tailscale Serve and rebuilds). Then follow SETUP-UK.md steps 4–6.

If you had set up Cloudflare: delete the tunnel and the two Access
applications in the Cloudflare dashboard, and uninstall `cloudflared`
(`cloudflared service uninstall` in an Administrator PowerShell).

## Verified before handover

- Lint, type-check and all 866 tests pass (including the new ones), also
  in the UTC+14 and UTC-11 time zones CI uses. The production build succeeds.
- Driven end to end in a browser as two people (Tailscale login headers
  simulated): naming the household, marking account owners, the whose-money
  filters, categorising, Claude access, and a real encrypted backup written
  and logged under the right names.
- Not tested here: Tailscale Serve itself and the Windows setup script, which
  need your PC and tailnet.

## Clean-up release

- **Bank download** replaces the automatic bank link, which does not cover UK
  banks. See docs/BANK-DOWNLOAD.md.
- **Nothing greyed out.** Budget and Goals are always open; with no finished
  month of data yet they say so in plain words.
- **No streak counter** or chirpy wording.
- **Shorter menu** (15 to 11): *To do* holds Review, Weekly review and Monthly
  check; *Budget* holds Goals; *Net worth* holds Debt. Each is a tab bar on the
  same pages, so nothing was removed and old links still work.
- **Removed:** US bank sync (SimpleFIN), the Enable Banking link, the wall
  display and its token, and the US bank file formats (other banks still import
  through the column-mapping step).
- **Database:** migration 0012 drops the unused SimpleFIN table and deletes the
  saved settings of the removed features, including any stored Enable Banking
  key. Your accounts, transactions and everything else are untouched. Take a
  backup first (Settings, Off-PC backup, Back up now) as usual.
