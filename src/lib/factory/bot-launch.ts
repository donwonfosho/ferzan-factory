/**
 * Launches from this site go through the Ferzan Launch Bot API, the same pipeline the
 * Telegram bots use: the coin lands on the bots' curve factories (EVM) or the Ferzan
 * Meteora DBC config (Solana), and is announced, indexed and ranked like any bot launch.
 * The visitor signs with their own wallet. No Telegram account is involved.
 */
import { createServerFn } from "@tanstack/react-start";

export const BOT_LAUNCH_CHAINS = ["solana", "base", "bsc", "ethereum", "robinhood", "arc", "tron", "ton"] as const;
export type BotLaunchChain = (typeof BOT_LAUNCH_CHAINS)[number];
/** Chains where the site launches a standard fixed-supply coin (no Ferzan curve there yet). */
export const PLAIN_LAUNCH_CHAINS = ["tron", "ton"] as const;
export type PlainLaunchChain = (typeof PLAIN_LAUNCH_CHAINS)[number];
export type CurveLaunchChain = Exclude<BotLaunchChain, "solana" | PlainLaunchChain>;

export const isPlainLaunch = (chain: BotLaunchChain): chain is PlainLaunchChain =>
  (PLAIN_LAUNCH_CHAINS as readonly string[]).includes(chain);

/** Names and gas coins, including the chains that are not in the EVM/Solana catalog. */
export const LAUNCH_CHAIN_META: Record<BotLaunchChain, { label: string; native: string }> = {
  solana: { label: "Solana", native: "SOL" },
  base: { label: "Base", native: "ETH" },
  bsc: { label: "BNB Chain", native: "BNB" },
  ethereum: { label: "Ethereum", native: "ETH" },
  robinhood: { label: "Robinhood", native: "ETH" },
  arc: { label: "Arc", native: "USDC" },
  tron: { label: "Tron", native: "TRX" },
  ton: { label: "TON", native: "TON" },
};

/** Graduation presets, same as @Ferzan_Launch_Bot. */
export const GRAD_PRESETS: Record<CurveLaunchChain, string[]> = {
  bsc: ["5", "10", "20"],
  base: ["1", "2.5", "5"],
  ethereum: ["1", "2.5", "5"],
  robinhood: ["1", "2.5", "5"],
  arc: ["5000", "10000", "25000"],
};

export type BotLaunchInput = {
  chain: BotLaunchChain;
  wallet: string;
  name: string;
  symbol: string;
  description: string;
  image: string;
  gradNative: string;
  devBuy: string;
  maxBuy: string;
  startMinutes: string;
  website: string;
  x: string;
  telegram: string;
  /** Tron / TON only: whole coins to mint once. */
  supplyWhole: string;
};

export type EvmLaunchTx = {
  kind: "evm";
  requestId: string;
  to: string;
  data: string;
  value: string;
  gas: string;
  chainId: number;
  launchFeeWei: string;
  devBuyWei: string;
};

export type SolanaLaunchTx = { kind: "solana"; requestId: string; txHex: string; mint: string; costText: string };
/** Unsigned TronGrid transaction (as JSON text, so it crosses the server boundary as plain data) for TronLink. */
export type TronLaunchTx = { kind: "tron"; requestId: string; transactionJson: string; feeSun: string };
export type TonMessage = { address: string; amount: string; stateInit?: string; payload?: string };
/** TON Connect request: deploy+mint, drop the admin (fixed supply), launch fee. */
export type TonLaunchTx = { kind: "ton"; requestId: string; messages: TonMessage[]; validUntil: number; network: string };
export type AnyLaunchTx = EvmLaunchTx | SolanaLaunchTx | TronLaunchTx | TonLaunchTx;

export function tradeUrl(chain: BotLaunchChain, token: string, curve: string): string {
  if (chain === "solana") return `https://jup.ag/tokens/${token}`;
  if (chain === "tron") return `https://tronscan.org/#/token20/${token}`;
  if (chain === "ton") return `https://tonviewer.com/${token}`;
  return `https://launch.ferzaneco.com/miniapp/curve.html?chain=${chain}&curve=${curve}`;
}

function str(row: Record<string, unknown>, key: string, max: number): string {
  const v = row[key];
  if (v == null) return "";
  if (typeof v !== "string" || v.length > max) throw new Error(`${key} looks wrong.`);
  return v.trim();
}

