/**
 * Live pulse of the Ferzan platform, from the public Launch Bot API: the last trades across every chain,
 * coins that graduated in the last day, and the FERZAN hero numbers. One small call, cached a few seconds.
 */
import { createServerFn } from "@tanstack/react-start";

const API = "https://launch.ferzaneco.com/api";

export type TapeItem = {
  chain: string;
  ts: number;
  side: "buy" | "sell";
  symbol: string;
  token: string;
  native: number;
  unit: string;
  usd: number;
  who: string;
  url: string;
};
export type Graduation = { chain: string; token: string; symbol: string; name: string; ts: number; image: string; raised: number; unit: string; url: string };
export type FerzanPulse = {
  launchAt: number;
  live: boolean;
  token: string;
  url: string;
  priceUsd: number;
  mcapUsd: number;
  progress: number | null;
  graduated: boolean;
  burned: number;
  boughtSol: number;
  trades: number;
};
export type PulseStats = { launches: number; graduated: number; curves: number; chainsUsed: number; chains: number };
export type Pulse = { now: number; tape: TapeItem[]; graduations: Graduation[]; ferzan: FerzanPulse; stats: PulseStats };

const str = (v: unknown, max = 80) => (typeof v === "string" ? v.slice(0, max) : "");
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const rec = (v: unknown): Record<string, unknown> => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});
const https = (v: unknown) => {
  const s = str(v, 300);
  return /^https:\/\/[^\s"'<>]+$/.test(s) ? s : "";
};

let cached: { at: number; value: Pulse } | null = null;

export const getPulse = createServerFn({ method: "GET" }).handler(async (): Promise<Pulse | null> => {
  if (cached && Date.now() - cached.at < 4_000) return cached.value;
  const res = await fetch(`${API}/pulse`, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(6_000) }).catch(() => null);
  if (!res || !res.ok) return cached?.value ?? null;
  const body = rec(await res.json());
  const f = rec(body.ferzan);
  const st = rec(body.stats);
  const value: Pulse = {
    now: num(body.now),
    tape: (Array.isArray(body.tape) ? body.tape : []).slice(0, 30).map((raw): TapeItem => {
      const it = rec(raw);
      return {
        chain: str(it.chain, 12),
        ts: num(it.ts),
        side: it.side === "sell" ? "sell" : "buy",
        symbol: str(it.symbol, 12),
        token: str(it.token, 70),
        native: num(it.native),
        unit: str(it.unit, 6),
        usd: num(it.usd),
        who: str(it.who, 16),
        url: https(it.url),
      };
    }),
    graduations: (Array.isArray(body.graduations) ? body.graduations : []).slice(0, 5).map((raw): Graduation => {
      const it = rec(raw);
      return {
        chain: str(it.chain, 12),
        token: str(it.token, 70),
        symbol: str(it.symbol, 12),
        name: str(it.name, 40),
        ts: num(it.ts),
        image: https(it.image),
        raised: num(it.raised),
        unit: str(it.unit, 6),
        url: https(it.url),
      };
    }),
    ferzan: {
      launchAt: num(f.launch_at) || 1791586800,
      live: f.live === true,
      token: /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(str(f.token)) ? str(f.token) : "",
      url: https(f.url),
      priceUsd: num(f.price_usd),
      mcapUsd: num(f.mcap_usd),
      progress: typeof f.progress === "number" ? Math.max(0, Math.min(100, f.progress)) : null,
      graduated: f.graduated === true,
      burned: num(f.burned),
      boughtSol: num(f.bought_sol),
      trades: num(f.trades),
    },
    stats: { launches: num(st.launches), graduated: num(st.graduated), curves: num(st.curves), chainsUsed: num(st.chains_used), chains: num(st.chains) || 8 },
  };
  cached = { at: Date.now(), value };
  return value;
});
