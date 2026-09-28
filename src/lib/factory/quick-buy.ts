/**
 * One-tap buys from the board: a fixed amount of the chain's own coin, straight into a Ferzan curve.
 * The visitor's wallet still approves every buy; nothing is signed for them.
 * Solana curves: the same Meteora swap the coin page builds. EVM curves: the curve's buy() with 15% slippage.
 */
import { useSyncExternalStore } from "react";
import { siteCoinHref, SEL, word, addrWord, getBotCurve, quoteBotCurve, BOT_CURVE_CHAINS, type BotCurveChain } from "@/lib/factory/bot-curve";
import { buildSolSwap } from "@/lib/factory/sol-coin";
import { evmWallet, solanaWallet } from "@/lib/factory/wallet-bridge";
import { getReceipt } from "@/lib/factory/relay";
import { parseDecimal } from "@/lib/factory/units";
import { creditCall } from "./compete";

export type QuickUnit = "SOL" | "ETH" | "BNB" | "USDC";
const DEFAULTS: Record<QuickUnit, string> = { SOL: "0.1", ETH: "0.005", BNB: "0.02", USDC: "5" };
const MAX: Record<QuickUnit, number> = { SOL: 50, ETH: 5, BNB: 20, USDC: 10_000 };
const KEY = "ferzan-quick-buy";
const SLIPPAGE_BPS = 1500;
const ZERO = "0x0000000000000000000000000000000000000000";

export const UNIT_OF: Record<string, QuickUnit> = { solana: "SOL", base: "ETH", ethereum: "ETH", robinhood: "ETH", bsc: "BNB", arc: "USDC" };

let amounts: Record<QuickUnit, string> = { ...DEFAULTS };
let loaded = false;
const subs = new Set<() => void>();

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    const saved = JSON.parse(window.localStorage.getItem(KEY) || "{}") as Record<string, string>;
    for (const u of Object.keys(DEFAULTS) as QuickUnit[]) {
      if (typeof saved[u] === "string" && validAmount(u, saved[u])) amounts[u] = saved[u];
    }
  } catch {
    /* private mode: defaults */
  }
}

export function validAmount(unit: QuickUnit, v: string): boolean {
  const n = Number(v);
  return /^\d*\.?\d+$/.test(v.trim()) && n > 0 && n <= MAX[unit];
}

export function setQuickAmount(unit: QuickUnit, v: string) {
  if (!validAmount(unit, v)) return;
  amounts = { ...amounts, [unit]: v.trim() };
  try {
    window.localStorage.setItem(KEY, JSON.stringify(amounts));
  } catch {
    /* not saved, still used this visit */
  }
  subs.forEach((fn) => fn());
}

export function useQuickAmounts(): Record<QuickUnit, string> {
  return useSyncExternalStore(
    (fn) => {
      load();
      subs.add(fn);
      return () => subs.delete(fn);
    },
    () => (load(), amounts),
    () => DEFAULTS,
  );
}

/** Where a board coin can be quick-bought: { chain, id } (Solana mint or EVM curve), or null. */
export function quickTarget(coin: { chain: string; token: string; url: string; graduated: boolean }): { chain: string; id: string } | null {
  if (coin.graduated) return null;
  const href = siteCoinHref(coin.url) ?? "";
  const m = /^\/coin\/([a-z]+)\/([0-9A-Za-z]+)$/.exec(href);
  if (!m) return null;
  if (m[1] === "solana") return { chain: "solana", id: m[2] };
  return (BOT_CURVE_CHAINS as readonly string[]).includes(m[1]) ? { chain: m[1], id: m[2] } : null;
}

function fromB64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

function referrer(me: string): string {
  try {
    const ref = window.sessionStorage.getItem("ferzan-ref") ?? "";
    return /^0x[0-9a-f]{40}$/.test(ref) && ref !== me.toLowerCase() ? ref : ZERO;
  } catch {
    return ZERO;
  }
}

/** Buys `amount` (whole units of the chain's coin). Resolves with the transaction id once sent (Solana) or confirmed (EVM). */
export async function quickBuy(target: { chain: string; id: string }, amount: string, step: (msg: string) => void): Promise<string> {
  if (target.chain === "solana") {
    const lamports = parseDecimal(amount, 9);
    if (!lamports || lamports <= 0n) throw new Error("Set a quick-buy amount first.");
    step("Connect your wallet.");
    const w = await solanaWallet();
    step("Preparing the buy.");
    const built = await buildSolSwap({ data: { mint: target.id, wallet: w.address, side: "buy", amount: lamports.toString(), slippageBps: SLIPPAGE_BPS, simulate: true } });
    if (built.simError) {
      throw new Error(/insufficient/i.test(built.simError) ? "Not enough SOL for this buy plus fees (keep about 0.01 SOL extra)." : `Solana would reject this buy: ${built.simError}`);
    }
    step("Approve the buy in your wallet.");
    const sig = await w.signAndSend(fromB64(built.txB64));
    creditCall("solana", sig, w.address);
    return sig;
  }
  const chain = target.chain as BotCurveChain;
  const curve = target.id.toLowerCase();
  const wei = parseDecimal(amount, 18);
  if (!wei || wei <= 0n) throw new Error("Set a quick-buy amount first.");
  step("Connect your wallet.");
  const { address: from, provider } = await evmWallet(chain);
  const state = await getBotCurve({ data: { chain, curve, wallet: from, tf: 300 } });
  if (state.startTime > Date.now() / 1000) throw new Error("Trading has not opened yet.");
  const cap = BigInt(state.maxBuy);
  if (cap > 0n && BigInt(state.mine?.bought ?? "0") + wei > cap) throw new Error("That is over this coin's max buy per wallet. Open the coin to buy less.");
  const q = await quoteBotCurve({ data: { chain, curve, side: "buy", amount: wei.toString() } });
  const out = BigInt(q.out);
  if (out <= 0n) throw new Error("That amount gets nothing back.");
  const minOut = (out * BigInt(10_000 - SLIPPAGE_BPS)) / 10_000n;
  step("Approve the buy in your wallet.");
  const hash = await provider.request({
    method: "eth_sendTransaction",
    params: [{ from, to: curve, data: SEL.buy + word(minOut) + addrWord(referrer(from)), value: "0x" + wei.toString(16) }],
  });
  if (typeof hash !== "string") throw new Error("The wallet did not send it.");
  step("Confirming…");
  for (let i = 0; i < 48; i += 1) {
    const r = await getReceipt({ data: { chain, hash } }).catch(() => null);
    if (r) {
      if (r.status !== "0x1") throw new Error("The buy failed on chain (price moved or max buy reached).");
      return hash;
    }
    await new Promise((res) => setTimeout(res, 2500));
  }
  return hash;
}
