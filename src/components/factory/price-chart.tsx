import { useEffect, useRef, useState } from "react";
import { CHAINS } from "@/lib/factory/catalog";
import { spot } from "@/lib/factory/curve";
import { listFills } from "@/lib/factory/market";
import { isEvmChain, readCurve, type EvmChainId } from "@/lib/factory/deploy";
import type { ChainId } from "@/lib/factory/types";
import { formatPrice } from "@/lib/factory/units";
import { useNativeUsd } from "@/lib/factory/usd";
import { compactCap, compactUsd } from "./market-line";
import { cn } from "@/lib/cn";
import { readPrefs, writePrefs } from "@/lib/factory/prefs";

type Point = { t: number; y: number };

const RANGES = [
  { id: "live", label: "Live", ms: 60_000 },
  { id: "5m", label: "5m", ms: 5 * 60_000 },
  { id: "15m", label: "15m", ms: 15 * 60_000 },
  { id: "1h", label: "1H", ms: 60 * 60_000 },
  { id: "4h", label: "4H", ms: 4 * 60 * 60_000 },
  { id: "1d", label: "1D", ms: 24 * 60 * 60_000 },
  { id: "all", label: "All", ms: 0 },
] as const;

type RangeId = (typeof RANGES)[number]["id"];

export function PriceChart({
  contract,
  chain,
  createdAt,
  native,
  supply = "0",
}: {
  contract: string;
  chain: string;
  createdAt?: string;
  native: string;
  supply?: string;
}) {
  const [points, setPoints] = useState<Point[]>([]);
  const [live, setLive] = useState(0);
  const [range, setRange] = useState<RangeId>("all");
  const [focus, setFocus] = useState<Point | null>(null);
  const [plot, setPlot] = useState<"price" | "cap">(readPrefs().chart);

  useEffect(() => {
    let stop = false;
    async function pull() {
      const next: Point[] = [];
      let now = 0;
      const evm = isListedEvm(chain);
      if (evm) {
        try {
          const state = await readCurve(evm, contract);
          const meta = CHAINS[evm];
          const open = spot({ ...state, realEth: 0n, tokensSold: 0n, raisedEth: 0n }, meta.nativeDecimals, meta.tokenDecimals);
          now = spot(state, meta.nativeDecimals, meta.tokenDecimals);
          const fills = await listFills({ data: { chain: evm, contract } }).catch(() => []);
          for (const row of fills) {
            if (row.price > 0 && Number.isFinite(row.t)) next.push({ t: row.t, y: row.price });
          }
          const start = Date.parse(createdAt ?? "");
          const firstTrade = next[0]?.t;
          const openAt = Number.isFinite(start) ? start : firstTrade ? firstTrade - 1000 : Date.now() - 60_000;
          if (open > 0) next.unshift({ t: openAt, y: open });
        } catch {
          /* curve read can fail; the live price still draws */
        }
      }
      if (now > 0) next.push({ t: Date.now(), y: now });
      next.sort((a, b) => a.t - b.t);
      if (!stop) {
        setPoints(next);
        setLive(now || next.at(-1)?.y || 0);
      }
    }
    void pull();
    const timer = window.setInterval(() => void pull(), 8000);
    return () => {
      stop = true;
      window.clearInterval(timer);
    };
  }, [contract, chain, createdAt]);

  const windowMs = RANGES.find((item) => item.id === range)?.ms ?? 0;
  const priced = (chain in CHAINS ? chain : "base") as ChainId;
  const usd = useNativeUsd(priced);
  const scale = Number(supply);
  const asCap = plot === "cap" && Number.isFinite(scale) && scale > 0;
  const factor = asCap ? scale * (usd || 1) : 1;
  const scaled = points.map((point) => ({ ...point, y: point.y * factor }));
  const liveScaled = live * factor;
  const drawn = clip(scaled, windowMs);
  const shown = focus ?? (drawn.length ? { t: drawn[drawn.length - 1].t, y: liveScaled || drawn[drawn.length - 1].y } : null);
  const first = drawn[0]?.y ?? 0;
  const last = shown?.y ?? 0;
  const up = last >= first;
  const change = first > 0 && last > 0 ? ((last - first) / first) * 100 : 0;

  return (
    <section className="mt-6">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-extrabold">{asCap ? "Market cap" : "Price"}</h2>
          <p className="mt-1 text-sm text-muted">
            {focus ? stamp(focus.t) : asCap ? "Drag the line to read the market cap." : "Drag the line to read a price."}
          </p>
        </div>
        <p className="text-right">
          <span className="block text-lg font-extrabold tabular-nums">
            {last > 0 ? (asCap ? (usd ? compactUsd(last) : compactCap(last, native)) : formatPrice(last)) : "—"}
          </span>
          <span className={`block text-xs tabular-nums ${up ? "text-cyan" : "text-sell"}`}>
            {last > 0 ? `${change >= 0 ? "+" : ""}${change.toFixed(2)}%${asCap ? "" : ` · ${native}`}` : native}
          </span>
        </p>
      </div>
      <div className="mt-3 flex gap-2">
        <button type="button" className={asCap ? "chip-on min-h-11 px-3 text-sm font-semibold" : "min-h-11 bg-surface px-3 text-sm font-semibold text-muted shadow-border"} onClick={() => { setPlot("cap"); writePrefs({ chart: "cap" }); setFocus(null); }}>
          Market cap
        </button>
        <button type="button" className={!asCap ? "chip-on min-h-11 px-3 text-sm font-semibold" : "min-h-11 bg-surface px-3 text-sm font-semibold text-muted shadow-border"} onClick={() => { setPlot("price"); writePrefs({ chart: "price" }); setFocus(null); }}>
          Price
        </button>
      </div>
      <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
        {RANGES.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => {
              setRange(item.id);
              setFocus(null);
            }}
            className={cn(
              "min-h-11 shrink-0 px-3 text-sm font-semibold",
              range === item.id ? "chip-on" : "bg-surface text-muted shadow-border",
            )}
          >
            {item.label}
          </button>
        ))}
      </div>
      {drawn.length < 2 ? (
        <p className="mt-3 text-sm text-muted">The chart appears once the curve answers.</p>
      ) : (
        <ChartLine key={range} points={drawn} up={up} native={native} onFocus={setFocus} />
      )}
    </section>
  );
}

