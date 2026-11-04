"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

/** Pages that share one menu entry, shown as tabs along the top. */
const GROUPS = {
  todo: [
    { href: "/review", label: "Review" },
    { href: "/weekly", label: "Weekly review" },
    { href: "/check", label: "Monthly check" },
  ],
  budget: [
    { href: "/budget", label: "Budget" },
    { href: "/goals", label: "Goals" },
  ],
  networth: [
    { href: "/networth", label: "Net worth" },
    { href: "/debt", label: "Debt" },
  ],
} as const;

export function SectionTabs({ group }: { group: keyof typeof GROUPS }) {
  const path = usePathname();
  return (
    <nav aria-label="Section" className="mb-6 flex gap-1">
      {GROUPS[group].map((t) => {
        const active = path.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "rounded-pill px-4 py-1.5 text-caption font-medium transition-colors",
              active
                ? "bg-accent text-white"
                : "bg-subtle text-ink-2 hover:text-ink",
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
