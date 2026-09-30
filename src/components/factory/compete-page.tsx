import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { getCompete, type CallerRow, type Compete, type ProfitRow, type VolumeRow } from "@/lib/factory/compete";
import { cn } from "@/lib/cn";
import { ChainMark, type MarkChain } from "./chain-mark";
import { compactUsd } from "./market-line";

import { tr } from "@/lib/i18n";
type Tab = "volume" | "profit" | "callers";
const TABS: { id: Tab; label: string }[] = [
  { id: "volume", label: "Volume" },
  { id: "profit", label: "Profit" },
  { id: "callers", label: "Callers" },
];
const MARKS = new Set(["solana", "base", "bsc", "ethereum", "robinhood", "arc", "tron", "ton"]);
const medal = (i: number) => (i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : String(i + 1));
const signedUsd = (v: number) => (v >= 0 ? "+" : "−") + compactUsd(Math.abs(v));
const times = (x: number) => `${x >= 10 ? x.toFixed(0) : x.toFixed(1)}x`;

function left(sec: number) {
  const s = Math.max(0, Math.floor(sec));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m ${s % 60}s`;
}

function Wallet({ wallet, short }: { wallet: string; short: string }) {
  return (
    <Link to="/creator/$wallet" params={{ wallet }} className="font-mono font-semibold hover:text-cyan">
      {short || wallet}
    </Link>
  );
}

function Rank({ i, children, value, sub }: { i: number; children: React.ReactNode; value: string; sub: string }) {
  return (
    <li className={cn("flex items-center gap-3 py-3", i < 3 && "font-medium")}>
      <span className="w-8 shrink-0 text-center text-lg font-extrabold tabular-nums">{medal(i)}</span>
      <span className="min-w-0 flex-1">{children}</span>
      <span className="shrink-0 text-right tabular-nums">
        <span className="block font-extrabold">{value}</span>
        <span className="block text-xs text-muted">{sub}</span>
      </span>
    </li>
  );
}

function VolumeList({ rows }: { rows: VolumeRow[] }) {
  return (
    <ol className="divide-y divide-line">
      {rows.map((r, i) => (
        <Rank key={r.wallet} i={i} value={compactUsd(r.volumeUsd)} sub={tr("volume")}>
          <Wallet wallet={r.wallet} short={r.short} />
          <span className="block text-xs text-muted">{tr("{0} trades", r.trades)}</span>
        </Rank>
      ))}
    </ol>
  );
}

function ProfitList({ rows }: { rows: ProfitRow[] }) {
  return (
    <ol className="divide-y divide-line">
      {rows.map((r, i) => (
        <Rank key={r.wallet} i={i} value={signedUsd(r.pnlUsd)} sub={`${r.pnlPct >= 0 ? "+" : ""}${r.pnlPct.toFixed(0)}%`}>
          <Wallet wallet={r.wallet} short={r.short} />
          <span className="block truncate text-xs text-muted">
            {tr("Put in {0}", compactUsd(r.spentUsd))}
            {r.best ? ` · ${tr("best: ${0}", r.best)}` : ""}
          </span>
        </Rank>
      ))}
    </ol>
  );
}

function CallerList({ rows }: { rows: CallerRow[] }) {
  return (
    <ol className="divide-y divide-line">
      {rows.map((r, i) => (
        <Rank key={r.wallet} i={i} value={times(r.best.multiple)} sub={tr("best call")}>
          <Wallet wallet={r.wallet} short={r.short} />
          <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
            {r.top.map((c) => (
              <a key={c.path || c.symbol} href={c.path || undefined} className="inline-flex items-center gap-1 rounded-md bg-bg px-1.5 py-0.5 shadow-border hover:text-cyan">
                {MARKS.has(c.chain) ? <ChainMark id={c.chain as MarkChain} className="h-3 w-3" /> : null}${c.symbol}{" "}
                <span className={c.multiple >= 1 ? "text-cyan" : "text-sell"}>{times(c.multiple)}</span>
              </a>
            ))}
          </span>
          <span className="mt-0.5 block text-xs text-muted">
            {r.calls === 1
              ? tr("1 call · {0} buyers through the link · {1}", r.buyers, compactUsd(r.volumeUsd))
              : tr("{0} calls · {1} buyers through the link · {2}", r.calls, r.buyers, compactUsd(r.volumeUsd))}
          </span>
        </Rank>
      ))}
    </ol>
  );
}

/** Weekly competition: volume and profit boards, plus the callers board. Prizes switch on after FERZAN graduates. */
export function CompetePage() {
  const [tab, setTab] = useState<Tab>("volume");
  const [prev, setPrev] = useState(false);
  const [data, setData] = useState<Compete | null | undefined>(undefined);
  const [now, setNow] = useState(() => Date.now() / 1000);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const h = window.location.hash.slice(1);
    if (h === "profit" || h === "callers" || h === "volume") setTab(h);
  }, []);

  useEffect(() => {
    let stop = false;
    setData(undefined);
    const pull = () =>
      getCompete({ data: { prev } })
        .then((r) => !stop && setData(r))
        .catch(() => !stop && setData(null));
    void pull();
    const id = window.setInterval(() => void pull(), 60_000);
    return () => {
      stop = true;
      window.clearInterval(id);
    };
  }, [prev]);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now() / 1000), 1000);
    return () => window.clearInterval(id);
  }, []);

  const d = data;
  const rows = d ? (tab === "volume" ? d.volume : tab === "profit" ? d.profit : d.callers) : [];
  const status = !d
    ? ""
    : d.practice
      ? tr("Practice round (last 7 days). Week 1 starts at the FERZAN launch in {0}.", left(d.startsAt - now))
      : prev
        ? tr("Week {0} final results.", d.week)
        : tr("Week {0} · ends in {1}", d.week, left(d.end - now));

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h1 className="text-4xl">{tr("Weekly competition")}</h1>
        <p className="mt-2 text-muted">{tr("Top traders and top callers on every Ferzan coin, every chain. A new week starts every Thursday at 4:00 PM ET.")}</p>
        {status ? <p className="mt-2 text-sm font-semibold text-cyan tabular-nums">{status}</p> : null}
      </div>

      <div className={cn("ticket text-sm", d?.prizesLive && "shadow-border-hover")}>
        {d?.prizesLive ? (
          <p>
            <span className="font-semibold">{tr("🏆 Prizes are live.")}</span> {d.prizeText ? tr(d.prizeText) : tr("Top 3 on each board win each week.")}
          </p>
        ) : (
          <p>
            <span className="font-semibold">{tr("🏆 Prizes switch on when FERZAN graduates.")}</span>{" "}
            {tr("The boards run from launch day, so you can climb now.")}
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="grid grid-cols-3 gap-1" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={cn("min-h-10 rounded-lg px-4 text-sm font-semibold", tab === t.id ? "chip-on" : "bg-bg text-muted shadow-border")}
            >
              {tr(t.label)}
            </button>
          ))}
        </div>
        {d && !d.practice && (d.week > 1 || prev) ? (
          <button type="button" className="text-sm text-cyan" onClick={() => setPrev(!prev)}>
            {prev ? tr("This week") : tr("Last week's winners")}
          </button>
        ) : null}
      </div>

      <section className="ticket p-3">
        {d === undefined ? (
          <div className="space-y-2">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="h-12 animate-pulse rounded-xl bg-bg" />
            ))}
          </div>
        ) : d === null ? (
          <p className="p-3 text-sm text-muted">{tr("The boards could not load. Try again in a minute.")}</p>
        ) : rows.length === 0 ? (
          <p className="p-3 text-sm text-muted">
            {tab === "callers" ? tr("No calls yet this week. Share a coin and be the first.") : tr("No trades yet this week.")}
          </p>
        ) : tab === "volume" ? (
          <VolumeList rows={d.volume} />
        ) : tab === "profit" ? (
          <ProfitList rows={d.profit} />
        ) : (
          <CallerList rows={d.callers} />
        )}
      </section>

      <div className="space-y-2 text-sm text-muted">
        {tab === "volume" ? (
          <p>{tr("Volume: every buy and sell on Ferzan coins this week, in dollars. Trading your own coin does not count.")}</p>
        ) : tab === "profit" ? (
          <p>
            {tr(
              "Profit: on coins you bought this week, what you sold for plus what you still hold at today's price, minus what you put in. You need at least {0} put in. Your own coins do not count.",
              compactUsd(d?.minSpentUsd || 20),
            )}
          </p>
        ) : (
          <p>
            {tr(
              "Callers: sign in and use the Share buttons on any coin page. Your link carries your wallet. A call counts once {0} or more people buy through your link, and is scored by how far the coin has gone since the first buy through it. Your own coins do not count.",
              d?.callerMinBuyers || 2,
            )}
          </p>
        )}
        <p>{tr("Winners are checked before any prize is paid. Wash trading, self-referrals and linked wallets are disqualified.")}</p>
      </div>
    </div>
  );
}
