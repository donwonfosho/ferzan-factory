import type { BoardMark } from "@/lib/factory/board";
import { CHAINS } from "@/lib/factory/catalog";
import type { ChainId } from "@/lib/factory/types";
import { useNativeUsd } from "@/lib/factory/usd";

export function compactUsd(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "—";
  if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
  if (value >= 1e3) return `$${(value / 1e3).toFixed(1)}K`;
  if (value >= 1) return `$${value.toFixed(0)}`;
  return `$${value.toFixed(2)}`;
}

export function compactCap(value: number, native: string) {
  if (!Number.isFinite(value) || value <= 0) return "—";
  const body =
    value >= 1e9 ? `${(value / 1e9).toFixed(2)}B` : value >= 1e6 ? `${(value / 1e6).toFixed(2)}M` : value >= 1e3 ? `${(value / 1e3).toFixed(2)}K` : value.toFixed(2);
  return `${body} ${native}`;
}

export function Spark({ values, up }: { values: number[]; up: boolean }) {
  if (values.length < 2) return <span className="hidden h-6 w-16 shrink-0 sm:block" />;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const d = values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * 64;
      const y = 22 - ((value - min) / span) * 18;
      return `${index === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg viewBox="0 0 64 24" className={`hidden h-6 w-16 shrink-0 sm:block ${up ? "text-cyan" : "text-sell"}`} aria-hidden>
      <path d={d} fill="none" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

export function CapChange({ mark, chain }: { mark?: BoardMark; chain: ChainId }) {
  const usd = useNativeUsd(chain);
  const native = CHAINS[chain]?.native ?? "";
  const dollars = mark && usd ? mark.mcap * usd : 0;
  const up = (mark?.change ?? 0) >= 0;
  return (
    <span className="shrink-0 text-right text-sm tabular-nums">
      <span className="block font-semibold">{dollars > 0 ? compactUsd(dollars) : mark ? compactCap(mark.mcap, native) : "—"}</span>
      <span className={up ? "text-cyan" : "text-sell"}>{mark && mark.mcap > 0 ? `${up ? "+" : ""}${mark.change.toFixed(1)}%` : ""}</span>
    </span>
  );
}
