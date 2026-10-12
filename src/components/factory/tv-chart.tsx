import { useEffect, useMemo, useRef, useState } from "react";
import type { IChartApi, ISeriesApi, MouseEventParams, UTCTimestamp } from "lightweight-charts";
import { tr } from "@/lib/i18n";
import { CandleChart } from "./chart-pro";

type Candle = [number, number, number, number, number, number];
type Charts = typeof import("lightweight-charts");
type Bar = { time: UTCTimestamp; open: number; high: number; low: number; close: number; vol: number };

export const CHART_TIMEFRAMES = [
  { tf: 60, label: "1m" },
  { tf: 300, label: "5m" },
  { tf: 900, label: "15m" },
  { tf: 3600, label: "1h" },
  { tf: 14400, label: "4h" },
] as const;

/**
 * One candle chart for every chain. The library loads only when this mounts (coin pages).
 * If it fails, the old SVG chart draws the same candles.
 * TradingView Lightweight Charts™ (Apache-2.0). Copyright (c) TradingView, Inc.
 */
export function TvChart({
  candles,
  tf,
  onTf,
  native,
  toCap,
}: {
  candles: Candle[];
  tf: number;
  onTf: (tf: number) => void;
  native: string;
  toCap?: number;
}) {
  const [lib, setLib] = useState<Charts | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let stop = false;
    import("lightweight-charts")
      .then((mod) => {
        if (!stop) setLib(mod);
      })
      .catch(() => {
        if (!stop) setFailed(true);
      });
    return () => {
      stop = true;
    };
  }, []);

  return (
    <div>
      <div className="mb-2 flex gap-2 overflow-x-auto">
        {CHART_TIMEFRAMES.map((item) => (
          <button key={item.tf} type="button" onClick={() => onTf(item.tf)} className={item.tf === tf ? "btn-cyan min-h-9 px-3 text-sm" : "btn-line min-h-9 px-3 text-sm"}>
            {item.label}
          </button>
        ))}
      </div>
      {failed ? (
        <CandleChart candles={candles} tf={tf} native={native} toCap={toCap} />
      ) : lib ? (
        <LibraryChart lib={lib} candles={candles} tf={tf} native={native} toCap={toCap} onFail={() => setFailed(true)} />
      ) : (
        <div className="h-[280px] sm:h-[340px]" aria-busy="true" />
      )}
    </div>
  );
}

