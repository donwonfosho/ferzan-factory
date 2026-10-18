import { useEffect, useMemo, useRef, useState } from "react";
import type { IChartApi, IPriceLine, ISeriesApi, ISeriesMarkersPluginApi, MouseEventParams, SeriesMarker, Time, UTCTimestamp } from "lightweight-charts";
import { tr } from "@/lib/i18n";
import { getPnl } from "@/lib/factory/market-extra";
import { CandleChart } from "./chart-pro";

type Candle = [number, number, number, number, number, number];
type Charts = typeof import("lightweight-charts");
type Bar = { time: UTCTimestamp; open: number; high: number; low: number; close: number; vol: number };

export type ChartTrade = { ts: number; buy: boolean; native: number; tokens: number; trader: string };

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
  trades,
  wallet,
  chain,
  token,
  creator,
  targetRaw,
  targetDecimals,
  wallets = true,
}: {
  candles: Candle[];
  tf: number;
  onTf: (tf: number) => void;
  native: string;
  toCap?: number;
  trades?: ChartTrade[];
  wallet?: string;
  /** Coin the Launch API uses for this wallet's position. Without both, the chart hides P/L. */
  chain?: string;
  token?: string;
  creator?: string;
  /** Graduation target as the chain's raw integer, plus its decimals. */
  targetRaw?: string;
  targetDecimals?: number;
  /** False on a chain whose trade feed has no wallet. */
  wallets?: boolean;
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

  const noWallets = wallets === false || ((trades?.length ?? 0) > 0 && !(trades ?? []).some((t) => t.trader));

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
        <LibraryChart
          lib={lib}
          candles={candles}
          tf={tf}
          native={native}
          toCap={toCap}
          trades={wallets === false ? [] : (trades ?? [])}
          wallet={wallet ?? ""}
          chain={chain ?? ""}
          token={token ?? ""}
          creator={creator ?? ""}
          target={chartNative(targetRaw ?? "", targetDecimals ?? 0)}
          onFail={() => setFailed(true)}
        />
      ) : (
        <div className="h-[280px] sm:h-[340px]" aria-busy="true" />
      )}
      {noWallets ? <p className="mt-2 text-xs text-muted">{tr("Your trades are not shown on this chain yet")}</p> : null}
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

function chartNative(raw: string, decimals: number): number {
  if (!/^\d+$/.test(raw) || decimals < 0 || decimals > 18) return 0;
  const v = BigInt(raw);
  const scale = 10n ** BigInt(decimals);
  return Number(v / scale) + Number(v % scale) / Number(scale);
}

function sameWallet(a: string, b: string) {
  if (!a || !b) return false;
  if (a.startsWith("0x") || a.startsWith("0X") || b.startsWith("0x") || b.startsWith("0X")) return a.toLowerCase() === b.toLowerCase();
  return a === b;
}

function tradeSec(ts: number) {
  return ts > 1e12 ? Math.floor(ts / 1000) : Math.floor(ts);
}

