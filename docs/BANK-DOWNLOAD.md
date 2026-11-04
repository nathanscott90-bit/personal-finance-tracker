# Bank download

UK banks do not offer a free way for a household to connect an app to its own
accounts (the automatic route needs a regulated provider, and the one this app
first used does not cover the UK). So you do the one thing only you can do,
logging in, and the app does the rest.

## What happens

`npm run bank` (the **Bank download** shortcut) opens an ordinary Chrome window
at NatWest and Nationwide. You log in as you always do, including the phone
approval, and download your transactions as CSV. The app picks up each CSV/OFX
file you download and imports it through the same pipeline as the Import page:
bank format detection, de-duplication, transfer detection between your own
accounts, rules, bills and balances.

- **Your login never touches the app.** It does not type or store usernames,
  passwords or approval codes, and it does not click anything for you.
- **Chrome is started as a normal program**, then attached to, so the bank sees
  a normal browser rather than an automation tool.
- **Nothing you download is lost.** Statements go to `data\inbox\`; other files
  (a PDF statement) go to `data\inbox\other\` and are not imported.
- **Which account is which.** The first time a bank account appears, you are
  asked which of your accounts it is (or to add it). The app recognises it by
  the account line in Nationwide files, the account number in NatWest files,
  or the account id in OFX, and remembers. Account numbers are never shown in
  full.
- **Safe to repeat.** Dates you already have are skipped; an identical file is
  recognised. Every import takes a database snapshot first (`data\backups`),
  and `npm run bank -- --undo` removes everything imported in the last session.

## Each time (about two minutes)

1. Double-click **Bank download**.
2. Log in at each bank.
3. For each account: Download / Export transactions → CSV → dates → download.
4. Press Enter in the black window.

Once a week is plenty. If it has been a week, the phone alert asks you to. The
bills check will not call a bill "missing" while the data is more than three
days old, so a late download does not cause false alarms.

## Options

```
npm run bank                  NatWest and Nationwide
npm run bank -- natwest       one bank (natwest | nationwide | any https address)
npm run bank -- --forget      delete the saved Chrome profile and its cookies
npm run bank -- --undo        undo everything imported in the last session
npm run bank -- --reset-accounts   forget which account each bank account is
```

Picked the wrong account by mistake? Run `--undo`, then `--reset-accounts`, and
download again.

- The Chrome profile lives in `data\browser-profile` so the bank can recognise
  the PC and ask for fewer approvals. `--forget` removes it.
- Chrome is preferred; Edge is used only if Chrome is not installed. Set
  `FINANCE_BROWSER` to a browser's .exe to choose another.

## Things to know

- **Check your bank's terms.** This only reads your own accounts, in your own
  session, by downloading the files the bank offers. Some banks' terms
  discourage automated tools; a download you trigger yourself is the mildest
  version, but it is your call.
- **While the window is open**, Chrome listens for the app on a random port
  that only this PC can reach. Anything running on the PC could, in theory,
  use it, so close the window when you are done (pressing Enter does).
- **Bank websites change.** The download step is yours, so a redesign cannot
  break it. If a bank changes its file layout, import one file on the Import
  page and the app learns the new layout.
- If NatWest or Nationwide ever stops offering CSV/OFX downloads, this route
  stops too.

## If a file does not import

- "Could not read any transactions": a new layout. Import it once on the
  Import page and map the columns.
- "This file mixes several accounts": download one account at a time.
- "Could not capture that download": download it again, or save it and use
  the Import page.
