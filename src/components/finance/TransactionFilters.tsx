"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";

type Opt = { id: number; name: string };
type LeafOpt = Opt & { parentId: number | null };

/**
 * One dropdown drives two query params: a leaf sets `category`, a
 * "Food (all)" entry sets `group` (any leaf under that parent). The two are
 * exclusive, so choosing one clears the other.
 */
const GROUP_PREFIX = "g";
function categoryValue(sp: URLSearchParams): string {
  const group = sp.get("group");
  if (group) return `${GROUP_PREFIX}${group}`;
  return sp.get("category") ?? "";
}

export function TransactionFilters({
  accounts,
  categories,
  groups = [],
  people,
}: {
  accounts: Opt[];
  categories: LeafOpt[];
  /** Groups to offer as "(all)" entries; each precedes its own leaves. */
  groups?: Opt[];
  /** Household names; when given, a "whose money" select is shown. */
  people?: { p1: string; p2: string };
}) {
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  const spRef = useRef(sp);
  spRef.current = sp;
  const [q, setQ] = useState(sp.get("q") ?? "");

  const setMany = useCallback(
    (patch: Record<string, string>) => {
      const next = new URLSearchParams(spRef.current.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v) next.set(k, v);
        else next.delete(k);
      }
      router.replace(`${path}?${next.toString()}`);
    },
    [router, path],
  );
  const set = useCallback(
    (k: string, v: string) => setMany({ [k]: v }),
    [setMany],
  );
  const setCategory = (v: string) => {
    if (v.startsWith(GROUP_PREFIX))
      setMany({ group: v.slice(GROUP_PREFIX.length), category: "" });
    else setMany({ category: v, group: "" });
  };

  const grouped = groups.map((g) => ({
    group: g,
    leaves: categories.filter((c) => c.parentId === g.id),
  }));
  const ungrouped = categories.filter(
    (c) => !groups.some((g) => g.id === c.parentId),
  );

  useEffect(() => {
    const t = setTimeout(() => {
      if ((spRef.current.get("q") ?? "") !== q) set("q", q);
    }, 250);
    return () => clearTimeout(t);
  }, [q, set]);

  const sel =
    "h-10 rounded-control border border-line bg-card px-3 text-body text-ink";
  return (
    <div className="mb-4 flex flex-wrap items-center gap-3">
      <Input
        className="h-10 w-64 rounded-control bg-card"
        placeholder="Search merchants…"
        value={q}
        maxLength={80}
        onChange={(e) => setQ(e.target.value)}
      />
      {people && (
        <select
          className={sel}
          aria-label="Whose money"
          value={sp.get("who") ?? ""}
          onChange={(e) => set("who", e.target.value)}
        >
          <option value="">Everyone</option>
          <option value="joint">Joint</option>
          <option value="p1">{people.p1}</option>
          <option value="p1-joint">{people.p1} + joint</option>
          <option value="p2">{people.p2}</option>
          <option value="p2-joint">{people.p2} + joint</option>
        </select>
      )}
      <select
        className={sel}
        value={sp.get("account") ?? ""}
        onChange={(e) => set("account", e.target.value)}
      >
        <option value="">All accounts</option>
        {accounts.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
      </select>
      <select
        className={sel}
        value={categoryValue(sp)}
        onChange={(e) => setCategory(e.target.value)}
      >
        <option value="">All categories</option>
        {grouped.map(({ group, leaves }) => (
          <optgroup key={group.id} label={group.name}>
            <option value={`${GROUP_PREFIX}${group.id}`}>
              {group.name} (all)
            </option>
            {leaves.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </optgroup>
        ))}
        {ungrouped.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      <input
        type="date"
        className={sel}
        value={sp.get("from") ?? ""}
        onChange={(e) => set("from", e.target.value)}
      />
      <span className="text-ink-3">–</span>
      <input
        type="date"
        className={sel}
        value={sp.get("to") ?? ""}
        onChange={(e) => set("to", e.target.value)}
      />
    </div>
  );
}
