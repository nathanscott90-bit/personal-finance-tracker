"use client";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { type AccountInput, deleteAccount } from "@/actions/accounts";
import { AccountForm } from "@/components/finance/AccountForm";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { AccountDependents } from "@/lib/accounts/dependents";
import type { Owner } from "@/lib/household/people";

export type AccountCardProps = {
  account: {
    id: number;
    name: string;
    type: AccountInput["type"];
    institution: string | null;
    color: string;
    owner: Owner;
    txnCount: number;
    dependents: AccountDependents;
  };
  people: { p1: string; p2: string };
};

function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

/** What the confirm names besides the account itself. */
export function deleteConfirmText(name: string, d: AccountDependents): string {
  const extras: string[] = [];
  if (d.snapshots) extras.push(`its ${plural(d.snapshots, "stored balance")}`);
  if (d.rules) extras.push(`${plural(d.rules, "rule")} scoped to it`);
  return extras.length
    ? `Delete "${name}"? This also removes ${extras.join(", ")}.`
    : `Delete "${name}"?`;
}

const ownerName = (people: AccountCardProps["people"], owner: Owner) =>
  owner === "joint" ? "Joint" : people[owner];

export function AccountCard({ account, people }: AccountCardProps) {
  const [editing, setEditing] = useState(false);
  const [pending, start] = useTransition();
  const canDelete = account.txnCount === 0;

  if (editing)
    return (
      <Card>
        <h2 className="mb-4 text-headline font-semibold">Edit account</h2>
        <AccountForm
          id={account.id}
          initial={{
            name: account.name,
            type: account.type,
            institution: account.institution ?? "",
            color: account.color,
            owner: account.owner,
          }}
          people={people}
          onDone={() => setEditing(false)}
          onCancel={() => setEditing(false)}
        />
      </Card>
    );

  return (
    <Card className="flex items-center gap-4">
      <span
        className="size-10 rounded-pill"
        style={{ backgroundColor: account.color }}
      />
      <div className="flex-1">
        <div className="text-headline font-semibold">{account.name}</div>
        <div className="text-caption text-ink-2">
          {account.institution ?? "—"} · {account.type} ·{" "}
          {ownerName(people, account.owner)}
        </div>
      </div>
      <div className="tnum text-caption text-ink-2">
        {plural(account.txnCount, "transaction")}
      </div>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setEditing(true)}
        disabled={pending}
      >
        Edit
      </Button>
      <Button
        variant="destructive"
        size="sm"
        disabled={!canDelete || pending}
        title={
          canDelete
            ? undefined
            : `Has ${plural(account.txnCount, "transaction")}`
        }
        onClick={() => {
          if (
            !window.confirm(deleteConfirmText(account.name, account.dependents))
          )
            return;
          start(async () => {
            const r = await deleteAccount(account.id);
            if (!r.ok) toast.error(r.error);
            else toast.success("Account deleted");
          });
        }}
      >
        Delete
      </Button>
    </Card>
  );
}
