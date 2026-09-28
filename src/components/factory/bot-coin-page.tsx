import { useCallback, useEffect, useMemo, useState } from "react";
import { CHAINS } from "@/lib/factory/catalog";
import {
  SEL,
  addrWord,
  getBotCurve,
  quoteBotCurve,
  word,
  type BotCurveChain,
  type BotCurveState,
} from "@/lib/factory/bot-curve";
import { dexSwapUrl, explorerAddress, explorerTx } from "@/lib/factory/deploy";
import { evmWallet } from "@/lib/factory/wallet-bridge";
import { getReceipt } from "@/lib/factory/relay";
import { formatSmart, parseDecimal } from "@/lib/factory/units";
import { cn } from "@/lib/cn";
import { Button, TextInput } from "./ui";
import { CreatorScoreBox } from "./creator-score";

const ZERO = "0x0000000000000000000000000000000000000000";
const TIMEFRAMES = [
  { tf: 300, label: "5m" },
  { tf: 3600, label: "1h" },
  { tf: 14400, label: "4h" },
];
const SLIPPAGES = [100, 500, 1000];

function usd(n: number): string {
  if (!n) return "$0";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(2)}`;
}

function ago(ts: number): string {
  const s = Math.max(0, Math.floor(Date.now() / 1000) - ts);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

/** Exact decimal text for an 18-decimal amount (no rounding), for the amount box. */
function plain(v: bigint): string {
  const whole = v / 10n ** 18n;
  const frac = (v % 10n ** 18n).toString().padStart(18, "0").replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : whole.toString();
}

const short = (a: string) => (a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a);

/** Referrer from ?ref=0x… (kept for this visit), never the trader's own wallet. */
function referrerFor(account: string): string {
  if (typeof window === "undefined") return ZERO;
  let ref = new URLSearchParams(window.location.search).get("ref")?.toLowerCase() ?? "";
  try {
    if (/^0x[0-9a-f]{40}$/.test(ref)) window.sessionStorage.setItem("ferzan-ref", ref);
    else ref = window.sessionStorage.getItem("ferzan-ref") ?? "";
  } catch {
    /* private mode: the URL value still works */
  }
  return /^0x[0-9a-f]{40}$/.test(ref) && ref !== account.toLowerCase() ? ref : ZERO;
}

export function Chart({ candles }: { candles: BotCurveState["candles"] }) {
  const path = useMemo(() => {
    const closes = candles.map((k) => k[4]).filter((v) => v > 0);
    if (closes.length < 2) return "";
    const min = Math.min(...closes);
    const max = Math.max(...closes);
    const span = max - min || max || 1;
    return closes
      .map((v, i) => `${i === 0 ? "M" : "L"}${((i / (closes.length - 1)) * 600).toFixed(1)},${(190 - ((v - min) / span) * 180).toFixed(1)}`)
      .join(" ");
  }, [candles]);
  if (!path) return <p className="py-12 text-center text-sm text-muted">Not enough trades for a chart yet.</p>;
  return (
    <svg viewBox="0 0 600 200" className="h-48 w-full" preserveAspectRatio="none" role="img" aria-label="Price chart">
      <path d={path} fill="none" stroke="currentColor" strokeWidth="2" vectorEffect="non-scaling-stroke" className="text-cyan" />
    </svg>
  );
}

export function BotCoinPage({ chain, curve }: { chain: BotCurveChain; curve: string }) {
  const meta = CHAINS[chain];
  const [state, setState] = useState<BotCurveState | null>(null);
  const [loadError, setLoadError] = useState("");
  const [tf, setTf] = useState(300);
  const [account, setAccount] = useState("");
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [amount, setAmount] = useState("");
  const [slip, setSlip] = useState(500);
  const [quoted, setQuoted] = useState<{ out: bigint; refund: bigint } | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [lastTx, setLastTx] = useState("");
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    try {
      const next = await getBotCurve({ data: { chain, curve, wallet: account, tf } });
      setState(next);
      setLoadError("");
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "This coin did not load.");
    }
  }, [chain, curve, account, tf]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 15_000);
    return () => window.clearInterval(timer);
  }, [load]);

  const sellable = state?.mine ? BigInt(state.mine.balance) - BigInt(state.mine.locked) : 0n;
  const raw = parseDecimal(amount, 18); // native coins and Ferzan curve tokens both use 18 decimals

  useEffect(() => {
    setQuoted(null);
    if (!raw || raw <= 0n || !state || state.graduated) return;
    const id = window.setTimeout(() => {
      void quoteBotCurve({ data: { chain, curve, side, amount: raw.toString() } }).then(
        (q) => setQuoted({ out: BigInt(q.out), refund: BigInt(q.refund) }),
        () => setQuoted(null),
      );
    }, 350);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [amount, side, chain, curve, state?.graduated]);

  async function connect(): Promise<string> {
    const { address } = await evmWallet(chain);
    setAccount(address);
    return address;
  }

  async function send(from: string, to: string, data: string, value = 0n): Promise<void> {
    const { address, provider: eth } = await evmWallet(chain);
    if (address !== from.toLowerCase()) throw new Error("The wallet changed. Press the button again.");
    const hash = await eth.request({
      method: "eth_sendTransaction",
      params: [{ from, to, data, ...(value > 0n ? { value: "0x" + value.toString(16) } : {}) }],
    });
    if (typeof hash !== "string") throw new Error("The wallet did not send it.");
    setLastTx(hash);
    for (let i = 0; i < 60; i += 1) {
      const receipt = await getReceipt({ data: { chain, hash } }).catch(() => null);
      if (receipt) {
        if (receipt.status !== "0x1") throw new Error("The transaction failed on chain.");
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 2500));
    }
    throw new Error("Still confirming. Check the transaction before trying again.");
  }

  async function trade(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!state) return;
    try {
      if (!raw || raw <= 0n) throw new Error(side === "buy" ? `Type how much ${state.native} to spend.` : `Type how many ${state.symbol} to sell.`);
      if (state.startTime > Date.now() / 1000) throw new Error("Trading has not opened yet.");
      setBusy("Connect your wallet.");
      const from = await connect(); // follows sign-in / wallet switches since the page loaded
      const ref = referrerFor(from);
      const fresh = await quoteBotCurve({ data: { chain, curve, side, amount: raw.toString() } });
      const out = BigInt(fresh.out);
      if (out <= 0n) throw new Error("That amount gets nothing back. Try a larger amount.");
      const minOut = (out * BigInt(10_000 - slip)) / 10_000n;
      if (side === "buy") {
        const cap = BigInt(state.maxBuy);
        const bought = BigInt(state.mine?.bought ?? "0");
        if (cap > 0n && bought + raw > cap) {
          throw new Error(`Max buy is ${formatSmart(cap, 18)} ${state.native} per wallet. You have ${formatSmart(cap - bought, 18)} left.`);
        }
        setBusy("Approve the buy in your wallet.");
        await send(from, curve, SEL.buy + word(minOut) + addrWord(ref), raw);
      } else {
        const now = await getBotCurve({ data: { chain, curve, wallet: from, tf } });
        const free = now.mine ? BigInt(now.mine.balance) - BigInt(now.mine.locked) : 0n;
        if (raw > free) throw new Error(`You can sell up to ${formatSmart(free > 0n ? free : 0n, 18)} ${state.symbol}.`);
        if (BigInt(now.mine?.allowance ?? "0") < raw) {
          setBusy("Step 1 of 2: let the curve take the tokens you are selling.");
          await send(from, now.token, SEL.approve + addrWord(curve) + word(raw));
        }
        setBusy(BigInt(now.mine?.allowance ?? "0") < raw ? "Step 2 of 2: approve the sell." : "Approve the sell in your wallet.");
        await send(from, curve, SEL.sell + word(raw) + word(minOut) + addrWord(ref));
      }
      setAmount("");
      await load();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "The trade did not go through.";
      setError(/user (rejected|denied)|rejected the request|4001/i.test(msg) ? "You cancelled in the wallet." : msg.split("\n")[0]);
    } finally {
      setBusy("");
    }
  }

  async function copyShare() {
    try {
      const from = account || (await connect());
      const url = new URL(window.location.href);
      url.searchParams.set("ref", from);
      await navigator.clipboard.writeText(url.toString());
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not copy the link.");
    }
  }

  if (loadError && !state) return <p className="ticket text-sm text-sell">{loadError}</p>;
  if (!state) return <p className="ticket text-sm text-muted">Loading the curve…</p>;

  const dex = dexSwapUrl(chain, state.token);
  const opensAt = state.startTime > Date.now() / 1000 ? new Date(state.startTime * 1000) : null;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="ticket flex items-start gap-4">
        {state.image ? <img src={state.image} alt="" className="h-16 w-16 shrink-0 object-cover" /> : null}
        <div className="min-w-0 flex-1">
          <h1 className="text-3xl">
            {state.name} <span className="text-muted">${state.symbol}</span>
          </h1>
          <p className="mt-1 text-sm text-muted">
            {meta.label} ·{" "}
            <a className="text-cyan" href={explorerAddress(chain, state.token)} target="_blank" rel="noopener noreferrer">
              {short(state.token)}
            </a>
            {state.creator ? (
              <>
                {" "}· by {short(state.creator)}
                {state.creatorLaunches > 1 ? ` (${state.creatorLaunches} launches, ${state.creatorGraduated} graduated)` : " (first launch)"}
              </>
            ) : null}
          </p>
          {state.description ? <p className="mt-2 text-sm">{state.description}</p> : null}
          <p className="mt-2 flex flex-wrap gap-3 text-sm">
            {state.links.website ? <a className="text-cyan" href={state.links.website} target="_blank" rel="noopener noreferrer">Website</a> : null}
            {state.links.x ? <a className="text-cyan" href={state.links.x} target="_blank" rel="noopener noreferrer">X</a> : null}
            {state.links.telegram ? <a className="text-cyan" href={state.links.telegram} target="_blank" rel="noopener noreferrer">Telegram</a> : null}
            <a className="text-cyan" href={`https://t.me/Ferzan_Trade_Bot?start=buy_${state.token}`} target="_blank" rel="noopener noreferrer">
              Trade in Telegram
            </a>
          </p>
        </div>
      </div>

      <CreatorScoreBox token={state.token} />

      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <div className="ticket">
          <p className="text-xs text-muted">Market cap</p>
          <p className="text-base font-extrabold tabular-nums sm:text-lg">{usd(state.mcapUsd)}</p>
        </div>
        <div className="ticket">
          <p className="text-xs text-muted">Price</p>
          <p className="text-base font-extrabold tabular-nums sm:text-lg">{state.price ? state.price.toPrecision(3) : "—"} {state.native}</p>
        </div>
        <div className="ticket">
          <p className="text-xs text-muted">{state.graduated ? "Graduated" : "To graduation"}</p>
          <p className="text-base font-extrabold tabular-nums sm:text-lg">{state.progress.toFixed(1)}%</p>
        </div>
      </div>
      <div className="h-2 w-full bg-surface shadow-border">
        <div className="h-2 bg-cyan" style={{ width: `${Math.min(100, state.progress)}%` }} />
      </div>
      <p className="text-xs text-muted">
        {state.graduated
          ? "This curve is full. Its liquidity moved to a DEX pool."
          : `${formatSmart(BigInt(state.realEth), 18)} of ${formatSmart(BigInt(state.gradTarget), 18)} ${state.native} raised.`}
      </p>

      <div className="ticket">
        <div className="mb-2 flex gap-2">
          {TIMEFRAMES.map((t) => (
            <button key={t.tf} type="button" onClick={() => setTf(t.tf)} className={cn("min-h-9 px-3 text-sm", tf === t.tf ? "btn-cyan" : "btn-line")}>
              {t.label}
            </button>
          ))}
        </div>
        <Chart candles={state.candles} />
      </div>

      {state.graduated ? (
        <div className="ticket">
          <p className="text-sm">Trading moved to the DEX pool.</p>
          {dex ? (
            <a className="btn-cyan mt-3 inline-flex" href={dex} target="_blank" rel="noopener noreferrer">
              Trade on the DEX
            </a>
          ) : (
            <p className="mt-2 text-sm text-muted">Find the pool on the explorer from the token page.</p>
          )}
        </div>
      ) : (
        <form onSubmit={(e) => void trade(e)} className="ticket space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <button type="button" className={cn("w-full", side === "buy" ? "btn-cyan" : "btn-line")} onClick={() => { setSide("buy"); setAmount(""); }}>
              Buy
            </button>
            <button type="button" className={cn("w-full", side === "sell" ? "btn-cyan" : "btn-line")} onClick={() => { setSide("sell"); setAmount(""); }}>
              Sell
            </button>
          </div>
          {opensAt ? <p className="text-sm text-muted">Trading opens {opensAt.toLocaleString()}.</p> : null}
          <TextInput
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal"
            placeholder={side === "buy" ? `${state.native} to spend` : `${state.symbol} to sell`}
          />
          {side === "sell" && state.mine ? (
            <div className="flex flex-wrap gap-2">
              {[25, 50, 100].map((p) => (
                <button
                  key={p}
                  type="button"
                  className="btn-line min-h-9 px-3 text-sm"
                  onClick={() => setAmount(plain(((sellable > 0n ? sellable : 0n) * BigInt(p)) / 100n))}
                >
                  {p}%
                </button>
              ))}
            </div>
          ) : null}
          {quoted ? (
            <p className="text-sm text-muted">
              ≈ {side === "buy" ? `${formatSmart(quoted.out, 18)} ${state.symbol}` : `${formatSmart(quoted.out, 18)} ${state.native}`}
              {quoted.refund > 0n ? ` · fills the curve, ${formatSmart(quoted.refund, 18)} ${state.native} comes back` : ""}
            </p>
          ) : null}
          <div className="flex items-center gap-2 text-sm text-muted">
            Slippage
            {SLIPPAGES.map((s) => (
              <button key={s} type="button" onClick={() => setSlip(s)} className={cn("min-h-9 px-3", slip === s ? "btn-cyan" : "btn-line")}>
                {s / 100}%
              </button>
            ))}
          </div>
          {state.mine ? (
            <p className="text-xs text-muted">
              You hold {formatSmart(BigInt(state.mine.balance), 18)} {state.symbol}
              {BigInt(state.mine.locked) > 0n ? ` (${formatSmart(BigInt(state.mine.locked), 18)} team tokens locked until graduation)` : ""} ·{" "}
              {formatSmart(BigInt(state.mine.nativeBalance), 18)} {state.native}
            </p>
          ) : null}
          {error ? <p className="text-sm text-sell">{error}</p> : null}
          {busy ? <p className="text-sm text-cyan">{busy}</p> : null}
          {lastTx ? (
            <a className="text-sm text-cyan" href={explorerTx(chain, lastTx)} target="_blank" rel="noopener noreferrer">
              View last transaction
            </a>
          ) : null}
          <Button type="submit" className="w-full" disabled={Boolean(busy) || Boolean(opensAt)}>
            {!account ? "Connect wallet" : side === "buy" ? `Buy ${state.symbol}` : `Sell ${state.symbol}`}
          </Button>
          <p className="text-xs text-muted">1% fee on every trade: half to the creator, half to Ferzan. A referrer gets 10% of the fee.</p>
        </form>
      )}

      <div className="ticket">
        <div className="flex items-center justify-between gap-3">
          <p className="font-semibold">Share and earn</p>
          <button type="button" className="btn-line" onClick={() => void copyShare()}>
            {copied ? "Link copied" : "Copy my referral link"}
          </button>
        </div>
        <p className="mt-2 text-xs text-muted">Anyone who trades through your link pays you 10% of the trading fee, straight to your wallet.</p>
      </div>

      <div className="ticket">
        <p className="font-semibold">Recent trades</p>
        {state.trades.length ? (
          <ul className="mt-2 divide-y divide-line text-sm">
            {state.trades.map((t) => (
              <li key={t.tx + t.ts} className="flex items-center justify-between gap-2 py-2">
                <span className={t.buy ? "text-cyan" : "text-sell"}>{t.buy ? "Buy" : "Sell"}</span>
                <span>{t.native.toPrecision(3)} {state.native}</span>
                <a className="text-muted" href={explorerTx(chain, t.tx)} target="_blank" rel="noopener noreferrer">
                  {short(t.trader)} · {ago(t.ts)}
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-muted">No trades yet.</p>
        )}
      </div>
    </div>
  );
}
