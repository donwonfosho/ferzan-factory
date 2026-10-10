/** Server functions for the account's Tron and TON wallets (balances, broadcast). Everything is signed in the browser. */
import { createServerFn } from "@tanstack/react-start";

const TRON_ADDR = /^T[1-9A-HJ-NP-Za-km-z]{33}$/;
const TON_ADDR = /^(?:[0-9A-Za-z_-]{48}|-?[01]:[0-9a-fA-F]{64})$/;

function field(data: unknown, key: string): string {
  const row = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
  const v = row[key];
  return typeof v === "string" ? v : "";
}

export const getTronBalance = createServerFn({ method: "GET" })
  .validator((data: unknown): { address: string } => {
    const address = field(data, "address");
    if (!TRON_ADDR.test(address)) throw new Error("That is not a Tron address.");
    return { address };
  })
  .handler(async ({ data }): Promise<{ trxSun: string; usdt: string }> => {
    await (await import("./guard.server")).guardRelay("read");
    return (await import("./site-tron.server")).tronBalance(data.address);
  });

/** Broadcasts a Tron transaction the browser signed with the account wallet. */
export const broadcastTronTx = createServerFn({ method: "POST" })
  .validator((data: unknown): { txJson: string } => {
    const txJson = field(data, "txJson");
    if (txJson.length < 100 || txJson.length > 40_000) throw new Error("Transaction looks wrong.");
    return { txJson };
  })
  .handler(async ({ data }): Promise<{ txid: string }> => {
    await (await import("./guard.server")).guardRelay("send");
    let tx: unknown;
    try {
      tx = JSON.parse(data.txJson);
    } catch {
      throw new Error("Transaction looks wrong.");
    }
    if (!tx || typeof tx !== "object") throw new Error("Transaction looks wrong.");
    return { txid: await (await import("./site-tron.server")).broadcastTron(tx as Record<string, unknown>) };
  });

export const getTonBalance = createServerFn({ method: "GET" })
  .validator((data: unknown): { address: string } => {
    const address = field(data, "address");
    if (!TON_ADDR.test(address)) throw new Error("That is not a TON address.");
    return { address };
  })
  .handler(async ({ data }): Promise<{ nano: string }> => {
    await (await import("./guard.server")).guardRelay("read");
    return { nano: await (await import("./site-ton.server")).tonBalance(data.address) };
  });

/** What the browser needs to build a wallet message: the next sequence number, and the public key if the wallet is already deployed. */
export const getTonWalletState = createServerFn({ method: "GET" })
  .validator((data: unknown): { address: string } => {
    const address = field(data, "address");
    if (!TON_ADDR.test(address)) throw new Error("That is not a TON address.");
    return { address };
  })
  .handler(async ({ data }): Promise<{ seqno: number; publicKey: string | null; state: "active" | "uninitialized" | "frozen" | "unknown"; balance: string }> => {
    await (await import("./guard.server")).guardRelay("read");
    const api = await import("./site-ton.server");
    const chain = await api.tonWalletChain(data.address);
    return { seqno: chain.seqno, state: chain.state, publicKey: null, balance: chain.balance };
  });

export const sendTonMessage = createServerFn({ method: "POST" })
  .validator((data: unknown): { boc: string } => {
    const boc = field(data, "boc");
    if (boc.length < 40 || boc.length > 20000 || !/^[A-Za-z0-9+/=]+$/.test(boc)) throw new Error(`Message looks wrong (${boc.length} characters).`);
    return { boc };
  })
  .handler(async ({ data }): Promise<{ hash: string }> => {
    await (await import("./guard.server")).guardRelay("send");
    return { hash: await (await import("./site-ton.server")).sendTonBoc(data.boc) };
  });
