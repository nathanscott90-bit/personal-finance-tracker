"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/**
 * "Whose money" select for pages with a `who` query param. Other params on
 * the URL are kept, so it composes with the month and average pickers.
 */
export function WhoPicker({ people }: { people: { p1: string; p2: string } }) {
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  return (
    <select
      aria-label="Whose money"
      className="h-9 rounded-control border border-line bg-card px-3 text-body text-ink"
      value={sp.get("who") ?? ""}
      onChange={(e) => {
        const next = new URLSearchParams(sp.toString());
        if (e.target.value) next.set("who", e.target.value);
        else next.delete("who");
        router.push(`${path}?${next.toString()}`);
      }}
    >
      <option value="">Everyone</option>
      <option value="joint">Joint</option>
      <option value="p1">{people.p1}</option>
      <option value="p1-joint">{people.p1} + joint</option>
      <option value="p2">{people.p2}</option>
      <option value="p2-joint">{people.p2} + joint</option>
    </select>
  );
}
