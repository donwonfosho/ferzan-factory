import { useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import { cn } from "@/lib/cn";

type Candle = [number, number, number, number, number, number];
type Trade = { ts: number; buy: boolean; native: number };

function fmt(v: number) {
  if (!Number.isFinite(v) || v === 0) return "0";
  const a = Math.abs(v);
  if (a >= 1e9) return `${(v / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `${(v / 1e6).toFixed(2)}M`;
  if (a >= 1e3) return `${(v / 1e3).toFixed(1)}K`;
  if (a >= 1) return v.toFixed(2);
  const zeros = Math.floor(-Math.log10(a));
  return zeros >= 4 ? `0.0${String.fromCharCode(8320 + Math.min(9, zeros))}${Math.round(a * 10 ** (zeros + 3))}` : v.toPrecision(4);
}

const UP = "#3ee0e6";
const DOWN = "#e07a68";

function niceTicks(lo: number, hi: number, n: number) {
  const span = hi - lo || Math.abs(hi) || 1;
  const step0 = span / n;
  const mag = 10 ** Math.floor(Math.log10(step0));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= step0) ?? step0;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-9; v += step) out.push(v);
  return out;
}

function clock(ts: number, tf: number) {
  const d = new Date(ts * 1000);
  if (tf >= 14_400) return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

/**
 * Candle chart for a coin, drawn in SVG (no chart library): candles, volume, buy/sell markers,
 * last-price line and a crosshair with the candle's open/high/low/close. Price or market cap.
 */
export function CandleChart({
  candles,
  trades = [],
  tf,
  native,
  toCap,
  className,
}: {
  candles: Candle[];
  trades?: Trade[];
  tf: number;
  native: string;
  /** multiply a native price by this to get market cap in USD (0 = unknown) */
  toCap?: number;
  className?: string;
}) {
  const box = useRef<HTMLDivElement | null>(null);
  const [w, setW] = useState(640);
  const [hover, setHover] = useState<number | null>(null);
  const [mode, setMode] = useState<"price" | "cap">("price");
  const capOk = (toCap ?? 0) > 0;
  const k = mode === "cap" && capOk ? (toCap as number) : 1;

  useEffect(() => {
    const el = box.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const H = w < 520 ? 280 : 320;
  const padR = 64;
  const padB = 22;
  const volH = 44;
  const plotW = w - padR;
  const maxBars = Math.max(12, Math.floor(plotW / 7));

  const data = useMemo(
    () =>
      candles
        .filter((c) => c[4] > 0)
        .map((c) => ({ time: c[0], open: c[1] * k, high: c[2] * k, low: c[3] * k, close: c[4] * k, vol: c[5] }))
        .sort((a, b) => a.time - b.time)
        .slice(-maxBars),
    [candles, k, maxBars],
  );

  if (data.length === 0) return <p className="py-12 text-center text-sm text-muted">Not enough trades for a chart yet.</p>;

  let lo = Math.min(...data.map((d) => d.low));
  let hi = Math.max(...data.map((d) => d.high));
  if (hi === lo) {
    hi *= 1.05;
    lo *= 0.95;
  }
  const pad = (hi - lo) * 0.08;
  lo = Math.max(0, lo - pad);
  hi += pad;
  const top = 12;
  const priceH = H - padB - volH - top - 6;
  const y = (v: number) => top + ((hi - v) / (hi - lo)) * priceH;
  const slot = plotW / Math.max(data.length, 12);
  const bodyW = Math.max(2, Math.min(14, slot * 0.66));
  const x = (i: number) => plotW - (data.length - i - 0.5) * slot;
  const maxVol = Math.max(...data.map((d) => d.vol), 0);
  const volTop = H - padB - volH;
  const ticks = niceTicks(lo, hi, 4);
  const last = data[data.length - 1];
  const lastUp = last.close >= last.open;
  const label = (v: number) => (mode === "cap" && capOk ? `$${fmt(v)}` : fmt(v));
  const idxOf = new Map(data.map((d, i) => [Math.floor(d.time / tf) * tf, i]));
  const marks = trades
    .filter((t) => t.ts >= data[0].time)
    .slice(-60)
    .map((t) => ({ t, i: idxOf.get(Math.floor(t.ts / tf) * tf) }))
    .filter((m): m is { t: Trade; i: number } => m.i !== undefined);
  const timeEvery = Math.max(1, Math.ceil(data.length / Math.max(2, Math.floor(plotW / 90))));
  const h = hover !== null ? data[hover] : null;
  const change = data.length > 1 ? ((last.close - data[0].open) / (data[0].open || 1)) * 100 : 0;

  function onMove(e: PointerEvent<SVGSVGElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * w;
    const i = Math.round(data.length - 0.5 - (plotW - px) / slot);
    setHover(i >= 0 && i < data.length ? i : null);
  }

  return (
    <div className={className}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs tabular-nums text-muted">
          {h ? (
            <span>
              {clock(h.time, tf)} · O <span className="text-fg">{label(h.open)}</span> H <span className="text-fg">{label(h.high)}</span> L{" "}
              <span className="text-fg">{label(h.low)}</span> C{" "}
              <span className={h.close >= h.open ? "text-cyan" : "text-sell"}>{label(h.close)}</span>
              {h.vol > 0 ? ` · vol ${fmt(h.vol)} ${native}` : ""}
            </span>
          ) : (
            <span>
              <span className="text-fg">{label(last.close)}</span>{" "}
              <span className={change >= 0 ? "text-cyan" : "text-sell"}>
                {change >= 0 ? "+" : ""}
                {change.toFixed(1)}%
              </span>{" "}
              over the shown range
            </span>
          )}
        </div>
        {capOk ? (
          <div className="flex gap-1">
            {(["price", "cap"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={cn("rounded-full px-3 py-1 text-xs", mode === m ? "bg-cyan text-cyan-ink" : "bg-bg text-muted shadow-border")}
              >
                {m === "price" ? `Price (${native})` : "Market cap ($)"}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      <div ref={box} className="w-full">
        <svg
          viewBox={`0 0 ${w} ${H}`}
          width="100%"
          height={H}
          className="block touch-pan-y select-none"
          onPointerMove={onMove}
          onPointerDown={onMove}
          onPointerLeave={() => setHover(null)}
          role="img"
          aria-label={`Candle chart, last ${label(last.close)}`}
        >
          <defs>
            <linearGradient id="cc-glow" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor={UP} stopOpacity="0.10" />
              <stop offset="1" stopColor={UP} stopOpacity="0" />
            </linearGradient>
          </defs>
          <rect x="0" y={top} width={plotW} height={priceH} fill="url(#cc-glow)" />
          {ticks.map((t) => (
            <g key={t}>
              <line x1="0" x2={plotW} y1={y(t)} y2={y(t)} stroke="#1c2a2c" strokeDasharray="2 4" />
              <text x={plotW + 6} y={y(t) + 4} fontSize="10.5" fill="#93a4a7" className="tabular-nums">
                {label(t)}
              </text>
            </g>
          ))}
          {data.map((d, i) =>
            i % timeEvery === 0 ? (
              <text key={`t${d.time}`} x={x(i)} y={H - 6} fontSize="10.5" fill="#93a4a7" textAnchor="middle">
                {clock(d.time, tf)}
              </text>
            ) : null,
          )}
          {data.map((d, i) => {
            const up = d.close >= d.open;
            const c = up ? UP : DOWN;
            const y1 = y(Math.max(d.open, d.close));
            const y2 = y(Math.min(d.open, d.close));
            return (
              <g key={d.time} opacity={hover === null || hover === i ? 1 : 0.55}>
                {maxVol > 0 && d.vol > 0 ? (
                  <rect x={x(i) - bodyW / 2} width={bodyW} y={volTop + volH - (d.vol / maxVol) * volH} height={(d.vol / maxVol) * volH} fill={c} fillOpacity="0.28" />
                ) : null}
                <line x1={x(i)} x2={x(i)} y1={y(d.high)} y2={y(d.low)} stroke={c} strokeWidth="1.2" />
                <rect x={x(i) - bodyW / 2} width={bodyW} y={y1} height={Math.max(1.2, y2 - y1)} rx="1" fill={c} />
              </g>
            );
          })}
          {marks.map(({ t, i }, n) => {
            const d = data[i];
            const cy = t.buy ? y(d.low) + 10 : y(d.high) - 10;
            return (
              <path
                key={`m${n}`}
                d={t.buy ? `M${x(i)} ${cy - 4} l4 6 h-8 z` : `M${x(i)} ${cy + 4} l4 -6 h-8 z`}
                fill={t.buy ? UP : DOWN}
              >
                <title>
                  {t.buy ? "Buy" : "Sell"} {fmt(t.native)} {native}
                </title>
              </path>
            );
          })}
          <line x1="0" x2={plotW} y1={y(last.close)} y2={y(last.close)} stroke={lastUp ? UP : DOWN} strokeDasharray="4 3" strokeOpacity="0.8" />
          <rect x={plotW + 1} y={y(last.close) - 9} width={padR - 2} height="18" rx="4" fill={lastUp ? UP : DOWN} />
          <text x={plotW + 6} y={y(last.close) + 4} fontSize="10.5" fontWeight="700" fill="#042022" className="tabular-nums">
            {label(last.close)}
          </text>
          {h && hover !== null ? (
            <g pointerEvents="none">
              <line x1={x(hover)} x2={x(hover)} y1={top} y2={H - padB} stroke="#f4f7f7" strokeOpacity="0.35" strokeDasharray="3 3" />
              <line x1="0" x2={plotW} y1={y(h.close)} y2={y(h.close)} stroke="#f4f7f7" strokeOpacity="0.2" strokeDasharray="3 3" />
            </g>
          ) : null}
        </svg>
      </div>
    </div>
  );
}

/**
 * The Ferzan bonding curve, drawn to scale. Price rises with the square of what has been raised:
 * price(r) = start x (1 + 3r)^2, so the graduation price is 16x the launch price (r = share of the target raised).
 * Shows where the coin is now, the graduation point, and what a buy of a chosen size would do.
 */
export function CurveGraphic({
  progress,
  gradNative,
  price,
  native,
  symbol,
  supply,
  graduated,
}: {
  progress: number;
  gradNative: number;
  price: number;
  native: string;
  symbol: string;
  supply: number;
  graduated: boolean;
}) {
  const [buy, setBuy] = useState("");
  const r = Math.max(0, Math.min(1, progress / 100));
  const mult = (x: number) => (1 + 3 * x) ** 2;
  const p0 = price > 0 ? price / mult(r) : 0;
  const amt = Math.max(0, Number(buy) || 0);
  const r2 = Math.min(1, r + (amt * 0.99) / Math.max(gradNative, 1e-18));
  const sold = (x: number) => supply * (16 / 15 - 16 / 45 / (1 / 3 + x));
  const tokens = supply > 0 ? Math.max(0, sold(r2) - sold(r)) : 0;
  const impact = r2 > r ? (mult(r2) / mult(r) - 1) * 100 : 0;

  const W = 640;
  const H = 280;
  const L = 56;
  const R = 20;
  const T = 24;
  const B = 40;
  const x = (v: number) => L + v * (W - L - R);
  const y = (m: number) => H - B - ((m - 1) / 15) * (H - B - T);
  const pts = useMemo(() => Array.from({ length: 81 }, (_, i) => i / 80), []);
  const line = pts.map((v, i) => `${i ? "L" : "M"}${x(v).toFixed(1)},${y(mult(v)).toFixed(1)}`).join(" ");
  const filled = pts.filter((v) => v <= r);
  const area = filled.length
    ? `M${x(0)},${H - B} ` + filled.map((v) => `L${x(v).toFixed(1)},${y(mult(v)).toFixed(1)}`).join(" ") + ` L${x(r).toFixed(1)},${y(mult(r)).toFixed(1)} L${x(r).toFixed(1)},${H - B} Z`
    : "";
  const ghost = r2 > r
    ? `M${x(r)},${H - B} ` +
      pts.filter((v) => v >= r && v <= r2).map((v) => `L${x(v).toFixed(1)},${y(mult(v)).toFixed(1)}`).join(" ") +
      ` L${x(r2).toFixed(1)},${y(mult(r2)).toFixed(1)} L${x(r2).toFixed(1)},${H - B} Z`
    : "";

  return (
    <div className="ticket">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-extrabold">Bonding curve</p>
        <p className="text-xs text-muted">Price grows 16x from launch to graduation</p>
      </div>
      <div className="mt-2 overflow-x-auto">
        <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full min-w-[320px]" role="img" aria-label={`${symbol} is ${progress.toFixed(0)}% along its bonding curve`}>
          <defs>
            <linearGradient id="curve-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#3ee0e6" stopOpacity="0.45" />
              <stop offset="100%" stopColor="#3ee0e6" stopOpacity="0.03" />
            </linearGradient>
          </defs>
          {[1, 4, 9, 16].map((m) => (
            <g key={m}>
              <line x1={L} x2={W - R} y1={y(m)} y2={y(m)} stroke="#1c2a2c" strokeDasharray="3 5" />
              <text x={L - 8} y={y(m) + 4} textAnchor="end" fontSize="11" fill="#93a4a7">
                {m}x
              </text>
            </g>
          ))}
          {[0, 0.25, 0.5, 0.75, 1].map((v) => (
            <text key={v} x={x(v)} y={H - B + 18} textAnchor={v === 0 ? "start" : v === 1 ? "end" : "middle"} fontSize="11" fill="#93a4a7">
              {fmt(gradNative * v)} {native}
            </text>
          ))}
          <text x={L} y={H - 6} fontSize="11" fill="#93a4a7">
            raised
          </text>
          {area ? <path d={area} fill="url(#curve-fill)" /> : null}
          {ghost ? <path d={ghost} fill="#3ee0e6" fillOpacity="0.18" /> : null}
          <path d={line} fill="none" stroke="#3ee0e6" strokeWidth="2.5" strokeOpacity="0.35" />
          <path
            d={pts.filter((v) => v <= r).map((v, i) => `${i ? "L" : "M"}${x(v).toFixed(1)},${y(mult(v)).toFixed(1)}`).join(" ") + ` L${x(r)},${y(mult(r))}`}
            fill="none"
            stroke="#3ee0e6"
            strokeWidth="3"
          />
          <line x1={x(1)} x2={x(1)} y1={T - 6} y2={H - B} stroke="#f4f7f7" strokeOpacity="0.4" strokeDasharray="4 4" />
          <text x={x(1) - 6} y={T + 6} textAnchor="end" fontSize="12" fontWeight="700" fill="#f4f7f7">
            🎓 Graduation
          </text>
          {r2 > r ? <circle cx={x(r2)} cy={y(mult(r2))} r="6" fill="none" stroke="#f4f7f7" strokeWidth="2" strokeDasharray="3 3" /> : null}
          <circle cx={x(r)} cy={y(mult(r))} r="11" fill="#3ee0e6" fillOpacity="0.25" className={graduated ? "" : "curve-pulse"} />
          <circle cx={x(r)} cy={y(mult(r))} r="6" fill="#3ee0e6" stroke="#07090b" strokeWidth="2" />
          <text
            x={Math.min(x(r) + 12, W - R - 90)}
            y={Math.max(y(mult(r)) - 12, T + 26)}
            fontSize="12"
            fontWeight="700"
            fill="#f4f7f7"
          >
            {graduated ? "Graduated" : `Now · ${progress.toFixed(1)}%`}
          </text>
        </svg>
      </div>
      {!graduated && p0 > 0 ? (
        <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto] sm:items-center">
          <label className="flex items-center gap-2 text-sm">
            <span className="shrink-0 text-muted">If you buy</span>
            <input
              id="curve-sim"
              value={buy}
              onChange={(e) => setBuy(e.target.value.replace(/[^0-9.]/g, ""))}
              inputMode="decimal"
              placeholder="0.5"
              className="min-h-10 w-28 bg-bg px-3 tabular-nums shadow-border outline-none"
            />
            <span className="shrink-0">{native}</span>
          </label>
          <p className="text-sm tabular-nums text-muted">
            {amt > 0 ? (
              <>
                ≈ <b className="text-fg">{fmt(tokens)}</b> ${symbol} · price +{impact.toFixed(1)}%
                {r2 >= 1 ? <b className="text-cyan"> · fills the curve</b> : null}
              </>
            ) : (
              "Type an amount to see where the dot moves."
            )}
          </p>
        </div>
      ) : null}
    </div>
  );
}
