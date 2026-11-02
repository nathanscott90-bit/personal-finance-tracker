# Household access

How both of you use the app from your own phones and laptops, how it knows
which of you made a change, how a wall display reads it, and how the data is
kept safe if the PC dies.

**The shape of it.** The app runs on the desktop PC and only listens on
`127.0.0.1:3000`. Tailscale Serve publishes it at
`https://<pc-name>.<tailnet>.ts.net`, reachable only by devices signed in to
your tailnet. Serve tells the app who is asking, so changes are logged by
name. Nothing is opened to the internet, there is no port forwarding and no
domain to buy.

`setup.cmd` does most of this. The steps below say what it does and what only
you can do.

---

## 1. The PC is the server

- `setup.cmd` registers a **Finance server** task that starts the app at login
  and restarts it if it stops, and sets the PC not to sleep on mains power
  (`powercfg`). The screen can still turn off.
- If the PC is off, neither of you can reach the app. If that becomes a
  nuisance, the cleanest fix is a small always-on mini PC (any £150–£250
  Intel N100 box running Windows 11 works): copy the folder across, run
  `setup.cmd`, done. A rented cloud server would also work but puts the data
  on someone else's hardware, which this app is designed to avoid.

## 2. Tailscale

1. On the PC: setup installs Tailscale. Sign in when it opens, then run
   `setup.cmd` again so it can finish (it needs your tailnet's name).
2. In the Tailscale admin console (login.tailscale.com):
   - **DNS**: turn on **MagicDNS** and **HTTPS Certificates** (Serve needs
     both).
   - **Users → Invite users**: invite your partner by email. They sign in
     with their own account, which is what lets the app tell you apart. The
     free Personal plan covers this.
3. On each phone or laptop: install Tailscale, sign in, open the address in
   `PHONE-LINK.txt`, and add it to the home screen.

Setup runs `tailscale serve --bg --https=443 http://127.0.0.1:3000` and writes
the address to `.env.local` as `FINANCE_PUBLIC_HOST`. The app uses it for
links and to accept forms posted from that address.

Check it: from a phone with Tailscale **off**, the address should not load.
With it on, it should, and the sidebar should say "Using as <your name>" once
step 3 is done.

## 3. People, owners and the activity log

**Settings → People**: name the two of you. From each person's own device,
press **That's me** so their Tailscale login is matched to their name.

**Accounts**: mark each account **Joint**, or as one person's own.
Transactions and Insights then get a **whose money** filter: everyone, joint,
one person, or one person plus joint.

**Settings → Recent activity** lists changes made in the app and who made
them. "This PC" means the desktop's own browser.

What it is and is not: the names come from Tailscale Serve's
`Tailscale-User-Login` header. Because the app listens only on loopback,
another device cannot fake that header. A program running on the PC itself
could, so treat the log as a household convenience, not a security control.
Both of you can see and change everything; there are no per-person
permissions.

## 4. Wall display (optional)

A kiosk browser cannot sign in to anything, so `/wall` and `/api/wall` are
guarded by a **display token** instead.

1. The display device needs Tailscale too (a spare tablet or a Raspberry Pi
   signed in to your tailnet; a tagged device is fine).
2. **Settings → Wall display → Generate token**. The token and an enrollment
   link are shown **once**. If the link says `localhost`, swap that part for
   your `https://<pc>.<tailnet>.ts.net` address and keep `?token=…` as is.
3. Open the link once in the display's browser. It sets a long-lived,
   httpOnly cookie and lands on `/wall`, which refreshes every 5 minutes.
4. Clear the kiosk browser's history afterwards (the link contains the
   token), or rotate the token if the link was shared.

**Rotate** issues a new token and cuts off every enrolled display and the
hub; re-enrol them. **Revoke** cuts them off with no replacement.

## 5. The hub contract

A separate dashboard can read one endpoint, server-side, from a machine on
your tailnet:

```
GET https://<pc>.<tailnet>.ts.net/api/wall
Authorization: Bearer <the display token>
```

- `200` with the JSON below, `Cache-Control: no-store`.
- `401` `{ "ok": false, "error": "Not enrolled." }` when the token is missing
  or wrong.
- Poll every **60–300 seconds**. There is no push and no CORS header: call it
  from the hub's server, not from its browser code.
- Keep the token in the hub's secret store.

The payload (the `WallSummary` type in `src/lib/wall/types.ts`; integer cents,
dates `YYYY-MM-DD`):

```ts
type WallSummary = {
  generatedAt: string; // ISO time
  today: string; // YYYY-MM-DD
  gateOpen: boolean; // the budget gate: false until 2 complete months of data
  safeToSpend: {
    perDayCents: number;
    totalCents: number;
    untilDate: string; // next payday or month end
    horizonLabel: "until payday" | "until month end";
  } | null;
  bills: {
    due: {
      name: string;
      cents: number;
      expectedDate: string;
      overdue: boolean;
      categoryColor: string | null;
    }[];
    dueTotalCents: number;
  };
  review: { count: number; streakWeeks: number; weeklyDue: boolean };
  budget: {
    month: string;
    spentCents: number;
    budgetedCents: number;
    elapsedShare: number;
  } | null;
  nextPlanned: { name: string; cents: number; date: string } | null;
  alerts: { count: number };
};
```

`safeToSpend` and `budget` are `null` while the budget gate is closed or the
month has no budget; `gateOpen` tells the two apart, so a display can say
"unlocks after 2 months of data" rather than "no budget this month". Every number comes from the same loaders the app's own
Home, Budget, Bills and weekly review screens use, so the wall can never
disagree with the app. No transactions, balances or account names are exposed;
bill `name`s are merchant names.

## 6. Backups

Two layers, both automatic once set up:

1. **Local snapshots.** Every import copies the database to `data\backups\`
   first (newest 20 kept). `npm run backup` makes one by hand. These protect
   against a bad import, not against losing the PC.
2. **Off-PC, encrypted.** **Settings → Off-PC backup**: choose a folder your
   cloud drive syncs (OneDrive, Google Drive, Dropbox) or a USB disk, and a
   passphrase of 12+ characters. The daily job (07:30) then writes an
   encrypted `.finbak` there at most once a day and keeps the newest N.
   **Back up now** runs one immediately. The cloud provider only ever holds
   ciphertext (AES-256-GCM, key from the passphrase via scrypt).

   **Store the passphrase in a password manager both of you can reach.**
   Without it the backups cannot be opened, by you or anyone.

**Restoring on a new PC:** copy the Finance folder, run `setup.cmd`, then

```
npm run restore -- "C:\path\to\finance-20261101-073000.finbak"
```

That writes `data\restored-<time>.db` for you to inspect. To use it, stop the
app (end the **Finance server** task in Task Scheduler) and run the same
command with `--replace`: it saves the current database to `data\backups\`
first, then swaps the restored one in. The passphrase can also come from
`FINANCE_BACKUP_PASSPHRASE`.

**Never put `data\finance.db` itself in a synced folder.** SQLite keeps
`-wal` and `-shm` files open while the app runs; a sync client copying them
mid-write corrupts the database. Sync the encrypted backups only.

## 7. Without Tailscale

To serve the home network directly instead, start the app with
`FINANCE_HOST=0.0.0.0` (launcher) or `-H 0.0.0.0` (task) and allow port 3000
for private networks in Windows Firewall. Anyone on your Wi-Fi can then open
the app, and the activity log shows everyone as "This PC". Never forward port
3000 on your router.
