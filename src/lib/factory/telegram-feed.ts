import { createServerFn } from "@tanstack/react-start";

/** Public read-only API of the Ferzan Telegram launch platform (Launch Bot, Trade Bot, Buy Bot). */
export const FERZAN_API = "https://launch.ferzaneco.com/api";

export type TelegramSort = "new" | "koth" | "trending" | "volume" | "graduated";
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
  /** "site" when it was launched on this website, otherwise "telegram". */
  source: string;
  native: string;
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

const SORTS = new Set<string>(["new", "koth", "trending", "volume", "graduated"]);
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
  if (cache.size > 500) cache.clear();
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
    source: it.source === "site" ? "site" : "telegram",
    native: str(it.native).slice(0, 6),
  };
}

/** Every Ferzan launch (site and Telegram): new, King of the Hill, trending, 24h volume or graduated; optional search. */
export const listTelegram = createServerFn({ method: "GET" })
  .validator((data: unknown): { sort: TelegramSort; chain: TelegramChain; q: string } => {
    const row = record(data);
    const sort = typeof row.sort === "string" && SORTS.has(row.sort) ? (row.sort as TelegramSort) : "new";
    const chain = typeof row.chain === "string" && CHAINS.has(row.chain) ? (row.chain as TelegramChain) : "";
    const q = typeof row.q === "string" ? row.q.replace(/[^\p{L}\p{N} ._-]/gu, "").trim().slice(0, 44) : "";
    return { sort, chain, q };
  })
  .handler(async ({ data }): Promise<TelegramCoin[]> => {
    try {
      const search = data.q ? `&q=${encodeURIComponent(data.q)}` : "";
      const body = record(await getJson(`/launches?sort=${data.sort}&limit=30${data.chain ? `&chain=${data.chain}` : ""}${search}`));
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

export type PortfolioCoin = TelegramCoin & {
  balance: number;
  valueNative: number;
  valueUsd: number;
  /** EVM curves pay the creator on every trade; null where fees are claimed instead (Solana). */
  earnedNative: number | null;
  earnedUsd: number | null;
};

export type WalletPortfolio = {
  holdings: PortfolioCoin[];
  launches: PortfolioCoin[];
  valueUsd: number;
  earnedUsd: number;
  referralUsd: number;
};

const EVM_ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const SOL_ADDRESS = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

function toPortfolioCoin(raw: unknown): PortfolioCoin {
  const it = record(raw);
  const earned = typeof it.earned_native === "number" && Number.isFinite(it.earned_native);
  return {
    ...toCoin(raw),
    balance: num(it.balance),
    valueNative: num(it.value_native),
    valueUsd: num(it.value_usd),
    earnedNative: earned ? num(it.earned_native) : null,
    earnedUsd: earned ? num(it.earned_usd) : null,
  };
}

/** What one wallet holds (live balances), launched, and earned in trading fees. */
export const getPortfolio = createServerFn({ method: "GET" })
  .validator((data: unknown): { wallet: string } => {
    const wallet = String(record(data).wallet ?? "").trim();
    if (!EVM_ADDRESS.test(wallet) && !SOL_ADDRESS.test(wallet)) throw new Error("Wallet looks wrong.");
    return { wallet };
  })
  .handler(async ({ data }): Promise<WalletPortfolio> => {
    const body = record(await getJson(`/wallet/${data.wallet}`));
    const list = (v: unknown) => (Array.isArray(v) ? v.map(toPortfolioCoin).filter((coin) => coin.token && coin.symbol) : []);
    return {
      holdings: list(body.holdings),
      launches: list(body.launches),
      valueUsd: num(body.value_usd),
      earnedUsd: num(body.earned_usd),
      referralUsd: num(body.referral_usd),
    };
  });

export type SolFeePool = { pool: string; mint: string; symbol: string; name: string; sol: number };

/** Unclaimed creator trading fees on the wallet's Solana (Meteora) launches. */
export const getSolFees = createServerFn({ method: "GET" })
  .validator((data: unknown): { wallet: string } => {
    const wallet = String(record(data).wallet ?? "").trim();
    if (!SOL_ADDRESS.test(wallet)) throw new Error("Wallet looks wrong.");
    return { wallet };
  })
  .handler(async ({ data }): Promise<{ totalSol: number; pools: SolFeePool[] }> => {
    try {
      const body = record(await getJson(`/sol-fees?wallet=${data.wallet}&role=creator`));
      const pools = (Array.isArray(body.pools) ? body.pools : [])
        .map((raw): SolFeePool => {
          const it = record(raw);
          return { pool: str(it.pool), mint: str(it.mint), symbol: str(it.symbol).slice(0, 12), name: str(it.name).slice(0, 40), sol: num(it.sol) };
        })
        .filter((p) => SOL_ADDRESS.test(p.pool) && p.sol > 0);
      return { totalSol: num(body.total_sol), pools };
    } catch {
      return { totalSol: 0, pools: [] };
    }
  });

/** Unsigned fee-claim transactions for the wallet to sign (built by the Launch Bot API). */
export const buildSolFeeClaim = createServerFn({ method: "POST" })
  .validator((data: unknown): { wallet: string; pools: string[] } => {
    const row = record(data);
    const wallet = String(row.wallet ?? "").trim();
    const pools = (Array.isArray(row.pools) ? row.pools : []).map(String).filter((p) => SOL_ADDRESS.test(p)).slice(0, 12);
    if (!SOL_ADDRESS.test(wallet) || !pools.length) throw new Error("Nothing to claim.");
    return { wallet, pools };
  })
  .handler(async ({ data }): Promise<string[]> => {
    await (await import("./guard.server")).guardRelay("send");
    const res = await fetch(`${FERZAN_API}/sol-fees/build`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ wallet: data.wallet, role: "creator", pools: data.pools }),
      signal: AbortSignal.timeout(45_000),
    }).catch(() => null);
    if (!res) throw new Error("The claim service did not answer. Try again.");
    const body = record(await res.json().catch(() => ({})));
    if (!res.ok) throw new Error(typeof body.detail === "string" ? body.detail.slice(0, 200) : `The claim service answered ${res.status}.`);
    const txs = (Array.isArray(body.txs) ? body.txs : []).map((t) => str(record(t).tx_b64)).filter((t) => /^[A-Za-z0-9+/=]{100,}$/.test(t));
    if (!txs.length) throw new Error("Nothing to claim right now.");
    return txs;
  });
