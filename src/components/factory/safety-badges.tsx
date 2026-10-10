import { tr } from "@/lib/i18n";

/** Badges we can compute from a launch count or a creator score we already loaded. */
export function SafetyBadges({ launches, score, note = true }: { launches?: number | null; score?: number | null; note?: boolean }) {
  const count = typeof launches === "number" && launches > 0 ? launches : null;
  const scored = typeof score === "number" && Number.isFinite(score) ? score : null;
  if (count === null && scored === null) return null;
  return (
    <div className="mt-2" onClick={(e) => e.stopPropagation()}>
      <div className="flex flex-wrap gap-1.5">
        {count === 1 ? (
          <Badge label={tr("New creator")} tip={tr("First coin we have on record for this creator. It does not mean the coin is safe.")} />
        ) : null}
        {count !== null && count > 1 ? (
          <Badge label={tr("{0} launches", count)} tip={tr("How many coins this creator has launched on Ferzan. It does not grade those coins.")} />
        ) : null}
        {scored !== null ? (
          <Badge label={tr("Creator score {0}", scored)} tip={tr("A score from Ferzan's launch records. It is a signal, not a guarantee.")} />
        ) : null}
      </div>
      {note ? <p className="mt-1 text-[11px] leading-4 text-muted">{tr("Badges are a signal from data we already have. They are not a guarantee.")}</p> : null}
    </div>
  );
}

function Badge({ label, tip }: { label: string; tip: string }) {
  return (
    <details className="relative" onClick={(e) => e.stopPropagation()}>
      <summary className="cursor-pointer list-none rounded-full bg-cyan/15 px-2 py-0.5 text-xs font-semibold text-cyan [&::-webkit-details-marker]:hidden">
        {label}
      </summary>
      <p className="absolute left-0 top-full z-20 mt-1 w-56 rounded-lg bg-bg p-2 text-xs font-normal text-fg shadow-border">{tip}</p>
    </details>
  );
}
