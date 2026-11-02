# Security policy

## Reporting a vulnerability

Please **do not open a public issue** for security problems. Report them
privately through the repository's **Security → Report a vulnerability**
page on GitHub.

Include what you found, how to reproduce it, and what an attacker could do with
it. Use made-up data in any proof of concept. You should get a first response
within a week. Once a fix is released, you'll be credited in the advisory
unless you'd rather not be.

## Supported versions

Only the latest commit on `main` is supported. There are no release branches.

## Threat model, in short

- The app is meant to run on your own machine for one household and has **no
  login of its own**. It listens on `127.0.0.1` and is reached from other
  devices through Tailscale Serve (`docs/HOUSEHOLD.md`). Anyone who can reach
  its port can read and change everything; serving it on a network without
  an authenticating layer is a configuration issue, not a vulnerability.
- The activity log's names come from Tailscale Serve headers. Spoofing them
  from the PC itself is out of scope; spoofing them from another device while
  the app listens on loopback **is** in scope.
- The Claude connector (`scripts/mcp.ts`) must stay read-only and must never
  return account numbers, raw bank descriptions or credentials. Anything that
  breaks either **is** in scope. So is anything that lets an off-PC backup be
  read without its passphrase.
- The wall display endpoints (`/wall`, `/api/wall`) are protected by a display
  token and deliberately expose only a summary. Anything that lets that token
  read or change more than the summary **is** in scope.
- Also in scope: anything that leaks data from `data/finance.db` or the
  SimpleFIN access URL, or that lets a crafted CSV/OFX file or SimpleFIN
  response run code or write outside the database.
