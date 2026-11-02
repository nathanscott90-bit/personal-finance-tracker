import { createVerify, generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import { ensureDefaultCategories } from "@/lib/categories/ensure";
import { openDb } from "@/lib/db/client";
import { accounts, balanceSnapshots, transactions } from "@/lib/db/schema";
import { ebJwt, normalisePem } from "@/lib/enablebanking/jwt";
import { pickBalance, toSfinTransactions } from "@/lib/enablebanking/map";
import {
  DEFAULT_REDIRECT,
  getSessions,
  setEbConfig,
} from "@/lib/enablebanking/store";
import {
  beginConnect,
  completeConnect,
  parseRedirect,
  runEbSync,
} from "@/lib/enablebanking/sync";
import type { EbTransaction } from "@/lib/enablebanking/types";

const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
});
const PEM = privateKey.export({ type: "pkcs8", format: "pem" }).toString();

describe("ebJwt", () => {
  it("signs RS256 with the app id as kid and fixed iss/aud", () => {
    const t = ebJwt("app-123", PEM, 1_000_000);
    const [h, p, s] = t.split(".");
    const header = JSON.parse(Buffer.from(h, "base64url").toString());
    const payload = JSON.parse(Buffer.from(p, "base64url").toString());
    expect(header).toEqual({ typ: "JWT", alg: "RS256", kid: "app-123" });
    expect(payload).toEqual({
      iss: "enablebanking.com",
      aud: "api.enablebanking.com",
      iat: 1_000_000,
      exp: 1_003_600,
    });
    const ok = createVerify("RSA-SHA256")
      .update(`${h}.${p}`)
      .verify(publicKey, Buffer.from(s, "base64url"));
    expect(ok).toBe(true);
  });
  it("repairs a PEM pasted on one line", () => {
    const flat = PEM.replace(/\n/g, " ");
    expect(() => ebJwt("x", normalisePem(flat))).not.toThrow();
  });
});

describe("parseRedirect", () => {
  it("reads the code from the address the bank sent the user to", () =>
    expect(
      parseRedirect(`${DEFAULT_REDIRECT}?state=abc&code=c0de-123`),
    ).toEqual({ code: "c0de-123", state: "abc" }));
  it("accepts a bare code", () =>
    expect(parseRedirect("c0de-12345")).toEqual({
      code: "c0de-12345",
      state: null,
    }));
  it("surfaces a bank error", () =>
    expect(() =>
      parseRedirect(`${DEFAULT_REDIRECT}?error=access_denied`),
    ).toThrow(/access_denied/));
});

const tx = (o: Partial<EbTransaction>): EbTransaction => ({
  transaction_amount: { amount: "10.00", currency: "GBP" },
  credit_debit_indicator: "DBIT",
  status: "BOOK",
  booking_date: "2026-10-01",
  ...o,
});

describe("toSfinTransactions", () => {
  it("signs by indicator and names the counterparty", () => {
    const { txns } = toSfinTransactions("u1", [
      tx({
        transaction_id: "a",
        creditor: { name: "OCTOPUS ENERGY" },
        remittance_information: ["A-123"],
      }),
      tx({
        transaction_id: "b",
        credit_debit_indicator: "CRDT",
        transaction_amount: { amount: "3850.00", currency: "GBP" },
        debtor: { name: "SPECIALIST LINES LTD" },
        remittance_information: ["SALARY"],
      }),
    ]);
    expect(txns.map((t) => [t.amount, t.description, t.memo])).toEqual([
      ["-10.00", "OCTOPUS ENERGY", "A-123"],
      ["3850.00", "SPECIALIST LINES LTD", "SALARY"],
    ]);
  });
  it("gives id-less identical rows distinct ids", () => {
    const { txns } = toSfinTransactions("u1", [
      tx({ remittance_information: ["COSTA"] }),
      tx({ remittance_information: ["COSTA"] }),
    ]);
    expect(new Set(txns.map((t) => t.id)).size).toBe(2);
  });
  it("pending rows carry no posted date", () => {
    const { txns } = toSfinTransactions("u1", [
      tx({
        transaction_id: "p",
        status: "PDNG",
        booking_date: null,
        transaction_date: "2026-10-02",
      }),
    ]);
    expect(txns[0]).toMatchObject({ posted: 0, pending: true });
    expect(txns[0].transacted_at).toBeGreaterThan(0);
  });
});

