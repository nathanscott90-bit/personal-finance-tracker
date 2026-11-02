"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  type BankConnectionView,
  ebSyncNowAction,
  finishConnectAction,
  forgetBankAction,
  listBanksAction,
  saveEbConfigAction,
  startConnectAction,
} from "@/actions/enablebanking";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const PORTAL = "https://enablebanking.com/cp/applications";

function Setup({ redirectUrl }: { redirectUrl: string }) {
  const router = useRouter();
  const [appId, setAppId] = useState("");
  const [key, setKey] = useState("");
  const [pending, start] = useTransition();
  return (
    <div className="grid gap-4">
      <ol className="ml-5 list-decimal space-y-1 text-caption text-ink-2">
        <li>
          Create a free account at{" "}
          <a
            href={PORTAL}
            target="_blank"
            rel="noreferrer"
            className="text-accent"
          >
            Enable Banking
          </a>{" "}
          and add an application: environment <b>Production</b>, keep the key
          generated in the browser.
        </li>
        <li>
          Allowed redirect URL:{" "}
          <code className="select-all">{redirectUrl}</code>. Privacy and terms
          URLs can be the same address.
        </li>
        <li>
          Click <b>Link accounts</b> on the application and link NatWest and
          Nationwide. That makes it free for your own accounts.
        </li>
        <li>
          Paste the Application ID and choose the downloaded .pem file below.
        </li>
      </ol>
      <label
        htmlFor="eb-app"
        className="grid max-w-md gap-1 text-caption text-ink-2"
      >
        Application ID
        <Input
          id="eb-app"
          value={appId}
          onChange={(e) => setAppId(e.target.value)}
        />
      </label>
      <label
        htmlFor="eb-key"
        className="grid max-w-md gap-1 text-caption text-ink-2"
      >
        Private key (.pem)
        <input
          id="eb-key"
          type="file"
          accept=".pem,.key,.txt"
          className="text-caption"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (f) setKey(await f.text());
          }}
        />
        {key && <span className="text-positive">Key loaded</span>}
      </label>
      <div>
        <Button
          disabled={pending || !appId || !key}
          onClick={() =>
            start(async () => {
              const r = await saveEbConfigAction({
                appId,
                privateKey: key,
                redirectUrl,
              });
              if (!r.ok) return void toast.error(r.error);
              toast.success("Saved. Now connect your banks.");
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

function Connect() {
  const router = useRouter();
  const [banks, setBanks] = useState<string[] | null>(null);
  const [bank, setBank] = useState("");
  const [waiting, setWaiting] = useState(false);
  const [pasted, setPasted] = useState("");
  const [pending, start] = useTransition();

  if (!banks)
    return (
      <Button
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await listBanksAction();
            if (!r.ok) return void toast.error(r.error);
            setBanks(r.banks);
          })
        }
      >
        {pending ? "Loading banks…" : "Connect a bank"}
      </Button>
    );

  return (
    <div className="grid max-w-xl gap-3">
      {!waiting ? (
        <div className="flex flex-wrap items-end gap-3">
          <label
            htmlFor="eb-bank"
            className="grid gap-1 text-caption text-ink-2"
          >
            Bank
            <Input
              id="eb-bank"
              list="eb-banks"
              placeholder="NatWest"
              value={bank}
              onChange={(e) => setBank(e.target.value)}
              className="w-64"
            />
            <datalist id="eb-banks">
              {banks.map((b) => (
                <option key={b} value={b} />
              ))}
            </datalist>
          </label>
          <Button
            disabled={pending || !banks.includes(bank)}
            onClick={() =>
              start(async () => {
                const r = await startConnectAction(bank);
                if (!r.ok) return void toast.error(r.error);
                window.open(r.url, "_blank", "noopener");
                setWaiting(true);
              })
            }
          >
            Continue to {bank || "bank"}
          </Button>
        </div>
      ) : (
        <>
          <p className="text-caption text-ink-2">
            Approve access in the tab that opened. You'll land on a page that
            may say it can't be reached; that's expected. Copy its address and
            paste it here.
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <Input
              aria-label="Address after approving"
              placeholder="https://localhost:3000/api/enablebanking/callback?code=…"
              value={pasted}
              onChange={(e) => setPasted(e.target.value)}
              className="w-[28rem] max-w-full"
            />
            <Button
              disabled={pending || !pasted}
              onClick={() =>
                start(async () => {
                  const r = await finishConnectAction(pasted);
                  if (!r.ok) return void toast.error(r.error);
                  toast.success(
                    `${r.bank} connected · ${r.accounts.length} account(s) · ${r.added} transactions`,
                  );
                  setBanks(null);
                  setWaiting(false);
                  setPasted("");
                  router.refresh();
                })
              }
            >
              {pending ? "Connecting…" : "Finish"}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

export function BankConnectionCard({
  view,
  lastSyncLabel,
  validLabels,
}: {
  view: BankConnectionView;
  lastSyncLabel: string | null;
  validLabels: Record<string, string>;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Card>
      <h2 className="mb-1 text-headline font-semibold">Bank connection</h2>
      <p className="mb-4 text-caption text-ink-2">
        Reads transactions and balances straight from your banks through Enable
        Banking (FCA-regulated open banking). Read-only; your bank login is
        never seen by this app.
      </p>
      {!view.configured ? (
        <Setup redirectUrl={view.redirectUrl} />
      ) : (
        <div className="grid gap-4">
          {view.banks.length > 0 && (
            <ul className="grid gap-2">
              {view.banks.map((b) => (
                <li
                  key={b.bank}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-control border border-line px-4 py-3"
                >
                  <div>
                    <div className="text-body font-medium">{b.bank}</div>
                    <div className="text-caption text-ink-2">
                      {b.accounts.join(" · ")} · access until{" "}
                      {validLabels[b.bank]}
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={pending}
                    onClick={() =>
                      start(async () => {
                        await forgetBankAction(b.bank);
                        router.refresh();
                      })
                    }
                  >
                    Forget
                  </Button>
                </li>
              ))}
            </ul>
          )}
          {view.lastError && (
            <p className="text-caption text-negative">{view.lastError}</p>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <Connect />
            {view.banks.length > 0 && (
              <Button
                variant="outline"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    const r = await ebSyncNowAction();
                    if (r.ok) toast.success(`Synced · ${r.added} new`);
                    else toast.error(r.error ?? "Sync failed");
                    router.refresh();
                  })
                }
              >
                {pending ? "Syncing…" : "Sync now"}
              </Button>
            )}
            {lastSyncLabel && (
              <span className="text-caption text-ink-2">
                Last synced {lastSyncLabel}
              </span>
            )}
          </div>
          <p className="text-micro text-ink-3">
            Reconnecting a bank (same steps) renews its access. The app tells
            you when that's due.
          </p>
        </div>
      )}
    </Card>
  );
}
