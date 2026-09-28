import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { getPulse, type Graduation, type Pulse, type TapeItem } from "@/lib/factory/pulse";
import { siteCoinHref } from "@/lib/factory/bot-curve";
import { cn } from "@/lib/cn";
import { ChainMark, type MarkChain } from "./chain-mark";
import { compactUsd } from "./market-line";

/* One shared poll for everything live on the page (tape, graduation banner, FERZAN hero). */
let pulse: Pulse | null = null;
let timer: number | null = null;
const subs = new Set<() => void>();
async function pull() {
  const next = await getPulse().catch(() => null);
  if (next) {
    pulse = next;
    subs.forEach((fn) => fn());
  }
}
function subscribe(fn: () => void) {
  subs.add(fn);
  if (timer === null && typeof window !== "undefined") {
    void pull();
    timer = window.setInterval(() => void pull(), 8_000);
  }
  return () => {
    subs.delete(fn);
    if (subs.size === 0 && timer !== null) {
      window.clearInterval(timer);
      timer = null;
    }
  };
}
export function usePulse(): Pulse | null {
  return useSyncExternalStore(subscribe, () => pulse, () => null);
}

const MARKS = new Set(["solana", "base", "bsc", "ethereum", "robinhood", "arc", "tron", "ton"]);

function hrefOf(item: { url: string }) {
  const site = siteCoinHref(item.url);
  return site ? { href: site, ext: false } : item.url ? { href: item.url, ext: true } : null;
}

function ago(ts: number, now: number) {
  const s = Math.max(0, Math.floor(now - ts));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  return `${Math.floor(s / 3600)}h`;
}

function TapeChip({ it, now }: { it: TapeItem; now: number }) {
  const link = hrefOf(it);
  const body = (
    <>
      <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", it.side === "buy" ? "bg-cyan" : "bg-sell")} />
      {MARKS.has(it.chain) ? <ChainMark id={it.chain as MarkChain} className="h-4 w-4 shrink-0" /> : null}
      <span className="font-semibold text-fg">${it.symbol}</span>
      <span className={it.side === "buy" ? "text-cyan" : "text-sell"}>{it.side === "buy" ? "buy" : "sell"}</span>
      <span className="tabular-nums text-fg">
        {it.native >= 1 ? it.native.toFixed(2) : it.native.toPrecision(2)} {it.unit}
      </span>
      {it.usd > 0 ? <span className="tabular-nums text-muted">{compactUsd(it.usd)}</span> : null}
      <span className="text-muted">
        {it.who} · {ago(it.ts, now)}
      </span>
    </>
  );
  const cls = "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full bg-surface px-3 py-1 text-xs shadow-border hover:shadow-border-hover";
  if (!link) return <span className={cls}>{body}</span>;
  return (
    <a href={link.href} className={cls} {...(link.ext ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
      {body}
    </a>
  );
}

/** Scrolling strip of the latest trades on every Ferzan coin. Pauses on hover; static when motion is reduced. */
export function TradeTape() {
  const p = usePulse();
  const items = p?.tape ?? [];
  if (!items.length) return null;
  const dur = Math.max(30, items.length * 4);
  return (
    <div className="tape border-b border-line bg-bg/80" aria-label="Latest trades">
      <div className="tape-track" style={{ animationDuration: `${dur}s` }}>
        {[0, 1].map((copy) => (
          <div key={copy} className="flex shrink-0 gap-2 pr-2" aria-hidden={copy === 1}>
            {items.map((it, i) => (
              <TapeChip key={`${copy}-${it.chain}-${it.token}-${it.ts}-${i}`} it={it} now={p?.now ?? it.ts} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------- graduation celebration ---------------- */
function confetti(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return () => {};
  const w = (canvas.width = window.innerWidth);
  const h = (canvas.height = window.innerHeight);
  const colors = ["#3ee0e6", "#f4f7f7", "#2fd0d6", "#9af3f6", "#e07a68"];
  const bits = Array.from({ length: 160 }, () => ({
    x: w / 2 + (Math.random() - 0.5) * w * 0.3,
    y: h * 0.35,
    vx: (Math.random() - 0.5) * 14,
    vy: -Math.random() * 14 - 4,
    r: Math.random() * 6 + 3,
    a: Math.random() * Math.PI,
    c: colors[Math.floor(Math.random() * colors.length)],
  }));
  let raf = 0;
  const start = performance.now();
  const tick = (t: number) => {
    ctx.clearRect(0, 0, w, h);
    for (const b of bits) {
      b.vy += 0.35;
      b.x += b.vx;
      b.y += b.vy;
      b.a += 0.15;
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(b.a);
      ctx.fillStyle = b.c;
      ctx.fillRect(-b.r / 2, -b.r / 4, b.r, b.r / 2);
      ctx.restore();
    }
    if (t - start < 3200) raf = requestAnimationFrame(tick);
    else ctx.clearRect(0, 0, w, h);
  };
  raf = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(raf);
}

/** When a coin graduates while someone is on the site: confetti and a banner linking to it. */
export function GraduationBanner() {
  const p = usePulse();
  const [shown, setShown] = useState<Graduation | null>(null);
  const seen = useRef<Set<string>>(new Set());
  const since = useRef<number>(Math.floor(Date.now() / 1000) - 600);
  const canvas = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!p) return;
    for (const g of p.graduations) {
      const key = `${g.chain}:${g.token}`;
      if (g.ts < since.current || seen.current.has(key)) continue;
      let already = false;
      try {
        already = window.sessionStorage.getItem(`grad:${key}`) === "1";
        window.sessionStorage.setItem(`grad:${key}`, "1");
      } catch {
        already = false;
      }
      seen.current.add(key);
      if (!already) {
        setShown(g);
        break;
      }
    }
  }, [p]);

  useEffect(() => {
    if (!shown) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const stop = canvas.current && !reduced ? confetti(canvas.current) : () => {};
    const hide = window.setTimeout(() => setShown(null), 12_000);
    return () => {
      stop();
      window.clearTimeout(hide);
    };
  }, [shown]);

  if (!shown) return null;
  const link = hrefOf(shown);
  return (
    <>
      <canvas ref={canvas} className="pointer-events-none fixed inset-0 z-50" aria-hidden />
      <div className="grad-pop fixed inset-x-4 bottom-4 z-50 mx-auto flex max-w-lg items-center gap-3 rounded-2xl bg-surface p-4 shadow-border-hover" role="status">
        {shown.image ? <img src={shown.image} alt="" className="h-12 w-12 rounded-xl object-cover" /> : <span className="text-3xl">🎓</span>}
        <span className="min-w-0 flex-1">
          <span className="block font-extrabold">${shown.symbol} just graduated</span>
          <span className="block text-sm text-muted">
            The curve filled at {shown.raised.toPrecision(4)} {shown.unit}. Liquidity is live on the DEX.
          </span>
        </span>
        {link ? (
          <a className="btn-cyan shrink-0" href={link.href} {...(link.ext ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
            See it
          </a>
        ) : null}
        <button type="button" className="shrink-0 px-1 text-muted" onClick={() => setShown(null)} aria-label="Close">
          ✕
        </button>
      </div>
    </>
  );
}
