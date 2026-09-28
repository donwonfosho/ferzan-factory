import { useEffect, useState } from "react";
import { getCreator, type Creator } from "@/lib/factory/trust";
import { loadProfile } from "@/lib/factory/board";
import { cn } from "@/lib/cn";
import { ChainMark, type MarkChain } from "./chain-mark";
import { compactUsd } from "./market-line";
import { Mark } from "./ui";

import { tr } from "@/lib/i18n";
const MARKS = new Set(["solana", "base", "bsc", "ethereum", "robinhood", "arc", "tron", "ton"]);
const CHAIN_NAME: Record<string, string> = {
  solana: "Solana",
  base: "Base",
  bsc: "BNB",
  ethereum: "Ethereum",
  robinhood: "Robinhood",
  arc: "Arc",
  tron: "Tron",
  ton: "TON",
};
const TONE: Record<string, string> = { Good: "text-cyan", Caution: "text-fg", Risky: "text-sell" };

function when(ts: number) {
  return ts ? new Date(ts * 1000).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "";
}

/** Everything one wallet launched through Ferzan, its track record, and a Follow button (Telegram alerts). */
export function CreatorPage({ wallet }: { wallet: string }) {
  const [c, setC] = useState<Creator | null | undefined>(undefined);
  const [profile, setProfile] = useState<{ name: string; bio: string; image: string } | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let stop = false;
    setC(undefined);
    getCreator({ data: { wallet } })
      .then((r) => !stop && setC(r))
      .catch(() => !stop && setC(null));
    if (/^0x[0-9a-fA-F]{40}$|^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(wallet)) {
      loadProfile({ data: { address: wallet } })
        .then((p) => !stop && p && setProfile({ name: p.name, bio: p.bio, image: p.image }))
        .catch(() => null);
    }
    return () => {
      stop = true;
    };
  }, [wallet]);

  const short = `${wallet.slice(0, 6)}…${wallet.slice(-4)}`;
  async function copy() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* the address bar still has it */
    }
  }

  if (c === undefined) return <p className="ticket mx-auto max-w-3xl text-sm text-muted">{tr("Loading this creator…")}</p>;
  if (c === null)
    return (
      <div className="ticket mx-auto max-w-3xl">
        <h1 className="text-3xl">{short}</h1>
        <p className="mt-2 text-sm text-muted">{tr("This wallet has not launched a coin through Ferzan yet.")}</p>
      </div>
    );

  const stats = [
    { label: "Launches", value: c.launches.toLocaleString() },
    { label: "Graduated", value: c.graduated.toLocaleString() },
    { label: "Best market cap", value: compactUsd(c.bestMcapUsd) },
    { label: "Volume", value: compactUsd(c.volumeUsd) },
  ];
  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-1 items-center gap-4">
        {profile?.image ? (
          <img src={profile.image} alt="" className="h-20 w-20 shrink-0 rounded-2xl object-cover shadow-border" />
        ) : (
          <span className="grid h-20 w-20 shrink-0 place-items-center rounded-2xl bg-surface text-3xl shadow-border" aria-hidden>
            👤
          </span>
        )}
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-3xl sm:text-4xl">{profile?.name || short}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted">
            <span className="font-mono text-xs">{short}</span>
            {c.badge ? <span className="chip-on rounded-full px-2 py-0.5 text-xs font-semibold">{c.badge}</span> : null}
            {c.firstLaunchTs ? <span>{tr("· launching since")}{" "}{when(c.firstLaunchTs)}</span> : null}
            <span>· {c.followers.toLocaleString()}{" "}{tr("follower")}{c.followers === 1 ? "" : "s"}</span>
          </p>
          {profile?.bio ? <p className="mt-2 max-w-xl text-sm">{profile.bio}</p> : null}
        </div>
        </div>
        <div className="flex gap-2">
          {c.followUrl ? (
            <a className="btn-cyan" href={c.followUrl} target="_blank" rel="noopener noreferrer">
              {tr("🔔 Follow")}
            </a>
          ) : null}
          <button type="button" className="btn-line" onClick={() => void copy()}>
            {copied ? tr("Copied") : tr("Share")}
          </button>
        </div>
      </header>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="rounded-2xl bg-surface p-4 shadow-border">
            <p className="text-xs text-muted">{tr(s.label)}</p>
            <p className="mt-1 text-2xl font-extrabold tabular-nums">{s.value}</p>
          </div>
        ))}
      </section>

      {c.score ? (
        <section className="ticket space-y-2">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-sm font-medium text-muted">{tr("Creator score (latest launch)")}</p>
            <p className={cn("text-2xl font-extrabold tabular-nums", TONE[c.score.label] ?? "text-fg")}>
              {c.score.score}
              <span className="text-sm text-muted">/100 · {tr(c.score.label)}</span>
            </p>
          </div>
          <ul className="space-y-1 text-sm">
            {c.score.lines.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-2xl">{tr("Launches")}</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          {c.items.map((it) => (
            <a key={`${it.chain}-${it.token}`} href={it.path} className="ticket flex items-center gap-3">
              <Mark symbol={it.symbol} image={it.image || undefined} />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <span className="truncate font-extrabold">${it.symbol}</span>
                  {MARKS.has(it.chain) ? <ChainMark id={it.chain as MarkChain} className="h-4 w-4 shrink-0" /> : null}
                  {it.graduated ? <span className="text-xs text-cyan">{tr("Graduated")}</span> : null}
                </span>
                <span className="block truncate text-sm text-muted">
                  {it.name} · {CHAIN_NAME[it.chain] ?? it.chain} · {when(it.launchedTs)}
                </span>
                {it.progress !== null ? (
                  <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-line">
                    <span className="block h-full bg-cyan" style={{ width: `${Math.max(2, it.graduated ? 100 : it.progress)}%` }} />
                  </span>
                ) : null}
              </span>
              <span className="shrink-0 text-right text-sm tabular-nums">
                <span className="block font-semibold">{compactUsd(it.mcapUsd)}</span>
                <span className="block text-xs text-muted">{tr("mcap")}</span>
              </span>
            </a>
          ))}
        </div>
      </section>
      <p className="text-xs text-muted">
        {tr("Follow opens @Ferzan_Launch_Bot in Telegram. It messages you the moment this wallet launches a new coin. Stop any time with /following.")}
      </p>
    </div>
  );
}
