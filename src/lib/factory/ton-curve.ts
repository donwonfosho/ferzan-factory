/**
 * On-site trading for Ferzan bonding curves on TON. Reads come from the Launch Bot API (which reads the chain);
 * the visitor's own TON Connect wallet signs. Amounts are in nanoTON / coin units (9 decimals for both TON and
 * Ferzan TON coins). The curve address is the bounceable "EQ…" form the Launch Bot publishes.
 */
import { createServerFn } from "@tanstack/react-start";

export const TON_CURVE_ADDRESS = /^EQ[A-Za-z0-9_-]{46}$/;
const TON_WALLET = /^(?:(?:0|-1):[0-9a-fA-F]{64}|[A-Za-z0-9_-]{48})$/;

export type TonCurveState = {
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
  overhead: string;
  complete: boolean;
  graduated: boolean;
  candles: [number, number, number, number, number, number][];
  trades: { ts: number; buy: boolean; native: number; tokens: number; trader: string; tx: string }[];
  mine: null | { balance: string };
};

type ReadArgs = { curve: string; wallet: string; tf: number };

function readArgs(data: unknown): ReadArgs {
  const row = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
  const curve = String(row.curve ?? "");
  const wallet = String(row.wallet ?? "");
  const tf = Number(row.tf ?? 300);
  if (!TON_CURVE_ADDRESS.test(curve)) throw new Error("That coin address looks wrong.");
  if (wallet && !TON_WALLET.test(wallet)) throw new Error("Wallet looks wrong.");
  return { curve, wallet, tf: [60, 300, 900, 3600, 14400].includes(tf) ? tf : 300 };
}

export const getTonCurve = createServerFn({ method: "POST" })
  .validator(readArgs)
  .handler(async ({ data }): Promise<TonCurveState> => {
    await (await import("./guard.server")).guardRelay("read");
    return (await import("./ton-curve.server")).loadTonCurve(data);
  });

export const quoteTonCurve = createServerFn({ method: "POST" })
  .validator((data: unknown): { curve: string; side: "buy" | "sell"; amount: string } => {
    const row = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
    const curve = String(row.curve ?? "");
    const amount = String(row.amount ?? "");
    if (!TON_CURVE_ADDRESS.test(curve) || !/^\d{1,30}$/.test(amount) || amount === "0") throw new Error("Amount looks wrong.");
    return { curve, side: row.side === "sell" ? "sell" : "buy", amount };
  })
  .handler(async ({ data }): Promise<{ out: string; refund: string }> => {
    await (await import("./guard.server")).guardRelay("read");
    return (await import("./ton-curve.server")).quoteTon(data);
  });

export type TonTradeMessage = { address: string; amount: string; payload?: string };

export const buildTonTrade = createServerFn({ method: "POST" })
  .validator((data: unknown): { curve: string; wallet: string; side: "buy" | "sell"; amount: string; minOut: string; ref: string } => {
    const row = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
    const curve = String(row.curve ?? "");
    const wallet = String(row.wallet ?? "");
    const amount = String(row.amount ?? "");
    const minOut = String(row.minOut ?? "0");
    const ref = String(row.ref ?? "");
    const side = row.side === "sell" ? "sell" : "buy";
    if (!TON_CURVE_ADDRESS.test(curve) || !TON_WALLET.test(wallet)) throw new Error("Address looks wrong.");
    if (!/^\d{1,30}$/.test(amount) || amount === "0" || !/^\d{1,30}$/.test(minOut)) throw new Error("Amount looks wrong.");
    return { curve, wallet, side, amount, minOut, ref: TON_WALLET.test(ref) ? ref : "" };
  })
  .handler(async ({ data }): Promise<{ message: TonTradeMessage; validUntil: number; network: string }> => {
    await (await import("./guard.server")).guardRelay("send");
    return (await import("./ton-curve.server")).buildTrade(data);
  });
