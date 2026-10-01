import { useEffect, useState } from "react";
import { getPnlAll, type PnlAll } from "@/lib/factory/social";
import { cn } from "@/lib/cn";
import { compactUsd } from "./market-line";

import { tr } from "@/lib/i18n";
const pct = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(Math.abs(v) >= 10 ? 0 : 1)}%`;
const usd = (v: number) => `${v < 0 ? "-" : "+"}${compactUsd(Math.abs(v)) === "—" ? "$0" : compactUsd(Math.abs(v))}`;

/** Profit and loss on the Ferzan coins a wallet traded. Shown on a profile only when the owner shares the PNL link. */
export function ProfilePnl({ address }: { address: string }) {
  const [data, setData] = useState<PnlAll | null | undefined>(undefined);
  const [note, setNote] = useState("");

  useEffect(() => {
    let stop = false;
    getPnlAll({ data: { wallet: address } })
      .then((r) => {
        if (!stop) setData(r);
      })
      .catch(() => {
        if (!stop) setData(null);
      });
    return () => {
      stop = true;
    };
  }, [address]);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/p/${address}?pnl=1`);
      setNote(tr("Link copied."));
    } catch {
      setNote(tr("Could not copy. Select the link and copy it."));
    }
  }

  const items = data ? [...data.items].sort((a, b) => b.pnlUsd - a.pnlUsd) : [];
  const best = items[0];
  const winRate = data && data.coins ? Math.round((data.wins * 100) / data.coins) : 0;

  return (
    <section className="ticket mt-6 space-y-4" aria-label={tr("Trading record")}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-xl">{tr("Trading record on Ferzan")}</h2>
        {data && data.coins ? (
          <p className={cn("shrink-0 whitespace-nowrap text-2xl font-extrabold tabular-nums", data.pnlUsd >= 0 ? "text-cyan" : "text-sell")}>{usd(data.pnlUsd)}</p>
        ) : null}
      </div>
      {data === undefined ? <p className="text-sm text-muted">{tr("Loading trades…")}</p> : null}
      {data === null || (data && data.coins === 0) ? (
        <p className="text-sm text-muted">{tr("No trades on Ferzan curves from this wallet yet. Solana trades count from Sept 28, 2026.")}</p>
      ) : null}
      {data && data.coins > 0 ? (
        <>
          <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-muted">{tr("Return")}</dt>
              <dd className={cn("font-semibold tabular-nums", data.pnlPct >= 0 ? "text-cyan" : "text-sell")}>{pct(data.pnlPct)}</dd>
            </div>
            <div>
              <dt className="text-muted">{tr("Win rate")}</dt>
              <dd className="font-semibold tabular-nums">{winRate}%</dd>
            </div>
            <div>
              <dt className="text-muted">{tr("Coins traded")}</dt>
              <dd className="font-semibold tabular-nums">{data.coins}</dd>
            </div>
            <div>
              <dt className="text-muted">{tr("Put in")}</dt>
              <dd className="font-semibold tabular-nums">{compactUsd(data.spentUsd)}</dd>
            </div>
          </dl>
          {best ? (
            <p className="text-sm text-muted">
              {tr("Best trade")}:{" "}
              <a href={best.path} className="font-semibold text-cyan">
                ${best.symbol}
              </a>{" "}
              <span className="tabular-nums">{pct(best.pnlPct)}</span>
            </p>
          ) : null}
          <ul className="divide-y divide-line">
            {items.slice(0, 5).map((it) => (
              <li key={`${it.chain}-${it.token}`} className="flex items-center justify-between gap-3 py-2">
                <a href={it.path} className="min-w-0 flex-1 truncate font-semibold">
                  ${it.symbol}{" "}
                  <span className="text-xs font-normal text-muted">{it.holding ? tr("holding") : tr("sold")}</span>
                </a>
                <span className={cn("shrink-0 whitespace-nowrap text-sm font-semibold tabular-nums", it.pnlUsd >= 0 ? "text-cyan" : "text-sell")}>
                  {usd(it.pnlUsd)} ({pct(it.pnlPct)})
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="min-h-11 font-semibold text-cyan" onClick={() => void copyLink()}>
          {tr("Copy link to this record")}
        </button>
        {note ? <span className="text-xs text-muted">{note}</span> : null}
      </div>
      <p className="text-xs text-muted">{tr("Based on trades on Ferzan curves. Past results do not predict future ones.")}</p>
    </section>
  );
}
