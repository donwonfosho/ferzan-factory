/**
 * Server-only: TON reads and one broadcast for the account wallet.
 * These go through the Ferzan relay (it holds the toncenter key and retries). The browser never calls toncenter.
 */
import { tonWalletAddress } from "./ton-address";

const RELAY = "https://launch.ferzaneco.com/api/ton/relay";
/** Mainnet V4R2 subwallet id. The relay reports the same value; signing still uses this. */
const WALLET_ID = 698983191;

export type TonAccountState = "active" | "uninitialized" | "frozen" | "unknown";

function detailOf(body: Record<string, unknown>): string {
  const detail = body.detail;
  if (typeof detail === "string" && detail.trim()) return detail.trim().slice(0, 300);
  if (Array.isArray(detail)) {
    const text = detail
      .map((item) => {
        if (typeof item === "string") return item;
        if (item && typeof item === "object" && "msg" in item) return String((item as { msg: unknown }).msg);
        return "";
      })
      .filter(Boolean)
      .join(" ")
      .trim();
    if (text) return text.slice(0, 300);
  }
  return "The TON network is busy, try again in a minute.";
}

async function readJson(res: Response): Promise<{ text: string; body: Record<string, unknown> }> {
  const text = await res.text();
  try {
    const body = JSON.parse(text) as unknown;
    return { text, body: body && typeof body === "object" ? (body as Record<string, unknown>) : {} };
  } catch {
    return { text, body: {} };
  }
}

function uqAddress(address: string): string {
  const uq = tonWalletAddress(address).trim();
  if (!/^[A-Za-z0-9_-]{48}$/.test(uq)) throw new Error("That is not a TON address.");
  return uq;
}

function asState(value: unknown): TonAccountState {
  const s = typeof value === "string" ? value.toLowerCase() : "";
  if (s === "active") return "active";
  if (s === "frozen") return "frozen";
  if (s === "uninitialized" || s === "uninit" || s === "nonexist") return "uninitialized";
  return "unknown";
}

function asSeqno(value: unknown): number {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isSafeInteger(n) && n >= 0 ? n : 0;
}

function asNano(value: unknown): string {
  if (typeof value === "string" && /^\d{1,30}$/.test(value)) return value;
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) return Math.floor(value).toString();
  return "0";
}

/** One read of the account wallet. Not polled. */
export async function tonWalletChain(address: string): Promise<{ state: TonAccountState; seqno: number; balance: string }> {
  const uq = uqAddress(address);
  let res: Response;
  try {
    res = await fetch(`${RELAY}/wallet/${encodeURIComponent(uq)}`, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(12_000),
    });
  } catch (err) {
    console.error("ton relay wallet", err);
    throw new Error("The TON network is busy, try again in a minute.");
  }
  const { text, body } = await readJson(res);
  if (!res.ok) {
    console.error("ton relay wallet", res.status, text.slice(0, 800));
    throw new Error(detailOf(body));
  }
  const walletId = typeof body.wallet_id === "number" ? body.wallet_id : null;
  if (walletId != null && walletId !== WALLET_ID) console.error("ton relay wallet_id", walletId, "expected", WALLET_ID);
  return { state: asState(body.state), seqno: asSeqno(body.seqno), balance: asNano(body.balance) };
}

/** Balance for the profile card, from the same relay read. One call, not a poll. */
export async function tonBalance(address: string): Promise<string> {
  return (await tonWalletChain(address)).balance;
}

/** Broadcasts one signed external message. The relay retries; this is not called again for the same click. */
export async function sendTonBoc(boc: string): Promise<string> {
  let res: Response;
  try {
    res = await fetch(`${RELAY}/send`, {
      method: "POST",
      headers: { accept: "application/json", "content-type": "application/json" },
      body: JSON.stringify({ boc }),
      signal: AbortSignal.timeout(20_000),
    });
  } catch (err) {
    console.error("ton relay send", err);
    throw new Error("The TON network is busy, try again in a minute.");
  }
  const { text, body } = await readJson(res);
  if (!res.ok || body.ok !== true) {
    console.error("ton relay send", res.status, text.slice(0, 800));
    throw new Error(detailOf(body));
  }
  return "";
}
