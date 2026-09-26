import { useEffect, useState } from "react";
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
];
const BOARD_CHAINS = new Set<string>(["base", "bsc", "ethereum", "robinhood", "solana"]);
const MARKS = new Set<string>(["solana", "base", "bsc", "ethereum", "robinhood", "arc"]);

/** Live board of coins launched with @Ferzan_Launch_Bot on Telegram. Cards open each coin's trade page. */
export function TelegramBoard({ chain = "all" }: { chain?: string }) {
  const [sort, setSort] = useState<TelegramSort>("new");
  const [coins, setCoins] = useState<TelegramCoin[] | null>(null);
  const onBoard = chain === "all" || BOARD_CHAINS.has(chain);
  const apiChain: TelegramChain = chain === "all" || !BOARD_CHAINS.has(chain) ? "" : (chain as TelegramChain);

  useEffect(() => {
    if (!onBoard) return;
    let stop = false;
    async function pull() {
      const rows = await listTelegram({ data: { sort, chain: apiChain } }).catch(() => []);
      if (!stop) setCoins(rows);
    }
    void pull();
    const timer = window.setInterval(() => void pull(), 15_000);
    return () => {
      stop = true;
      window.clearInterval(timer);
    };
  }, [sort, apiChain, onBoard]);

  if (!onBoard) return null;

  return (
    <section id="telegram">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl">From Telegram</h2>
          <p className="mt-1 text-sm text-muted">
            Launched with{" "}
            <a className="text-cyan" href="https://t.me/Ferzan_Launch_Bot" target="_blank" rel="noopener noreferrer">
              @Ferzan_Launch_Bot
            </a>
            . Live from{" "}
            <a className="text-cyan" href="https://t.me/Ferzan_Launches" target="_blank" rel="noopener noreferrer">
              @Ferzan_Launches
            </a>
            .
          </p>
        </div>
        <div className="flex gap-1.5" role="tablist" aria-label="Sort Telegram launches">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={sort === tab.id}
              onClick={() => setSort(tab.id)}
              className={cn("rounded-full px-3 py-1.5 text-sm", sort === tab.id ? "bg-cyan text-cyan-ink" : "bg-surface text-muted shadow-border")}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>
      {coins === null ? (
        <p className="mt-4 text-sm text-muted">Loading…</p>
      ) : coins.length === 0 ? (
        <p className="mt-4 text-sm text-muted">
          {sort === "trending" ? "Nothing traded in the last hour." : "No Telegram launches here yet."}
        </p>
      ) : (
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {coins.slice(0, 12).map((coin) => (
            <TelegramCard key={`${coin.chain}-${coin.token}`} coin={coin} />
          ))}
        </div>
      )}
      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <a href="https://t.me/Ferzan_Launch_Bot" target="_blank" rel="noopener noreferrer" className="btn-line w-full sm:w-auto">
          Launch on Telegram
        </a>
        <a href="/leaderboard" className="btn-line w-full sm:w-auto">
          Top creators
        </a>
      </div>
    </section>
  );
}

function TelegramCard({ coin }: { coin: TelegramCoin }) {
  const progress = coin.graduated ? 100 : coin.progress;
  const creator = coin.creator ? `${coin.creator.slice(0, 4)}…${coin.creator.slice(-4)}` : "";
  return (
    <a href={coin.url} target="_blank" rel="noopener noreferrer" className="ticket block">
      <div className="flex items-center gap-3">
        <Mark symbol={coin.symbol} image={coin.image || undefined} />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className="truncate font-extrabold">{coin.symbol}</span>
            {MARKS.has(coin.chain) ? <ChainMark id={coin.chain as MarkChain} className="h-4 w-4" /> : null}
            {coin.graduated ? <span className="text-xs text-cyan">Graduated</span> : null}
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
        {coin.creatorLaunches > 1 ? ` (${coin.creatorLaunches} launches, ${coin.creatorGraduated} graduated)` : ""}
      </p>
    </a>
  );
}
