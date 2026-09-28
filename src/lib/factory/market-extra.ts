/**
 * Read-only data from the public Launch Bot API for coin pages and search:
 * holders + safety (snipers, launch-block bundles, dev share), a wallet's profit on a coin, and search.
 */
import { createServerFn } from "@tanstack/react-start";

const API = "https://launch.ferzaneco.com/api";
const CHAIN = /^[a-z]{2,12}$/;
const ADDR = /^(0x[0-9a-fA-F]{40}|[1-9A-HJ-NP-Za-km-z]{32,48}|[EUk]Q[A-Za-z0-9_-]{46})$/;
const PATH = /^\/(coin|token|c)\/[a-z]{2,12}\/[0-9A-Za-z_-]{20,70}$/;

const str = (v: unknown, max = 80) => (typeof v === "string" ? v.slice(0, max) : "");
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const rec = (v: unknown): Record<string, unknown> => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});

async function get(path: string, ms = 8_000): Promise<Record<string, unknown> | null> {
  const res = await fetch(`${API}${path}`, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(ms) }).catch(() => null);
  if (!res || !res.ok) return null;
  return rec(await res.json().catch(() => null));
}

function coinArgs(data: unknown): { chain: string; token: string } {
  const row = rec(data);
  const chain = String(row.chain ?? "");
  const token = String(row.token ?? "").trim();
  if (!CHAIN.test(chain) || !ADDR.test(token)) throw new Error("bad coin");
  return { chain, token };
}

export type HolderRow = { wallet: string; short: string; pct: number; tags: string[] };
export type Group = { wallets: number; boughtPct: number; holdingPct: number };
export type Holders = {
  source: "chain" | "trades";
  graduated: boolean;
  holders: HolderRow[];
  holderCount: number;
  top10Pct: number;
  devPct: number | null;
  snipers: Group;
  bundle: Group;
  tradesSeen: number;
  note: string;
};

const group = (v: unknown): Group => {
  const g = rec(v);
  return { wallets: num(g.wallets), boughtPct: num(g.bought_pct), holdingPct: num(g.holding_pct) };
};

export const getHolders = createServerFn({ method: "GET" })
  .validator(coinArgs)
  .handler(async ({ data }): Promise<Holders | null> => {
    const it = await get(`/holders/${data.chain}/${encodeURIComponent(data.token)}`);
    if (!it || it.found !== true) return null;
    const TAGS = new Set(["curve", "program", "dev", "sniper", "bundle"]);
    const holders = (Array.isArray(it.holders) ? it.holders : []).slice(0, 20).map((h) => {
      const r = rec(h);
      return {
        wallet: str(r.wallet, 70),
        short: str(r.short, 16),
        pct: Math.max(0, Math.min(100, num(r.pct))),
        tags: (Array.isArray(r.tags) ? r.tags : []).filter((t): t is string => typeof t === "string" && TAGS.has(t)),
      };
    });
    return {
      source: it.source === "chain" ? "chain" : "trades",
      graduated: it.graduated === true,
      holders,
      holderCount: num(it.holder_count),
      top10Pct: num(it.top10_pct),
      devPct: typeof it.dev_pct === "number" ? it.dev_pct : null,
      snipers: group(it.snipers),
      bundle: group(it.bundle),
      tradesSeen: num(it.trades_seen),
      note: str(it.note, 200),
    };
  });

export type Pnl = {
  symbol: string;
  unit: string;
  spent: number;
  received: number;
  holdingValue: number;
  pnl: number;
  pnlUsd: number;
  pnlPct: number;
  entryMcapUsd: number;
  mcapUsd: number;
};

export const getPnl = createServerFn({ method: "GET" })
  .validator((data: unknown): { chain: string; token: string; wallet: string } => {
    const base = coinArgs(data);
    const wallet = String(rec(data).wallet ?? "").trim();
    if (!ADDR.test(wallet)) throw new Error("bad wallet");
    return { ...base, wallet };
  })
  .handler(async ({ data }): Promise<Pnl | null> => {
    const it = await get(`/pnl/${data.chain}/${encodeURIComponent(data.token)}/${encodeURIComponent(data.wallet)}`);
    if (!it || it.traded !== true) return null;
    return {
      symbol: str(it.symbol, 16),
      unit: str(it.unit, 8),
      spent: num(it.spent),
      received: num(it.received),
      holdingValue: num(it.holding_value),
      pnl: num(it.pnl),
      pnlUsd: num(it.pnl_usd),
      pnlPct: num(it.pnl_pct),
      entryMcapUsd: num(it.entry_mcap_usd),
      mcapUsd: num(it.mcap_usd),
    };
  });

export type SearchHit = {
  chain: string;
  token: string;
  symbol: string;
  name: string;
  image: string;
  mcapUsd: number;
  progress: number | null;
  graduated: boolean;
  path: string;
};

export const searchCoins = createServerFn({ method: "GET" })
  .validator((data: unknown): { q: string } => {
    const q = String(rec(data).q ?? "").trim().slice(0, 64);
    return { q };
  })
  .handler(async ({ data }): Promise<SearchHit[]> => {
    if (data.q.length < 2) return [];
    const it = await get(`/search?q=${encodeURIComponent(data.q)}&limit=12`, 6_000);
    const items = Array.isArray(it?.items) ? it.items : [];
    return items
      .map((raw) => {
        const r = rec(raw);
        const image = str(r.image, 400);
        return {
          chain: str(r.chain, 12),
          token: str(r.token, 70),
          symbol: str(r.symbol, 16),
          name: str(r.name, 40),
          image: /^https:\/\/[^\s"'<>]+$/.test(image) ? image : "",
          mcapUsd: num(r.mcap_usd),
          progress: typeof r.progress === "number" ? Math.max(0, Math.min(100, r.progress)) : null,
          graduated: r.graduated === true,
          path: str(r.path, 120),
        };
      })
      .filter((h) => PATH.test(h.path));
  });
