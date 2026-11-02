import type { Db } from "@/lib/db/client";
import { getPeople, type Person, personForLogin } from "./people";

/**
 * Who is making this request. Tailscale Serve adds `Tailscale-User-Login`
 * and `Tailscale-User-Name` to every request it proxies from a signed-in
 * tailnet user. The app only listens on 127.0.0.1 (see scripts/app.mjs and
 * setup-windows.ps1), so other machines can reach it only through Serve and
 * cannot set these headers themselves. A request with no header came from
 * the desktop's own browser.
 *
 * This names people in the activity log; it is not a login. Anyone on the
 * PC itself, or any local program, could send the headers.
 */
export type Actor = {
  /** Display name: the household name if the login is mapped, else Tailscale's name. */
  name: string;
  login: string | null;
  person: Person | null;
};

export const THIS_PC = "This PC";

type HeaderSource = { get(name: string): string | null };

/** Tailscale sends non-ASCII names percent-encoded with a `=?utf-8?q?` wrapper on some versions; keep it readable either way. */
function cleanName(v: string | null): string | null {
  if (!v) return null;
  const t = v.trim();
  if (t === "") return null;
  try {
    return decodeURIComponent(t).slice(0, 60);
  } catch {
    return t.slice(0, 60);
  }
}

export function actorFromHeaders(db: Db, h: HeaderSource): Actor {
  const login = h.get("tailscale-user-login")?.trim().toLowerCase() || null;
  if (!login) return { name: THIS_PC, login: null, person: null };
  const people = getPeople(db);
  const person = personForLogin(people, login);
  const name = person
    ? people[person].name
    : (cleanName(h.get("tailscale-user-name")) ?? login);
  return { name, login, person };
}
