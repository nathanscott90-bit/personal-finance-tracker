# Finance — UK setup (Windows)

Runs on your PC, for both of you. Your data never leaves it, apart from the
alerts sent to your phones and encrypted backups to a folder you choose. Bank
data comes from statements you download yourself while logged in to your bank.

## 1. Install (once, ~5 minutes)

1. Unzip this folder somewhere permanent, e.g. `Documents\Finance`.
2. Double-click **setup.cmd**. It installs Node.js if needed, builds the
   app, adds **Finance** and **Bank download** shortcuts to the desktop, schedules a daily job
   (alerts and backup) at 07:30 (or as soon as the PC is next on), keeps the PC awake on mains
   power and installs Tailscale.
3. Sign in to Tailscale when it opens, then run **setup.cmd** once more. It
   needs your tailnet's name to finish phone access.

## 2. Bring in your bank data (weekly, about two minutes)

Double-click **Bank download** on the desktop.

1. Chrome opens at NatWest and Nationwide. Log in as you normally do,
   including the approval on your phone. The app never sees or stores your
   login.
2. For each account: **Download / Export transactions** → **CSV** → pick the
   dates → download. Each file is imported as it arrives.
3. The first time for each account you are asked which account in the app it
   is (or to add it as a new one). After that it remembers.
4. Press **Enter** in the black window when you have finished.

Downloading dates you already have is safe: repeats are skipped. You get a
phone alert if it has been a week. Details: docs/BANK-DOWNLOAD.md.

## 3. Phone alerts (once)

Settings → **Phone alerts**: install the free **ntfy** app, subscribe to the
topic shown, press **Send test**.

Optional: if you pay NatWest by standing order, enter the amount. You'll then
only hear from the app in months that need more.

## 4. Phones and laptops, for both of you (once)

1. In the Tailscale admin console (login.tailscale.com): **DNS** → turn on
   **MagicDNS** and **HTTPS Certificates**; **Users** → invite your partner.
2. On each phone: install Tailscale, sign in (each with your own account),
   open the link in **PHONE-LINK.txt**, then Chrome's menu → **Add to Home
   screen**. Both of you subscribe to the ntfy topic for alerts.
3. In **Settings → People**, enter both names. On each person's phone,
   press **That's me**.
4. In **Accounts**, mark each account **Joint** or as one person's own.

## 5. Off-PC backup (once, 2 minutes)

**Settings → Off-PC backup**: choose a folder inside OneDrive or Google Drive
(e.g. `C:\Users\you\OneDrive\Finance backups`) and a passphrase. Save the
passphrase in a password manager you both can open. A backup is then written
every day; restore with `npm run restore -- <file>` (see docs/HOUSEHOLD.md).

## 6. Claude (optional)

**Settings → Claude** lets Claude Desktop on this PC answer questions about
your money, read-only. Off until you choose. See docs/CLAUDE-CONNECTOR.md.

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

## Where things are

- Data: `data\finance.db`. Encrypted copies go to your Off-PC backup folder.
- Daily job log: `data\daily.log`.
- Run the daily job by hand: `npm run daily` in this folder.
