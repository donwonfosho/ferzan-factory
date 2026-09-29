/**
 * On-site trading for Ferzan bonding curves on Tron. Reads come from the Launch Bot API (which reads the chain);
 * the visitor's own TronLink signs. Amounts are in sun / coin units (6 decimals for both TRX and Ferzan Tron coins).
 */
import { createServerFn } from "@tanstack/react-start";

/** Ferzan's Tron curve factory. A launch built for any other contract is refused. Update when the factory is redeployed. */
export const TRON_CURVE_FACTORY = "TPS1aM5TwfmJHjzuA1XMy6wWme2LYqZ1BN";
export const TRON_ADDRESS = /^T[1-9A-HJ-NP-Za-km-z]{33}$/;

export type TronCurveState = {
  curve: string;
  token: string;
  name: string;
  symbol: string;
  image: string;
  description: string;
  links: { website: string; x: string; telegram: string };
  creator: string;
  creatorLaunches: number;
  creatorGraduated: number;
  nativeUsd: number;
  price: number;
  mcapUsd: number;
  progress: number;
  gradTarget: string;
  real: string;
  start: number;
  maxBuy: string;
  complete: boolean;
  graduated: boolean;
  candles: [number, number, number, number, number, number][];
  trades: { ts: number; buy: boolean; native: number; tokens: number; trader: string; tx: string }[];
  mine: null | { balance: string; allowance: string; bought: string; trx: string };
};

type ReadArgs = { curve: string; wallet: string; tf: number };

function readArgs(data: unknown): ReadArgs {
  const row = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
  const curve = String(row.curve ?? "");
  const wallet = String(row.wallet ?? "");
  const tf = Number(row.tf ?? 300);
  if (!TRON_ADDRESS.test(curve)) throw new Error("That coin address looks wrong.");
  if (wallet && !TRON_ADDRESS.test(wallet)) throw new Error("Wallet looks wrong.");
  return { curve, wallet, tf: [60, 300, 900, 3600, 14400].includes(tf) ? tf : 300 };
}

export const getTronCurve = createServerFn({ method: "POST" })
  .validator(readArgs)
  .handler(async ({ data }): Promise<TronCurveState> => {
    await (await import("./guard.server")).guardRelay("read");
    return (await import("./tron-curve.server")).loadTronCurve(data);
  });

export const quoteTronCurve = createServerFn({ method: "POST" })
  .validator((data: unknown): { curve: string; side: "buy" | "sell"; amount: string } => {
    const row = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
    const curve = String(row.curve ?? "");
    const amount = String(row.amount ?? "");
    if (!TRON_ADDRESS.test(curve) || !/^\d{1,30}$/.test(amount) || amount === "0") throw new Error("Amount looks wrong.");
    return { curve, side: row.side === "sell" ? "sell" : "buy", amount };
  })
  .handler(async ({ data }): Promise<{ out: string; refund: string }> => {
    await (await import("./guard.server")).guardRelay("read");
    return (await import("./tron-curve.server")).quoteTron(data);
  });

export const buildTronTrade = createServerFn({ method: "POST" })
  .validator((data: unknown): { curve: string; wallet: string; side: "buy" | "sell" | "approve"; amount: string; minOut: string; ref: string } => {
    const row = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
    const curve = String(row.curve ?? "");
    const wallet = String(row.wallet ?? "");
    const amount = String(row.amount ?? "");
    const minOut = String(row.minOut ?? "0");
    const ref = String(row.ref ?? "");
    const side = row.side === "sell" ? "sell" : row.side === "approve" ? "approve" : "buy";
    if (!TRON_ADDRESS.test(curve) || !TRON_ADDRESS.test(wallet)) throw new Error("Address looks wrong.");
    if (!/^\d{1,30}$/.test(amount) || amount === "0" || !/^\d{1,30}$/.test(minOut)) throw new Error("Amount looks wrong.");
    return { curve, wallet, side, amount, minOut, ref: TRON_ADDRESS.test(ref) ? ref : "" };
  })
  .handler(async ({ data }): Promise<{ transactionJson: string }> => {
    await (await import("./guard.server")).guardRelay("send");
    return (await import("./tron-curve.server")).buildTrade(data);
  });
