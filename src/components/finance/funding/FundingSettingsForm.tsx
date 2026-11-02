"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { saveFundingSettingsAction } from "@/actions/funding";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MONEY_PLACEHOLDER } from "@/lib/locale";
import { parseAmountToCents } from "@/lib/money";

export function FundingSettingsForm({
  accounts,
  billsAccountId,
  bufferCents,
}: {
  accounts: { id: number; name: string }[];
  billsAccountId: number | null;
  bufferCents: number;
}) {
  const router = useRouter();
  const [account, setAccount] = useState(
    billsAccountId ? String(billsAccountId) : "",
  );
  const [buffer, setBuffer] = useState(
    bufferCents ? (bufferCents / 100).toFixed(2) : "",
  );
  const [pending, start] = useTransition();

  function save() {
    const cents = buffer.trim() === "" ? 0 : parseAmountToCents(buffer);
    if (!account || cents === null || cents < 0) {
      toast.error("Pick the bills account and a buffer of zero or more");
      return;
    }
    start(async () => {
      const r = await saveFundingSettingsAction({
        billsAccountId: Number(account),
        bufferCents: cents,
      });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success("Bills account saved");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-end gap-3">
      <label
        htmlFor="funding-account"
        className="grid gap-1 text-caption text-ink-2"
      >
        Bills account
        <select
          id="funding-account"
          value={account}
          onChange={(e) => setAccount(e.target.value)}
          className="h-8 w-56 rounded-control border border-line bg-transparent px-2.5 text-body"
        >
          <option value="">Choose…</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </label>
      <label
        htmlFor="funding-buffer"
        className="grid gap-1 text-caption text-ink-2"
      >
        Buffer (optional)
        <Input
          id="funding-buffer"
          inputMode="decimal"
          placeholder={MONEY_PLACEHOLDER}
          value={buffer}
          onChange={(e) => setBuffer(e.target.value)}
          className="w-32"
        />
      </label>
      <Button onClick={save} disabled={pending}>
        {pending ? "Saving…" : "Save"}
      </Button>
    </div>
  );
}
