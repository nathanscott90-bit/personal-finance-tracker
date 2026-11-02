import { z } from "zod";
import type { Db } from "@/lib/db/client";
import { getSetting, setSetting } from "@/lib/settings";

/** Whose money an account holds. */
export const OWNERS = ["joint", "p1", "p2"] as const;
export type Owner = (typeof OWNERS)[number];
export type Person = "p1" | "p2";

/**
 * The "whose money" filter on Transactions and Insights. `everyone` shows all
 * accounts, `joint` the shared ones, `p1`/`p2` one person's own accounts, and
 * `p1-joint`/`p2-joint` one person's own plus the shared ones.
 */
export const WHO = [
  "everyone",
  "joint",
  "p1",
  "p2",
  "p1-joint",
  "p2-joint",
] as const;
export type Who = (typeof WHO)[number];

/** The account owners a filter selects, or null for no filter. */
export function ownersFor(who: Who): Owner[] | null {
  switch (who) {
    case "everyone":
      return null;
    case "p1-joint":
      return ["p1", "joint"];
    case "p2-joint":
      return ["p2", "joint"];
    default:
      return [who];
  }
}

export type People = {
  p1: { name: string; login: string | null };
  p2: { name: string; login: string | null };
};

const KEY = "household.people";

export const DEFAULT_PEOPLE: People = {
  p1: { name: "Person 1", login: null },
  p2: { name: "Person 2", login: null },
};

const login = z
  .string()
  .trim()
  .max(120)
  .transform((v) => (v === "" ? null : v.toLowerCase()))
  .nullable()
  .optional()
  .transform((v) => v ?? null);

const person = z.object({
  name: z.string().trim().min(1).max(30),
  login,
});

export const peopleInput = z
  .object({ p1: person, p2: person })
  .refine((p) => !p.p1.login || p.p1.login !== p.p2.login, {
    message: "The two people need different Tailscale logins.",
  });

export function getPeople(db: Db): People {
  const stored = getSetting<unknown>(db, KEY, null);
  const parsed = peopleInput.safeParse(stored);
  return parsed.success ? parsed.data : DEFAULT_PEOPLE;
}

export function setPeople(db: Db, input: unknown): People | { error: string } {
  const parsed = peopleInput.safeParse(input);
  if (!parsed.success)
    return { error: parsed.error.issues[0]?.message ?? "Check the names." };
  setSetting(db, KEY, parsed.data);
  return parsed.data;
}

export function ownerLabel(people: People, owner: Owner): string {
  return owner === "joint" ? "Joint" : people[owner].name;
}

export function whoLabel(people: People, who: Who): string {
  switch (who) {
    case "everyone":
      return "Everyone";
    case "p1-joint":
      return `${people.p1.name} + joint`;
    case "p2-joint":
      return `${people.p2.name} + joint`;
    default:
      return ownerLabel(people, who);
  }
}

export function parseWho(v: string | null | undefined): Who {
  return (WHO as readonly string[]).includes(v ?? "") ? (v as Who) : "everyone";
}

/** Which person a Tailscale login belongs to, if either. */
export function personForLogin(
  people: People,
  loginName: string | null,
): Person | null {
  if (!loginName) return null;
  const l = loginName.toLowerCase();
  if (people.p1.login === l) return "p1";
  if (people.p2.login === l) return "p2";
  return null;
}
