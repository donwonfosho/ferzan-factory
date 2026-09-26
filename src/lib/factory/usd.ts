import { useEffect, useState } from "react";
import type { ChainId } from "./types";

const PAIR: Record<ChainId, string> = {
  ethereum: "ETH",
  base: "ETH",
  robinhood: "ETH",
  bsc: "BNB",
  solana: "SOL",
  arc: "USDC",
};

const cache = new Map<string, number>();

async function nativeUsd(chain: ChainId): Promise<number | null> {
  const pair = PAIR[chain];
  if (pair === "USDC") return 1;
  const hit = cache.get(pair);
  if (hit) return hit;
  const res = await fetch(`https://api.coinbase.com/v2/prices/${pair}-USD/spot`);
  if (!res.ok) return null;
  const body = (await res.json()) as { data?: { amount?: string } };
  const n = Number(body.data?.amount);
  if (!Number.isFinite(n) || n <= 0) return null;
  cache.set(pair, n);
  return n;
}

export function useNativeUsd(chain: ChainId): number | null {
  const [usd, setUsd] = useState<number | null>(cache.get(PAIR[chain]) ?? (PAIR[chain] === "USDC" ? 1 : null));
  useEffect(() => {
    let stop = false;
    void nativeUsd(chain).then((n) => {
      if (!stop && n) setUsd(n);
    });
    return () => {
      stop = true;
    };
  }, [chain]);
  return usd;
}

export function formatUsd(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "";
  if (n >= 1) return `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
  if (n >= 0.01) return `$${n.toFixed(4).replace(/0+$/, "").replace(/\.$/, "")}`;
  return `$${n.toPrecision(2)}`;
}
