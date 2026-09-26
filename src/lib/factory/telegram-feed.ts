import { createServerFn } from "@tanstack/react-start";

/** Public read-only API of the Ferzan Telegram launch platform (Launch Bot, Trade Bot, Buy Bot). */
export const FERZAN_API = "https://launch.ferzaneco.com/api";

export type TelegramSort = "new" | "koth" | "trending" | "volume";
export type TelegramChain = "" | "base" | "bsc" | "ethereum" | "robinhood" | "solana";

export type TelegramCoin = {
  chain: string;
  token: string;
  name: string;
  symbol: string;
  image: string;
  progress: number | null;
  graduated: boolean;
  mcapUsd: number;
  vol24Usd: number;
  trades: number;
  launchedTs: number;
  url: string;
  creator: string;
  creatorLaunches: number;
  creatorGraduated: number;
};

export type TelegramLeader = {
  rank: number;
  creator: string;
  short: string;
  launches: number;
  graduated: number;
  volumeUsd: number;
  trades: number;
  chains: string[];
  best: { name: string; symbol: string; chain: string; url: string; mcapUsd: number; graduated: boolean } | null;
};

const SORTS = new Set<string>(["new", "koth", "trending", "volume"]);
const CHAINS = new Set<string>(["", "base", "bsc", "ethereum", "robinhood", "solana"]);
const PERIODS = new Set<string>(["7d", "30d", "all"]);
const cache = new Map<string, { at: number; value: unknown }>();

async function getJson(path: string): Promise<unknown> {
  const hit = cache.get(path);
  if (hit && Date.now() - hit.at < 15_000) return hit.value;
  const res = await fetch(`${FERZAN_API}${path}`, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(8_000),
  });
  if (!res.ok) throw new Error(`Ferzan API answered ${res.status}`);
  const value: unknown = await res.json();
  cache.set(path, { at: Date.now(), value });
  return value;
}

const str = (v: unknown): string => (typeof v === "string" ? v : "");
const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const httpsUrl = (v: unknown): string => {
  const s = str(v);
  return /^https:\/\/[^\s"'<>]+$/.test(s) ? s : "";
};
const record = (v: unknown): Record<string, unknown> => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});

function toCoin(raw: unknown): TelegramCoin {
  const it = record(raw);
  const stats = record(it.creator_stats);
  const progress = typeof it.progress === "number" && Number.isFinite(it.progress) ? Math.max(0, Math.min(100, it.progress)) : null;
  return {
    chain: str(it.chain),
    token: str(it.token),
    name: str(it.name).slice(0, 40),
    symbol: str(it.symbol).slice(0, 12),
    image: httpsUrl(it.image),
    progress,
    graduated: it.graduated === true,
    mcapUsd: num(it.mcap_usd),
    vol24Usd: num(it.vol24_usd),
    trades: num(it.trades),
    launchedTs: num(it.launched_ts),
    url: httpsUrl(it.url),
    creator: str(it.creator),
    creatorLaunches: num(stats.launches),
    creatorGraduated: num(stats.graduated),
  };
}

/** Launches from the Telegram platform: new, King of the Hill, trending (last hour) or 24h volume. */
export const listTelegram = createServerFn({ method: "GET" })
  .validator((data: unknown): { sort: TelegramSort; chain: TelegramChain } => {
    const row = record(data);
    const sort = typeof row.sort === "string" && SORTS.has(row.sort) ? (row.sort as TelegramSort) : "new";
    const chain = typeof row.chain === "string" && CHAINS.has(row.chain) ? (row.chain as TelegramChain) : "";
    return { sort, chain };
  })
  .handler(async ({ data }): Promise<TelegramCoin[]> => {
    try {
      const body = record(await getJson(`/launches?sort=${data.sort}&limit=30${data.chain ? `&chain=${data.chain}` : ""}`));
      const items = Array.isArray(body.items) ? body.items : [];
      return items.map(toCoin).filter((coin) => coin.token && coin.url && coin.symbol);
    } catch {
      return [];
    }
  });

/** Top creators across the Telegram platform. */
export const listTelegramLeaders = createServerFn({ method: "GET" })
  .validator((data: unknown): { period: string; chain: TelegramChain } => {
    const row = record(data);
    const period = typeof row.period === "string" && PERIODS.has(row.period) ? row.period : "all";
    const chain = typeof row.chain === "string" && CHAINS.has(row.chain) ? (row.chain as TelegramChain) : "";
    return { period, chain };
  })
  .handler(async ({ data }): Promise<TelegramLeader[]> => {
    try {
      const body = record(await getJson(`/leaderboard?period=${data.period}&limit=50${data.chain ? `&chain=${data.chain}` : ""}`));
      const items = Array.isArray(body.items) ? body.items : [];
      return items.map((raw): TelegramLeader => {
        const it = record(raw);
        const best = it.best ? record(it.best) : null;
        return {
          rank: num(it.rank),
          creator: str(it.creator),
          short: str(it.short),
          launches: num(it.launches),
          graduated: num(it.graduated),
          volumeUsd: num(it.volume_usd),
          trades: num(it.trades),
          chains: Array.isArray(it.chains) ? it.chains.map(str) : [],
          best: best
            ? { name: str(best.name), symbol: str(best.symbol), chain: str(best.chain), url: httpsUrl(best.url), mcapUsd: num(best.mcap_usd), graduated: best.graduated === true }
            : null,
        };
      });
    } catch {
      return [];
    }
  });