describe("pickBalance", () => {
  it("prefers the booked balance and honours a debit indicator", () => {
    const b = pickBalance(
      [
        {
          balance_type: "ITAV",
          balance_amount: { amount: "900.00", currency: "GBP" },
        },
        {
          balance_type: "CLBD",
          balance_amount: { amount: "312.40", currency: "GBP" },
          credit_debit_indicator: "DBIT",
          reference_date: "2026-10-24",
        },
      ],
      new Date("2026-10-25T08:00:00Z"),
    );
    expect(b?.amount).toBe("-312.40");
  });
});

/** A fake Enable Banking: two banks, three accounts. */
function fakeBank(state: {
  nwTxns: EbTransaction[];
  natTxns: EbTransaction[];
}) {
  const calls: string[] = [];
  const fetchFn = async (url: string, init?: RequestInit) => {
    const u = new URL(url);
    calls.push(`${init?.method ?? "GET"} ${u.pathname}`);
    const json = (b: unknown, status = 200) =>
      new Response(JSON.stringify(b), { status });
    if (u.pathname === "/auth")
      return json({ url: "https://bank.example/consent" });
    if (u.pathname === "/sessions") {
      const code = JSON.parse(String(init?.body)).code;
      if (code === "nationwide")
        return json({
          session_id: "s-nw",
          aspsp: { name: "Nationwide", country: "GB" },
          access: { valid_until: "2027-04-20T00:00:00Z" },
          accounts: [
            {
              uid: "nw-cur",
              name: "FlexPlus",
              currency: "GBP",
              cash_account_type: "CACC",
              account_id: { other: { identification: "07012312345678" } },
            },
            {
              uid: "nw-cc",
              name: "Member Credit Card",
              currency: "GBP",
              cash_account_type: "CARD",
            },
          ],
        });
      return json({
        session_id: "s-nat",
        aspsp: { name: "NatWest", country: "GB" },
        access: { valid_until: "2027-01-20T00:00:00Z" },
        accounts: [
          {
            uid: "nat-bills",
            name: "Bills",
            currency: "GBP",
            cash_account_type: "CACC",
          },
        ],
      });
    }
    const m = /^\/accounts\/([^/]+)\/(transactions|balances)$/.exec(u.pathname);
    if (m) {
      const [, uid, what] = m;
      if (what === "balances")
        return json({
          balances: [
            {
              balance_type: "CLBD",
              balance_amount: {
                amount: uid === "nat-bills" ? "1720.45" : "2104.10",
                currency: "GBP",
              },
              reference_date: "2026-10-24",
            },
          ],
        });
      const list =
        uid === "nat-bills"
          ? state.natTxns
          : uid === "nw-cur"
            ? state.nwTxns
            : [];
      return json({ transactions: list, continuation_key: null });
    }
    return json({ message: "not found" }, 404);
  };
  return { fetchFn: fetchFn as typeof fetch, calls };
}

