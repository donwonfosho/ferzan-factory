/** Server-only: Tron reads and broadcasts for the account wallet (TronGrid). The key never reaches the server. */
import { createHash } from "node:crypto";

const GRID = "https://api.trongrid.io";
const USDT = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";

/** Optional key (TRONGRID_API_KEY) lifts TronGrid's anonymous rate limit; it is never sent to the browser. */
function headers(): Record<string, string> {
  const h: Record<string, string> = { accept: "application/json", "content-type": "application/json" };
  const key = process.env.TRONGRID_API_KEY;
  if (key) h["TRON-PRO-API-KEY"] = key;
  return h;
}

export type TronBalance = { trxSun: string; usdt: string };

export async function tronBalance(address: string): Promise<TronBalance> {
  const res = await fetch(`${GRID}/v1/accounts/${address}`, { headers: headers(), signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`TronGrid answered ${res.status}.`);
  const body = (await res.json()) as { data?: { balance?: number; trc20?: Record<string, string>[] }[] };
  const row = body.data?.[0]; // an address that never received anything has no row: balance 0
  const usdt = (row?.trc20 ?? []).map((t) => t[USDT]).find((v) => typeof v === "string") ?? "0";
  const sun = typeof row?.balance === "number" && Number.isSafeInteger(row.balance) ? row.balance : 0;
  return { trxSun: String(sun), usdt: /^\d{1,30}$/.test(usdt) ? usdt : "0" };
}

const ALLOWED = new Set(["TriggerSmartContract", "CreateSmartContract", "TransferContract", "TransferAssetContract"]);

/** Checks a signed transaction is one this site could have prepared, then hands it to TronGrid. */
export async function broadcastTron(tx: Record<string, unknown>): Promise<string> {
  const txID = String(tx.txID ?? "");
  const rawHex = String(tx.raw_data_hex ?? "");
  const sigs = Array.isArray(tx.signature) ? (tx.signature as unknown[]) : [];
  if (!/^[0-9a-f]{64}$/.test(txID) || !/^[0-9a-f]{2,20000}$/.test(rawHex)) throw new Error("Transaction looks wrong.");
  // The id is the sha256 of the raw bytes: a mismatch means the signature would cover something else.
  if (createHash("sha256").update(Buffer.from(rawHex, "hex")).digest("hex") !== txID) throw new Error("Transaction looks wrong.");
  if (sigs.length !== 1 || typeof sigs[0] !== "string" || !/^[0-9a-f]{130}$/.test(sigs[0])) throw new Error("Signature looks wrong.");
  const contracts = ((tx.raw_data as { contract?: { type?: string }[] } | undefined)?.contract ?? []) as { type?: string }[];
  if (contracts.length !== 1 || !ALLOWED.has(String(contracts[0]?.type))) throw new Error("This kind of Tron transaction is not sent from the site.");

  const res = await fetch(`${GRID}/wallet/broadcasttransaction`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(tx),
    signal: AbortSignal.timeout(20_000),
  });
  const out = (await res.json().catch(() => ({}))) as { result?: boolean; txid?: string; code?: string; message?: string };
  if (!out.result) {
    let detail = out.code ?? `status ${res.status}`;
    if (typeof out.message === "string" && /^[0-9a-f]+$/i.test(out.message)) detail += ` ${Buffer.from(out.message, "hex").toString("utf8").slice(0, 100)}`;
    throw new Error(`Tron did not take the transaction (${detail}).`);
  }
  return out.txid || txID;
}
