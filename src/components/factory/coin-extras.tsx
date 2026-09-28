import { useEffect, useState } from "react";
import { getHolders, getPnl, type Holders, type Pnl } from "@/lib/factory/market-extra";
import { useLive, sameCoin } from "@/lib/factory/live";
import { cn } from "@/lib/cn";
import { compactUsd } from "./market-line";

import { tr } from "@/lib/i18n";
const TAG: Record<string, { label: string; cls: string }> = {
  curve: { label: "Curve", cls: "bg-cyan/15 text-cyan" },
  program: { label: "Pool / lock", cls: "bg-bg text-muted shadow-border" },
  dev: { label: "Dev", cls: "bg-fg/10 text-fg" },
  sniper: { label: "Sniper", cls: "bg-sell/15 text-sell" },
  bundle: { label: "Bundle", cls: "bg-sell/15 text-sell" },
};

function tone(pct: number, warn: number, bad: number) {
  return pct >= bad ? "text-sell" : pct >= warn ? "text-fg" : "text-cyan";
}

/** Top holders, dev share, snipers and launch-block bundles. Refreshes when the coin trades. */
export function HoldersPanel({ chain, token }: { chain: string; token: string }) {
  const [h, setH] = useState<Holders | null | undefined>(undefined);
  const [tick, setTick] = useState(0);
  const [all, setAll] = useState(false);

  useEffect(() => {
    let stop = false;
    getHolders({ data: { chain, token } })
      .then((r) => !stop && setH(r))
      .catch(() => !stop && setH(null));
    return () => {
      stop = true;
    };
  }, [chain, token, tick]);

  useLive((e) => {
    if (e.type === "trade" && sameCoin(e, chain, token)) window.setTimeout(() => setTick((t) => t + 1), 1500);
  });

  if (!h) return null;
  const shown = all ? h.holders : h.holders.slice(0, 8);
  const stats = [
    { label: "Top 10", value: `${h.top10Pct.toFixed(1)}%`, cls: tone(h.top10Pct, 30, 50) },
    { label: "Dev holds", value: h.devPct === null ? "—" : `${h.devPct.toFixed(1)}%`, cls: tone(h.devPct ?? 0, 5, 10) },
    { label: "Snipers", value: `${h.snipers.wallets} · ${h.snipers.holdingPct.toFixed(1)}%`, cls: tone(h.snipers.holdingPct, 5, 15) },
    { label: "Bundled", value: `${h.bundle.wallets} · ${h.bundle.holdingPct.toFixed(1)}%`, cls: tone(h.bundle.holdingPct, 5, 15) },
  ];
  return (
    <section className="ticket space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm font-medium text-muted">{tr("Holders and safety")}</p>
        {h.holderCount ? <p className="text-xs text-muted">{h.holderCount.toLocaleString()}{" "}{tr("holders traded on the curve")}</p> : null}
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="rounded-xl bg-bg p-3 shadow-border">
            <p className="text-xs text-muted">{tr(s.label)}</p>
            <p className={cn("mt-1 text-lg font-extrabold tabular-nums", s.cls)}>{s.value}</p>
          </div>
        ))}
      </div>
      <ul className="divide-y divide-line text-sm">
        {shown.map((r, i) => (
          <li key={`${r.wallet}-${i}`} className="flex items-center gap-2 py-2">
            <span className="w-5 shrink-0 text-xs tabular-nums text-muted">{i + 1}</span>
            <span className="min-w-0 flex-1 truncate font-mono text-xs">{r.tags.includes("curve") ? tr("Bonding curve") : r.short}</span>
            {r.tags.map((t) =>
              TAG[t] ? (
                <span key={t} className={cn("shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold", TAG[t].cls)}>
                  {tr(TAG[t].label)}
                </span>
              ) : null,
            )}
            <span className="w-16 shrink-0 text-right tabular-nums">{r.pct < 0.01 ? "<0.01" : r.pct.toFixed(2)}%</span>
          </li>
        ))}
      </ul>
      {h.holders.length > 8 ? (
        <button type="button" className="text-xs text-cyan" onClick={() => setAll(!all)}>
          {all ? tr("Show fewer") : tr("Show all {0}", h.holders.length)}
        </button>
      ) : null}
      <p className="text-xs text-muted">
        {tr("Snipers bought in the first 15 seconds; bundled wallets bought in the launch block itself.")}{" "}{tr(h.note)}
      </p>
    </section>
  );
}

const fmt = (v: number) => (Math.abs(v) >= 100 ? v.toFixed(1) : Math.abs(v) >= 1 ? v.toFixed(3) : v.toPrecision(3));

/** "You're up 140% on $MOON" with a card to share, when the connected wallet has traded this coin. */
export function PnlShare({ chain, token, wallet }: { chain: string; token: string; wallet: string | null | undefined }) {
  const [p, setP] = useState<Pnl | null>(null);
  const [tick, setTick] = useState(0);
  const [done, setDone] = useState("");

  useEffect(() => {
    let stop = false;
    setP(null);
    if (!wallet) return;
    getPnl({ data: { chain, token, wallet } })
      .then((r) => !stop && setP(r))
      .catch(() => !stop && setP(null));
    return () => {
      stop = true;
    };
  }, [chain, token, wallet, tick]);

  useLive((e) => {
    if (e.type === "trade" && wallet && sameCoin(e, chain, token)) window.setTimeout(() => setTick((t) => t + 1), 2000);
  });

  if (!p || !wallet) return null;
  const up = p.pnl >= 0;
  const share = `https://launch.ferzaneco.com/api/share/${chain}/${token}?w=${encodeURIComponent(wallet)}`;
  const img = `https://launch.ferzaneco.com/api/pnl/${chain}/${token}/${wallet}.png?t=${tick}`;
  const pct = `${up ? "+" : ""}${p.pnlPct.toFixed(Math.abs(p.pnlPct) >= 10 ? 0 : 1)}%`;
  const text = `${pct} on $${p.symbol} on Ferzan`;
  async function copy() {
    try {
      await navigator.clipboard.writeText(share);
      setDone(tr("Link copied"));
    } catch {
      setDone(share);
    }
    window.setTimeout(() => setDone(""), 2500);
  }
  return (
    <section className="ticket space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm font-medium text-muted">{tr("Your position")}</p>
        <p className={cn("text-2xl font-extrabold tabular-nums", up ? "text-cyan" : "text-sell")}>{pct}</p>
      </div>
      <p className="text-sm text-muted">
        {tr("Put in")}{" "}{fmt(p.spent)} {p.unit}{" "}{tr("· now worth")}{" "}{fmt(p.received + p.holdingValue)} {p.unit} ({up ? "+" : ""}
        {compactUsd(Math.abs(p.pnlUsd)).replace("$", up ? "$" : "-$")}{tr(") · bought at")}{" "}{compactUsd(p.entryMcapUsd)}{" "}{tr("market cap")}
      </p>
      <img src={img} alt={tr("Profit card: {0}", text)} className="w-full rounded-xl shadow-border" loading="lazy" />
      <div className="flex flex-wrap gap-2">
        <a className="btn-cyan" href={`https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(share)}`} target="_blank" rel="noopener noreferrer">
          {tr("Post it on X")}
        </a>
        <a className="btn-line" href={`https://t.me/share/url?url=${encodeURIComponent(share)}&text=${encodeURIComponent(text)}`} target="_blank" rel="noopener noreferrer">
          {tr("Telegram")}
        </a>
        <button type="button" className="btn-line" onClick={() => void copy()}>
          {tr(done) || tr("Copy link")}
        </button>
      </div>
    </section>
  );
}
