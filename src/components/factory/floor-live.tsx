/** Live floor sections. File revision so a cached 404 of the previous script name is not reused. */
import { Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { listTelegram, type TelegramCoin } from "@/lib/factory/telegram-feed";
import { cn } from "@/lib/cn";
import { coinHref } from "./launch-board";
import { usePulse } from "./pulse-live";
import { Mark } from "./ui";
import { ChainMark, type MarkChain } from "./chain-mark";
import { compactUsd } from "./market-line";

const pad = (n: number) => String(Math.max(0, Math.floor(n))).padStart(2, "0");

function useNow(ms = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), ms);
    return () => window.clearInterval(t);
  }, [ms]);
  return now;
}

/** FERZAN on the floor: a countdown until 7:00 PM ET on Oct 9, then its live numbers and the burn total. */
export function FerzanHero() {
  const p = usePulse();
  const now = useNow();
  const f = p?.ferzan;
  const launchAt = (f?.launchAt ?? 1791586800) * 1000;
  const left = launchAt - now;

  if (f?.live) {
    return (
      <section className="hero-live ticket overflow-hidden">
        <div className="flex flex-wrap items-center gap-2">
          <span className="live-dot" aria-hidden />
          <span className="text-sm font-semibold text-cyan">FERZAN is live</span>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat label="Price" value={f.priceUsd ? `$${f.priceUsd.toPrecision(3)}` : "—"} />
          <Stat label="Market cap" value={compactUsd(f.mcapUsd)} />
          <Stat label={f.graduated ? "Graduated" : "To graduation"} value={f.progress === null ? "—" : `${f.progress.toFixed(1)}%`} />
          <Stat label="Burned so far" value={`${Math.round(f.burned).toLocaleString()} FERZAN`} accent />
        </div>
        {f.progress !== null ? (
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-line">
            <div className="h-full rounded-full bg-cyan transition-[width] duration-700" style={{ width: `${Math.max(2, f.progress)}%` }} />
          </div>
        ) : null}
        <div className="mt-5 flex flex-col gap-3 sm:flex-row">
          <a href={`/coin/solana/${f.token}`} className="btn-cyan w-full sm:w-auto">
            Buy FERZAN
          </a>
          <Link to="/ferzan" className="btn-line w-full sm:w-auto">
            How the burn works
          </Link>
        </div>
        <p className="mt-3 break-all text-xs text-muted">Contract {f.token}</p>
      </section>
    );
  }

  if (left <= 0) {
    return (
      <section className="ticket">
        <p className="text-sm font-semibold text-cyan">FERZAN is launching now</p>
        <p className="mt-2 text-sm text-muted">The contract appears here and in @Ferzan_Launches the moment the pool is created. Only trust that address.</p>
      </section>
    );
  }

  const d = left / 86_400_000;
  const h = (left % 86_400_000) / 3_600_000;
  const m = (left % 3_600_000) / 60_000;
  const s = (left % 60_000) / 1000;
  return (
    <section className="hero-count ticket overflow-hidden">
      <p className="text-sm font-semibold text-cyan">FERZAN launches Friday, October 9 · 7:00 PM ET</p>
      <div className="mt-4 flex flex-wrap gap-2 sm:gap-3" role="timer" aria-live="off" aria-label="Time until FERZAN launches">
        {[
          [d, "days"],
          [h, "hours"],
          [m, "min"],
          [s, "sec"],
        ].map(([v, label]) => (
          <div key={label as string} className="count-box">
            <span className="block text-3xl font-extrabold tabular-nums sm:text-5xl">{pad(v as number)}</span>
            <span className="block text-xs uppercase tracking-wider text-muted">{label}</span>
          </div>
        ))}
      </div>
      <p className="mt-4 max-w-xl text-sm text-muted">
        The token behind the Ferzan launchpad and bots. Every day, part of the platform's trading fees buys FERZAN and burns it. The contract is posted
        here and in @Ferzan_Launches at 7:00 PM. Any address before that is fake.
      </p>
      <div className="mt-5 flex flex-col gap-3 sm:flex-row">
        <a href="https://t.me/Ferzan_Launches" target="_blank" rel="noopener noreferrer" className="btn-cyan w-full sm:w-auto">
          Get the launch alert
        </a>
        <Link to="/ferzan" className="btn-line w-full sm:w-auto">
          About FERZAN
        </Link>
      </div>
    </section>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-muted">{label}</p>
      <p className={cn("truncate text-xl font-extrabold tabular-nums sm:text-2xl", accent && "text-cyan")}>{value}</p>
    </div>
  );
}

