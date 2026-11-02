"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { setRenewalDateAction } from "@/actions/monthly";

/** Inline date picker for a contract's renewal; saves on change. */
export function RenewalDate({
  merchant,
  date,
}: {
  merchant: string;
  date: string | null;
}) {
  const router = useRouter();
  const [v, setV] = useState(date ?? "");
  const [pending, start] = useTransition();
  return (
    <input
      type="date"
      aria-label={`Renewal date for ${merchant}`}
      value={v}
      disabled={pending}
      onChange={(e) => {
        const next = e.target.value;
        setV(next);
        start(async () => {
          const r = await setRenewalDateAction({
            merchant,
            date: next || null,
          });
          if (!r.ok) return void toast.error(r.error);
          router.refresh();
        });
      }}
      className="h-7 rounded-control border border-line bg-transparent px-2 text-caption"
    />
  );
}
