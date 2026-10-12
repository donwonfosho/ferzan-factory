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

function verdictOf(value: unknown): string | null {
  if (!value || typeof value !== "object") return textOf(value);
  const row = value as { line?: unknown; reasons?: unknown; level?: unknown };
  const level = typeof row.level === "string" && !/^\d/.test(row.level) ? row.level : "";
  const line = typeof row.line === "string" ? row.line : "";
  const reasons = Array.isArray(row.reasons) ? row.reasons.map(textOf).filter((item): item is string => Boolean(item)).join(". ") : "";
  const text = [level, line, reasons].filter(Boolean).join(" — ");
  return text || null;
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

  const recordRows: { label: string; value: string | null }[] = [
    { label: "Verdict", value: record ? verdictOf(record.verdict) : null },
    { label: "Launch record", value: record ? textOf(record.launch) : null },
    { label: "Holder record", value: record ? textOf(record.holders) : null },
    { label: "Creator record", value: record ? textOf(record.creator) : null },
    { label: "Contract", value: record ? textOf(record.contract) : null },
    { label: "Liquidity", value: record ? textOf(record.lp) : null },
    { label: "Outside", value: record ? textOf(record.external) : null },
    { label: "Rules", value: record ? textOf(record.rules) : null },
    { label: "Contract check", value: safety === undefined ? null : safety },
  ];

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
        {recordRows.map((row) => (
          <li key={row.label} className="flex items-baseline justify-between gap-3">
            <span className="shrink-0 text-muted">{tr(row.label)}</span>
            <span className="text-right">{record === undefined || (row.label === "Contract check" && safety === undefined) ? tr("Loading…") : row.value ?? tr("Not available")}</span>
          </li>
        ))}
      </ul>
      {score ? (
        <div className="text-sm">
          {score.badge ? <p className="font-semibold">{score.badge}</p> : null}
          <SafetyBadges score={score.score} note={false} />
        </div>
      ) : null}
    </section>
  );
}
