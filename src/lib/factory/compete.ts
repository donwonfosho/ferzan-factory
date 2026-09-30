/**
 * Weekly competition (volume and profit), the callers board, and share-link credit.
 * Data comes from the Launch Bot API; weeks start at the FERZAN launch (Thu Oct 15, 4:00 PM ET).
 */
import { createServerFn } from "@tanstack/react-start";

const API = "https://launch.ferzaneco.com/api";
const ADDR = /^(0x[0-9a-fA-F]{40}|[1-9A-HJ-NP-Za-km-z]{32,48}|[EUk]Q[A-Za-z0-9_-]{46}|-?[01]:[0-9a-fA-F]{64})$/;
const PATH = /^\/(coin|token|c)\/[a-z]{2,12}\/[0-9A-Za-z_-]{20,70}$/;
const SIG = /^([1-9A-HJ-NP-Za-km-z]{64,90}|[0-9a-fA-F]{64}|[A-Za-z0-9+/_=-]{43,48})$/;

const str = (v: unknown, max = 80) => (typeof v === "string" ? v.slice(0, max) : "");
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const rec = (v: unknown): Record<string, unknown> => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const addr = (v: unknown) => (typeof v === "string" && ADDR.test(v) ? v : "");

export type VolumeRow = { wallet: string; short: string; volumeUsd: number; trades: number };
export type ProfitRow = { wallet: string; short: string; pnlUsd: number; pnlPct: number; spentUsd: number; best: string };
export type Call = { chain: string; symbol: string; multiple: number; buyers: number; path: string };
export type CallerRow = { wallet: string; short: string; best: Call; avgMultiple: number; calls: number; buyers: number; volumeUsd: number; top: Call[] };
export type Compete = {
  week: number;
  start: number;
  end: number;
  now: number;
  practice: boolean;
  startsAt: number;
  prizesLive: boolean;
  prizeText: string;
  traders: number;
  minSpentUsd: number;
  callerMinBuyers: number;
  volume: VolumeRow[];
  profit: ProfitRow[];
  callers: CallerRow[];
};

function call(raw: unknown): Call {
  const c = rec(raw);
  const path = str(c.path, 120);
  return { chain: str(c.chain, 12), symbol: str(c.symbol, 16), multiple: num(c.multiple), buyers: num(c.buyers), path: PATH.test(path) ? path : "" };
}

export const getCompete = createServerFn({ method: "GET" })
  .validator((d: unknown): { prev: boolean } => ({ prev: rec(d).prev === true }))
  .handler(async ({ data }): Promise<Compete | null> => {
    const res = await fetch(`${API}/compete?prev=${data.prev ? 1 : 0}`, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(12_000) }).catch(() => null);
    if (!res || !res.ok) return null;
    const it = rec(await res.json().catch(() => null));
    const prizes = rec(it.prizes);
    const rules = rec(it.rules);
    return {
      week: num(it.week),
      start: num(it.start),
      end: num(it.end),
      now: num(it.now),
      practice: it.practice === true,
      startsAt: num(it.starts_at),
      prizesLive: prizes.live === true,
      prizeText: str(prizes.text, 200),
      traders: num(it.traders),
      minSpentUsd: num(rules.min_spent_usd),
      callerMinBuyers: num(rules.caller_min_buyers),
      volume: arr(it.volume)
        .slice(0, 25)
        .map((raw) => {
          const r = rec(raw);
          return { wallet: addr(r.wallet), short: str(r.short, 16), volumeUsd: num(r.volume_usd), trades: num(r.trades) };
        })
        .filter((r) => r.wallet),
      profit: arr(it.profit)
        .slice(0, 25)
        .map((raw) => {
          const r = rec(raw);
          return { wallet: addr(r.wallet), short: str(r.short, 16), pnlUsd: num(r.pnl_usd), pnlPct: num(r.pnl_pct), spentUsd: num(r.spent_usd), best: str(r.best, 16) };
        })
        .filter((r) => r.wallet),
      callers: arr(it.callers)
        .slice(0, 25)
        .map((raw) => {
          const r = rec(raw);
          return {
            wallet: addr(r.wallet),
            short: str(r.short, 16),
            best: call(r.best),
            avgMultiple: num(r.avg_multiple),
            calls: num(r.calls),
            buyers: num(r.buyers),
            volumeUsd: num(r.volume_usd),
            top: arr(r.top).slice(0, 3).map(call),
          };
        })
        .filter((r) => r.wallet),
    };
  });

const creditCallFn = createServerFn({ method: "POST" })
  .validator((raw: unknown): { chain: string; tx: string; ref: string } => {
    const d = rec(raw);
    const chain = str(d.chain, 12);
    const tx = str(d.tx, 100);
    const ref = str(d.ref, 80);
    if (!["solana", "ton"].includes(chain) || !SIG.test(tx) || !ADDR.test(ref)) throw new Error("bad request");
    return { chain, tx, ref };
  })
  .handler(async ({ data }) => {
    await fetch(`${API}/call-credit`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(data),
      signal: AbortSignal.timeout(8_000),
    }).catch(() => null);
    return { ok: true };
  });

/* ---- share-link credit: ?ref=<wallet> is kept for 7 days in this browser ---- */
const KEY = "ferzan-call";
const KEEP_MS = 7 * 86_400_000;

/** Call once per page load: remembers who shared the link this visitor came in on. */
export function captureRef() {
  if (typeof window === "undefined") return;
  const ref = new URLSearchParams(window.location.search).get("ref") ?? "";
  if (!ADDR.test(ref)) return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ ref, ts: Date.now() }));
  } catch {
    /* storage blocked: the link still credits EVM buys on this page */
  }
}

/** The wallet that shared the link this visitor came from, never the buyer's own. */
export function sharedBy(buyer: string): string {
  if (typeof window === "undefined") return "";
  try {
    const v = JSON.parse(window.localStorage.getItem(KEY) ?? "null") as { ref?: string; ts?: number } | null;
    if (!v?.ref || !ADDR.test(v.ref) || Date.now() - (v.ts ?? 0) > KEEP_MS) return "";
    return v.ref.toLowerCase() === buyer.toLowerCase() ? "" : v.ref;
  } catch {
    return "";
  }
}

/** After a Solana buy on the site: tell the callers board who shared the link. Never blocks or fails the buy. */
export function creditCall(chain: "solana" | "ton", tx: string, buyer: string) {
  const ref = sharedBy(buyer);
  if (!ref || !SIG.test(tx)) return;
  void creditCallFn({ data: { chain, tx, ref } }).catch(() => null);
}
