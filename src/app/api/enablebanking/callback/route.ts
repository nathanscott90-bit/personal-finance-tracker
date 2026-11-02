import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";
import { completeConnect, runEbSync } from "@/lib/enablebanking/sync";

/**
 * Where the bank sends the browser back, when the registered redirect can
 * reach this app directly. Finishes the connection and returns to Settings.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const back = new URL("/settings", url.origin);
  try {
    const db = getDb();
    const r = await completeConnect(db, fetch, req.url);
    await runEbSync(db, fetch);
    back.searchParams.set("connected", r.bank);
  } catch (e) {
    back.searchParams.set(
      "bankError",
      e instanceof Error ? e.message : "Connection failed",
    );
  }
  return NextResponse.redirect(back);
}