function readInput(data: unknown): BotLaunchInput {
  if (!data || typeof data !== "object") throw new Error("Bad launch.");
  const row = data as Record<string, unknown>;
  const chain = str(row, "chain", 12) as BotLaunchChain;
  if (!BOT_LAUNCH_CHAINS.includes(chain)) throw new Error("That chain is not open for curve launches.");
  const wallet = str(row, "wallet", 70);
  const walletOk =
    chain === "solana"
      ? /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(wallet)
      : chain === "tron"
        ? /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(wallet)
        : chain === "ton"
          ? /^(0|-1):[0-9a-fA-F]{64}$/.test(wallet) || /^[A-Za-z0-9_-]{48}$/.test(wallet)
          : /^0x[a-fA-F0-9]{40}$/.test(wallet);
  if (!walletOk) throw new Error("Connect your wallet first.");
  return {
    chain,
    wallet,
    name: str(row, "name", 32),
    symbol: str(row, "symbol", 10).toUpperCase(),
    description: str(row, "description", 500),
    image: str(row, "image", 420_000),
    gradNative: str(row, "gradNative", 20),
    devBuy: str(row, "devBuy", 20),
    maxBuy: str(row, "maxBuy", 20),
    startMinutes: str(row, "startMinutes", 6),
    website: str(row, "website", 200),
    x: str(row, "x", 200),
    telegram: str(row, "telegram", 200),
    supplyWhole: (() => {
      const v = str(row, "supplyWhole", 16) || "1000000000";
      if (!/^[1-9]\d{0,12}$/.test(v)) throw new Error("Supply looks wrong.");
      return v;
    })(),
  };
}

/** Step 1: register the launch with the bots and get the unsigned transaction for the visitor's wallet. */
export const startBotLaunch = createServerFn({ method: "POST" })
  .validator(readInput)
  .handler(async ({ data }): Promise<AnyLaunchTx> => {
    await (await import("./guard.server")).guardRelay("send");
    const api = await import("./bot-launch.server");
    return api.startLaunch(data);
  });

/** Step 2 (Solana wallets that can only sign): send the signed launch through the bots' RPC. */
export const sendBotLaunchSol = createServerFn({ method: "POST" })
  .validator((data: unknown): { requestId: string; signedB64: string } => {
    const row = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
    const requestId = str(row, "requestId", 40);
    const signedB64 = str(row, "signedB64", 4000);
    if (!/^[0-9a-f-]{36}$/.test(requestId) || !/^[A-Za-z0-9+/=]{100,}$/.test(signedB64)) throw new Error("Bad launch.");
    return { requestId, signedB64 };
  })
  .handler(async ({ data }): Promise<{ signature: string }> => {
    await (await import("./guard.server")).guardRelay("send");
    return (await import("./bot-launch.server")).sendSolana(data.requestId, data.signedB64);
  });

/** Step 3: the bots check the transaction on chain, then announce and index the coin. */
export const finishBotLaunch = createServerFn({ method: "POST" })
  .validator((data: unknown): { requestId: string; chain: BotLaunchChain; hash: string; mint: string } => {
    const row = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
    const requestId = str(row, "requestId", 40);
    const chain = str(row, "chain", 12) as BotLaunchChain;
    const hash = str(row, "hash", 100);
    const mint = str(row, "mint", 48);
    if (!/^[0-9a-f-]{36}$/.test(requestId) || !BOT_LAUNCH_CHAINS.includes(chain)) throw new Error("Bad launch.");
    const hashOk =
      chain === "solana"
        ? /^[1-9A-HJ-NP-Za-km-z]{64,90}$/.test(hash)
        : chain === "tron"
          ? /^[0-9a-f]{64}$/.test(hash)
          : chain === "ton"
            ? /^[A-Za-z0-9_-]{1,64}$/.test(hash)
            : /^0x[a-fA-F0-9]{64}$/.test(hash);
    if (!hashOk) throw new Error("Launch transaction looks wrong.");
    return { requestId, chain, hash, mint };
  })
  .handler(async ({ data }): Promise<{ token: string; curve: string; url: string }> => {
    await (await import("./guard.server")).guardRelay("send");
    const done = await (await import("./bot-launch.server")).finishLaunch(data);
    return { ...done, url: tradeUrl(data.chain, done.token, done.curve) };
  });
