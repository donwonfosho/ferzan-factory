/**
 * One live connection per tab to the Ferzan Launch API (server-sent events): every trade, new coin and
 * graduation on any chain, a second or two after it lands. Pages keep their own refresh timers as the
 * fallback, so if the live feed is down or full nothing breaks, it just gets slower.
 */
import { useEffect, useRef, useSyncExternalStore } from "react";

const STREAM = "https://launch.ferzaneco.com/api/stream";

export type LiveTrade = {
  type: "trade";
  chain: string;
  token: string;
  curve: string;
  symbol: string;
  ts: number;
  tx: string;
  side: "buy" | "sell";
  native: number;
  unit: string;
  usd: number;
  trader: string;
  who: string;
  tokens: number;
  mcapUsd: number;
  progress: number;
  trades: number;
  graduated: boolean;
  path: string;
};
export type LiveLaunch = { type: "launch"; chain: string; token: string; curve: string; symbol: string; name: string; ts: number; path: string };
export type LiveGrad = {
  type: "grad";
  chain: string;
  token: string;
  curve: string;
  symbol: string;
  name: string;
  ts: number;
  raised: number;
  unit: string;
  path: string;
};
export type LiveEvent = LiveTrade | LiveLaunch | LiveGrad;

const str = (v: unknown, max = 80) => (typeof v === "string" ? v.slice(0, max) : "");
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const PATH = /^\/(coin|token|c)\/[a-z]{2,12}\/[0-9A-Za-z_-]{20,70}$/;
const ADDR = /^[0-9A-Za-z_-]{20,70}$/;

function parse(type: string, raw: string): LiveEvent | null {
  let d: Record<string, unknown>;
  try {
    d = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
  const chain = str(d.chain, 12);
  const token = str(d.token);
  const path = str(d.path, 120);
  if (!/^[a-z]{2,12}$/.test(chain) || !ADDR.test(token) || !PATH.test(path)) return null;
  const base = { chain, token, curve: str(d.curve), symbol: str(d.symbol, 16), ts: num(d.ts), path };
  if (type === "trade") {
    return {
      ...base,
      type: "trade",
      tx: str(d.tx, 100),
      side: d.side === "sell" ? "sell" : "buy",
      native: num(d.native),
      unit: str(d.unit, 8),
      usd: num(d.usd),
      trader: str(d.trader, 70),
      who: str(d.who, 16),
      tokens: num(d.tokens),
      mcapUsd: num(d.mcap_usd),
      progress: Math.max(0, Math.min(100, num(d.progress))),
      trades: num(d.trades),
      graduated: d.graduated === true,
    };
  }
  if (type === "launch") return { ...base, type: "launch", name: str(d.name, 40) };
  if (type === "grad") return { ...base, type: "grad", name: str(d.name, 40), raised: num(d.raised), unit: str(d.unit, 8) };
  return null;
}

let es: EventSource | null = null;
let connected = false;
let retry: number | null = null;
const listeners = new Set<(e: LiveEvent) => void>();
const statusSubs = new Set<() => void>();

function setConnected(v: boolean) {
  if (connected === v) return;
  connected = v;
  statusSubs.forEach((fn) => fn());
}

function open() {
  if (typeof window === "undefined" || es || typeof EventSource === "undefined") return;
  es = new EventSource(STREAM);
  for (const type of ["trade", "launch", "grad"]) {
    es.addEventListener(type, (m) => {
      const ev = parse(type, (m as MessageEvent<string>).data);
      if (ev) listeners.forEach((fn) => fn(ev));
    });
  }
  es.onopen = () => setConnected(true);
  es.onerror = () => {
    setConnected(false);
    if (es && es.readyState === EventSource.CLOSED) {
      // the server said no (feed full or down): try again later, pages keep refreshing on their own meanwhile
      es = null;
      if (retry === null) retry = window.setTimeout(() => ((retry = null), listeners.size && open()), 30_000);
    }
  };
}

function close() {
  es?.close();
  es = null;
  setConnected(false);
}

export function subscribeLive(fn: (e: LiveEvent) => void): () => void {
  listeners.add(fn);
  open();
  return () => {
    listeners.delete(fn);
    if (listeners.size === 0) window.setTimeout(() => listeners.size === 0 && close(), 10_000);
  };
}

/** Calls `fn` for every live event while the component is mounted. */
export function useLive(fn: (e: LiveEvent) => void) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => subscribeLive((e) => ref.current(e)), []);
}

/** True while the live feed is connected. */
export function useLiveConnected(): boolean {
  return useSyncExternalStore(
    (fn) => {
      statusSubs.add(fn);
      return () => statusSubs.delete(fn);
    },
    () => connected,
    () => false,
  );
}

/** Same coin? Tokens and curves are compared case-insensitively for 0x addresses only. */
export function sameCoin(a: { chain: string; token: string; curve?: string }, chain: string, id: string): boolean {
  if (a.chain !== chain) return false;
  const k = id.startsWith("0x") ? id.toLowerCase() : id;
  const t = a.token.startsWith("0x") ? a.token.toLowerCase() : a.token;
  const c = (a.curve ?? "").startsWith("0x") ? (a.curve ?? "").toLowerCase() : (a.curve ?? "");
  return t === k || c === k;
}
