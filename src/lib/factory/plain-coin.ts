/**
 * Standard (fixed-supply) Ferzan coins on Tron, TON and Arc: read-only data from the public Launch Bot API.
 * These coins have no Ferzan curve; people buy them in the Ferzan Trade Bot once their creator opens a pool.
 */
import { createServerFn } from "@tanstack/react-start";

const API = "https://launch.ferzaneco.com/api";

export const PLAIN_CHAINS = ["tron", "ton", "arc"] as const;
export type PlainChain = (typeof PLAIN_CHAINS)[number];

export type PlainCoin = {
  chain: PlainChain;
  chainName: string;
  token: string;
  name: string;
  symbol: string;
  image: string;
  description: string;
  links: { website: string; x: string; telegram: string };
  supply: string;
  creator: string;
  launchedTs: number;
  tx: string;
  native: string;
  explorer: string;
  tradeBot: string;
};

const ADDRESS: Record<PlainChain, RegExp> = {
  tron: /^T[1-9A-HJ-NP-Za-km-z]{33}$/,
  ton: /^[A-Za-z0-9_-]{48}$/,
  arc: /^0x[0-9a-fA-F]{40}$/,
};

const str = (v: unknown, max = 200) => (typeof v === "string" ? v.slice(0, max) : "");
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const https = (v: unknown) => {
  const s = str(v, 400);
  return /^https:\/\/[^\s"'<>]+$/.test(s) ? s : "";
};

export function isPlainCoin(chain: string, token: string): chain is PlainChain {
  return (PLAIN_CHAINS as readonly string[]).includes(chain) && ADDRESS[chain as PlainChain].test(token);
}

export const getPlainCoin = createServerFn({ method: "GET" })
  .validator((data: unknown): { chain: PlainChain; token: string } => {
    const row = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
    const chain = String(row.chain ?? "");
    const token = String(row.token ?? "").trim();
    if (!isPlainCoin(chain, token)) throw new Error("That coin link looks wrong.");
    return { chain, token };
  })
  .handler(async ({ data }): Promise<PlainCoin | null> => {
    const res = await fetch(`${API}/coin/${data.chain}/${encodeURIComponent(data.token)}`, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(8_000),
    }).catch(() => null);
    if (!res || res.status === 404) return null;
    if (!res.ok) throw new Error(`The Ferzan API answered ${res.status}.`);
    const it = (await res.json()) as Record<string, unknown>;
    const links = (it.links && typeof it.links === "object" ? it.links : {}) as Record<string, unknown>;
    return {
      chain: data.chain,
      chainName: str(it.chain_name, 20) || data.chain,
      token: str(it.token, 70),
      name: str(it.name, 40),
      symbol: str(it.symbol, 12),
      image: https(it.image),
      description: str(it.description, 400),
      links: { website: https(links.website), x: https(links.x), telegram: https(links.telegram) },
      supply: /^\d{1,40}$/.test(str(it.supply, 41)) ? str(it.supply, 41) : "0",
      creator: str(it.creator, 70),
      launchedTs: num(it.launched_ts),
      tx: str(it.tx, 100),
      native: str(it.native, 6),
      explorer: https(it.explorer),
      tradeBot: /^https:\/\/t\.me\/[A-Za-z0-9_]{3,40}\?start=buy_[A-Za-z0-9_-]{20,70}$/.test(str(it.trade_bot, 200)) ? str(it.trade_bot, 200) : "",
    };
  });
