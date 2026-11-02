"use client";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { type ClaudeView, setClaudeAccessAction } from "@/actions/claude";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { ClaudeAccess } from "@/lib/claude/tools";

const OPTIONS: { value: ClaudeAccess; label: string; note: string }[] = [
  { value: "off", label: "Off", note: "Claude sees nothing." },
  {
    value: "summaries",
    label: "Summaries",
    note: "Monthly totals, categories, bills, balances and net worth.",
  },
  {
    value: "transactions",
    label: "Summaries and transactions",
    note: "Also individual payments: date, merchant, amount, category.",
  },
];

export function ClaudeCard({ view }: { view: ClaudeView }) {
  const [pending, start] = useTransition();
  // Shown straight away; put back if the save fails.
  const [access, setAccess] = useState(view.access);
  const choose = (v: ClaudeAccess) => {
    const before = access;
    setAccess(v);
    start(async () => {
      const r = await setClaudeAccessAction(v);
      if (!r.ok) {
        setAccess(before);
        toast.error(r.error);
      } else toast.success("Claude access updated");
    });
  };
  const copy = () => {
    if (!navigator.clipboard) {
      toast.error("Copy failed — select the text and copy it");
      return;
    }
    navigator.clipboard.writeText(view.config).then(
      () => toast.success("Config copied"),
      () => toast.error("Copy failed"),
    );
  };
  return (
    <Card>
      <h2 className="mb-1 text-headline font-semibold">Claude</h2>
      <p className="mb-3 text-caption text-ink-2">
        Lets Claude Desktop on this PC answer questions such as &ldquo;where did
        our money go in October?&rdquo; It can only read, never change anything,
        and never sees account numbers or raw bank text. What it reads is sent
        to Anthropic to produce the answer, so choose how much.
      </p>
      <fieldset className="mb-4 grid gap-2" aria-label="Claude access">
        {OPTIONS.map((o) => (
          <label
            key={o.value}
            className="flex items-start gap-2 text-caption text-ink-2"
          >
            <input
              type="radio"
              name="claude-access"
              className="mt-0.5"
              checked={access === o.value}
              disabled={pending}
              onChange={() => choose(o.value)}
            />
            <span>
              <b className="font-medium text-ink">{o.label}</b> — {o.note}
            </span>
          </label>
        ))}
      </fieldset>
      <p className="mb-2 text-caption text-ink-2">
        To connect: Claude Desktop → Settings → Developer → Edit Config, paste
        this into the file (merge with anything already there), save, and
        restart Claude.
      </p>
      <pre className="mb-2 max-h-56 overflow-auto rounded-control border border-line bg-subtle p-3 text-micro">
        {view.config}
      </pre>
      <Button variant="outline" size="sm" onClick={copy}>
        Copy config
      </Button>
    </Card>
  );
}
