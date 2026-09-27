/**
 * Solana coin pages: data and swaps for Ferzan Meteora curves, through the Launch Bot API.
 * Chart/stats come from the public /api/sol-coin; buy/sell transactions are built by the droplet
 * (/api/sol-swap, unsigned) and signed by the visitor's own wallet.
 */
import { createServerFn } from "@tanstack/react-start";

const API = "https://launch.ferzaneco.com/api";
const B58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export type SolCoin = {
  indexed: boolean;
  mint: string;
  pool: string;
  name: string;
  symbol: string;
  image: string;
  description: string;
  links: { website: string; x: string; telegram: string };
  nativeUsd: number;
  price: number;
  mcapUsd: number;
  progress: number;
  raisedSol: number;
  gradSol: number;
  volumeSol: number;
  trades: number;
  graduated: boolean;
  creator: string;
  creatorLaunches: number;
  creatorGraduated: number;
  candles: [number, number, number, number, number, number][];
  mine: null | { lamports: string; tokenRaw: string };
};

const str = (v: unknown, max = 200) => (typeof v === "string" ? v.slice(0, max) : "");
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const https = (v: unknown) => {
  const s = str(v);
  return /^https:\/\/[^\s"'<>]+$/.test(s) ? s : "";
};

export const getSolCoin = createServerFn({ method: "POST" })
  .validator((data: unknown): { mint: string; wallet: string; tf: number } => {
    const row = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
    const mint = String(row.mint ?? "");
    const wallet = String(row.wallet ?? "");
    const tf = Number(row.tf ?? 300);
    if (!B58.test(mint)) throw new Error("That coin address looks wrong.");
    if (wallet && !B58.test(wallet)) throw new Error("Wallet looks wrong.");
    return { mint, wallet, tf: [60, 300, 900, 3600, 14400].includes(tf) ? tf : 300 };
  })
  .handler(async ({ data }): Promise<SolCoin> => {
    await (await import("./guard.server")).guardRelay("read");
    const q = new URLSearchParams({ tf: String(data.tf), ...(data.wallet ? { wallet: data.wallet } : {}) });
    let d: Record<string, unknown> = {};
    try {
      const res = await fetch(`${API}/sol-coin/${data.mint}?${q}`, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(12_000) });
      if (res.ok) d = (await res.json()) as Record<string, unknown>;
    } catch {
      d = {};
    }
    const stats = (d.creator_stats ?? {}) as Record<string, unknown>;
    const mine = (d.mine ?? null) as Record<string, unknown> | null;
    const candles = Array.isArray(d.candles) ? (d.candles as unknown[]) : [];
    return {
      indexed: d.indexed === true,
      mint: data.mint,
      pool: str(d.pool, 48),
      name: str(d.name, 40) || "Unnamed",
      symbol: str(d.symbol, 12) || "?",
      image: https(d.image),
      description: str(d.description, 500),
      links: { website: https(d.website), x: https(d.x), telegram: https(d.telegram) },
      nativeUsd: num(d.native_usd),
      price: num(d.price),
      mcapUsd: num(d.mcap_usd),
      progress: num(d.progress),
      raisedSol: num(d.raised_sol),
      gradSol: num(d.grad_sol),
      volumeSol: num(d.volume_native),
      trades: num(d.trades_count),
      graduated: d.graduated === true,
      creator: str(d.creator, 48),
      creatorLaunches: num(stats.launches),
      creatorGraduated: num(stats.graduated),
      candles: candles
        .filter((k): k is number[] => Array.isArray(k) && k.length >= 6 && k.every((x) => typeof x === "number"))
        .slice(-400)
        .map((k) => [k[0], k[1], k[2], k[3], k[4], k[5]] as [number, number, number, number, number, number]),
      mine: mine ? { lamports: /^\d+$/.test(String(mine.sol_lamports)) ? String(mine.sol_lamports) : "0", tokenRaw: /^\d+$/.test(String(mine.token_raw)) ? String(mine.token_raw) : "0" } : null,
    };
  });

