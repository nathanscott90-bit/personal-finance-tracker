"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  saveNotifySettingsAction,
  sendTestNotificationAction,
} from "@/actions/notify";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { MONEY_PLACEHOLDER } from "@/lib/locale";
import { parseAmountToCents } from "@/lib/money";

export function NotifyCard({
  topic,
  server,
  standingOrderCents,
  reminderDays,
  enabled,
}: {
  topic: string;
  server: string;
  standingOrderCents: number;
  reminderDays: number;
  enabled: boolean;
}) {
  const router = useRouter();
  const [so, setSo] = useState(
    standingOrderCents ? (standingOrderCents / 100).toFixed(2) : "",
  );
  const [days, setDays] = useState(String(reminderDays));
  const [on, setOn] = useState(enabled);
  const [pending, start] = useTransition();
  const link = `${server.replace(/\/$/, "")}/${topic}`;
  return (
    <Card>
      <h2 className="mb-1 text-headline font-semibold">Phone alerts</h2>
      <p className="mb-3 text-caption text-ink-2">
        The app messages you only when something needs doing: the payday
        transfer, a shortfall, a bill that's missing or has gone up, or a bank
        connection to renew.
      </p>
      <ol className="mb-4 ml-5 list-decimal space-y-1 text-caption text-ink-2">
        <li>
          Install the free <b>ntfy</b> app on your phone.
        </li>
        <li>
          Tap <b>+</b> and subscribe to{" "}
          <code className="select-all">{topic}</code> (or open{" "}
          <a
            href={link}
            className="text-accent"
            target="_blank"
            rel="noreferrer"
          >
            {link}
          </a>{" "}
          on the phone).
        </li>
        <li>Send a test below.</li>
      </ol>
      <div className="flex flex-wrap items-end gap-3">
        <label htmlFor="so" className="grid gap-1 text-caption text-ink-2">
          Standing order to bills account (optional)
          <Input
            id="so"
            inputMode="decimal"
            placeholder={MONEY_PLACEHOLDER}
            value={so}
            onChange={(e) => setSo(e.target.value)}
            className="w-40"
          />
        </label>
        <label htmlFor="days" className="grid gap-1 text-caption text-ink-2">
          Remind days before payday
          <Input
            id="days"
            type="number"
            min={0}
            max={10}
            value={days}
            onChange={(e) => setDays(e.target.value)}
            className="w-24"
          />
        </label>
        <label className="flex items-center gap-2 text-caption text-ink-2">
          <input
            type="checkbox"
            checked={on}
            onChange={(e) => setOn(e.target.checked)}
          />
          Alerts on
        </label>
        <Button
          disabled={pending}
          onClick={() =>
            start(async () => {
              const cents = so.trim() === "" ? 0 : parseAmountToCents(so);
              const d = Number(days);
              if (cents === null || cents < 0 || !Number.isInteger(d))
                return void toast.error("Check the amounts");
              const r = await saveNotifySettingsAction({
                standingOrderCents: cents,
                reminderDays: d,
                enabled: on,
              });
              if (!r.ok) return void toast.error(r.error);
              toast.success("Saved");
              router.refresh();
            })
          }
        >
          Save
        </Button>
        <Button
          variant="outline"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await sendTestNotificationAction();
              if (r.ok) toast.success("Test sent");
              else toast.error(r.error);
            })
          }
        >
          Send test
        </Button>
      </div>
      <p className="mt-3 text-micro text-ink-3">
        With a standing order set, you're only told when a month needs more than
        it pays in. Anyone who knows the topic name can read the alerts, so keep
        it to yourself; alerts carry amounts, not account numbers.
      </p>
    </Card>
  );
}
