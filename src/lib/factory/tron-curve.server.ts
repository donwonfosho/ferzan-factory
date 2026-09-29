/** Server-only: the Launch Bot API reads Ferzan Tron curves and prepares unsigned calls; nothing here signs or sends. */
import type { TronCurveState } from "./tron-curve";

const API = "https://launch.ferzaneco.com/api";
const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

export function tronHex(address: string): string {
  let n = 0n;
  for (const ch of address) {
    const i = B58.indexOf(ch);
    if (i < 0) throw new Error("Tron address looks wrong.");
    n = n * 58n + BigInt(i);
  }
  return n.toString(16).padStart(50, "0").slice(0, 42);
}

const str = (v: unknown, max = 200): string => (typeof v === "string" ? v.slice(0, max) : "");
const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const uint = (v: unknown): string => (typeof v === "number" && Number.isSafeInteger(v) && v >= 0 ? String(v) : typeof v === "string" && /^\d{1,40}$/.test(v) ? v : "0");
const https = (v: unknown): string => {
  const s = str(v);
  return /^https:\/\/[^\s"'<>]+$/.test(s) ? s : "";
};

async function getJson(path: string, ttlMs = 0): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch(`${API}${path}`, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(10_000) });
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

export async function loadTronCurve(input: { curve: string; wallet: string; tf: number }): Promise<TronCurveState> {
  const q = input.wallet ? `?wallet=${input.wallet}` : "";
  const [st, chart, info] = await Promise.all([
    getJson(`/tron-curve/${input.curve}${q}`),
    getJson(`/curve-chart/${input.curve}?tf=${input.tf}`, 1),
    getJson(`/curve-info/${input.curve}`, 1),
  ]);
  if (!st) throw new Error("That is not a Ferzan curve.");
  const token = str(st.token, 40);
  const grad = uint(st.grad_target);
  const real = uint(st.real);
  const stats = (chart?.creator_stats ?? {}) as Record<string, unknown>;
  const candles = Array.isArray(chart?.candles) ? (chart!.candles as unknown[]) : [];
  const trades = Array.isArray(chart?.trades) ? (chart!.trades as unknown[]) : [];
  const m = (st.mine ?? null) as Record<string, unknown> | null;
  const gradN = Number(grad);
  return {
    curve: input.curve,
    token,
    name: str(info?.name, 40) || "Unnamed",
    symbol: str(info?.symbol, 12) || "?",
    image: https(info?.image),
    description: str(info?.description, 500),
    links: { website: https(info?.website), x: https(info?.x), telegram: https(info?.telegram) },
    creator: str(chart?.creator, 40),
    creatorLaunches: num(stats.launches),
    creatorGraduated: num(stats.graduated),
    nativeUsd: num(chart?.native_usd),
    price: num(chart?.price),
    mcapUsd: num(chart?.mcap_usd),
    progress: st.graduated === true ? 100 : gradN > 0 ? Math.min(100, (Number(real) * 100) / gradN) : 0,
    gradTarget: grad,
    real,
    start: num(st.start),
    maxBuy: uint(st.max_buy),
    complete: st.complete === true,
    graduated: st.graduated === true,
    candles: candles
      .filter((k): k is number[] => Array.isArray(k) && k.length >= 6 && k.every((x) => typeof x === "number"))
      .slice(-400)
      .map((k) => [k[0], k[1], k[2], k[3], k[4], k[5]] as [number, number, number, number, number, number]),
    trades: trades.slice(0, 25).map((t) => {
      const r = (t ?? {}) as Record<string, unknown>;
      return { ts: num(r.ts), buy: r.buy === true, native: num(r.native), tokens: num(r.tokens), trader: str(r.trader, 40), tx: str(r.tx, 66) };
    }),
    mine: m ? { balance: uint(m.balance), allowance: uint(m.allowance), bought: uint(m.bought), trx: uint(m.trx) } : null,
  };
}

export async function quoteTron(input: { curve: string; side: "buy" | "sell"; amount: string }): Promise<{ out: string; refund: string }> {
  const q = await getJson(`/tron-curve/${input.curve}/quote?side=${input.side}&amount=${input.amount}`);
  return { out: uint(q?.out), refund: input.side === "buy" ? uint(q?.refund) : "0" };
}

export async function buildTrade(input: {
  curve: string;
  wallet: string;
  side: "buy" | "sell" | "approve";
  amount: string;
  minOut: string;
  ref: string;
}): Promise<{ transactionJson: string }> {
  const state = await getJson(`/tron-curve/${input.curve}`);
  const token = str(state?.token, 40);
  if (!/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(token)) throw new Error("That is not a Ferzan curve.");
  const res = await fetch(`${API}/tron-curve/${input.curve}/tx`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ wallet: input.wallet, side: input.side, amount: input.amount, min_out: input.minOut, ref: input.ref }),
    signal: AbortSignal.timeout(20_000),
  }).catch(() => null);
  const out = (await res?.json().catch(() => ({}))) as { transaction?: Record<string, unknown>; detail?: unknown } | undefined;
  if (!res || !res.ok || !out?.transaction) {
    throw new Error(typeof out?.detail === "string" ? out.detail.slice(0, 160) : "The service could not prepare that. Try again.");
  }
  // Check the call ourselves before the wallet sees it: right sender, right contract, right TRX amount.
  const tx = out.transaction;
  const raw = (tx.raw_data ?? {}) as { contract?: { type?: string; parameter?: { value?: Record<string, unknown> } }[] };
  const c = raw.contract?.[0];
  const v = c?.parameter?.value ?? {};
  const wantTo = tronHex(input.side === "approve" ? token : input.curve);
  const value = BigInt(uint(v.call_value ?? 0));
  const wantValue = input.side === "buy" ? BigInt(input.amount) : 0n;
  if (c?.type !== "TriggerSmartContract" || String(v.contract_address ?? "").toLowerCase() !== wantTo) throw new Error("The transaction does not go to the right contract. Nothing was sent.");
  if (String(v.owner_address ?? "").toLowerCase() !== tronHex(input.wallet)) throw new Error("The transaction was built for another wallet. Nothing was sent.");
  if (value !== wantValue) throw new Error("The TRX amount looks wrong. Nothing was sent.");
  if (!/^[0-9a-f]{64}$/.test(str(tx.txID, 64))) throw new Error("The service sent a transaction we cannot use.");
  return { transactionJson: JSON.stringify(tx) };
}
