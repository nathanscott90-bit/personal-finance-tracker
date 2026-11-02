import { ebJwt } from "./jwt";
import type {
  EbAspsp,
  EbBalance,
  EbConfig,
  EbSession,
  EbTransaction,
} from "./types";

export const EB_BASE = "https://api.enablebanking.com";

export type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;

export class EbError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function call<T>(
  cfg: EbConfig,
  fetchFn: FetchFn,
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<T> {
  const res = await fetchFn(`${EB_BASE}${path}`, {
    method: init.method ?? "GET",
    headers: {
      Authorization: `Bearer ${ebJwt(cfg.appId, cfg.privateKey)}`,
      "Content-Type": "application/json",
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    signal: AbortSignal.timeout(30_000),
  });
  const text = await res.text();
  if (!res.ok) {
    let detail = text.slice(0, 300);
    try {
      const j = JSON.parse(text);
      detail = j.message ?? j.error ?? j.detail ?? detail;
      if (typeof detail !== "string") detail = JSON.stringify(detail);
    } catch {}
    throw new EbError(`Enable Banking ${res.status}: ${detail}`, res.status);
  }
  return (text ? JSON.parse(text) : {}) as T;
}

export async function listAspsps(
  cfg: EbConfig,
  fetchFn: FetchFn,
  country = "GB",
): Promise<EbAspsp[]> {
  const r = await call<{ aspsps: EbAspsp[] }>(
    cfg,
    fetchFn,
    `/aspsps?country=${encodeURIComponent(country)}&psu_type=personal`,
  );
  return r.aspsps ?? [];
}

/** Starts the bank's consent journey; returns the URL to send the user to. */
export async function startAuth(
  cfg: EbConfig,
  fetchFn: FetchFn,
  a: { bank: string; country: string; state: string; validUntil: string },
): Promise<string> {
  const r = await call<{ url: string }>(cfg, fetchFn, "/auth", {
    method: "POST",
    body: {
      access: { valid_until: a.validUntil },
      aspsp: { name: a.bank, country: a.country },
      state: a.state,
      redirect_url: cfg.redirectUrl,
      psu_type: "personal",
    },
  });
  return r.url;
}

export function createSession(
  cfg: EbConfig,
  fetchFn: FetchFn,
  code: string,
): Promise<EbSession> {
  return call<EbSession>(cfg, fetchFn, "/sessions", {
    method: "POST",
    body: { code },
  });
}

export async function deleteSession(
  cfg: EbConfig,
  fetchFn: FetchFn,
  sessionId: string,
): Promise<void> {
  await call(cfg, fetchFn, `/sessions/${encodeURIComponent(sessionId)}`, {
    method: "DELETE",
  });
}

export async function getBalances(
  cfg: EbConfig,
  fetchFn: FetchFn,
  uid: string,
): Promise<EbBalance[]> {
  const r = await call<{ balances: EbBalance[] }>(
    cfg,
    fetchFn,
    `/accounts/${encodeURIComponent(uid)}/balances`,
  );
  return r.balances ?? [];
}

/** Every transaction from `dateFrom`, following continuation keys. */
export async function getTransactions(
  cfg: EbConfig,
  fetchFn: FetchFn,
  uid: string,
  dateFrom: string,
  maxPages = 50,
): Promise<EbTransaction[]> {
  const out: EbTransaction[] = [];
  let key: string | null = null;
  for (let page = 0; page < maxPages; page++) {
    const q = new URLSearchParams({ date_from: dateFrom });
    if (key) q.set("continuation_key", key);
    const r: {
      transactions?: EbTransaction[];
      continuation_key?: string | null;
    } = await call(
      cfg,
      fetchFn,
      `/accounts/${encodeURIComponent(uid)}/transactions?${q}`,
    );
    out.push(...(r.transactions ?? []));
    key = r.continuation_key ?? null;
    if (!key) break;
  }
  return out;
}
