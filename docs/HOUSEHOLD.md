# Household access

How both of you use the app from your own phones and laptops, how it knows
which of you made a change, and how the data is
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

## 4. Backups

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

## 5. Without Tailscale

To serve the home network directly instead, start the app with
`FINANCE_HOST=0.0.0.0` (launcher) or `-H 0.0.0.0` (task) and allow port 3000
for private networks in Windows Firewall. Anyone on your Wi-Fi can then open
the app, and the activity log shows everyone as "This PC". Never forward port
3000 on your router.
