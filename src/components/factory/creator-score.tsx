import { useEffect, useState } from "react";
import { getCreatorScore, type CreatorScore } from "@/lib/factory/creator-score";

const TONE: Record<CreatorScore["label"], string> = { Good: "text-cyan", Caution: "text-fg", Risky: "text-sell" };

/** Creator trust box for a Ferzan-launched coin. Renders nothing for coins the Launch Bot does not know. */
export function CreatorScoreBox({ token }: { token: string }) {
  const [cs, setCs] = useState<CreatorScore | null>(null);

  useEffect(() => {
    let stop = false;
    setCs(null);
    if (!token) return;
    getCreatorScore({ data: { token } })
      .then((r) => !stop && setCs(r))
      .catch(() => !stop && setCs(null));
    return () => {
      stop = true;
    };
  }, [token]);

  if (!cs) return null;
  return (
    <div className="ticket space-y-2">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm font-medium text-muted">
          Creator score
          {cs.badge ? <span className="chip-on ml-2 rounded-full px-2 py-0.5 text-xs font-semibold">{cs.badge}</span> : null}
        </p>
        <p className={`text-2xl font-extrabold tabular-nums ${TONE[cs.label]}`}>
          {cs.score}
          <span className="text-sm text-muted">/100 · {cs.label}</span>
        </p>
      </div>
      {cs.lines.length ? (
        <ul className="space-y-1 text-sm">
          {cs.lines.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      ) : null}
      <p className="text-xs text-muted">
        From Ferzan's own launch records: other coins by this creator, launch sprees and what the dev bought and sold on the curve. A
        signal, not a guarantee.
      </p>
    </div>
  );
}
