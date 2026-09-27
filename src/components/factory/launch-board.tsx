import { useEffect, useState } from "react";
import { siteCoinHref } from "@/lib/factory/bot-curve";
import { listTelegram, type TelegramChain, type TelegramCoin, type TelegramSort } from "@/lib/factory/telegram-feed";
import { cn } from "@/lib/cn";
import { Mark } from "./ui";
import { ChainMark, type MarkChain } from "./chain-mark";
import { compactUsd } from "./market-line";

const TABS: { id: TelegramSort; label: string }[] = [
  { id: "new", label: "New" },
  { id: "koth", label: "👑 King" },
  { id: "trending", label: "🔥 Hot" },
  { id: "volume", label: "Volume" },
  { id: "graduated", label: "Graduated" },
];
export const BOARD_PICKS: { id: "all" | MarkChain; label: string }[] = [
  { id: "all", label: "All chains" },
  { id: "solana", label: "Solana" },
  { id: "base", label: "Base" },
  { id: "bsc", label: "BNB" },
  { id: "ethereum", label: "Ethereum" },
  { id: "robinhood", label: "Robinhood" },
  { id: "arc", label: "Arc" },
  { id: "tron", label: "Tron" },
  { id: "ton", label: "TON" },
];
const BOARD_CHAINS = new Set<string>(["base", "bsc", "ethereum", "robinhood", "solana", "arc", "tron", "ton"]);
const MARKS = new Set<string>(["solana", "base", "bsc", "ethereum", "robinhood", "arc", "tron", "ton"]);

/** Where a coin opens: its page on this site, or (only if this site cannot show it) the original link. */
export function coinHref(coin: { url: string }): { href: string; external: boolean } {
  const onSite = siteCoinHref(coin.url);
  return onSite ? { href: onSite, external: false } : { href: coin.url, external: true };
}

/** One board for every Ferzan launch, from this site and from @Ferzan_Launch_Bot. */
export function LaunchBoard({ chain, onChain }: { chain: "all" | MarkChain; onChain: (next: "all" | MarkChain) => void }) {
  const [sort, setSort] = useState<TelegramSort>("new");
  const [q, setQ] = useState("");
  const [coins, setCoins] = useState<TelegramCoin[] | null>(null);
  const [more, setMore] = useState(false);
  const [chainsOpen, setChainsOpen] = useState(false);
  const apiChain: TelegramChain = chain !== "all" && BOARD_CHAINS.has(chain) ? (chain as TelegramChain) : "";

  useEffect(() => {
    let stop = false;
    async function pull() {
      const rows = await listTelegram({ data: { sort, chain: apiChain, q: q.trim() } }).catch(() => null);
      if (!stop && rows) setCoins(rows);
    }
    setCoins(null);
    setMore(false);
    const first = window.setTimeout(() => void pull(), q ? 300 : 0);
    const timer = window.setInterval(() => void pull(), 15_000);
    return () => {
      stop = true;
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, [sort, apiChain, q]);

  const shown = coins ? coins.slice(0, more ? 30 : 12) : [];
  const empty = q.trim()
    ? "No coin matches that."
    : sort === "trending"
      ? "Nothing traded in the last hour."
      : sort === "graduated"
        ? "No coin has graduated here yet."
        : "No launches on this chain yet.";

  return (
    <section id="launches">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-2xl">Launches</h2>
          <p className="mt-1 text-sm text-muted">Every Ferzan coin, launched here or with the Telegram bot. Tap one to see its chart and trade it.</p>
        </div>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Ticker, name, or contract"
          className="min-h-11 w-full bg-surface px-3 text-sm shadow-border outline-none placeholder:text-muted sm:max-w-xs"
          aria-label="Search launches"
        />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <div className="relative">
          <button type="button" className="btn-line gap-2" onClick={() => setChainsOpen((open) => !open)} aria-expanded={chainsOpen}>
            {chain === "all" ? null : <ChainMark id={chain} className="h-5 w-5" />}
            {BOARD_PICKS.find((pick) => pick.id === chain)?.label ?? "All chains"}
          </button>
          {chainsOpen ? (
            <div className="absolute z-20 mt-2 w-56 rounded-xl bg-surface p-2 shadow-border">
              {BOARD_PICKS.map((pick) => (
                <button
                  key={pick.id}
                  type="button"
                  className={cn(
                    "flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-sm",
                    chain === pick.id ? "bg-cyan/15 text-cyan" : "text-fg hover:bg-bg",
                  )}
                  onClick={() => {
                    onChain(pick.id);
                    setChainsOpen(false);
                  }}
                >
                  {pick.id === "all" ? <span className="grid h-5 w-5 place-items-center text-xs">All</span> : <ChainMark id={pick.id} className="h-5 w-5" />}
                  {pick.label}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>
      <div className="mt-3 flex gap-1.5 overflow-x-auto pb-1" role="tablist" aria-label="Sort launches">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={sort === tab.id}
            onClick={() => setSort(tab.id)}
            className={cn("shrink-0 rounded-full px-3 py-1.5 text-sm", sort === tab.id ? "bg-cyan text-cyan-ink" : "bg-surface text-muted shadow-border")}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {coins === null ? (
        <p className="mt-4 text-sm text-muted">Loading…</p>
      ) : shown.length === 0 ? (
        <p className="mt-4 text-sm text-muted">{empty}</p>
      ) : (
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {shown.map((coin) => (
            <LaunchCard key={`${coin.chain}-${coin.token}`} coin={coin} />
          ))}
        </div>
      )}
      {coins && coins.length > 12 && !more ? (
        <button type="button" className="btn-line mt-3 w-full sm:w-auto" onClick={() => setMore(true)}>
          Show more
        </button>
      ) : null}
    </section>
  );
}

export function LaunchCard({ coin }: { coin: TelegramCoin }) {
  const progress = coin.graduated ? 100 : coin.progress;
  const creator = coin.creator ? `${coin.creator.slice(0, 4)}…${coin.creator.slice(-4)}` : "";
  const link = coinHref(coin);
  return (
    <a href={link.href} {...(link.external ? { target: "_blank", rel: "noopener noreferrer" } : {})} className="ticket block min-w-0">
      <div className="flex items-center gap-3">
        <Mark symbol={coin.symbol} image={coin.image || undefined} />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className="truncate font-extrabold">{coin.symbol}</span>
            {MARKS.has(coin.chain) ? <ChainMark id={coin.chain as MarkChain} className="h-4 w-4 shrink-0" /> : null}
            {coin.graduated ? <span className="text-xs text-cyan">Graduated</span> : null}
            {coin.source === "site" ? <span className="text-xs text-muted">Site</span> : null}
          </span>
          <span className="block truncate text-sm text-muted">{coin.name}</span>
        </span>
        <span className="shrink-0 text-right text-sm tabular-nums">
          <span className="block font-semibold">{compactUsd(coin.mcapUsd)}</span>
          <span className="block text-muted">mcap</span>
        </span>
      </div>
      {progress !== null ? (
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-line" aria-label={`${progress.toFixed(0)}% to graduation`}>
          <div className="h-full bg-cyan" style={{ width: `${Math.max(2, progress)}%` }} />
        </div>
      ) : null}
      <p className="mt-2 truncate text-xs text-muted tabular-nums">
        {progress !== null && !coin.graduated ? `${progress.toFixed(0)}% to graduation · ` : ""}
        {coin.trades} trades
        {creator ? ` · by ${creator}` : ""}
      </p>
    </a>
  );
}
