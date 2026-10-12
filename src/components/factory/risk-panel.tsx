import { useEffect, useState } from "react";
import { getHolders } from "@/lib/factory/market-extra";
import { tr } from "@/lib/i18n";

function share(pct: number): string | null {
  if (!Number.isFinite(pct) || pct < 0) return null;
  if (pct > 0 && pct < 1) return tr("Under 1% of the supply");
  const n = Math.round(Math.min(100, pct));
  if (n <= 0) return tr("None of the supply");
  if (n >= 100) return tr("All of the supply");
  return tr("{0}% of the supply", n);
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
}: {
  chain: string;
  token: string;
  progress: number | null;
  curveOpen: boolean | null;
}) {
  const [top, setTop] = useState<string | null | undefined>(undefined);
  const [creator, setCreator] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    let stop = false;
    setTop(undefined);
    setCreator(undefined);
    getHolders({ data: { chain, token } })
      .then((h) => {
        if (stop) return;
        if (!h || h.source !== "chain") {
          setTop(null);
          setCreator(null);
          return;
        }
        setTop(share(h.top10Pct));
        setCreator(h.devPct === null ? null : share(h.devPct));
      })
      .catch(() => {
        if (stop) return;
        setTop(null);
        setCreator(null);
      });
    return () => {
      stop = true;
    };
  }, [chain, token]);

  const grad =
    progress === null || !Number.isFinite(progress)
      ? null
      : tr("{0}% of the way", Math.round(Math.max(0, Math.min(100, progress))));
  const rows: { label: string; value: string | null; pending?: boolean }[] = [
    { label: "Top 10 holders", value: top === undefined ? null : top, pending: top === undefined },
    { label: "Creator", value: creator === undefined ? null : creator, pending: creator === undefined },
    { label: "Graduation", value: grad },
    {
      label: "Curve",
      value: curveOpen === null ? null : curveOpen ? tr("Open. Trading is still on the curve.") : tr("Closed. Trading has left the curve."),
    },
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
      </ul>
    </section>
  );
}
