"use client";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { savePeopleAction } from "@/actions/household";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { People } from "@/lib/household/people";

/**
 * The two people in the household, and the Tailscale login each signs in
 * with, so accounts can be marked as theirs and the activity log can say who
 * changed what.
 */
export function PeopleCard({
  people,
  you,
}: {
  people: People;
  /** The Tailscale login of whoever has this page open, if any. */
  you: { login: string | null; name: string };
}) {
  const [form, setForm] = useState({
    p1: { name: people.p1.name, login: people.p1.login ?? "" },
    p2: { name: people.p2.name, login: people.p2.login ?? "" },
  });
  const [pending, start] = useTransition();
  const set = (who: "p1" | "p2", k: "name" | "login", v: string) =>
    setForm((f) => ({ ...f, [who]: { ...f[who], [k]: v } }));
  const save = () =>
    start(async () => {
      const r = await savePeopleAction(form);
      if (!r.ok) toast.error(r.error);
      else toast.success("Household saved");
    });
  const row = (who: "p1" | "p2", label: string) => (
    <div className="grid gap-2 sm:grid-cols-[1fr_1.4fr_auto] sm:items-end">
      <label
        htmlFor={`people-${who}-name`}
        className="grid gap-1 text-caption text-ink-2"
      >
        {label}
        <Input
          id={`people-${who}-name`}
          value={form[who].name}
          maxLength={30}
          onChange={(e) => set(who, "name", e.target.value)}
        />
      </label>
      <label
        htmlFor={`people-${who}-login`}
        className="grid gap-1 text-caption text-ink-2"
      >
        Tailscale login (email)
        <Input
          id={`people-${who}-login`}
          value={form[who].login}
          placeholder="name@gmail.com"
          maxLength={120}
          onChange={(e) => set(who, "login", e.target.value)}
        />
      </label>
      {/* Always rendered so both rows keep the same columns; hidden when it does not apply. */}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className={
          you.login && form[who].login.toLowerCase() !== you.login
            ? undefined
            : "invisible"
        }
        onClick={() => set(who, "login", you.login ?? "")}
      >
        That&apos;s me
      </Button>
    </div>
  );
  return (
    <Card>
      <h2 className="mb-1 text-headline font-semibold">People</h2>
      <p className="mb-3 text-caption text-ink-2">
        Names show on accounts (joint or one person&apos;s own) and in the
        &ldquo;whose money&rdquo; filters. The Tailscale login lets the activity
        log say which of you made a change.
      </p>
      <p className="mb-4 text-caption text-ink-2">
        {you.login ? (
          <>
            You are signed in to Tailscale as <b>{you.login}</b>.
          </>
        ) : (
          <>
            This page was opened on the PC itself, so there is no Tailscale
            login to match. Open it from a phone or laptop through Tailscale to
            fill these in with &ldquo;That&apos;s me&rdquo;.
          </>
        )}
      </p>
      <div className="grid gap-4">
        {row("p1", "Person 1")}
        {row("p2", "Person 2")}
        <div>
          <Button onClick={save} disabled={pending}>
            Save
          </Button>
        </div>
      </div>
    </Card>
  );
}
