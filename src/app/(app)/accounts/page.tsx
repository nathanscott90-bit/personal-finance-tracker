import { listAccounts } from "@/actions/accounts";
import { getPeopleAction } from "@/actions/household";
import { AccountCard } from "@/components/finance/AccountCard";
import { AccountForm } from "@/components/finance/AccountForm";
import { Card } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function AccountsPage() {
  const [rows, household] = await Promise.all([
    listAccounts(),
    getPeopleAction(),
  ]);
  const people = { p1: household.p1.name, p2: household.p2.name };
  return (
    <>
      <h1 className="mb-6 text-title font-semibold">Accounts</h1>
      <div className="grid grid-cols-12 gap-6">
        <div className="col-span-7 grid gap-4">
          {rows.length === 0 && (
            <Card className="text-ink-2">
              No accounts yet. Add your first one on the right. Mark each as
              joint or one person&apos;s own so you can filter by whose money it
              is.
            </Card>
          )}
          {rows.map((a) => (
            <AccountCard key={a.id} account={a} people={people} />
          ))}
        </div>
        <Card className="col-span-5 self-start">
          <h2 className="mb-4 text-headline font-semibold">Add account</h2>
          <AccountForm people={people} />
        </Card>
      </div>
    </>
  );
}
