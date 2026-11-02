import { hostname } from "node:os";
import { listAccounts } from "@/actions/accounts";
import { getBankConnection } from "@/actions/enablebanking";
import { getHouseholdAction } from "@/actions/household";
import { getNotifySettings } from "@/actions/notify";
import { getPaydayAction, getSettingsPage } from "@/actions/settings";
import { getConnectionAction } from "@/actions/simplefin";
import { BankConnectionCard } from "@/components/finance/bank/BankConnectionCard";
import { NotifyCard } from "@/components/finance/bank/NotifyCard";
import { PaydayForm } from "@/components/finance/budget/PaydayForm";
import { CategoryManager } from "@/components/finance/CategoryManager";
import { HouseholdCard } from "@/components/finance/household/HouseholdCard";
import { PhoneAccessCard } from "@/components/finance/phone/PhoneAccessCard";
import { RerunButton } from "@/components/finance/RerunButton";
import { ConnectionsCard } from "@/components/finance/simplefin/ConnectionsCard";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { LOCALE } from "@/lib/locale";
import { relativeSince } from "@/lib/simplefin/relative";

export const dynamic = "force-dynamic";

const stampDate = (iso: string) =>
  new Date(iso).toLocaleDateString(LOCALE, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

export default async function SettingsPage() {
  const { tree } = await getSettingsPage();
  const { stored, resolved } = await getPaydayAction();
  const connection = await getConnectionAction();
  const household = await getHouseholdAction();
  const appAccounts = (await listAccounts()).map((a) => ({
    id: a.id,
    name: a.name,
  }));
  const bank = await getBankConnection();
  const notify = await getNotifySettings();
  const now = new Date();
  const isUs = /^en-US$/i.test(LOCALE);
  return (
    <>
      <h1 className="mb-6 text-title font-semibold">Settings</h1>
      <div className="grid gap-6">
        <BankConnectionCard
          view={bank}
          lastSyncLabel={
            bank.lastSyncAt ? relativeSince(bank.lastSyncAt, now) : null
          }
          validLabels={Object.fromEntries(
            bank.banks.map((b) => [
              b.bank,
              b.validUntil ? stampDate(b.validUntil) : "unknown",
            ]),
          )}
        />
        <NotifyCard
          topic={notify.topic}
          server={notify.server}
          standingOrderCents={notify.standingOrderCents}
          reminderDays={notify.reminderDays}
          enabled={notify.enabled}
        />
        <PhoneAccessCard hostname={hostname()} />
        <HouseholdCard
          tokenSet={household.tokenSet}
          createdAtLabel={
            household.createdAt ? stampDate(household.createdAt) : null
          }
          origin={household.origin}
        />
        {isUs && (
          <ConnectionsCard
            connection={connection}
            appAccounts={appAccounts}
            connectedLabel={
              connection.connectedAt ? stampDate(connection.connectedAt) : null
            }
            lastSyncLabel={
              connection.lastSyncAt
                ? relativeSince(connection.lastSyncAt, now)
                : null
            }
          />
        )}
        <Card>
          <h2 className="mb-1 text-headline font-semibold">Payday</h2>
          <p className="mb-4 text-caption text-ink-2">
            Used for the bills transfer and safe to spend. Paydays on a weekend
            or bank holiday move to the working day before.
          </p>
          <PaydayForm
            key={JSON.stringify(stored ?? resolved?.config ?? null)}
            stored={stored}
            resolved={resolved}
          />
        </Card>
        <Card>
          <h2 className="mb-2 text-headline font-semibold">Data</h2>
          <p className="mb-4 text-caption text-ink-2">
            Re-applies merchant cleanup, transfer detection, rules and refund
            matching to every transaction. Your manual categories are kept.
          </p>
          <RerunButton />
          <hr className="my-4 border-border" />
          <p className="mb-4 text-caption text-ink-2">
            Copies the database with everything in it. Keep it somewhere safe.
            Restore by replacing <code>data/finance.db</code> while the app is
            closed.
          </p>
          <a
            href="/api/export/backup"
            download
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            Download a backup
          </a>
        </Card>
        <div>
          <h2 className="mb-4 text-headline font-semibold">Categories</h2>
          <CategoryManager tree={tree} />
        </div>
      </div>
    </>
  );
}