/** The coin closest to graduating, with a live progress ring. Flashes when a new king takes the crown. */
export function KingOfTheHill() {
  const [king, setKing] = useState<TelegramCoin | null>(null);
  const [crowned, setCrowned] = useState(false);
  const last = useRef("");

  useEffect(() => {
    let stop = false;
    async function pull() {
      const rows = await listTelegram({ data: { sort: "koth", chain: "", q: "" } }).catch(() => null);
      const top = rows?.find((c) => !c.graduated) ?? null;
      if (stop || !top) return;
      const key = `${top.chain}:${top.token}`;
      if (last.current && last.current !== key) {
        setCrowned(true);
        window.setTimeout(() => setCrowned(false), 2400);
      }
      last.current = key;
      setKing(top);
    }
    void pull();
    const t = window.setInterval(() => void pull(), 15_000);
    return () => {
      stop = true;
      window.clearInterval(t);
    };
  }, []);

  if (!king) return null;
  const pct = Math.max(0, Math.min(100, king.progress ?? 0));
  const R = 34;
  const C = 2 * Math.PI * R;
  const link = coinHref(king);
  return (
    <a
      href={link.href}
      {...(link.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      className={cn("koth ticket flex items-center gap-4", crowned && "koth-new")}
    >
      <div className="relative h-20 w-20 shrink-0">
        <svg viewBox="0 0 80 80" className="h-20 w-20 -rotate-90" aria-hidden>
          <circle cx="40" cy="40" r={R} fill="none" stroke="#1c2a2c" strokeWidth="6" />
          <circle
            cx="40"
            cy="40"
            r={R}
            fill="none"
            stroke="#3ee0e6"
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={C}
            strokeDashoffset={C * (1 - pct / 100)}
            className="transition-[stroke-dashoffset] duration-1000"
          />
        </svg>
        <div className="absolute inset-0 grid place-items-center">
          <Mark symbol={king.symbol} image={king.image || undefined} className="h-12 w-12 rounded-full" />
        </div>
        <span className="crown absolute -top-3 left-1/2 -translate-x-1/2 text-2xl" aria-hidden>
          👑
        </span>
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold uppercase tracking-wider text-cyan">{crowned ? "New King of the Hill" : "King of the Hill"}</p>
        <p className="mt-1 flex items-center gap-1.5">
          <span className="truncate text-xl font-extrabold">${king.symbol}</span>
          {MARKS.has(king.chain) ? <ChainMark id={king.chain as MarkChain} className="h-4 w-4 shrink-0" /> : null}
        </p>
        <p className="truncate text-sm text-muted">
          {pct.toFixed(0)}% to graduation · {compactUsd(king.mcapUsd)} mcap · {king.trades} trades
        </p>
      </div>
    </a>
  );
}
const MARKS = new Set(["solana", "base", "bsc", "ethereum", "robinhood", "arc", "tron", "ton"]);

const ONLY = [
  { t: "Eight chains, one board", d: "Solana, Base, BNB, Ethereum, Robinhood, Arc, Tron and TON. Launch and trade on any of them from the same page." },
  { t: "Telegram and web together", d: "Launch from @Ferzan_Launch_Bot or here. Every coin lands on the same board, and the Trade Bot trades them all." },
  { t: "Creators keep half the fees", d: "Ferzan curves charge 1% per trade and send half of it to the coin's creator on every trade. Solana creators get half of the Meteora trading fees." },
  { t: "A creator score on every coin", d: "Other launches by the same creator, launch sprees, and what the dev bought and sold, shown before you buy." },
  { t: "Rug Guard", d: "Turn it on in the Trade Bot and it sells your bag if the liquidity is pulled or the dev dumps. On Solana it also watches the top holders." },
  { t: "Fake-address guard", d: "In Ferzan's Telegram chats, Guardian deletes any contract address that isn't the official one or a Ferzan launch." },
  { t: "Liquidity nobody can pull", d: "When a curve fills, the pool opens at the curve's final price. The LP tokens are burned, or locked in the Meteora pool on Solana." },
  { t: "Buyback and burn, in public", d: "Every day 30% of the platform's Solana trading fees buys FERZAN and burns it. Each burn is posted with its transaction." },
];

/** What Ferzan does that other launchpads don't, with live platform numbers. */
export function OnlyOnFerzan() {
  const p = usePulse();
  const st = p?.stats;
  return (
    <section>
      <h2 className="text-2xl">Only on Ferzan</h2>
      <p className="mt-1 max-w-xl text-sm text-muted">What you get here that a single-chain launchpad doesn't give you.</p>
      {st && st.launches > 0 ? (
        <div className="mt-4 grid grid-cols-3 gap-2 sm:gap-3">
          <div className="ticket">
            <p className="text-xs text-muted">Coins launched</p>
            <p className="text-2xl font-extrabold tabular-nums">{st.launches.toLocaleString()}</p>
          </div>
          <div className="ticket">
            <p className="text-xs text-muted">Graduated</p>
            <p className="text-2xl font-extrabold tabular-nums">{st.graduated.toLocaleString()}</p>
          </div>
          <div className="ticket">
            <p className="text-xs text-muted">Chains live</p>
            <p className="text-2xl font-extrabold tabular-nums">{st.chains}</p>
          </div>
        </div>
      ) : null}
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {ONLY.map((x) => (
          <div key={x.t} className="ticket">
            <p className="font-extrabold">{x.t}</p>
            <p className="mt-1 text-sm text-muted">{x.d}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
