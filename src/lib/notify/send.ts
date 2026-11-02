import { randomBytes } from "node:crypto";
import type { Db } from "@/lib/db/client";
import { getSetting, setSetting } from "@/lib/settings";
import type { Notice, NotifySettings } from "./decide";

export const NOTIFY_KEY = "notify";
const SENT_KEY = "notify_sent";
const MAX_SENT = 300;

export type NotifyConfig = NotifySettings & {
  /** ntfy topic; anyone who knows it can read the messages, so it is long and random. */
  topic: string;
  server: string;
  enabled: boolean;
};

export function newTopic(): string {
  return `finance-${randomBytes(12).toString("hex")}`;
}

export function getNotifyConfig(db: Db): NotifyConfig {
  const stored = getSetting<Partial<NotifyConfig>>(db, NOTIFY_KEY, {});
  const cfg: NotifyConfig = {
    standingOrderCents: 0,
    reminderDays: 2,
    server: "https://ntfy.sh",
    enabled: true,
    ...stored,
    topic: stored.topic || newTopic(),
  };
  if (!stored.topic) setSetting(db, NOTIFY_KEY, cfg);
  return cfg;
}

export function setNotifyConfig(db: Db, cfg: NotifyConfig): void {
  setSetting(db, NOTIFY_KEY, cfg);
}

export type Sender = (cfg: NotifyConfig, n: Notice) => Promise<void>;

/** ntfy.sh: a plain POST to the topic; the phone app shows it. */
export const ntfySend: Sender = async (cfg, n) => {
  const res = await fetch(`${cfg.server.replace(/\/$/, "")}/${cfg.topic}`, {
    method: "POST",
    body: n.message,
    headers: {
      // HTTP headers must be Latin-1; ntfy reads RFC 2047 for anything else.
      Title: `=?UTF-8?B?${Buffer.from(n.title).toString("base64")}?=`,
      Priority: n.priority === "high" ? "high" : "default",
      Tags: n.priority === "high" ? "warning" : "pound",
    },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`ntfy ${res.status}`);
};

/** Sends each notice not already sent; returns what went out. */
export async function deliver(
  db: Db,
  notices: Notice[],
  send: Sender = ntfySend,
): Promise<{ sent: Notice[]; failed: string[] }> {
  const cfg = getNotifyConfig(db);
  const sentKeys = getSetting<string[]>(db, SENT_KEY, []);
  const seen = new Set(sentKeys);
  const sent: Notice[] = [];
  const failed: string[] = [];
  if (!cfg.enabled) return { sent, failed };
  for (const n of notices) {
    if (seen.has(n.key)) continue;
    try {
      await send(cfg, n);
      sent.push(n);
      seen.add(n.key);
      sentKeys.push(n.key);
    } catch (e) {
      failed.push(`${n.key}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  setSetting(db, SENT_KEY, sentKeys.slice(-MAX_SENT));
  return { sent, failed };
}
