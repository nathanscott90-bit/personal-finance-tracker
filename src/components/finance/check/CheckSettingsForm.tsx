"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { saveCheckSettingsAction } from "@/actions/monthly";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { parseAmountToCents } from "@/lib/money";

type Acct = { id: number; name: string; type: string };

const pounds = (c: number) => (c / 100).toFixed(2);

function Pick({
  id,
  label,
  value,
  onChange,
  options,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Acct[];
}) {
  return (
    <label htmlFor={id} className="grid gap-1 text-caption text-ink-2">
      {label}
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 w-56 rounded-control border border-line bg-transparent px-2.5 text-body"
      >
        <option value="">Automatic</option>
        {options.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
      </select>
    </label>
  );
}

export function CheckSettingsForm(p: {
  accounts: Acct[];
  cardAccountId: number | null;
  allOnCardIsWork: boolean;
  savingsAccountId: number | null;
  mainAccountId: number | null;
  cushionCents: number;
  toleranceCents: number;
}) {
  const router = useRouter();
  const [card, setCard] = useState(
    p.cardAccountId ? String(p.cardAccountId) : "",
  );
  const [allWork, setAllWork] = useState(p.allOnCardIsWork);
  const [saver, setSaver] = useState(
    p.savingsAccountId ? String(p.savingsAccountId) : "",
  );
  const [main, setMain] = useState(
    p.mainAccountId ? String(p.mainAccountId) : "",
  );
  const [cushion, setCushion] = useState(pounds(p.cushionCents));
  const [tol, setTol] = useState(pounds(p.toleranceCents));
  const [pending, start] = useTransition();
  const num = (v: string) => (v ? Number(v) : null);
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-end gap-4">
        <Pick
          id="ck-card"
          label="Work card"
          value={card}
          onChange={setCard}
          options={p.accounts.filter((a) => a.type === "credit")}
        />
        <label className="flex items-center gap-2 pb-1.5 text-caption text-ink-2">
          <input
            type="checkbox"
            checked={allWork}
            onChange={(e) => setAllWork(e.target.checked)}
          />
          Everything on it is work
        </label>
      </div>
      <div className="flex flex-wrap items-end gap-4">
        <Pick
          id="ck-main"
          label="Main account"
          value={main}
          onChange={setMain}
          options={p.accounts.filter((a) => a.type === "checking")}
        />
        <Pick
          id="ck-saver"
          label="Savings account"
          value={saver}
          onChange={setSaver}
          options={p.accounts.filter(
            (a) => a.type === "savings" || a.type === "investment",
          )}
        />
        <label
          htmlFor="ck-cushion"
          className="grid gap-1 text-caption text-ink-2"
        >
          Keep in main account
          <Input
            id="ck-cushion"
            inputMode="decimal"
            value={cushion}
            onChange={(e) => setCushion(e.target.value)}
            className="w-28"
          />
        </label>
        <label htmlFor="ck-tol" className="grid gap-1 text-caption text-ink-2">
          Ignore bill differences up to
          <Input
            id="ck-tol"
            inputMode="decimal"
            value={tol}
            onChange={(e) => setTol(e.target.value)}
            className="w-28"
          />
        </label>
      </div>
      <div>
        <Button
          disabled={pending}
          onClick={() =>
            start(async () => {
              const c = parseAmountToCents(cushion);
              const t = parseAmountToCents(tol);
              if (c === null || t === null || c < 0 || t < 0)
                return void toast.error("Check the amounts");
              const r = await saveCheckSettingsAction({
                cardAccountId: num(card),
                allOnCardIsWork: allWork,
                savingsAccountId: num(saver),
                mainAccountId: num(main),
                cushionCents: c,
                toleranceCents: t,
              });
              if (!r.ok) return void toast.error(r.error);
              toast.success("Saved");
              router.refresh();
            })
          }
        >
          {pending ? "Saving…" : "Save"}
        </Button>
      </div>
    </div>
  );
}
