import { Card } from "@/components/ui/card";

/**
 * How both of you reach the app away from the PC. Tailscale Serve publishes
 * it on an HTTPS address only your own tailnet can open, and tells the app
 * which of you is asking. `publicHost` comes from FINANCE_PUBLIC_HOST, which
 * setup-windows.ps1 writes to .env.local.
 */
export function PhoneAccessCard({ publicHost }: { publicHost: string | null }) {
  const base = publicHost ? `https://${publicHost}` : null;
  return (
    <Card>
      <h2 className="mb-1 text-headline font-semibold">Phones and laptops</h2>
      <p className="mb-3 text-caption text-ink-2">
        Both of you can use the full app, or the compact phone view, from
        anywhere. Tailscale keeps it private: only devices signed in to your
        tailnet can open it, and nothing is opened to the internet.
      </p>
      <ol className="ml-5 list-decimal space-y-1 text-caption text-ink-2">
        <li>
          Install <b>Tailscale</b> on each phone or laptop. You sign in with
          your own account; invite your partner from the Tailscale admin page
          (Users → Invite) so they sign in with theirs.
        </li>
        {base ? (
          <li>
            Open <code className="select-all">{base}/m</code> (phone view) or{" "}
            <code className="select-all">{base}</code> (full app) in Chrome,
            then menu → <b>Add to Home screen</b>.
          </li>
        ) : (
          <li>
            The app address is not set up yet: run <b>setup.cmd</b> again after
            signing in to Tailscale on this PC. It is shown in{" "}
            <code>PHONE-LINK.txt</code> once done.
          </li>
        )}
        <li>
          Under <b>People</b> below, press &ldquo;That&apos;s me&rdquo; from
          each person&apos;s own device so changes are logged under the right
          name.
        </li>
      </ol>
    </Card>
  );
}
