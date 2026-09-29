/** Server-only: the Launch Bot API reads Ferzan TON curves and prepares unsigned messages; nothing here signs or sends. */
import type { TonCurveState, TonTradeMessage } from "./ton-curve";

const API = "https://launch.ferzaneco.com/api";

const str = (v: unknown, max = 200): string => (typeof v === "string" ? v.slice(0, max) : "");
const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const uint = (v: unknown): string => (typeof v === "number" && Number.isSafeInteger(v) && v >= 0 ? String(v) : typeof v === "string" && /^\d{1,40}$/.test(v) ? v : "0");
const https = (v: unknown): string => {
  const s = str(v);
  return /^https:\/\/[^\s"'<>]+$/.test(s) ? s : "";
};

async function getJson(path: string, ttlMs = 0): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch(`${API}${path}`, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(15_000) });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { detail?: unknown };
      if (ttlMs === 0) throw new Error(typeof body.detail === "string" ? body.detail.slice(0, 160) : `The service answered ${res.status}.`);
      return null;
    }
    return (await res.json()) as Record<string, unknown>;
  } catch (e) {
    if (e instanceof Error && ttlMs === 0) throw e;
    return null;
  }
}

export async function loadTonCurve(input: { curve: string; wallet: string; tf: number }): Promise<TonCurveState> {
  const q = input.wallet ? `?wallet=${encodeURIComponent(input.wallet)}` : "";
  const [st, chart, info] = await Promise.all([
    getJson(`/ton-curve/${input.curve}${q}`),
    getJson(`/curve-chart/${input.curve}?tf=${input.tf}`, 1),
    getJson(`/curve-info/${input.curve}`, 1),
  ]);
  if (!st) throw new Error("That is not a Ferzan curve.");
  const grad = uint(st.grad_target);
  const real = uint(st.real);
  const stats = (chart?.creator_stats ?? {}) as Record<string, unknown>;
  const candles = Array.isArray(chart?.candles) ? (chart!.candles as unknown[]) : [];
  const trades = Array.isArray(chart?.trades) ? (chart!.trades as unknown[]) : [];
  const m = (st.mine ?? null) as Record<string, unknown> | null;
  const gradN = Number(grad);
  return {
    curve: input.curve,
    token: str(st.token, 60),
    name: str(info?.name, 40) || "Unnamed",
    symbol: str(info?.symbol, 12) || "?",
    image: https(info?.image),
    description: str(info?.description, 500),
    links: { website: https(info?.website), x: https(info?.x), telegram: https(info?.telegram) },
    creator: str(chart?.creator, 70),
    creatorLaunches: num(stats.launches),
    creatorGraduated: num(stats.graduated),
    nativeUsd: num(chart?.native_usd),
    price: num(chart?.price),
    mcapUsd: num(chart?.mcap_usd),
    progress: st.graduated === true ? 100 : gradN > 0 ? Math.min(100, (Number(real) * 100) / gradN) : 0,
    gradTarget: grad,
    real,
    start: num(st.start),
    overhead: uint(st.overhead),
    complete: st.complete === true,
    graduated: st.graduated === true,
    candles: candles
      .filter((k): k is number[] => Array.isArray(k) && k.length >= 6 && k.every((x) => typeof x === "number"))
      .slice(-400)
      .map((k) => [k[0], k[1], k[2], k[3], k[4], k[5]] as [number, number, number, number, number, number]),
    trades: trades.slice(0, 25).map((t) => {
      const r = (t ?? {}) as Record<string, unknown>;
      return { ts: num(r.ts), buy: r.buy === true, native: num(r.native), tokens: num(r.tokens), trader: str(r.trader, 70), tx: str(r.tx, 90) };
    }),
    mine: m ? { balance: uint(m.balance) } : null,
  };
}

export async function quoteTon(input: { curve: string; side: "buy" | "sell"; amount: string }): Promise<{ out: string; refund: string }> {
  const q = await getJson(`/ton-curve/${input.curve}/quote?side=${input.side}&amount=${input.amount}`);
  return { out: uint(q?.out), refund: input.side === "buy" ? uint(q?.refund) : "0" };
}

const MAX_BUY_OVERHEAD = 300_000_000n; // the curve keeps 0.12 TON for gas; refuse anything above 0.3
const MAX_SELL_ATTACH = 600_000_000n; // a sell attaches 0.3 TON to the coin transfer

export async function buildTrade(input: {
  curve: string;
  wallet: string;
  side: "buy" | "sell";
  amount: string;
  minOut: string;
  ref: string;
}): Promise<{ message: TonTradeMessage; validUntil: number; network: string }> {
  const res = await fetch(`${API}/ton-curve/${input.curve}/tx`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ wallet: input.wallet, side: input.side, amount: input.amount, min_out: input.minOut, ref: input.ref }),
    signal: AbortSignal.timeout(25_000),
  }).catch(() => null);
  const out = (await res?.json().catch(() => ({}))) as { message?: Record<string, unknown>; valid_until?: unknown; network?: unknown; detail?: unknown } | undefined;
  if (!res || !res.ok || !out?.message) {
    throw new Error(typeof out?.detail === "string" ? out.detail.slice(0, 160) : "The service could not prepare that. Try again.");
  }
  const address = str(out.message.address, 80);
  const amount = uint(out.message.amount);
  const payload = typeof out.message.payload === "string" && /^[A-Za-z0-9+/=]{4,4000}$/.test(out.message.payload) ? out.message.payload : "";
  // Check the message ourselves before the wallet sees it. A buy goes to the curve with the amount plus a small gas
  // allowance; a sell goes to the seller's own coin wallet with a small fixed attachment.
  if (!/^[A-Za-z0-9_-]{48}$/.test(address) || !payload) throw new Error("The service sent a transaction we cannot use.");
  const value = BigInt(amount);
  if (input.side === "buy") {
    if (address !== input.curve) throw new Error("The transaction does not go to the right contract. Nothing was sent.");
    const extra = value - BigInt(input.amount);
    if (extra < 0n || extra > MAX_BUY_OVERHEAD) throw new Error("The TON amount looks wrong. Nothing was sent.");
  } else if (value <= 0n || value > MAX_SELL_ATTACH) {
    throw new Error("The TON amount looks wrong. Nothing was sent.");
  }
  const validUntil = Number(out.valid_until);
  const now = Math.floor(Date.now() / 1000);
  return {
    message: { address, amount, payload },
    validUntil: Number.isFinite(validUntil) && validUntil > now && validUntil < now + 3600 ? validUntil : now + 600,
    network: str(out.network, 8) === "-3" ? "-3" : "-239",
  };
}
