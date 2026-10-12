import { useEffect, useState } from "react";
import { getCoinRisk, getHolders } from "@/lib/factory/market-extra";
import { deskSafety } from "@/lib/factory/trade-desk";
import { getCreatorScore, type CreatorScore } from "@/lib/factory/creator-score";
import { SafetyBadges } from "./safety-badges";
import { tr } from "@/lib/i18n";

function share(pct: number): string | null {
  if (!Number.isFinite(pct) || pct < 0) return null;
  if (pct > 0 && pct < 1) return tr("Under 1% of the supply");
  const n = Math.round(Math.min(100, pct));
  if (n <= 0) return tr("None of the supply");
  if (n >= 100) return tr("All of the supply");
  return tr("{0}% of the supply", n);
}

function textOf(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "string") return value.slice(0, 220);
  if (typeof value === "boolean") return value ? tr("Yes") : tr("No");
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : null;
  if (Array.isArray(value)) {
    const parts = value.map(textOf).filter((item): item is string => Boolean(item));
    return parts.length ? parts.slice(0, 8).join(", ") : null;
  }
  if (typeof value === "object") {
    const parts = Object.entries(value as Record<string, unknown>)
      .filter(([key]) => key !== "level")
      .map(([key, item]) => {
        const shown = textOf(item);
        return shown ? `${key.replaceAll("_", " ")}: ${shown}` : null;
      })
      .filter((item): item is string => Boolean(item));
    return parts.length ? parts.join(" · ") : null;
  }
  return null;
}

function obj(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function pick(row: Record<string, unknown> | null, keys: string[]): unknown {
  if (!row) return undefined;
  for (const key of keys) if (key in row) return row[key];
  return undefined;
}

function blank(value: unknown): boolean {
  return value === null || value === undefined || value === "";
}

function pct(value: unknown): string | null {
  if (blank(value)) return null;
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isFinite(n)) return null;
  const shown = Math.round(n * 10) / 10;
  return Number.isInteger(shown) ? `${shown}%` : `${shown.toFixed(1)}%`;
}

function countOf(value: unknown): string | null {
  if (blank(value)) return null;
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isFinite(n)) return null;
  return String(Math.round(n));
}

function yesNo(value: unknown): string | null {
  if (blank(value)) return null;
  if (value === true) return tr("Yes");
  if (value === false) return tr("No");
  if (typeof value === "string") return value.slice(0, 120);
  return null;
}

function honeypotOf(value: unknown): string | null {
  if (blank(value)) return null;
  if (value === true || value === "yes") return tr("Yes");
  if (value === false || value === "no") return tr("No");
  if (value === "unknown") return tr("Unknown");
  return typeof value === "string" ? value.slice(0, 40) : null;
}

function plainText(value: unknown): string | null {
  if (blank(value)) return null;
  if (typeof value === "string") return value.slice(0, 400);
  if (typeof value === "boolean") return value ? tr("Yes") : tr("No");
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function flagText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (!Array.isArray(value)) return plainText(value);
  const parts = value.filter((item): item is string => typeof item === "string" && item.length > 0).slice(0, 12);
  return parts.length ? parts.join(", ") : tr("None");
}

function groupOf(value: unknown): { wallets: string | null; held: string | null } | null {
  const row = obj(value);
  if (!row) return null;
  return {
    wallets: countOf(pick(row, ["wallets", "wallet_count", "count"])),
    held: pct(pick(row, ["holding_pct", "held_pct", "still_held_pct", "pct"])),
  };
}

type Rated = {
  level: string;
  line: string | null;
  holders: { count: string | null; top10: string | null; dev: string | null } | null;
  snipers: { wallets: string | null; held: string | null } | null;
  bundles: { wallets: string | null; held: string | null } | null;
  contract: { owner: string | null; pausable: string | null; blacklist: string | null; mint: string | null; sell: string | null; note: string | null } | null;
  lp: { status: string | null; note: string | null } | null;
  external: { honeypot: string | null; buy: string | null; sell: string | null; flags: string | null } | null;
  rules: string[] | null;
};

