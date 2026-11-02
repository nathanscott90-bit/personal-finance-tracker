# Finance — UK setup (Windows)

Runs on your PC. Your data never leaves it, apart from read-only bank access
through Enable Banking and the alerts sent to your phone.

## 1. Install (once, ~5 minutes)

1. Unzip this folder somewhere permanent, e.g. `Documents\Finance`.
2. Double-click **setup.cmd**. It installs Node.js if needed, builds the
   app, adds a **Finance** shortcut to the desktop and schedules a daily sync
   at 07:30 (or as soon as the PC is next on).

## 2. Connect your banks (once, then every few months)

1. Open **Finance** → **Settings** → **Bank connection** and follow the four
   steps shown there (free Enable Banking account, register the app, link
   NatWest and Nationwide, paste the ID and key).
2. Click **Connect a bank**, choose NatWest, approve in the bank's page. You
   land on a page that may say it can't be reached: copy its address, paste
   it into the app, **Finish**. Repeat for Nationwide.

Accounts are created and matched automatically. Banks make you re-approve
access every 90–180 days; you'll get a phone alert when it's due — repeat
step 2 for that bank.

## 3. Phone alerts (once)

Settings → **Phone alerts**: install the free **ntfy** app, subscribe to the
topic shown, press **Send test**.

Optional: if you pay NatWest by standing order, enter the amount. You'll then
only hear from the app in months that need more.

## 4. Phone view (once)

Setup installs **Tailscale** on the PC; sign in when it opens. On the phone,
install Tailscale from the Play Store, sign in with the same account, then
open the link in **PHONE-LINK.txt** (also shown in Settings → Phone view) and
use Chrome's menu → **Add to Home screen**. It works from anywhere, and only
your own signed-in devices can reach it.

## What you'll get

- Two days before payday (the 28th, or the working day before): the exact
  amount to move to NatWest, covering every bill on its own date until the
  next payday.
- A same-day alert if a bill is missing, has gone up, or NatWest would run
  short before payday.
- Nothing otherwise.

## Monthly check (replaces the spreadsheet)

**Monthly check** in the sidebar, plus one phone summary each payday:

- **Bills check**: every NatWest payment, budgeted (what it took last month)
  vs actual, with differences. Under £2 is treated as minor. A payment above
  budget, or a new one, alerts you the day it happens.
- **Work expenses**: everything on the Nationwide credit card counts as work
  and is kept out of household spending. Repayments from your employer are
  matched automatically. You're alerted if anything is unpaid after 30 days.
- **Savings sweep**: what was left in Nationwide before payday, less a £250
  cushion and personal card spending, as an amount to move to savings.
- **Subscriptions** with yearly cost and price rises, **renewals** with a
  reminder 28 days before (add dates for monthly insurance, energy and
  broadband contracts), and **spending vs usual**.

All the defaults can be changed in Settings at the foot of that page.

## Without the bank connection

Download CSVs from NatWest and Nationwide online banking and drop them on the
**Import** page. Both banks' formats are recognised automatically.

## Where things are

- Data: `data\finance.db` (back it up from Settings → Data).
- Daily job log: `data\daily.log`.
- Run the daily job by hand: `npm run daily` in this folder.
