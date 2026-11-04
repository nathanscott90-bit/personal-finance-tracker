"use client";
import {
  CalendarClock,
  CircleDollarSign,
  House,
  Landmark,
  LineChart,
  ListChecks,
  PieChart,
  Receipt,
  Settings,
  TrendingUp,
  Upload,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

/**
 * `href` is where the entry goes; `match` lists every page that belongs to it,
 * so it stays highlighted on a tab (To do = Review, Weekly review and Monthly
 * check; Budget = Budget and Goals; Net worth = Net worth and Debt).
 */
const items = [
  { href: "/home", label: "Home", icon: House, match: ["/home"] },
  {
    href: "/review",
    label: "To do",
    icon: ListChecks,
    match: ["/review", "/weekly", "/check"],
  },
  {
    href: "/insights",
    label: "Insights",
    icon: PieChart,
    match: ["/insights"],
  },
  { href: "/bills", label: "Bills", icon: CalendarClock, match: ["/bills"] },
  {
    href: "/budget",
    label: "Budget",
    icon: Wallet,
    match: ["/budget", "/goals"],
  },
  {
    href: "/networth",
    label: "Net worth",
    icon: TrendingUp,
    match: ["/networth", "/debt"],
  },
  {
    href: "/forecast",
    label: "Forecast",
    icon: LineChart,
    match: ["/forecast"],
  },
  {
    href: "/transactions",
    label: "Transactions",
    icon: Receipt,
    match: ["/transactions"],
  },
  {
    href: "/accounts",
    label: "Accounts",
    icon: Landmark,
    match: ["/accounts"],
  },
  { href: "/import", label: "Import", icon: Upload, match: ["/import"] },
  {
    href: "/settings",
    label: "Settings",
    icon: Settings,
    match: ["/settings"],
  },
];

export function Sidebar({
  reviewCount,
  reviewDue,
  actorName,
}: {
  /** Transactions waiting in the Review queue. */
  reviewCount: number;
  /** This week's review has not been done. */
  reviewDue: boolean;
  /** Who this request is from (a household name, or "This PC"). */
  actorName?: string;
}) {
  const path = usePathname();
  return (
    <aside className="flex h-screen w-60 shrink-0 flex-col gap-1 border-r border-line bg-canvas px-3 py-6">
      <div className="mb-6 flex items-center gap-2 px-3 text-headline font-semibold">
        <CircleDollarSign className="size-6 text-accent" />
        Finance
      </div>
      {items.map(({ href, label, icon: Icon, match }) => {
        const active = match.some((m) => path.startsWith(m));
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex items-center gap-3 rounded-control px-3 py-2 text-body font-medium text-ink-2 transition-colors hover:bg-subtle",
              active && "bg-card text-ink shadow-card",
            )}
          >
            <Icon className="size-5" />
            {label}
            {href === "/review" &&
              (reviewCount > 0 ? (
                <span className="tnum ml-auto rounded-pill bg-warning px-2 py-0.5 text-micro font-semibold text-white">
                  {reviewCount > 99 ? "99+" : reviewCount}
                </span>
              ) : (
                reviewDue && (
                  <span
                    role="img"
                    aria-label="Weekly review due"
                    className="ml-auto size-2 rounded-pill bg-accent"
                  />
                )
              ))}
          </Link>
        );
      })}
      {actorName && (
        <div className="mt-auto px-3 pt-4 text-micro text-ink-3">
          Using as <span className="font-medium text-ink-2">{actorName}</span>
        </div>
      )}
    </aside>
  );
}
