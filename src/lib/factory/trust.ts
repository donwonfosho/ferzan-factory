/**
 * Public trust data from the Launch Bot API (read-only): the Transparency page (burns, creator fees,
 * per-chain numbers) and creator pages (everything one wallet launched).
 */
import { createServerFn } from "@tanstack/react-start";

const API = "https://launch.ferzaneco.com/api";
const ADDR = /^(0x[0-9a-fA-F]{40}|[1-9A-HJ-NP-Za-km-z]{32,48}|[EUk]Q[A-Za-z0-9_-]{46})$/;
const PATH = /^\/(coin|token|c)\/[a-z]{2,12}\/[0-9A-Za-z_-]{20,70}$/;
const SIG = /^[1-9A-HJ-NP-Za-km-z]{60,100}$/;

const str = (v: unknown, max = 80) => (typeof v === "string" ? v.slice(0, max) : "");
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const rec = (v: unknown): Record<string, unknown> => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

async function get(path: string): Promise<Record<string, unknown> | null> {
  const res = await fetch(`${API}${path}`, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(10_000) }).catch(() => null);
  if (!res || !res.ok) return null;
  return rec(await res.json().catch(() => null));
}

export type BurnDay = { day: string; claimedSol: number; boughtSol: number; burned: number; forwardSol: number; buyTx: string; burnTx: string; claimTxs: string[] };
export type ChainRow = {
  chain: string;
  name: string;
  unit: string;
  launches: number;
  graduated: number;
  volumeUsd: number;
  volume24hUsd: number;
  trades24h: number;
  creatorFeesNative: number;
  creatorFeesUsd: number;
};
export type Transparency = {
  now: number;
  ferzanLive: boolean;
  burn: { claimedSol: number; boughtSol: number; burned: number; forwardSol: number; boughtUsd: number };
  burns: BurnDay[];
  chains: ChainRow[];
  totals: { launches: number; graduated: number; volumeUsd: number; creatorFeesUsd: number; trades24h: number; traders24h: number; tradesAll: number };
  multisig: string;
};

export const getTransparency = createServerFn({ method: "GET" }).handler(async (): Promise<Transparency | null> => {
  const it = await get("/transparency");
  if (!it) return null;
  const b = rec(it.burn);
  const t = rec(it.totals);
  return {
    now: num(it.now),
    ferzanLive: it.ferzan_live === true,
    burn: { claimedSol: num(b.claimed_sol), boughtSol: num(b.bought_sol), burned: num(b.burned), forwardSol: num(b.forward_sol), boughtUsd: num(b.bought_usd) },
    burns: arr(it.burns)
      .slice(0, 60)
      .map((raw) => {
        const d = rec(raw);
        const sig = (v: unknown) => (typeof v === "string" && SIG.test(v) ? v : "");
        return {
          day: /^\d{4}-\d{2}-\d{2}$/.test(str(d.day, 10)) ? str(d.day, 10) : "",
          claimedSol: num(d.claimed_sol),
          boughtSol: num(d.bought_sol),
          burned: num(d.burned),
          forwardSol: num(d.forward_sol),
          buyTx: sig(d.buy_tx),
          burnTx: sig(d.burn_tx),
          claimTxs: arr(d.claim_txs).map(sig).filter(Boolean).slice(0, 10),
        };
      })
      .filter((d) => d.day),
    chains: arr(it.chains)
      .slice(0, 12)
      .map((raw) => {
        const r = rec(raw);
        return {
          chain: str(r.chain, 12),
          name: str(r.name, 24),
          unit: str(r.unit, 8),
          launches: num(r.launches),
          graduated: num(r.graduated),
          volumeUsd: num(r.volume_usd),
          volume24hUsd: num(r.volume_24h_usd),
          trades24h: num(r.trades_24h),
          creatorFeesNative: num(r.creator_fees_native),
          creatorFeesUsd: num(r.creator_fees_usd),
        };
      }),
    totals: {
      launches: num(t.launches),
      graduated: num(t.graduated),
      volumeUsd: num(t.volume_usd),
      creatorFeesUsd: num(t.creator_fees_usd),
      trades24h: num(t.trades_24h),
      traders24h: num(t.traders_24h),
      tradesAll: num(t.trades_all),
    },
    multisig: ADDR.test(str(it.multisig, 60)) ? str(it.multisig, 60) : "",
  };
});

export type CreatorCoin = {
  chain: string;
  token: string;
  name: string;
  symbol: string;
  image: string;
  launchedTs: number;
  mcapUsd: number;
  progress: number | null;
  graduated: boolean;
  volumeUsd: number;
  path: string;
};
export type Creator = {
  wallet: string;
  launches: number;
  graduated: number;
  bestMcapUsd: number;
  volumeUsd: number;
  chains: string[];
  firstLaunchTs: number;
  followers: number;
  badge: string;
  score: { score: number; label: string; lines: string[] } | null;
  items: CreatorCoin[];
  followUrl: string;
};

export const getCreator = createServerFn({ method: "GET" })
  .validator((data: unknown): { wallet: string } => {
    const wallet = String(rec(data).wallet ?? "").trim();
    if (!ADDR.test(wallet)) throw new Error("bad wallet");
    return { wallet };
  })
  .handler(async ({ data }): Promise<Creator | null> => {
    const it = await get(`/creator/${encodeURIComponent(data.wallet)}`);
    if (!it || it.found !== true) return null;
    const s = rec(it.score);
    const follow = str(it.follow_url, 200);
    return {
      wallet: str(it.wallet, 70),
      launches: num(it.launches),
      graduated: num(it.graduated),
      bestMcapUsd: num(it.best_mcap_usd),
      volumeUsd: num(it.volume_usd),
      chains: arr(it.chains).map((c) => str(c, 12)).filter(Boolean),
      firstLaunchTs: num(it.first_launch_ts),
      followers: num(it.followers),
      badge: str(it.badge, 40),
      score: typeof s.score === "number" ? { score: num(s.score), label: str(s.label, 12), lines: arr(s.lines).map((l) => str(l, 120)).filter(Boolean).slice(0, 6) } : null,
      items: arr(it.items)
        .slice(0, 100)
        .map((raw) => {
          const r = rec(raw);
          const image = str(r.image, 400);
          return {
            chain: str(r.chain, 12),
            token: str(r.token, 70),
            name: str(r.name, 40),
            symbol: str(r.symbol, 16),
            image: /^https:\/\/[^\s"'<>]+$/.test(image) ? image : "",
            launchedTs: num(r.launched_ts),
            mcapUsd: num(r.mcap_usd),
            progress: typeof r.progress === "number" ? Math.max(0, Math.min(100, r.progress)) : null,
            graduated: r.graduated === true,
            volumeUsd: num(r.volume_usd),
            path: str(r.path, 120),
          };
        })
        .filter((c) => PATH.test(c.path)),
      followUrl: /^https:\/\/t\.me\/[A-Za-z0-9_]{3,40}\?start=follow_[0-9A-Za-z_-]{20,70}$/.test(follow) ? follow : "",
    };
  });