function ratedOf(raw: Record<string, unknown> | null): Rated | null {
  if (!raw) return null;
  const verdict = obj(raw.verdict);
  const holders = obj(raw.holders);
  const contract = obj(raw.contract);
  const lp = obj(raw.lp);
  const external = obj(raw.external);
  const level = typeof verdict?.level === "string" ? verdict.level.toLowerCase() : "unknown";
  return {
    level: level === "ok" || level === "caution" || level === "risky" ? level : "unknown",
    line: plainText(verdict?.line),
    holders: holders
      ? {
          count: countOf(pick(holders, ["count", "holder_count"])),
          top10: pct(pick(holders, ["top10_pct", "top_10_pct"])),
          dev: pct(pick(holders, ["dev_pct", "creator_pct"])),
        }
      : null,
    snipers: groupOf(raw.snipers),
    bundles: groupOf(raw.bundles ?? raw.bundle),
    contract: contract
      ? {
          owner: plainText(contract.owner),
          pausable: yesNo(contract.pausable),
          blacklist: yesNo(contract.blacklist),
          mint: yesNo(contract.mint_after_launch),
          sell: yesNo(contract.sell_allowed),
          note: plainText(contract.sell_note),
        }
      : null,
    lp: lp ? { status: plainText(lp.status), note: plainText(lp.note) } : null,
    external: external
      ? {
          honeypot: honeypotOf(pick(external, ["honeypot", "is_honeypot"])),
          buy: pct(pick(external, ["buy_tax", "buy_tax_pct"])),
          sell: pct(pick(external, ["sell_tax", "sell_tax_pct"])),
          flags: flagText(external.flags),
        }
      : null,
    rules: Array.isArray(raw.rules) ? raw.rules.filter((item): item is string => typeof item === "string") : null,
  };
}

function levelClass(level: string): string {
  if (level === "ok") return "text-cyan";
  if (level === "caution") return "text-[#e0b15a]";
  if (level === "risky") return "text-[#e07a68]";
  return "text-muted";
}

function levelLabel(level: string): string {
  if (level === "ok") return tr("OK");
  if (level === "caution") return tr("Caution");
  if (level === "risky") return tr("Risky");
  return tr("Unknown");
}

function ageOf(ts: number | null | undefined): string | null {
  if (ts === null || ts === undefined || !Number.isFinite(ts) || ts <= 0) return null;
  const ms = ts > 1e12 ? ts : ts * 1000;
  const s = Math.floor((Date.now() - ms) / 1000);
  if (s < 0 || s > 60 * 60 * 24 * 365 * 20) return null;
  if (s < 60) return tr("{0} seconds", s);
  if (s < 3600) return tr("{0} minutes", Math.floor(s / 60));
  if (s < 86400) return tr("{0} hours", Math.floor(s / 3600));
  return tr("{0} days", Math.floor(s / 86400));
}

/**
 * Plain facts for a coin. Anything the chain or the launch API did not return stays "Not available".
 * No score and no color that pretends to rate the coin.
 */
