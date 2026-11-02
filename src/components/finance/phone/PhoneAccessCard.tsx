import { Card } from "@/components/ui/card";

export function PhoneAccessCard({ hostname }: { hostname: string }) {
  const link = `http://${hostname.toLowerCase()}:3000/m`;
  return (
    <Card>
      <h2 className="mb-1 text-headline font-semibold">Phone view</h2>
      <p className="mb-3 text-caption text-ink-2">
        A compact view of what needs doing, upcoming bills and balances. It
        works from anywhere through Tailscale, which keeps it private to your
        own devices.
      </p>
      <ol className="ml-5 list-decimal space-y-1 text-caption text-ink-2">
        <li>
          Install <b>Tailscale</b> on the phone and sign in with the same
          account as this PC.
        </li>
        <li>
          Open <code className="select-all">{link}</code> in Chrome, then menu →{" "}
          <b>Add to Home screen</b>.
        </li>
      </ol>
    </Card>
  );
}
