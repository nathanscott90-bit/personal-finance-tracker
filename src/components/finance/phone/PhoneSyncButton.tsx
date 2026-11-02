"use client";
import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { ebSyncNowAction } from "@/actions/enablebanking";

export function PhoneSyncButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      aria-label="Sync now"
      disabled={pending}
      onClick={() =>
        start(async () => {
          await ebSyncNowAction();
          router.refresh();
        })
      }
      className="rounded-pill p-2 text-accent disabled:opacity-50"
    >
      <RefreshCw className={`size-5 ${pending ? "animate-spin" : ""}`} />
    </button>
  );
}
