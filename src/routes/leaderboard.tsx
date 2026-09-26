import { createFileRoute } from "@tanstack/react-router";
import { siteCoinHref } from "@/lib/factory/bot-curve";
import { useEffect, useState } from "react";
import { listTelegramLeaders, type TelegramChain, type TelegramLeader } from "@/lib/factory/telegram-feed";
import { cn } from "@/lib/cn";
import { compactUsd } from "@/components/factory/market-line";

export const Route = createFileRoute("/leaderboard")({
  component: LeaderboardPage,
});

const PERIODS = [
  { id: "7d", label: "7 days" },
  { id: "30d", label: "30 days" },
  { id: "all", label: "All time" },
] as const;
const CHAIN_TABS: { id: TelegramChain; label: string }[] = [
  { id: "", label: "All" },
  { id: "solana", label: "Solana" },
  { id: "base", label: "Base" },
  { id: "bsc", label: "BNB" },
  { id: "ethereum", label: "Ethereum" },
  { id: "robinhood", label: "Robinhood" },
];
const SCAN: Record<string, string> = {
  solana: "https://solscan.io/account/",
  base: "https://basescan.org/address/",
  bsc: "https://bscscan.com/address/",
  ethereum: "https://etherscan.io/address/",
  robinhood: "https://robinhoodchain.blockscout.com/address/",
};

function LeaderboardPage() {
  const [period, setPeriod] = useState<(typeof PERIODS)[number]["id"]>("all");
  const [chain, setChain] = useState<TelegramChain>("");
  const [rows, setRows] = useState<TelegramLeader[] | null>(null);

  useEffect(() => {
    let stop = false;
    setRows(null);
    void listTelegramLeaders({ data: { period, chain } })
      .catch(() => [])
      .then((next) => {
        if (!stop) setRows(next);
      });
    return () => {
      stop = true;
    };
  }, [period, chain]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-4xl">Top creators</h1>
        <p className="mt-2 text-muted">Ranked by coins that graduated, then by trading volume on their curves. Telegram launches, every chain.</p>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {PERIODS.map((p) => (
          <button key={p.id} type="button" onClick={() => setPeriod(p.id)}
            className={cn("rounded-full px-3 py-1.5 text-sm", period === p.id ? "bg-cyan text-cyan-ink" : "bg-surface text-muted shadow-border")}>
            {p.label}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {CHAIN_TABS.map((c) => (
          <button key={c.id || "all"} type="button" onClick={() => setChain(c.id)}
            className={cn("rounded-full px-3 py-1.5 text-sm", chain === c.id ? "bg-cyan text-cyan-ink" : "bg-surface text-muted shadow-border")}>
            {c.label}
          </button>
        ))}
      </div>
      {rows === null ? (
        <p className="text-muted">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-muted">
          No creators here yet.{" "}
          <a className="text-cyan" href="https://t.me/Ferzan_Launch_Bot" target="_blank" rel="noopener noreferrer">Launch the first one</a>.
        </p>
      ) : (
        <ol className="divide-y divide-line border-y border-line">
          {rows.map((row) => (
            <li key={row.creator} className="flex items-center gap-4 py-4">
              <span className="w-8 shrink-0 text-center text-lg font-extrabold tabular-nums">
                {row.rank === 1 ? "🥇" : row.rank === 2 ? "🥈" : row.rank === 3 ? "🥉" : row.rank}
              </span>
              <span className="min-w-0 flex-1">
                <a className="font-mono font-semibold" href={`${SCAN[row.chains[0]] ?? SCAN.base}${row.creator}`} target="_blank" rel="noopener noreferrer">
                  {row.short || row.creator}
                </a>
                <span className="block text-sm text-muted">
                  {row.launches} {row.launches === 1 ? "launch" : "launches"} · {row.graduated} graduated · {row.trades} trades
                </span>
                {row.best ? (
                  <span className="block truncate text-sm">
                    Best:{" "}
                    {row.best.url ? (
                      <a
                        className="text-cyan"
                        href={siteCoinHref(row.best.url) ?? row.best.url}
                        {...(siteCoinHref(row.best.url) ? {} : { target: "_blank", rel: "noopener noreferrer" })}
                      >
                        {row.best.name} (${row.best.symbol})
                      </a>
                    ) : (
                      `${row.best.name} ($${row.best.symbol})`
                    )}
                    {row.best.graduated ? " 🎓" : ""} · {compactUsd(row.best.mcapUsd)} mcap
                  </span>
                ) : null}
              </span>
              <span className="shrink-0 text-right tabular-nums">
                <span className="block font-extrabold">{row.graduated ? `🎓 ${row.graduated}` : compactUsd(row.volumeUsd)}</span>
                <span className="block text-sm text-muted">{row.graduated ? `${compactUsd(row.volumeUsd)} vol` : "volume"}</span>
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
