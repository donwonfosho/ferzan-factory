import { useCallback, useEffect, useRef, useState } from "react";
import { setPollInterval } from "@/lib/factory/poll";
import { listPulseCoins, type TelegramChain, type TelegramCoin } from "@/lib/factory/telegram-feed";
import { useLiveConnected } from "@/lib/factory/live";
import { cn } from "@/lib/cn";
import { ChainMark, type MarkChain } from "./chain-mark";
import { BOARD_PICKS, coinHref } from "./launch-board";
import { compactUsd } from "./market-line";
import { QuickBuyBar, QuickBuyButton } from "./quick-buy";
import { Mark } from "./ui";
import { WatchlistStrip } from "./watch";
import { coinKey } from "@/lib/factory/streams";
import { LiveMark, useLiveStreams } from "./coin-stream";
import { sameCreator, useFollows } from "./follow";

import { tr } from "@/lib/i18n";
import { tryFive } from "@/lib/factory/retry";
const CHAIN_KEY = "ferzan-pulse-chain";
const API_CHAINS = new Set(["base", "bsc", "ethereum", "robinhood", "solana", "arc", "tron", "ton"]);
const MARKS = new Set(["solana", "base", "bsc", "ethereum", "robinhood", "arc", "tron", "ton"]);
const TABS = ["trending", "new", "soon", "graduated", "live", "following"] as const;
type Tab = (typeof TABS)[number];
const WINDOWS = ["5m", "1h", "24h"] as const;
type Window = (typeof WINDOWS)[number];
const TAB_LABEL: Record<Tab, string> = {
  trending: "Trending",
  new: "New",
  soon: "Graduating soon",
  graduated: "Graduated",
  live: "Live now",
  following: "Following",
};
const WINDOW_LABEL: Record<Window, string> = { "5m": "5 minutes", "1h": "1 hour", "24h": "24 hours" };

