import { useCallback, useEffect, useRef, useState } from "react";
import { listTelegram, type TelegramChain, type TelegramCoin, type TelegramSort } from "@/lib/factory/telegram-feed";
import { useLive, useLiveConnected, sameCoin } from "@/lib/factory/live";
import { cn } from "@/lib/cn";
import { ChainMark, type MarkChain } from "./chain-mark";
import { BOARD_PICKS, coinHref } from "./launch-board";
import { compactUsd } from "./market-line";
import { QuickBuyBar, QuickBuyButton } from "./quick-buy";
import { Mark } from "./ui";
import { WatchlistStrip } from "./watch";

import { tr } from "@/lib/i18n";
const COLS: { sort: TelegramSort; title: string; hint: string }[] = [
  { sort: "new", title: "New", hint: "Just launched" },
  { sort: "koth", title: "About to graduate", hint: "Closest to filling the curve" },
  { sort: "graduated", title: "Graduated", hint: "Curve filled, trading on the DEX" },
];
const API_CHAINS = new Set(["base", "bsc", "ethereum", "robinhood", "solana", "arc", "tron", "ton"]);
const MARKS = new Set(["solana", "base", "bsc", "ethereum", "robinhood", "arc", "tron", "ton"]);

function age(ts: number, now: number) {
  const s = Math.max(0, Math.floor(now / 1000 - ts));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

function Row({ coin, flash, now }: { coin: TelegramCoin; flash: boolean; now: number }) {
  const link = coinHref(coin);
  const prog = coin.graduated ? 100 : (coin.progress ?? 0);
  return (
    <a
      href={link.href}
      {...(link.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      className={cn("flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-bg", flash && "card-flash")}
    >
      <Mark symbol={coin.symbol} image={coin.image || undefined} className="h-11 w-11" />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="truncate font-semibold">${coin.symbol}</span>
          {MARKS.has(coin.chain) ? <ChainMark id={coin.chain as MarkChain} className="h-3.5 w-3.5 shrink-0" /> : null}
          {coin.safe ? <span className="shrink-0 text-xs" title={tr("Safe launch")}>🛡️</span> : null}
          <span className="shrink-0 text-xs text-muted">{coin.launchedTs ? age(coin.launchedTs, now) : ""}</span>
        </span>
        <span className="mt-0.5 flex min-w-0 items-center gap-2 whitespace-nowrap text-xs text-muted">
          <span className="tabular-nums text-fg">{compactUsd(coin.mcapUsd)}</span>
          <span className="truncate tabular-nums">{coin.trades}{" "}{tr("trades")}</span>
        </span>
        <span className="mt-1 block h-1 overflow-hidden rounded-full bg-line">
          <span className="block h-full bg-cyan transition-[width] duration-700" style={{ width: `${Math.max(2, prog)}%` }} />
        </span>
      </span>
      <QuickBuyButton coin={coin} />
    </a>
  );
}

function Column({ sort, title, hint, chain, hidden, now }: { sort: TelegramSort; title: string; hint: string; chain: TelegramChain; hidden: boolean; now: number }) {
  const [coins, setCoins] = useState<TelegramCoin[] | null>(null);
  const [hot, setHot] = useState<Set<string>>(new Set());
  const live = useLiveConnected();
  const again = useRef<number | null>(null);

  const pull = useCallback(async () => {
    const rows = await listTelegram({ data: { sort, chain, q: "" } }).catch(() => null);
    if (rows) setCoins(rows.slice(0, 30));
  }, [sort, chain]);

  useEffect(() => {
    setCoins(null);
    void pull();
    const id = window.setInterval(() => void pull(), live ? 45_000 : 12_000);
    return () => window.clearInterval(id);
  }, [pull, live]);

  const soon = useCallback(
    (ms: number) => {
      if (again.current !== null) return;
      again.current = window.setTimeout(() => ((again.current = null), void pull()), ms);
    },
    [pull],
  );

  useLive((e) => {
    if (chain && e.chain !== chain) return;
    if (e.type === "trade") {
      setCoins((list) => {
        if (!list) return list;
        const i = list.findIndex((c) => sameCoin({ chain: c.chain, token: c.token, curve: /curve=(0x[0-9a-fA-F]{40})/.exec(c.url)?.[1] }, e.chain, e.token));
        if (i < 0) {
          if (sort === "koth" && e.progress >= 50) soon(2500);
          return list;
        }
        const next = list.slice();
        next[i] = { ...next[i], mcapUsd: e.mcapUsd || next[i].mcapUsd, progress: e.progress, trades: Math.max(next[i].trades + 1, e.trades) };
        const key = `${e.chain}-${next[i].token}`;
        setHot((h) => new Set(h).add(key));
        window.setTimeout(() => setHot((h) => ((h = new Set(h)), h.delete(key), h)), 1300);
        return next;
      });
    } else if (e.type === "launch" && sort === "new") soon(2500);
    else if (e.type === "grad" && sort !== "new") soon(2500);
  });

  return (
    <section className={cn("ticket min-w-0 p-3", hidden && "hidden lg:block")}>
      <div className="mb-2 flex items-baseline justify-between gap-2 px-2">
        <h2 className="text-lg font-extrabold">{tr(title)}</h2>
        <span className="text-xs text-muted">{tr(hint)}</span>
      </div>
      {coins === null ? (
        <div className="space-y-2 p-2">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="h-14 animate-pulse rounded-xl bg-bg" />
          ))}
        </div>
      ) : coins.length === 0 ? (
        <p className="p-4 text-sm text-muted">{tr("Nothing here yet.")}</p>
      ) : (
        <div className="max-h-[70vh] space-y-0.5 overflow-y-auto">
          {coins.map((c) => (
            <Row key={`${c.chain}-${c.token}`} coin={c} flash={hot.has(`${c.chain}-${c.token}`)} now={now} />
          ))}
        </div>
      )}
    </section>
  );
}

/** Three live columns: New, About to graduate, Graduated. Tabs on phones. */
export function PulseBoard() {
  const [chain, setChain] = useState<TelegramChain>("");
  const [tab, setTab] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const live = useLiveConnected();
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 5_000);
    return () => window.clearInterval(id);
  }, []);
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
                onClick={() => setChain(id)}
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
      <div className="grid grid-cols-3 gap-1 lg:hidden" role="tablist">
        {COLS.map((c, i) => (
          <button key={c.sort} type="button" role="tab" aria-selected={tab === i} onClick={() => setTab(i)} className={cn("min-h-10 rounded-lg text-sm font-semibold", tab === i ? "chip-on" : "bg-bg text-muted shadow-border")}>
            {c.title === "About to graduate" ? tr("Almost") : tr(c.title)}
          </button>
        ))}
      </div>
      <div className="grid gap-3 lg:grid-cols-3">
        {COLS.map((c, i) => (
          <Column key={c.sort} {...c} chain={chain} hidden={tab !== i} now={now} />
        ))}
      </div>
    </div>
  );
}
