import { useEffect, useSyncExternalStore } from "react";
import { cn } from "@/lib/cn";
import { accountWallets, useAccountWallets } from "@/lib/factory/wallet-bridge";
import { dropWatch, listWatch, putWatch, type WatchedCoin } from "@/lib/factory/watchlist";

import { tr } from "@/lib/i18n";
/** Coins starred in this browser. A signed-in account also keeps a copy, merged on sign-in. */
export type Watched = { chain: string; token: string; symbol: string; path: string };
const KEY = "ferzan-watch";
let list: Watched[] = [];
let loaded = false;
const subs = new Set<() => void>();
const PATH = /^\/(coin|token|c)\/[a-z]{2,12}\/[0-9A-Za-z_-]{20,70}$/;

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    const raw = JSON.parse(window.localStorage.getItem(KEY) || "[]") as Watched[];
    list = (Array.isArray(raw) ? raw : []).filter((w) => w && typeof w.token === "string" && PATH.test(w.path)).slice(0, 100);
  } catch {
    list = [];
  }
}
function save(next: Watched[], sync = true) {
  const prev = list;
  list = next.slice(0, 100);
  try {
    window.localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* kept for this visit */
  }
  subs.forEach((fn) => fn());
  if (sync) void pushDiff(prev, list);
}

async function pushDiff(prev: Watched[], next: Watched[]) {
  const account = accountWallets();
  if (!account?.authenticated) return;
  const token = await account.accessToken();
  if (!token) return;
  for (const item of next) {
    if (prev.some((w) => same(w, item.chain, item.token))) continue;
    await putWatch({ data: { token, coin: item } }).catch(() => undefined);
  }
  for (const item of prev) {
    if (next.some((w) => same(w, item.chain, item.token))) continue;
    await dropWatch({ data: { token, chain: item.chain, tokenId: item.token } }).catch(() => undefined);
  }
}

function merge(local: Watched[], remote: WatchedCoin[]): Watched[] {
  const out = [...local];
  for (const item of remote) {
    if (!out.some((w) => same(w, item.chain, item.token))) out.push(item);
  }
  return out.slice(0, 100);
}

/** Pulls the account watchlist once per sign-in and unions it with this browser's list. */
export function WatchSync() {
  const account = useAccountWallets();
  const id = account?.userId ?? "";
  useEffect(() => {
    if (!id) return;
    let stop = false;
    void (async () => {
      const live = accountWallets();
      const token = live ? await live.accessToken() : null;
      if (!token || stop) return;
      const remote = await listWatch({ data: { token } }).catch(() => [] as WatchedCoin[]);
      if (stop) return;
      load();
      const merged = merge(list, remote);
      save(merged, false);
      for (const item of merged) {
        if (remote.some((w) => same(w, item.chain, item.token))) continue;
        await putWatch({ data: { token, coin: item } }).catch(() => undefined);
      }
    })();
    return () => {
      stop = true;
    };
  }, [id]);
  return null;
}
export function useWatchlist(): Watched[] {
  return useSyncExternalStore(
    (fn) => {
      load();
      subs.add(fn);
      return () => subs.delete(fn);
    },
    () => (load(), list),
    () => [],
  );
}
const same = (a: Watched, chain: string, token: string) => a.chain === chain && a.token.toLowerCase() === token.toLowerCase();

export function WatchButton({ chain, token, symbol, path }: Watched) {
  const items = useWatchlist();
  const on = items.some((w) => same(w, chain, token));
  return (
    <button
      type="button"
      className={cn("btn-line", on && "text-cyan")}
      aria-pressed={on}
      onClick={() => save(on ? items.filter((w) => !same(w, chain, token)) : [{ chain, token, symbol, path }, ...items])}
    >
      {on ? tr("★ Watching") : tr("☆ Watch")}
    </button>
  );
}

/** Telegram alerts through the Launch Bot: 50% / 90% of curve, graduation, +50%, 2x, −30%. */
export function AlertsButton({ chain, token }: { chain: string; token: string }) {
  if (!/^[a-z]{2,12}$/.test(chain) || !/^[0-9A-Za-z_-]{20,70}$/.test(token)) return null;
  return (
    <a className="btn-line" href={`https://t.me/Ferzan_Launch_Bot?start=watch_${chain}_${token}`} target="_blank" rel="noopener noreferrer">
      {tr("🔔 Alerts")}
    </a>
  );
}

/** Starred coins as a row of chips. */
export function WatchlistStrip({ className }: { className?: string }) {
  const items = useWatchlist();
  if (!items.length) return null;
  return (
    <div className={cn("flex items-center gap-2 overflow-x-auto pb-1", className)} aria-label={tr("Your watchlist")}>
      <span className="shrink-0 text-xs font-semibold text-muted">{tr("★ Watchlist")}</span>
      {items.map((w) => (
        <a key={`${w.chain}-${w.token}`} href={w.path} className="shrink-0 rounded-full bg-surface px-3 py-1 text-xs font-semibold shadow-border hover:shadow-border-hover">
          ${w.symbol}
        </a>
      ))}
    </div>
  );
}