function fmt(v: number) {
  if (!Number.isFinite(v) || v === 0) return "0";
  const a = Math.abs(v);
  if (a >= 1e9) return `${(v / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `${(v / 1e6).toFixed(2)}M`;
  if (a >= 1e3) return `${(v / 1e3).toFixed(1)}K`;
  if (a >= 1) return v.toFixed(2);
  return v.toPrecision(4);
}

function barsOf(candles: Candle[], k: number): Bar[] {
  const map = new Map<number, Bar>();
  for (const c of candles) {
    if (!(c[4] > 0) || !(c[1] > 0)) continue;
    const time = Math.floor(c[0]) as UTCTimestamp;
    map.set(time, { time, open: c[1] * k, high: c[2] * k, low: c[3] * k, close: c[4] * k, vol: c[5] });
  }
  return [...map.values()].sort((a, b) => a.time - b.time);
}

function sma20(rows: Bar[]) {
  const out: { time: UTCTimestamp; value: number }[] = [];
  let sum = 0;
  for (let i = 0; i < rows.length; i += 1) {
    sum += rows[i].close;
    if (i >= 20) sum -= rows[i - 20].close;
    if (i >= 19) out.push({ time: rows[i].time, value: sum / 20 });
  }
  return out;
}

function LibraryChart({
  lib,
  candles,
  tf,
  native,
  toCap,
  onFail,
}: {
  lib: Charts;
  candles: Candle[];
  tf: number;
  native: string;
  toCap?: number;
  onFail: () => void;
}) {
  const frame = useRef<HTMLDivElement>(null);
  const host = useRef<HTMLDivElement>(null);
  const api = useRef<{ chart: IChartApi; series: ISeriesApi<"Candlestick">; volume: ISeriesApi<"Histogram">; sma: ISeriesApi<"Line"> } | null>(null);
  const failRef = useRef(onFail);
  const fitKey = useRef("");
  failRef.current = onFail;
  const [mode, setMode] = useState<"price" | "cap">("price");
  const [log, setLog] = useState(false);
  const [smaOn, setSmaOn] = useState(false);
  const [full, setFull] = useState(false);
  const [hover, setHover] = useState<{ o: number; h: number; l: number; c: number; vol: number } | null>(null);
  const capOk = (toCap ?? 0) > 0;
  const k = mode === "cap" && capOk ? (toCap as number) : 1;
  const rows = useMemo(() => barsOf(candles, k), [candles, k]);
  const logOk = rows.length > 0 && rows.every((row) => row.low > 0);
  const label = (v: number) => (mode === "cap" && capOk ? `$${fmt(v)}` : fmt(v));

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let chart: IChartApi;
    try {
      chart = lib.createChart(el, {
        autoSize: true,
        layout: { background: { type: lib.ColorType.Solid, color: "transparent" }, textColor: "#9aa7b2", fontFamily: "inherit" },
        grid: { vertLines: { color: "rgba(255,255,255,0.06)" }, horzLines: { color: "rgba(255,255,255,0.06)" } },
        rightPriceScale: { borderColor: "rgba(255,255,255,0.08)" },
        timeScale: { borderColor: "rgba(255,255,255,0.08)", timeVisible: true, secondsVisible: false },
        crosshair: { mode: lib.CrosshairMode.Normal },
        handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
        handleScale: { mouseWheel: true, pinch: true, axisPressedMouseMove: true, axisDoubleClickReset: true },
      });
    } catch {
      failRef.current();
      return;
    }
    const series = chart.addSeries(lib.CandlestickSeries, {
      upColor: "#3ee0e6",
      downColor: "#e07a68",
      borderVisible: false,
      wickUpColor: "#3ee0e6",
      wickDownColor: "#e07a68",
      priceLineVisible: true,
      lastValueVisible: true,
    });
    const volume = chart.addSeries(lib.HistogramSeries, {
      priceScaleId: "volume",
      priceLineVisible: false,
      lastValueVisible: false,
      priceFormat: { type: "volume" },
    });
    chart.priceScale("volume").applyOptions({ scaleMargins: { top: 0.78, bottom: 0 } });
    const sma = chart.addSeries(lib.LineSeries, {
      color: "#e6c15a",
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
    });
    const onMove = (param: MouseEventParams) => {
      const bar = param.seriesData.get(series);
      const vol = param.seriesData.get(volume);
      if (!bar || !("open" in bar)) {
        setHover(null);
        return;
      }
      const amount = vol && "value" in vol ? vol.value : 0;
      setHover({ o: bar.open, h: bar.high, l: bar.low, c: bar.close, vol: amount });
    };
    chart.subscribeCrosshairMove(onMove);
    api.current = { chart, series, volume, sma };
    return () => {
      chart.remove();
      api.current = null;
    };
  }, [lib]);

  useEffect(() => {
    const live = api.current;
    if (!live || rows.length === 0) return;
    const text = (price: number) => (mode === "cap" && capOk ? `$${fmt(price)}` : fmt(price));
    try {
      live.series.applyOptions({
        priceFormat: { type: "custom", formatter: text, minMove: 1e-12 },
      });
      live.series.setData(rows.map((row) => ({ time: row.time, open: row.open, high: row.high, low: row.low, close: row.close })));
      live.volume.setData(rows.map((row) => ({ time: row.time, value: row.vol, color: row.close >= row.open ? "rgba(62,224,230,0.45)" : "rgba(224,122,104,0.45)" })));
      live.sma.setData(smaOn ? sma20(rows) : []);
      live.chart.priceScale("right").applyOptions({
        mode: log && logOk ? lib.PriceScaleMode.Logarithmic : lib.PriceScaleMode.Normal,
      });
      const key = `${tf}:${mode}`;
      if (fitKey.current !== key) {
        live.chart.timeScale().fitContent();
        fitKey.current = key;
      }
    } catch {
      failRef.current();
    }
  }, [rows, smaOn, log, logOk, lib, mode, capOk, tf]);

  useEffect(() => {
    const on = () => setFull(document.fullscreenElement === frame.current);
    document.addEventListener("fullscreenchange", on);
    return () => document.removeEventListener("fullscreenchange", on);
  }, []);

  async function toggleFull() {
    const el = frame.current;
    if (!el) return;
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await el.requestFullscreen();
    } catch {
      /* this browser has no fullscreen; the chart still pans and zooms */
    }
  }

  const last = rows.at(-1);

  return (
    <div ref={frame} className={full ? "flex h-full flex-col bg-bg p-3" : ""}>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <button type="button" className={mode === "cap" ? "chip-on min-h-9 px-3 text-xs font-semibold" : "min-h-9 bg-surface px-3 text-xs font-semibold text-muted shadow-border"} disabled={!capOk} onClick={() => setMode("cap")}>
          {tr("Market cap")}
        </button>
        <button type="button" className={mode === "price" ? "chip-on min-h-9 px-3 text-xs font-semibold" : "min-h-9 bg-surface px-3 text-xs font-semibold text-muted shadow-border"} onClick={() => setMode("price")}>
          {tr("Price")}
        </button>
        <button type="button" className={log ? "chip-on min-h-9 px-3 text-xs font-semibold" : "min-h-9 bg-surface px-3 text-xs font-semibold text-muted shadow-border"} disabled={!logOk} onClick={() => setLog((v) => !v)}>
          {tr("Log scale")}
        </button>
        <button type="button" className={smaOn ? "chip-on min-h-9 px-3 text-xs font-semibold" : "min-h-9 bg-surface px-3 text-xs font-semibold text-muted shadow-border"} onClick={() => setSmaOn((v) => !v)}>
          {tr("SMA 20")}
        </button>
        <button type="button" className="min-h-9 bg-surface px-3 text-xs font-semibold text-muted shadow-border" onClick={() => void toggleFull()}>
          {full ? tr("Exit full screen") : tr("Full screen")}
        </button>
      </div>
      <p className="mb-1 min-h-5 text-xs tabular-nums text-muted">
        {hover ? (
          <span>
            O <span className="text-fg">{label(hover.o)}</span> H <span className="text-fg">{label(hover.h)}</span> L <span className="text-fg">{label(hover.l)}</span> C{" "}
            <span className={hover.c >= hover.o ? "text-cyan" : "text-sell"}>{label(hover.c)}</span>
            {hover.vol > 0 ? tr(" · vol {0} {1}", fmt(hover.vol), native) : ""}
          </span>
        ) : last ? (
          <span className="text-fg">{label(last.close)}</span>
        ) : (
          tr("Not enough trades for a chart yet.")
        )}
      </p>
      <div ref={host} className={full ? "min-h-0 w-full flex-1" : "h-[280px] w-full sm:h-[340px]"} />
      <p className="mt-1 text-[11px] text-muted">
        <a href="https://www.tradingview.com/" target="_blank" rel="noopener noreferrer" className="underline">
          TradingView Lightweight Charts™
        </a>
        {" · "}
        Copyright (c) TradingView, Inc.
      </p>
    </div>
  );
}