describe("connect and sync", () => {
  it("links accounts with no questions, syncs, pairs the transfer, and never duplicates", async () => {
    const db = openDb(":memory:");
    ensureDefaultCategories(db);
    setEbConfig(db, {
      appId: "app",
      privateKey: PEM,
      redirectUrl: DEFAULT_REDIRECT,
    });
    const state = {
      nwTxns: [
        tx({
          transaction_id: "n1",
          credit_debit_indicator: "CRDT",
          booking_date: "2026-10-23",
          transaction_amount: { amount: "3850.00", currency: "GBP" },
          debtor: { name: "SPECIALIST LINES LTD" },
          remittance_information: ["SALARY"],
        }),
        tx({
          transaction_id: "n2",
          booking_date: "2026-10-23",
          transaction_amount: { amount: "1650.00", currency: "GBP" },
          creditor: { name: "N SCOTT" },
          remittance_information: ["Transfer to 600000 12345678"],
        }),
        tx({
          transaction_id: "n3",
          status: "PDNG",
          booking_date: null,
          transaction_date: "2026-10-24",
          remittance_information: ["TESCO STORES 2345"],
          transaction_amount: { amount: "54.20", currency: "GBP" },
        }),
      ],
      natTxns: [
        tx({
          transaction_id: "w1",
          credit_debit_indicator: "CRDT",
          booking_date: "2026-10-23",
          transaction_amount: { amount: "1650.00", currency: "GBP" },
          remittance_information: ["FROM A/C 12345678 NATIONWIDE"],
        }),
        tx({
          transaction_id: "w2",
          booking_date: "2026-10-01",
          creditor: { name: "OCTOPUS ENERGY" },
          transaction_amount: { amount: "142.00", currency: "GBP" },
        }),
      ],
    };
    const bank = fakeBank(state);
    const now = new Date("2026-10-25T07:00:00Z");

    const url = await beginConnect(db, bank.fetchFn, "Nationwide", "GB", now);
    expect(url).toBe("https://bank.example/consent");
    await completeConnect(
      db,
      bank.fetchFn,
      `${DEFAULT_REDIRECT}?code=nationwide`,
    );
    await completeConnect(db, bank.fetchFn, "natwest-code");
    expect(
      getSessions(db)
        .map((s) => s.bank)
        .sort(),
    ).toEqual(["NatWest", "Nationwide"]);

    const accts = db.select().from(accounts).all();
    expect(accts.map((a) => [a.name, a.type]).sort()).toEqual([
      ["NatWest Bills", "checking"],
      ["Nationwide FlexPlus ••5678", "checking"],
      ["Nationwide Member Credit Card", "credit"],
    ]);

    const r1 = await runEbSync(db, bank.fetchFn, now);
    expect(r1.ok).toBe(true);
    expect(db.select().from(transactions).all()).toHaveLength(5);
    // Own transfer between Nationwide and NatWest is paired, not spending.
    const transfers = db
      .select()
      .from(transactions)
      .all()
      .filter((t) => t.isTransfer);
    expect(transfers.map((t) => t.amountCents).sort((a, b) => a - b)).toEqual([
      -165000, 165000,
    ]);
    // Balances land as snapshots for the funding plan.
    expect(
      db.select().from(balanceSnapshots).all().length,
    ).toBeGreaterThanOrEqual(2);

    // Next day: the pending Tesco row books with a new id; nothing doubles.
    state.nwTxns[2] = tx({
      transaction_id: "n3b",
      booking_date: "2026-10-25",
      remittance_information: ["TESCO STORES 2345"],
      transaction_amount: { amount: "54.20", currency: "GBP" },
    });
    const r2 = await runEbSync(
      db,
      bank.fetchFn,
      new Date("2026-10-26T07:00:00Z"),
    );
    expect(r2.ok).toBe(true);
    const tesco = db
      .select()
      .from(transactions)
      .all()
      .filter((t) => /tesco/i.test(t.rawDescription));
    // The pending row lingers until the vanished-pending window passes, so at
    // most one booked Tesco row exists and no booked row is duplicated.
    expect(tesco.filter((t) => !t.pending)).toHaveLength(1);
    const r3 = await runEbSync(
      db,
      bank.fetchFn,
      new Date("2026-10-26T08:00:00Z"),
    );
    expect(r3.results.reduce((n, r) => n + r.added, 0)).toBe(0);
  });

  it("warns before consent runs out and reports expiry", async () => {
    const db = openDb(":memory:");
    ensureDefaultCategories(db);
    setEbConfig(db, {
      appId: "app",
      privateKey: PEM,
      redirectUrl: DEFAULT_REDIRECT,
    });
    const bank = fakeBank({ nwTxns: [], natTxns: [] });
    await completeConnect(db, bank.fetchFn, "natwest-code");
    const soon = await runEbSync(
      db,
      bank.fetchFn,
      new Date("2027-01-10T07:00:00Z"),
    );
    expect(soon.expiring).toEqual([
      expect.objectContaining({ bank: "NatWest", expired: false }),
    ]);
    const late = await runEbSync(
      db,
      bank.fetchFn,
      new Date("2027-02-01T07:00:00Z"),
    );
    expect(late.ok).toBe(false);
    expect(late.error).toMatch(/reconnect/);
  });
});
