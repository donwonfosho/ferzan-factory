/**
 * "Buy with another chain": the visitor pays with the coin they hold on one chain, it is bridged to their own wallet on
 * the coin's chain (Relay first, deBridge as the second route, deBridge only for Solana and Tron), and then they buy with
 * the normal Buy button. Two steps on purpose: Ferzan curve coins are not in any aggregator, so a one-shot swap is not
 * possible. The site never holds funds or keys; the visitor's own wallet signs the bridge transaction.
 */
import { createServerFn } from "@tanstack/react-start";

export type BridgeChain = "ethereum" | "base" | "bsc" | "robinhood" | "arc" | "solana" | "tron";

/** Chains a visitor can pay FROM (Tron cannot be a source yet). */
export const BRIDGE_SOURCES: BridgeChain[] = ["base", "ethereum", "bsc", "robinhood", "arc", "solana"];

export const BRIDGE_META: Record<BridgeChain, { label: string; sym: string; dec: number; max: number; min: number }> = {
  ethereum: { label: "Ethereum", sym: "ETH", dec: 18, max: 5, min: 0.0005 },
  base: { label: "Base", sym: "ETH", dec: 18, max: 5, min: 0.0005 },
  bsc: { label: "BNB Chain", sym: "BNB", dec: 18, max: 25, min: 0.005 },
  robinhood: { label: "Robinhood Chain", sym: "ETH", dec: 18, max: 5, min: 0.0005 },
  arc: { label: "Arc", sym: "USDC", dec: 18, max: 25_000, min: 2 },
  solana: { label: "Solana", sym: "SOL", dec: 9, max: 200, min: 0.02 },
  tron: { label: "Tron", sym: "TRX", dec: 6, max: 100_000, min: 100 },
};

export type BridgeQuote = {
  via: "relay" | "debridge";
  /** EVM source: transactions to send in order (usually one). */
  evm: { to: string; data: string; value: string }[];
  /** Solana source: the serialized transaction, hex. */
  solHex: string;
  /** What the visitor should receive on the destination, in destination units (a string), and its text. */
  outRaw: string;
  outText: string;
  feeText: string;
};

type QuoteIn = { from: BridgeChain; to: BridgeChain; amount: string; sender: string; recipient: string };

function readQuoteIn(data: unknown): QuoteIn {
  const row = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
  const from = String(row.from ?? "") as BridgeChain;
  const to = String(row.to ?? "") as BridgeChain;
  if (!BRIDGE_SOURCES.includes(from) || !(to in BRIDGE_META) || from === to) throw new Error("Pick a different chain to pay from.");
  const amount = String(row.amount ?? "");
  if (!/^\d{1,30}$/.test(amount) || amount === "0") throw new Error("Amount looks wrong.");
  const sender = String(row.sender ?? "");
  const recipient = String(row.recipient ?? "");
  const okAddr = (chain: BridgeChain, a: string) =>
    chain === "solana" ? /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(a) : chain === "tron" ? /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(a) : /^0x[0-9a-fA-F]{40}$/.test(a);
  if (!okAddr(from, sender) || !okAddr(to, recipient)) throw new Error("Wallet address looks wrong.");
  return { from, to, amount, sender, recipient };
}

export const getBridgeQuote = createServerFn({ method: "POST" })
  .validator(readQuoteIn)
  .handler(async ({ data }): Promise<BridgeQuote> => {
    await (await import("./guard.server")).guardRelay("read");
    return (await import("./bridge-buy.server")).quoteBridge(data);
  });

/** Balance of a Tron address in sun (the other chains are read in the browser). */
export const getTronSun = createServerFn({ method: "POST" })
  .validator((data: unknown): { address: string } => {
    const row = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
    const address = String(row.address ?? "");
    if (!/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(address)) throw new Error("Tron address looks wrong.");
    return { address };
  })
  .handler(async ({ data }): Promise<{ sun: string }> => {
    await (await import("./guard.server")).guardRelay("read");
    return (await import("./bridge-buy.server")).tronSun(data.address);
  });