/** Builds an unsigned buy (amount = lamports) or sell (amount = raw token units) for `wallet`. */
export const buildSolSwap = createServerFn({ method: "POST" })
  .validator((data: unknown): { mint: string; wallet: string; side: "buy" | "sell"; amount: string; slippageBps: number; simulate: boolean } => {
    const row = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
    const mint = String(row.mint ?? "");
    const wallet = String(row.wallet ?? "");
    const side = row.side === "sell" ? "sell" : "buy";
    const amount = String(row.amount ?? "");
    const slippageBps = Math.max(10, Math.min(5000, Math.floor(Number(row.slippageBps ?? 500))));
    if (!B58.test(mint) || !B58.test(wallet)) throw new Error("Coin or wallet looks wrong.");
    if (!/^\d{1,20}$/.test(amount) || amount === "0") throw new Error("Amount looks wrong.");
    return { mint, wallet, side, amount, slippageBps, simulate: row.simulate === true };
  })
  .handler(async ({ data }): Promise<{ txB64: string; amountOut: string; minOut: string; simError: string }> => {
    await (await import("./guard.server")).guardRelay("send");
    // The swap is unsigned and built for the visitor's own wallet, so the Launch Bot needs no key for it.
    const res = await fetch(`${API}/sol-swap`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        mint: data.mint,
        wallet: data.wallet,
        side: data.side,
        amount: data.amount,
        slippage_bps: data.slippageBps,
        simulate: data.simulate,
      }),
      signal: AbortSignal.timeout(60_000),
    }).catch(() => null);
    if (!res) throw new Error("The trade service did not answer. Try again.");
    const out = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) throw new Error(typeof out.detail === "string" ? out.detail.slice(0, 200) : `The trade service answered ${res.status}.`);
    const txB64 = str(out.tx_b64, 4000);
    const amountOut = String(out.amount_out ?? "");
    const minOut = String(out.min_out ?? "");
    if (!/^[A-Za-z0-9+/=]{100,}$/.test(txB64) || !/^\d+$/.test(amountOut) || !/^\d+$/.test(minOut)) {
      throw new Error("The trade service sent a transaction we cannot use.");
    }
    // With simulate, the droplet dry-runs the trade for this wallet; say why Solana would reject it.
    let simError = "";
    if (out.sim_err) {
      const logs = Array.isArray(out.sim_logs) ? out.sim_logs.map(String) : [];
      const hint = logs.reverse().find((l) => /insufficient|error|failed|exceed/i.test(l)) ?? "";
      simError = (hint || JSON.stringify(out.sim_err)).replace(/^Program log: /, "").slice(0, 200);
    }
    return { txB64, amountOut, minOut, simError };
  });

/**
 * Broadcasts a wallet-signed Ferzan Meteora transaction (trade, launch or fee claim) through the
 * Launch Bot's RPC, which is more reliable than the public one a browser can reach.
 */
export const sendSignedSolana = createServerFn({ method: "POST" })
  .validator((data: unknown): { signedB64: string } => {
    const row = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
    const signedB64 = String(row.signedB64 ?? "");
    if (!/^[A-Za-z0-9+/=]{100,2000}$/.test(signedB64)) throw new Error("Transaction looks wrong.");
    return { signedB64 };
  })
  .handler(async ({ data }): Promise<{ signature: string }> => {
    const guard = await import("./guard.server");
    await guard.guardRelay("send");
    await guard.assertAllowedSolanaTx(data.signedB64);
    const res = await fetch(`${API}/sol-fees/send`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ signed_tx_b64: data.signedB64 }),
      signal: AbortSignal.timeout(45_000),
    }).catch(() => null);
    if (!res) throw new Error("Solana did not answer. Try again.");
    const out = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) throw new Error(typeof out.detail === "string" ? out.detail.slice(0, 200) : `Sending failed (${res.status}).`);
    const signature = str(out.signature, 100);
    if (!B58.test(signature.slice(0, 44)) || signature.length < 64) throw new Error("Solana did not return a signature.");
    return { signature };
  });
