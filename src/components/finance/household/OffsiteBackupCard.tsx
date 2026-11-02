"use client";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  type OffsiteView,
  runOffsiteNowAction,
  saveOffsiteAction,
} from "@/actions/backup";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export function OffsiteBackupCard({
  view,
  lastLabel,
}: {
  view: OffsiteView;
  lastLabel: string | null;
}) {
  const [dir, setDir] = useState(view.config?.dir ?? "");
  const [keep, setKeep] = useState(String(view.config?.keep ?? 30));
  const [pass, setPass] = useState("");
  const [pass2, setPass2] = useState("");
  const [pending, start] = useTransition();
  const save = () => {
    if (pass !== pass2) {
      toast.error("The two passphrases differ.");
      return;
    }
    start(async () => {
      const r = await saveOffsiteAction({
        dir,
        keep: Number(keep) || 30,
        passphrase: pass || undefined,
      });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      setPass("");
      setPass2("");
      toast.success("Off-PC backup saved");
    });
  };
  const runNow = () =>
    start(async () => {
      const r = await runOffsiteNowAction();
      if (r.ok) toast.success("Backup written");
      else toast.error(r.error ?? "Backup failed");
    });
  return (
    <Card>
      <h2 className="mb-1 text-headline font-semibold">Off-PC backup</h2>
      <p className="mb-3 text-caption text-ink-2">
        An encrypted copy of everything, written daily to a folder your cloud
        drive syncs (OneDrive, Google Drive, Dropbox) or a USB disk. The drive
        only ever sees scrambled data. If the PC dies, install Finance on
        another one and run <code>npm run restore -- &lt;file&gt;</code>.
      </p>
      <p className="mb-4 text-caption text-negative">
        Keep the passphrase in a password manager, and make sure your partner
        can get to it too. Without it the backups cannot be opened.
      </p>
      <div className="grid gap-3">
        <label
          htmlFor="offsite-dir"
          className="grid gap-1 text-caption text-ink-2"
        >
          Folder on this PC
          <Input
            id="offsite-dir"
            value={dir}
            placeholder="C:\Users\you\OneDrive\Finance backups"
            maxLength={400}
            onChange={(e) => setDir(e.target.value)}
          />
        </label>
        <div className="flex flex-wrap items-end gap-3">
          <label
            htmlFor="offsite-keep"
            className="grid gap-1 text-caption text-ink-2"
          >
            Keep the newest
            <Input
              id="offsite-keep"
              type="number"
              min={1}
              max={365}
              value={keep}
              onChange={(e) => setKeep(e.target.value)}
              className="w-24"
            />
          </label>
          <label
            htmlFor="offsite-pass"
            className="grid gap-1 text-caption text-ink-2"
          >
            {view.passphraseSet ? "New passphrase (optional)" : "Passphrase"}
            <Input
              id="offsite-pass"
              type="password"
              autoComplete="new-password"
              value={pass}
              onChange={(e) => setPass(e.target.value)}
              className="w-56"
            />
          </label>
          <label
            htmlFor="offsite-pass2"
            className="grid gap-1 text-caption text-ink-2"
          >
            Repeat passphrase
            <Input
              id="offsite-pass2"
              type="password"
              autoComplete="new-password"
              value={pass2}
              onChange={(e) => setPass2(e.target.value)}
              className="w-56"
            />
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={save} disabled={pending}>
            Save
          </Button>
          <Button
            variant="outline"
            onClick={runNow}
            disabled={pending || !view.config}
          >
            Back up now
          </Button>
          {view.last && (
            <span
              className={`text-caption ${view.last.ok ? "text-ink-2" : "text-negative"}`}
            >
              {view.last.ok
                ? `Last backup ${lastLabel ?? ""}`
                : `Last attempt failed: ${view.last.error}`}
            </span>
          )}
        </div>
      </div>
    </Card>
  );
}
