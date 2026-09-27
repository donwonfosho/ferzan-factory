/**
 * On-site trading for coins launched through the Ferzan bots (EVM curves from the bots' factories).
 * Reads come from the chain the coin lives on (never the wallet's current network) and from the
 * public Launch Bot API for chart, trades and project info. The browser wallet signs trades.
 */
import { createServerFn } from "@tanstack/react-start";

export const BOT_CURVE_CHAINS = ["base", "bsc", "ethereum", "robinhood", "arc"] as const;
export type BotCurveChain = (typeof BOT_CURVE_CHAINS)[number];

/** Verified against contracts/FerzanCurve.sol and CurveToken.sol (keccak256 of each signature). */
export const SEL = {
  token: "0xfc0c546a",
  gradTarget: "0x9a3a8ee1",
  realEth: "0x7a2a2a2b",
  tokensSold: "0x518ab2a8",
  graduated: "0xe7c2b772",
  startTime: "0x78e97925",
  maxBuyPerWallet: "0x8cadf61d",
  boughtNative: "0x4a1e9ab9",
  quoteBuy: "0x4beb394c",
  quoteSell: "0xa64190c4",
  buy: "0x7deb6025", // buy(uint256 minTokensOut, address referrer)
  sell: "0xd04c6983", // sell(uint256 tokenIn, uint256 minNativeOut, address referrer)
  balanceOf: "0x70a08231",
  lockedUntilGraduation: "0x1ef4cb94",
  allowance: "0xdd62ed3e",
  approve: "0x095ea7b3",
} as const;

export const word = (v: bigint) => v.toString(16).padStart(64, "0");
export const addrWord = (a: string) => a.toLowerCase().replace(/^0x/, "").padStart(64, "0");

/** Links from the bots (curve.html) that this site can show itself. */
export function siteCoinHref(url: string): string | null {
  const m = /curve\.html\?chain=(base|bsc|ethereum|robinhood|arc)&curve=(0x[0-9a-fA-F]{40})/.exec(url);
  if (m) return `/coin/${m[1]}/${m[2].toLowerCase()}`;
  // Standard (fixed-supply) coins on Tron, TON and Arc: the bots link their explorer page; show ours instead.
  const tron = /^https:\/\/tronscan\.org\/#\/token20\/(T[1-9A-HJ-NP-Za-km-z]{33})$/.exec(url);
  if (tron) return `/token/tron/${tron[1]}`;
  const ton = /^https:\/\/tonviewer\.com\/([A-Za-z0-9_-]{48})$/.exec(url);
  if (ton) return `/token/ton/${ton[1]}`;
  const arc = /^https:\/\/explorer\.arc\.io\/token\/(0x[0-9a-fA-F]{40})$/.exec(url);
  if (arc) return `/token/arc/${arc[1].toLowerCase()}`;
  // The bots hand out Jupiter links for Solana coins; those get the on-site Solana page instead.
  const sol = /^https:\/\/jup\.ag\/tokens\/([1-9A-HJ-NP-Za-km-z]{32,44})$/.exec(url);
  return sol ? `/coin/solana/${sol[1]}` : null;
}

export type BotCurveState = {
  chain: BotCurveChain;
  curve: string;
  token: string;
  name: string;
  symbol: string;
  image: string;
  description: string;
  links: { website: string; x: string; telegram: string };
  native: string;
  nativeUsd: number;
  price: number;
  mcapUsd: number;
  progress: number;
  gradTarget: string;
  realEth: string;
  graduated: boolean;
  startTime: number;
  maxBuy: string;
  creator: string;
  creatorLaunches: number;
  creatorGraduated: number;
  candles: [number, number, number, number, number, number][];
  trades: { ts: number; buy: boolean; native: number; tokens: number; trader: string; tx: string }[];
  mine: null | { balance: string; locked: string; allowance: string; bought: string; nativeBalance: string };
};

function readArgs(data: unknown): { chain: BotCurveChain; curve: string; wallet: string; tf: number } {
  const row = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
  const chain = String(row.chain ?? "") as BotCurveChain;
  const curve = String(row.curve ?? "").toLowerCase();
  const wallet = String(row.wallet ?? "").toLowerCase();
  const tf = Number(row.tf ?? 300);
  if (!BOT_CURVE_CHAINS.includes(chain)) throw new Error("That chain is not open here.");
  if (!/^0x[0-9a-f]{40}$/.test(curve)) throw new Error("That coin address looks wrong.");
  if (wallet && !/^0x[0-9a-f]{40}$/.test(wallet)) throw new Error("Wallet looks wrong.");
  return { chain, curve, wallet, tf: [60, 300, 900, 3600, 14400].includes(tf) ? tf : 300 };
}

export const getBotCurve = createServerFn({ method: "POST" })
  .validator(readArgs)
  .handler(async ({ data }): Promise<BotCurveState> => {
    await (await import("./guard.server")).guardRelay("read");
    return (await import("./bot-curve.server")).loadCurve(data);
  });

export const quoteBotCurve = createServerFn({ method: "POST" })
  .validator((data: unknown): { chain: BotCurveChain; curve: string; side: "buy" | "sell"; amount: string } => {
    const base = readArgs(data);
    const row = data as Record<string, unknown>;
    const side = row.side === "sell" ? "sell" : "buy";
    const amount = String(row.amount ?? "");
    if (!/^\d{1,40}$/.test(amount) || amount === "0") throw new Error("Amount looks wrong.");
    return { chain: base.chain, curve: base.curve, side, amount };
  })
  .handler(async ({ data }): Promise<{ out: string; refund: string }> => {
    await (await import("./guard.server")).guardRelay("read");
    return (await import("./bot-curve.server")).quote(data);
  });
