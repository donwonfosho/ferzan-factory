import { useSyncExternalStore } from "react";
import { cn } from "@/lib/cn";

/** Coins starred in this browser (kept on this device only). */
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
function save(next: Watched[]) {
  list = next.slice(0, 100);
  try {
    window.localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* kept for this visit */
  }
  subs.forEach((fn) => fn());
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
      {on ? "★ Watching" : "☆ Watch"}
    </button>
  );
}

/** Telegram alerts through the Launch Bot: 50% / 90% of curve, graduation, +50%, 2x, −30%. */
export function AlertsButton({ chain, token }: { chain: string; token: string }) {
  if (!/^[a-z]{2,12}$/.test(chain) || !/^[0-9A-Za-z_-]{20,70}$/.test(token)) return null;
  return (
    <a className="btn-line" href={`https://t.me/Ferzan_Launch_Bot?start=watch_${chain}_${token}`} target="_blank" rel="noopener noreferrer">
      🔔 Alerts
    </a>
  );
}

/** Starred coins as a row of chips. */
export function WatchlistStrip({ className }: { className?: string }) {
  const items = useWatchlist();
  if (!items.length) return null;
  return (
    <div className={cn("flex items-center gap-2 overflow-x-auto pb-1", className)} aria-label="Your watchlist">
      <span className="shrink-0 text-xs font-semibold text-muted">★ Watchlist</span>
      {items.map((w) => (
        <a key={`${w.chain}-${w.token}`} href={w.path} className="shrink-0 rounded-full bg-surface px-3 py-1 text-xs font-semibold shadow-border hover:shadow-border-hover">
          ${w.symbol}
        </a>
      ))}
    </div>
  );
}
