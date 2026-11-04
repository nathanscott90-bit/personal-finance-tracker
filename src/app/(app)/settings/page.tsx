import { getOffsiteAction } from "@/actions/backup";
import { getBankDownloadAction } from "@/actions/bankdownload";
import { getClaudeAction } from "@/actions/claude";
import {
  getPeopleAction,
  listActivityAction,
  whoAmIAction,
} from "@/actions/household";
import { getNotifySettings } from "@/actions/notify";
import { getPaydayAction, getSettingsPage } from "@/actions/settings";
import { BankDownloadCard } from "@/components/finance/bank/BankDownloadCard";
import { NotifyCard } from "@/components/finance/bank/NotifyCard";
import { PaydayForm } from "@/components/finance/budget/PaydayForm";
import { CategoryManager } from "@/components/finance/CategoryManager";
import { ActivityCard } from "@/components/finance/household/ActivityCard";
import { ClaudeCard } from "@/components/finance/household/ClaudeCard";
import { OffsiteBackupCard } from "@/components/finance/household/OffsiteBackupCard";
import { PeopleCard } from "@/components/finance/household/PeopleCard";
import { PhoneAccessCard } from "@/components/finance/phone/PhoneAccessCard";
import { RerunButton } from "@/components/finance/RerunButton";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { relativeSince } from "@/lib/relative";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const { tree } = await getSettingsPage();
  const { stored, resolved } = await getPaydayAction();
  const bankDownload = await getBankDownloadAction();
  const notify = await getNotifySettings();
  const [people, you, activity, offsite, claude] = await Promise.all([
    getPeopleAction(),
    whoAmIAction(),
    listActivityAction(40),
    getOffsiteAction(),
    getClaudeAction(),
  ]);
  const now = new Date();
  return (
    <>
      <h1 className="mb-6 text-title font-semibold">Settings</h1>
      <div className="grid gap-6">
        <BankDownloadCard
          view={bankDownload}
          lastLabel={
            bankDownload.last ? relativeSince(bankDownload.last.at, now) : null
          }
        />
        <NotifyCard
          topic={notify.topic}
          server={notify.server}
          standingOrderCents={notify.standingOrderCents}
          reminderDays={notify.reminderDays}
          enabled={notify.enabled}
        />
        <PhoneAccessCard
          publicHost={process.env.FINANCE_PUBLIC_HOST?.trim() || null}
        />
        <PeopleCard people={people} you={you} />
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
        <OffsiteBackupCard
          view={offsite}
          lastLabel={
            offsite.last?.ok ? relativeSince(offsite.last.at, now) : null
          }
        />
        <ClaudeCard view={claude} />
        <ActivityCard entries={activity} />
        <div>
          <h2 className="mb-4 text-headline font-semibold">Categories</h2>
          <CategoryManager tree={tree} />
        </div>
      </div>
    </>
  );
}
