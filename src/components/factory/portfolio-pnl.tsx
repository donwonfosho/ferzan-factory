import { useEffect, useState } from "react";
import { getPnlAll, type PnlAll, type PnlRow } from "@/lib/factory/social";
import { cn } from "@/lib/cn";
import { compactUsd } from "./market-line";
import { WatchlistStrip } from "./watch";

import { tr } from "@/lib/i18n";
const pct = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(Math.abs(v) >= 10 ? 0 : 1)}%`;
const usd = (v: number) => `${v < 0 ? "-" : "+"}${compactUsd(Math.abs(v)) === "—" ? "$0" : compactUsd(Math.abs(v))}`;

/** Profit and loss on every Ferzan coin these wallets traded, with a share card for the best one. */
export function PortfolioPnl({ wallets }: { wallets: string[] }) {
  const [data, setData] = useState<{ all: PnlAll; wallet: Record<string, string> } | null | undefined>(undefined);
  const key = wallets.filter(Boolean).join(",");

  useEffect(() => {
    let stop = false;
    const ws = key.split(",").filter(Boolean);
    if (!ws.length) {
      setData(null);
      return;
    }
    Promise.all(ws.map((w) => getPnlAll({ data: { wallet: w } }).then((r) => ({ w, r })).catch(() => ({ w, r: null }))))
      .then((res) => {
        if (stop) return;
        const items: PnlRow[] = [];
        const owner: Record<string, string> = {};
        let spentUsd = 0;
        let valueUsd = 0;
        let wins = 0;
        for (const { w, r } of res) {
          if (!r) continue;
          for (const it of r.items) {
            items.push(it);
            owner[`${it.chain}-${it.token}`] = w;
          }
          spentUsd += r.spentUsd;
          valueUsd += r.valueUsd;
          wins += r.wins;
        }
        items.sort((a, b) => b.pnlUsd - a.pnlUsd);
        const pnlUsd = valueUsd - spentUsd;
        setData({ all: { items, spentUsd, valueUsd, pnlUsd, pnlPct: spentUsd ? (pnlUsd * 100) / spentUsd : 0, coins: items.length, wins }, wallet: owner });
      })
      .catch(() => !stop && setData(null));
    return () => {
      stop = true;
    };
  }, [key]);

  return (
    <section className="mt-6 space-y-4">
      <WatchlistStrip />
      <div className="ticket space-y-4">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-xl">{tr("Your trades on Ferzan")}</h2>
          {data && data.all.coins ? <p className={cn("text-2xl font-extrabold tabular-nums", data.all.pnlUsd >= 0 ? "text-cyan" : "text-sell")}>{usd(data.all.pnlUsd)}</p> : null}
        </div>
        {data === undefined ? (
          <p className="text-sm text-muted">{tr("Loading your trades…")}</p>
        ) : !data || data.all.coins === 0 ? (
          <p className="text-sm text-muted">{tr("No trades on Ferzan curves from this account yet. Solana trades count from Sept 28, 2026.")}</p>
        ) : (
          <>
            <p className="text-sm text-muted">
              {data.all.coins}{" "}{tr("coin")}{data.all.coins === 1 ? "" : "s"} · {data.all.wins}{" "}{tr("in profit · put in")}{" "}{compactUsd(data.all.spentUsd)}{" "}{tr("· now worth")}{" "}{compactUsd(data.all.valueUsd)} ({pct(data.all.pnlPct)})
            </p>
            <ul className="divide-y divide-line">
              {data.all.items.slice(0, 50).map((it, i) => {
                const w = data.wallet[`${it.chain}-${it.token}`] ?? "";
                const share = `https://launch.ferzaneco.com/api/share/${it.chain}/${it.token}?w=${encodeURIComponent(w)}`;
                const text = `${pct(it.pnlPct)} on $${it.symbol} on Ferzan`;
                return (
                  <li key={`${it.chain}-${it.token}`} className="flex flex-wrap items-center gap-3 py-3">
                    <a href={it.path} className="min-w-0 flex-1">
                      <span className="block font-semibold">
                        ${it.symbol} {it.holding ? <span className="text-xs text-muted">{tr("holding")}</span> : <span className="text-xs text-muted">{tr("sold")}</span>}
                      </span>
                      <span className="block text-xs text-muted tabular-nums">
                        {it.trades}{" "}{tr("trades · put in")}{" "}{it.spent.toPrecision(3)} {it.unit}
                      </span>
                    </a>
                    <span className={cn("text-right font-extrabold tabular-nums", it.pnl >= 0 ? "text-cyan" : "text-sell")}>
                      {pct(it.pnlPct)}
                      <span className="block text-xs font-normal">{usd(it.pnlUsd)}</span>
                    </span>
                    {i < 10 && it.pnl > 0 && w ? (
                      <a className="btn-line shrink-0" href={`https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(share)}`} target="_blank" rel="noopener noreferrer">
                        {tr("Share")}
                      </a>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>
    </section>
  );
}
