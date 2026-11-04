import type { BankDownloadView } from "@/actions/bankdownload";
import { Card } from "@/components/ui/card";

/**
 * How bank data gets in: the person runs Bank download, logs in to their bank
 * in Chrome as normal, and every statement they download is imported.
 */
export function BankDownloadCard({
  view,
  lastLabel,
}: {
  view: BankDownloadView;
  lastLabel: string | null;
}) {
  const old = view.ageDays !== null && view.ageDays >= 7;
  return (
    <Card>
      <h2 className="mb-1 text-headline font-semibold">Bank download</h2>
      <p className="mb-3 text-caption text-ink-2">
        Brings in your NatWest and Nationwide transactions. You log in to the
        bank yourself in Chrome; the app never sees or stores your login or
        phone approvals. It only picks up the statement files you download.
      </p>
      <p
        className={`mb-3 text-caption ${old ? "text-negative" : "text-ink-2"}`}
      >
        {view.last ? (
          <>
            Last download <b>{lastLabel}</b>: {view.last.added} new transaction
            {view.last.added === 1 ? "" : "s"} from {view.last.files} file
            {view.last.files === 1 ? "" : "s"}.
          </>
        ) : view.ageDays === null ? (
          <>Not used yet.</>
        ) : (
          <>
            Not used yet.{" "}
            {view.ageDays === 0
              ? "Your newest transactions are from today."
              : `Your newest transactions are ${view.ageDays} day${view.ageDays === 1 ? "" : "s"} old.`}
          </>
        )}{" "}
        {old && "Time for a fresh download."}
      </p>
      <ol className="ml-5 list-decimal space-y-1 text-caption text-ink-2">
        <li>
          Double-click <b>Bank download</b> on the desktop (or run{" "}
          <code>npm run bank</code> in the Finance folder).
        </li>
        <li>
          In the Chrome window that opens, log in to your bank as usual,
          including the phone approval.
        </li>
        <li>
          Open an account → <b>Download / Export transactions</b> → choose{" "}
          <b>CSV</b> and the dates you want. It is imported as soon as it
          downloads. The first time, you are asked which account it is; after
          that it remembers ({view.accountsRemembered} remembered so far).
        </li>
        <li>
          Repeat for each account, then press <b>Enter</b> in the black window.
        </li>
      </ol>
      <p className="mt-3 text-caption text-ink-3">
        Once a week is plenty. Downloading dates you already have is safe:
        repeats are skipped. You get a phone alert when it has been a week.
      </p>
    </Card>
  );
}