function LibraryChart({
  lib,
  candles,
  tf,
  native,
  toCap,
  trades,
  wallet,
  chain,
  token,
  creator,
  target,
  onFail,
}: {
  lib: Charts;
  candles: Candle[];
  tf: number;
  native: string;
  toCap?: number;
  trades: ChartTrade[];
  wallet: string;
  chain: string;
  token: string;
  creator: string;
  target: number;
  onFail: () => void;
}) {
  const frame = useRef<HTMLDivElement>(null);
  const host = useRef<HTMLDivElement>(null);
  const api = useRef<{
    chart: IChartApi;
    series: ISeriesApi<"Candlestick">;
    volume: ISeriesApi<"Histogram">;
    sma: ISeriesApi<"Line">;
    markers: ISeriesMarkersPluginApi<Time>;
    priceLine: IPriceLine | null;
  } | null>(null);
  const failRef = useRef(onFail);
  const fitKey = useRef("");
  const tipRef = useRef(new Map<number, string>());
  failRef.current = onFail;
  const [mode, setMode] = useState<"price" | "cap">("price");
  const [log, setLog] = useState(false);
  const [smaOn, setSmaOn] = useState(false);
  const [full, setFull] = useState(false);
  const [hover, setHover] = useState<{ o: number; h: number; l: number; c: number; vol: number } | null>(null);
  const [tip, setTip] = useState("");
  const capOk = (toCap ?? 0) > 0;
  const k = mode === "cap" && capOk ? (toCap as number) : 1;
  const rows = useMemo(() => barsOf(candles, k), [candles, k]);
  const logOk = rows.length > 0 && rows.every((row) => row.low > 0);
  const label = (v: number) => (mode === "cap" && capOk ? `$${fmt(v)}` : fmt(v));
  const avg = useMemo(() => {
    let spent = 0;
    let got = 0;
    for (const t of trades) {
      if (!wallet || !sameWallet(t.trader, wallet) || !t.buy || !(t.native > 0) || !(t.tokens > 0)) continue;
      spent += t.native;
      got += t.tokens;
    }
    return got > 0 ? spent / got : 0;
  }, [trades, wallet]);
  // Spot price against the average buy overstates a large buy, because that buy itself moved the price.
  // The Launch API's pnl_pct is what selling the position would pay, the same number as "Your position".
  const [pnl, setPnl] = useState<number | null>(null);
  useEffect(() => {
    let stop = false;
    if (!wallet || !chain || !token) {
      setPnl(null);
      return;
    }
    getPnl({ data: { chain, token, wallet } })
      .then((row) => {
        if (!stop) setPnl(row && Number.isFinite(row.pnlPct) ? row.pnlPct : null);
      })
      .catch(() => {
        if (!stop) setPnl(null);
      });
    return () => {
      stop = true;
    };
  }, [wallet, chain, token, trades]);

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
        setTip("");
        return;
      }
      const amount = vol && "value" in vol ? vol.value : 0;
      const time = typeof param.time === "number" ? param.time : null;
      setHover({ o: bar.open, h: bar.high, l: bar.low, c: bar.close, vol: amount });
      setTip(time === null ? "" : (tipRef.current.get(time) ?? ""));
    };
    chart.subscribeCrosshairMove(onMove);
    const markers = lib.createSeriesMarkers(series, []);
    api.current = { chart, series, volume, sma, markers, priceLine: null };
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
      const times = new Set(rows.map((row) => row.time));
      const whale = target > 0 ? target * 0.05 : 0;
      const marks: SeriesMarker<Time>[] = [];
      const tips = new Map<number, string>();
      for (const t of trades) {
        if (!t.trader) continue;
        const bucket = (Math.floor(tradeSec(t.ts) / tf) * tf) as UTCTimestamp;
        if (!times.has(bucket)) continue;
        const mine = Boolean(wallet) && sameWallet(t.trader, wallet);
        const dev = Boolean(creator) && sameWallet(t.trader, creator);
        const big = t.buy && whale > 0 && t.native > whale;
        if (!mine && !dev && !big) continue;
        marks.push({
          time: bucket,
          position: t.buy ? "belowBar" : "aboveBar",
          shape: dev ? "circle" : mine ? (t.buy ? "arrowUp" : "arrowDown") : "square",
          color: dev ? "#e6c15a" : t.buy ? "#3ee0e6" : "#e07a68",
          text: mine ? (t.buy ? "B" : "S") : dev ? "C" : "",
          size: big ? 2 : 1,
        });
        if (mine && t.native > 0) {
          const line = `${t.buy ? "B" : "S"} ${fmt(t.native)} ${native}`;
          const prev = tips.get(bucket);
          tips.set(bucket, prev ? `${prev} · ${line}` : line);
        }
      }
      live.markers.setMarkers(marks);
      tipRef.current = tips;
      if (live.priceLine) {
        live.series.removePriceLine(live.priceLine);
        live.priceLine = null;
      }
      if (avg > 0) {
        live.priceLine = live.series.createPriceLine({
          price: avg * k,
          color: "#e6c15a",
          lineWidth: 1,
          lineStyle: lib.LineStyle.Dashed,
          axisLabelVisible: true,
          title: tr("Avg buy"),
        });
      }
    } catch {
      failRef.current();
    }
  }, [rows, smaOn, log, logOk, lib, mode, capOk, tf, trades, wallet, creator, target, avg, k, native]);

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
            {tip ? <span className="text-fg"> · {tip}</span> : null}
          </span>
        ) : last ? (
          <span>
            <span className="text-fg">{label(last.close)}</span>
            {pnl !== null ? <span className={pnl >= 0 ? "text-cyan" : "text-sell"}>{tr(" · Your P/L {0}%", `${pnl >= 0 ? "+" : ""}${pnl.toFixed(1)}`)}</span> : null}
          </span>
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