function clip(points: Point[], ms: number): Point[] {
  if (points.length === 0) return [];
  if (ms <= 0) return points.length === 1 ? [points[0], { t: points[0].t + 60_000, y: points[0].y }] : points;
  const end = points[points.length - 1].t;
  const start = end - ms;
  const inside = points.filter((point) => point.t >= start && point.t < end);
  const before = [...points].reverse().find((point) => point.t < start);
  const left = { t: start, y: before?.y ?? inside[0]?.y ?? points[0].y };
  const rows = [left, ...inside, points[points.length - 1]];
  const unique = rows.filter((point, index) => index === 0 || point.t > rows[index - 1].t);
  return unique.length === 1 ? [unique[0], { t: end, y: unique[0].y }] : unique;
}

function ChartLine({
  points,
  up,
  native,
  onFocus,
}: {
  points: Point[];
  up: boolean;
  native: string;
  onFocus: (point: Point | null) => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<Point | null>(null);
  const W = 640;
  const H = 220;
  const padX = 12;
  const padT = 18;
  const padB = 28;
  const ys = points.map((p) => p.y);
  let min = Math.min(...ys);
  let max = Math.max(...ys);
  if (!(max > min)) {
    const pad = min > 0 ? min * 0.04 : 1;
    min -= pad;
    max += pad;
  }
  const span = max - min || 1;
  const t0 = points[0].t;
  const t1 = Math.max(points[points.length - 1].t, t0 + 1);
  const xOf = (t: number) => padX + ((t - t0) / (t1 - t0)) * (W - padX * 2);
  const yOf = (v: number) => padT + (1 - (v - min) / span) * (H - padT - padB);
  const line = stepPath(points, xOf, yOf);
  const area = `${line} L${xOf(points[points.length - 1].t).toFixed(1)} ${H - padB} L${xOf(points[0].t).toFixed(1)} ${H - padB} Z`;
  const stroke = up ? "#2fd0d6" : "#e07a68";
  const grid = [0.25, 0.5, 0.75].map((g) => padT + g * (H - padT - padB));

  function pick(event: React.PointerEvent<SVGSVGElement>) {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    if (rect.width <= 0) return;
    const px = ((event.clientX - rect.left) / rect.width) * W;
    const ratio = Math.min(1, Math.max(0, (px - padX) / (W - padX * 2)));
    const t = t0 + ratio * (t1 - t0);
    let held = points[0];
    for (const point of points) {
      if (point.t <= t) held = point;
      else break;
    }
    const next = { t, y: held.y };
    setHover(next);
    onFocus(next);
  }

  const hx = hover ? xOf(hover.t) : 0;
  const hy = hover ? yOf(hover.y) : 0;
  const labelX = hover && hx > W * 0.62 ? hx - 168 : hx + 8;

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label="Price chart. Drag to read a point."
      className="mt-3 h-56 w-full touch-none bg-surface shadow-border"
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        pick(event);
      }}
      onPointerMove={(event) => {
        if (event.pointerType === "mouse" || event.buttons > 0) pick(event);
      }}
      onPointerUp={() => {
        /* keep the last point so the price can be read */
      }}
      onPointerLeave={(event) => {
        if (event.pointerType !== "mouse") return;
        setHover(null);
        onFocus(null);
      }}
    >
      {grid.map((gy) => (
        <line key={gy} x1={padX} x2={W - padX} y1={gy} y2={gy} stroke="#173033" strokeWidth="1" />
      ))}
      <path d={area} fill={stroke} opacity="0.16" />
      <path d={line} fill="none" stroke={stroke} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
      {hover ? (
        <>
          <line x1={hx} x2={hx} y1={padT} y2={H - padB} stroke="#f3f7f7" strokeDasharray="3 3" strokeWidth="1" />
          <circle cx={hx} cy={hy} r="4.5" fill={stroke} stroke="#041416" strokeWidth="1.5" />
          <rect x={labelX} y={padT} width="160" height="36" fill="#041416" stroke={stroke} />
          <text x={labelX + 8} y={padT + 15} fill="#f3f7f7" fontSize="12">
            {formatPrice(hover.y)} {native}
          </text>
          <text x={labelX + 8} y={padT + 29} fill="#8aa4a6" fontSize="10">
            {stamp(hover.t)}
          </text>
        </>
      ) : null}
      <text x={padX} y={14} fill="#8aa4a6" fontSize="11">
        {formatPrice(max)}
      </text>
      <text x={padX} y={H - 8} fill="#8aa4a6" fontSize="11">
        {formatPrice(min)}
      </text>
    </svg>
  );
}

function stepPath(points: Point[], xOf: (t: number) => number, yOf: (v: number) => number): string {
  let d = `M${xOf(points[0].t).toFixed(1)} ${yOf(points[0].y).toFixed(1)}`;
  for (let i = 1; i < points.length; i += 1) {
    d += ` H${xOf(points[i].t).toFixed(1)} V${yOf(points[i].y).toFixed(1)}`;
  }
  return d;
}

function stamp(ms: number): string {
  const d = new Date(ms);
  if (!Number.isFinite(d.getTime())) return "";
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const hh = d.getHours().toString().padStart(2, "0");
  const mm = d.getMinutes().toString().padStart(2, "0");
  const ss = d.getSeconds().toString().padStart(2, "0");
  return `${months[d.getMonth()]} ${d.getDate()} ${hh}:${mm}:${ss}`;
}

function isListedEvm(chain: string): EvmChainId | null {
  if (chain === "ethereum" || chain === "bsc" || chain === "base" || chain === "robinhood" || chain === "arc") {
    return isEvmChain(chain) ? chain : null;
  }
  return null;
}