function age(ts: number, now: number) {
  const s = Math.max(0, Math.floor(now / 1000 - ts));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

function savedChain(): TelegramChain {
  if (typeof window === "undefined") return "";
  try {
    const value = window.localStorage.getItem(CHAIN_KEY) || "";
    return API_CHAINS.has(value) ? (value as TelegramChain) : "";
  } catch {
    return "";
  }
}

function volumeOf(coin: TelegramCoin, window: Window): number | null {
  if (window === "5m") return coin.vol5Usd;
  if (window === "1h") return coin.vol1hUsd;
  return coin.vol24Usd;
}

function pick(rows: TelegramCoin[], tab: Tab, window: Window, follows: string[], live: Set<string>): { rows: TelegramCoin[]; missing: boolean } {
  if (tab === "new") return { rows: [...rows].sort((a, b) => b.launchedTs - a.launchedTs), missing: false };
  if (tab === "live") return { rows: rows.filter((c) => live.has(coinKey(c.chain, c.token))), missing: false };
  if (tab === "following") {
    return {
      rows: rows.filter((c) => follows.some((creator) => sameCreator(creator, c.creator))).sort((a, b) => b.launchedTs - a.launchedTs),
      missing: false,
    };
  }
  if (tab === "soon") {
    return { rows: rows.filter((c) => c.progress !== null && c.progress > 70 && !c.graduated), missing: false };
  }
  if (tab === "graduated") return { rows: rows.filter((c) => c.graduated), missing: false };
  const vols = rows.map((c) => volumeOf(c, window));
  if (window !== "24h" && vols.every((v) => v === null)) return { rows: [], missing: true };
  const ranked = rows
    .map((c, i) => ({ c, v: vols[i] ?? 0 }))
    .sort((a, b) => b.v - a.v || b.c.launchedTs - a.c.launchedTs)
    .map((row) => row.c);
  return { rows: ranked, missing: false };
}

function Row({ coin, now }: { coin: TelegramCoin; now: number }) {
  const link = coinHref(coin);
  const prog = coin.graduated ? 100 : (coin.progress ?? 0);
  return (
    <a
      href={link.href}
      {...(link.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      className="flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-bg"
    >
      <Mark symbol={coin.symbol} image={coin.image || undefined} className="h-11 w-11" />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="truncate font-semibold">${coin.symbol}</span>
          <LiveMark chain={coin.chain} token={coin.token} />
          {MARKS.has(coin.chain) ? <ChainMark id={coin.chain as MarkChain} className="h-3.5 w-3.5 shrink-0" /> : null}
          {coin.safe ? <span className="shrink-0 text-xs" title={tr("Safe launch")}>🛡️</span> : null}
          <span className="shrink-0 text-xs text-muted">{coin.launchedTs ? age(coin.launchedTs, now) : ""}</span>
        </span>
        <span className="mt-0.5 flex min-w-0 items-center gap-2 whitespace-nowrap text-xs text-muted">
          <span className="tabular-nums text-fg">{compactUsd(coin.mcapUsd)}</span>
          <span className="truncate tabular-nums">{coin.trades}{" "}{tr("trades")}</span>
        </span>
        <span className="mt-1 block h-1 overflow-hidden rounded-full bg-line">
          <span className="block h-full bg-cyan" style={{ width: `${Math.max(2, prog)}%` }} />
        </span>
      </span>
      <QuickBuyButton coin={coin} />
    </a>
  );
}

/** Pulse tabs: trending by the volume window we actually have, new, close to graduation, and graduated. */
export function PulseBoard() {
  const [chain, setChain] = useState<TelegramChain>("");
  const [tab, setTab] = useState<Tab>("trending");
  const [windowId, setWindowId] = useState<Window>("24h");
  const [coins, setCoins] = useState<TelegramCoin[] | null>(null);
  const [note, setNote] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const live = useLiveConnected();
  const follows = useFollows();
  const streams = useLiveStreams();
  const seen = useRef(false);

  useEffect(() => {
    setChain(savedChain());
  }, []);

  const pull = useCallback(async () => {
    const once = () => listPulseCoins({ data: { chain } });
    try {
      const rows = seen.current ? await once() : await tryFive(once, () => setNote("Busy right now, retrying"));
      seen.current = true;
      setNote("");
      setCoins(rows);
    } catch {
      if (!seen.current) setNote("Busy right now. Try again in a minute.");
    }
  }, [chain]);

  useEffect(() => {
    seen.current = false;
    setCoins(null);
    setNote("");
    void pull();
    return setPollInterval(() => void pull(), live ? 45_000 : 12_000);
  }, [pull, live]);

  useEffect(() => setPollInterval(() => setNow(Date.now()), 5_000), []);

  function chooseChain(next: TelegramChain) {
    setChain(next);
    try {
      window.localStorage.setItem(CHAIN_KEY, next);
    } catch {
      /* this visit still uses it */
    }
  }

  const shown = coins ? pick(coins, tab, windowId, follows, new Set(streams.map((row) => row.coin))) : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-3 text-4xl">
            {tr("Pulse")}{" "}{live ? <span className="live-dot" aria-label={tr("Live")} /> : null}
          </h1>
          <p className="mt-1 text-sm text-muted">
            {tr("Every Ferzan launch on every chain, as it happens.")}{" "}
            <a href="/compete" className="font-semibold text-cyan">{tr("🏆 Weekly competition →")}</a>
          </p>
        </div>
        <div className="flex max-w-full gap-1 overflow-x-auto">
          {BOARD_PICKS.filter((p) => p.id === "all" || API_CHAINS.has(p.id)).map((p) => {
            const id = (p.id === "all" ? "" : p.id) as TelegramChain;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => chooseChain(id)}
                className={cn("min-h-9 shrink-0 rounded-lg px-3 text-xs font-semibold", chain === id ? "chip-on" : "bg-bg text-muted shadow-border")}
              >
                {tr(p.label)}
              </button>
            );
          })}
        </div>
      </div>
      <WatchlistStrip />
      <QuickBuyBar />
      <div className="flex gap-1 overflow-x-auto" role="tablist">
        {TABS.map((id) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={cn("min-h-10 shrink-0 rounded-lg px-3 text-sm font-semibold", tab === id ? "chip-on" : "bg-bg text-muted shadow-border")}>
            {tr(TAB_LABEL[id])}
          </button>
        ))}
      </div>
      {tab === "trending" ? (
        <div className="flex gap-1">
          {WINDOWS.map((id) => (
            <button key={id} type="button" onClick={() => setWindowId(id)} className={cn("min-h-9 rounded-lg px-3 text-xs font-semibold", windowId === id ? "chip-on" : "bg-bg text-muted shadow-border")}>
              {tr(WINDOW_LABEL[id])}
            </button>
          ))}
        </div>
      ) : null}
      {shown === null ? (
        <div className="space-y-2 p-2" aria-busy="true">
          <p className="px-2 text-sm text-muted">{tr(note || "Loading…")}</p>
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="h-14 animate-pulse rounded-xl bg-bg" />
          ))}
        </div>
      ) : shown.missing ? (
        <p className="p-4 text-sm text-muted">{tr("Not available")}</p>
      ) : shown.rows.length === 0 ? (
        <p className="p-4 text-sm text-muted">{tr("Nothing here yet.")}</p>
      ) : (
        <div className="space-y-0.5">
          {shown.rows.slice(0, 50).map((c) => (
            <Row key={`${c.chain}-${c.token}`} coin={c} now={now} />
          ))}
        </div>
      )}
    </div>
  );
}