export function RiskPanel({
  chain,
  token,
  progress,
  curveOpen,
  launchedAt = null,
}: {
  chain: string;
  token: string;
  progress: number | null;
  curveOpen: boolean | null;
  launchedAt?: number | null;
}) {
  const [top, setTop] = useState<string | null | undefined>(undefined);
  const [creator, setCreator] = useState<string | null | undefined>(undefined);
  const [holders, setHolders] = useState<string | null | undefined>(undefined);
  const [score, setScore] = useState<CreatorScore | null | undefined>(undefined);
  const [record, setRecord] = useState<Record<string, unknown> | null | undefined>(undefined);
  const [safety, setSafety] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    let stop = false;
    setTop(undefined);
    setCreator(undefined);
    setHolders(undefined);
    getHolders({ data: { chain, token } })
      .then((h) => {
        if (stop) return;
        if (!h || h.source !== "chain") {
          setTop(null);
          setCreator(null);
          setHolders(null);
          return;
        }
        setTop(share(h.top10Pct));
        setCreator(h.devPct === null ? null : share(h.devPct));
        setHolders(Number.isFinite(h.holderCount) ? String(h.holderCount) : null);
      })
      .catch(() => {
        if (stop) return;
        setTop(null);
        setCreator(null);
        setHolders(null);
      });
    return () => {
      stop = true;
    };
  }, [chain, token]);

  useEffect(() => {
    let stop = false;
    setScore(undefined);
    getCreatorScore({ data: { token } })
      .then((row) => {
        if (!stop) setScore(row);
      })
      .catch(() => {
        if (!stop) setScore(null);
      });
    return () => {
      stop = true;
    };
  }, [token]);

  useEffect(() => {
    let stop = false;
    setRecord(undefined);
    setSafety(undefined);
    getCoinRisk({ data: { chain, token } })
      .then((row) => {
        if (!stop) setRecord(row ? (JSON.parse(row) as Record<string, unknown>) : null);
      })
      .catch(() => {
        if (!stop) setRecord(null);
      });
    deskSafety({ data: { mint: token, chain } })
      .then((row) => {
        if (!stop) setSafety(row ? textOf(JSON.parse(row) as unknown) : null);
      })
      .catch(() => {
        if (!stop) setSafety(null);
      });
    return () => {
      stop = true;
    };
  }, [chain, token]);

  const rated = record === undefined ? undefined : ratedOf(record);
  const show = (value: string | null | undefined) => (record === undefined ? tr("Loading…") : value ?? tr("Not available"));

  const grad =
    progress === null || !Number.isFinite(progress)
      ? null
      : tr("{0}% of the way", Math.round(Math.max(0, Math.min(100, progress))));
  const rows: { label: string; value: string | null; pending?: boolean }[] = [
    { label: "Top 10 holders", value: top === undefined ? null : top, pending: top === undefined },
    { label: "Creator holding", value: creator === undefined ? null : creator, pending: creator === undefined },
    { label: "Holders", value: holders === undefined ? null : holders, pending: holders === undefined },
    { label: "Graduation", value: grad },
    {
      label: "Curve",
      value: curveOpen === null ? null : curveOpen ? tr("Open. Trading is still on the curve.") : tr("Closed. Trading has left the curve."),
    },
    { label: "Launch age", value: ageOf(launchedAt) },
  ];

  return (
    <section className="ticket space-y-2">
      <h2 className="text-sm font-medium text-muted">{tr("Before you trade")}</h2>
      <ul className="space-y-2 text-sm">
        {rows.map((row) => (
          <li key={row.label} className="flex items-baseline justify-between gap-3">
            <span className="text-muted">{tr(row.label)}</span>
            <span className="text-right">{row.pending ? tr("Loading…") : row.value ?? tr("Not available")}</span>
          </li>
        ))}
        <li className="flex items-baseline justify-between gap-3">
          <span className="text-muted">{tr("Creator score")}</span>
          <span className="text-right">
            {score === undefined ? tr("Loading…") : score ? tr("{0} · {1}", score.score, tr(score.label)) : tr("Not available")}
          </span>
        </li>
        <li className="flex items-start justify-between gap-3">
          <span className={`shrink-0 text-xs font-semibold uppercase ${rated ? levelClass(rated.level) : "text-muted"}`}>
            {record === undefined ? tr("Loading…") : rated ? levelLabel(rated.level) : tr("Not available")}
          </span>
          <span className="text-right">{show(rated?.line)}</span>
        </li>
        <li className="flex items-baseline justify-between gap-3"><span className="text-muted">{tr("Holders")}</span><span className="text-right">{show(rated?.holders?.count)}</span></li>
        <li className="flex items-baseline justify-between gap-3"><span className="text-muted">{tr("Top 10")}</span><span className="text-right">{show(rated?.holders?.top10)}</span></li>
        <li className="flex items-baseline justify-between gap-3"><span className="text-muted">{tr("Dev")}</span><span className="text-right">{show(rated?.holders?.dev)}</span></li>
        <li className="flex items-baseline justify-between gap-3"><span className="text-muted">{tr("Snipers")}</span><span className="text-right">{record === undefined ? tr("Loading…") : rated?.snipers ? tr("{0} wallets, {1} still held", rated.snipers.wallets ?? tr("Not available"), rated.snipers.held ?? tr("Not available")) : tr("Not available")}</span></li>
        <li className="flex items-baseline justify-between gap-3"><span className="text-muted">{tr("Bundles")}</span><span className="text-right">{record === undefined ? tr("Loading…") : rated?.bundles ? tr("{0} wallets, {1} still held", rated.bundles.wallets ?? tr("Not available"), rated.bundles.held ?? tr("Not available")) : tr("Not available")}</span></li>
        <li className="flex items-baseline justify-between gap-3"><span className="text-muted">{tr("Owner")}</span><span className="text-right">{show(rated?.contract?.owner)}</span></li>
        <li className="flex items-baseline justify-between gap-3"><span className="text-muted">{tr("Pausable")}</span><span className="text-right">{show(rated?.contract?.pausable)}</span></li>
        <li className="flex items-baseline justify-between gap-3"><span className="text-muted">{tr("Blacklist")}</span><span className="text-right">{show(rated?.contract?.blacklist)}</span></li>
        <li className="flex items-baseline justify-between gap-3"><span className="text-muted">{tr("Mint after launch")}</span><span className="text-right">{show(rated?.contract?.mint)}</span></li>
        <li className="flex items-baseline justify-between gap-3">
          <span className="text-muted">{tr("Sell allowed")}</span>
          <span className="text-right">{show(rated?.contract?.sell)}{rated?.contract?.note ? ` ${rated.contract.note}` : ""}</span>
        </li>
        <li className="flex items-baseline justify-between gap-3">
          <span className="text-muted">{tr("Liquidity")}</span>
          <span className="text-right">{show(rated?.lp ? [rated.lp.status, rated.lp.note].filter(Boolean).join(" — ") || null : null)}</span>
        </li>
        <li className="flex items-baseline justify-between gap-3"><span className="text-muted">{tr("Honeypot")}</span><span className="text-right">{show(rated?.external?.honeypot)}</span></li>
        <li className="flex items-baseline justify-between gap-3"><span className="text-muted">{tr("Buy tax")}</span><span className="text-right">{show(rated?.external?.buy)}</span></li>
        <li className="flex items-baseline justify-between gap-3"><span className="text-muted">{tr("Sell tax")}</span><span className="text-right">{show(rated?.external?.sell)}</span></li>
        <li className="flex items-baseline justify-between gap-3"><span className="text-muted">{tr("Flags")}</span><span className="text-right">{show(rated?.external?.flags)}</span></li>
        <li className="flex items-baseline justify-between gap-3">
          <span className="shrink-0 text-muted">{tr("Contract check")}</span>
          <span className="text-right">{safety === undefined ? tr("Loading…") : safety ?? tr("Not available")}</span>
        </li>
      </ul>
      <details className="text-sm">
        <summary className="cursor-pointer text-muted">{tr("How this is rated")}</summary>
        {record === undefined ? (
          <p className="mt-2">{tr("Loading…")}</p>
        ) : rated?.rules ? (
          <ul className="mt-2 list-disc space-y-1 pl-4">
            {rated.rules.map((rule) => (
              <li key={rule}>{rule}</li>
            ))}
          </ul>
        ) : (
          <p className="mt-2">{tr("Not available")}</p>
        )}
      </details>
      {score ? (
        <div className="text-sm">
          {score.badge ? <p className="font-semibold">{score.badge}</p> : null}
          <SafetyBadges score={score.score} note={false} />
        </div>
      ) : null}
    </section>
  );
}
