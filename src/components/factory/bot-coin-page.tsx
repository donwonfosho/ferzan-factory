import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { evmWallet, useAccountWallets } from "@/lib/factory/wallet-bridge";
import { getReceipt } from "@/lib/factory/relay";
import { formatSmart, parseDecimal } from "@/lib/factory/units";
import { cn } from "@/lib/cn";
import { Button, TextInput } from "./ui";
import { CandleChart, CurveGraphic } from "./chart-pro";
import { CreatorScoreBox } from "./creator-score";
import { ShareCoin } from "./perks";
import { useLive, sameCoin } from "@/lib/factory/live";
import { HoldersPanel, PnlShare } from "./coin-extras";
import { AlertsButton, WatchButton } from "./watch";
import { CoinComments } from "./coin-comments";
import { BridgeBuy } from "./bridge-buy-panel";

import { tr } from "@/lib/i18n";
import { sharedBy } from "@/lib/factory/compete";
const ZERO = "0x0000000000000000000000000000000000000000";
const TIMEFRAMES = [
  { tf: 60, label: "1m" },
  { tf: 300, label: "5m" },
  { tf: 900, label: "15m" },
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
    else ref = window.sessionStorage.getItem("ferzan-ref") ?? sharedBy(account).toLowerCase();
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
  if (!path) return <p className="py-12 text-center text-sm text-muted">{tr("Not enough trades for a chart yet.")}</p>;
  return (
    <svg viewBox="0 0 600 200" className="h-48 w-full" preserveAspectRatio="none" role="img" aria-label={tr("Price chart")}>
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
      setLoadError(err instanceof Error ? err.message : tr("This coin did not load."));
    }
  }, [chain, curve, account, tf]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 15_000);
    return () => window.clearInterval(timer);
  }, [load]);

  // Live: reload a moment after any trade on this coin, so the chart and curve move right away.
  const reloadTimer = useRef<number | null>(null);
  useLive((e) => {
    if (e.type !== "trade" || !sameCoin(e, chain, curve) || reloadTimer.current !== null) return;
    reloadTimer.current = window.setTimeout(() => ((reloadTimer.current = null), void load()), 1200);
  });
  const signedIn = useAccountWallets();
  const pnlWallet = account || (signedIn?.authenticated ? (signedIn.evmAddress ?? "") : "");

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
    if (address !== from.toLowerCase()) throw new Error(tr("The wallet changed. Press the button again."));
    const hash = await eth.request({
      method: "eth_sendTransaction",
      params: [{ from, to, data, ...(value > 0n ? { value: "0x" + value.toString(16) } : {}) }],
    });
    if (typeof hash !== "string") throw new Error(tr("The wallet did not send it."));
    setLastTx(hash);
    for (let i = 0; i < 60; i += 1) {
      const receipt = await getReceipt({ data: { chain, hash } }).catch(() => null);
      if (receipt) {
        if (receipt.status !== "0x1") throw new Error(tr("The transaction failed on chain."));
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 2500));
    }
    throw new Error(tr("Still confirming. Check the transaction before trying again."));
  }

  async function trade(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!state) return;
    try {
      if (!raw || raw <= 0n) throw new Error(side === "buy" ? tr("Type how much {0} to spend.", state.native) : tr("Type how many {0} to sell.", state.symbol));
      if (state.startTime > Date.now() / 1000) throw new Error(tr("Trading has not opened yet."));
      setBusy(tr("Connect your wallet."));
      const from = await connect(); // follows sign-in / wallet switches since the page loaded
      const ref = referrerFor(from);
      const fresh = await quoteBotCurve({ data: { chain, curve, side, amount: raw.toString() } });
      const out = BigInt(fresh.out);
      if (out <= 0n) throw new Error(tr("That amount gets nothing back. Try a larger amount."));
      const minOut = (out * BigInt(10_000 - slip)) / 10_000n;
      if (side === "buy") {
        const cap = BigInt(state.maxBuy);
        const bought = BigInt(state.mine?.bought ?? "0");
        if (cap > 0n && bought + raw > cap) {
          throw new Error(tr("Max buy is {0} {1} per wallet. You have {2} left.", formatSmart(cap, 18), state.native, formatSmart(cap - bought, 18)));
        }
        setBusy(tr("Approve the buy in your wallet."));
        await send(from, curve, SEL.buy + word(minOut) + addrWord(ref), raw);
      } else {
        const now = await getBotCurve({ data: { chain, curve, wallet: from, tf } });
        const free = now.mine ? BigInt(now.mine.balance) - BigInt(now.mine.locked) : 0n;
        if (raw > free) throw new Error(tr("You can sell up to {0} {1}.", formatSmart(free > 0n ? free : 0n, 18), state.symbol));
        if (BigInt(now.mine?.allowance ?? "0") < raw) {
          setBusy(tr("Step 1 of 2: let the curve take the tokens you are selling."));
          await send(from, now.token, SEL.approve + addrWord(curve) + word(raw));
        }
        setBusy(BigInt(now.mine?.allowance ?? "0") < raw ? tr("Step 2 of 2: approve the sell.") : tr("Approve the sell in your wallet."));
        await send(from, curve, SEL.sell + word(raw) + word(minOut) + addrWord(ref));
      }
      setAmount("");
      await load();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "The trade did not go through.";
      setError(/user (rejected|denied)|rejected the request|4001/i.test(msg) ? tr("You cancelled in the wallet.") : msg.split("\n")[0]);
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
      setError(err instanceof Error ? err.message : tr("Could not copy the link."));
    }
  }

  if (loadError && !state) return <p className="ticket text-sm text-sell">{tr(loadError)}</p>;
  if (!state) return <p className="ticket text-sm text-muted">{tr("Loading the curve…")}</p>;

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
            {tr(meta.label)} ·{" "}
            <a className="text-cyan" href={explorerAddress(chain, state.token)} target="_blank" rel="noopener noreferrer">
              {short(state.token)}
            </a>
            {state.creator ? (
              <>
                {" "}{tr("· by")}{" "}{short(state.creator)}
                {state.creatorLaunches > 1 ? tr(" ({0} launches, {1} graduated)", state.creatorLaunches, state.creatorGraduated) : tr(" (first launch)")}
              </>
            ) : null}
          </p>
          {state.description ? <p className="mt-2 text-sm">{state.description}</p> : null}
          <p className="mt-2 flex flex-wrap gap-3 text-sm">
            {state.links.website ? <a className="text-cyan" href={state.links.website} target="_blank" rel="noopener noreferrer">{tr("Website")}</a> : null}
            {state.links.x ? <a className="text-cyan" href={state.links.x} target="_blank" rel="noopener noreferrer">X</a> : null}
            {state.links.telegram ? <a className="text-cyan" href={state.links.telegram} target="_blank" rel="noopener noreferrer">{tr("Telegram")}</a> : null}
            <a className="text-cyan" href={`https://t.me/Ferzan_Trade_Bot?start=buy_${state.token}`} target="_blank" rel="noopener noreferrer">
              {tr("Trade in Telegram")}
            </a>
          </p>
        </div>
      </div>

      <ShareCoin chain={state.chain} token={state.token} symbol={state.symbol} />
      <div className="flex flex-wrap gap-2">
        <WatchButton chain={state.chain} token={state.token} symbol={state.symbol} path={`/coin/${state.chain}/${curve.toLowerCase()}`} />
        <AlertsButton chain={state.chain} token={state.token} />
      </div>
      <PnlShare chain={state.chain} token={state.token} wallet={pnlWallet} />
      <HoldersPanel chain={state.chain} token={state.token} />
      <CoinComments chain={state.chain} token={state.token} creator={state.creator} />
      <CreatorScoreBox token={state.token} />

      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <div className="ticket">
          <p className="text-xs text-muted">{tr("Market cap")}</p>
          <p className="text-base font-extrabold tabular-nums sm:text-lg">{usd(state.mcapUsd)}</p>
        </div>
        <div className="ticket">
          <p className="text-xs text-muted">{tr("Price")}</p>
          <p className="text-base font-extrabold tabular-nums sm:text-lg">{state.price ? state.price.toPrecision(3) : "—"} {state.native}</p>
        </div>
        <div className="ticket">
          <p className="text-xs text-muted">{state.graduated ? tr("Graduated") : tr("To graduation")}</p>
          <p className="text-base font-extrabold tabular-nums sm:text-lg">{state.progress.toFixed(1)}%</p>
        </div>
      </div>
      <div className="h-2 w-full bg-surface shadow-border">
        <div className="h-2 bg-cyan" style={{ width: `${Math.min(100, state.progress)}%` }} />
      </div>
      <p className="text-xs text-muted">
        {state.graduated
          ? tr("This curve is full. Its liquidity moved to a DEX pool.")
          : tr("{0} of {1} {2} raised.", formatSmart(BigInt(state.realEth), 18), formatSmart(BigInt(state.gradTarget), 18), state.native)}
      </p>

      <div className="ticket">
        <div className="mb-2 flex gap-2 overflow-x-auto">
          {TIMEFRAMES.map((t) => (
            <button key={t.tf} type="button" onClick={() => setTf(t.tf)} className={cn("min-h-9 px-3 text-sm", tf === t.tf ? "btn-cyan" : "btn-line")}>
              {tr(t.label)}
            </button>
          ))}
        </div>
        <CandleChart
          candles={state.candles}
          trades={state.trades}
          tf={tf}
          native={state.native}
          toCap={state.price > 0 ? state.mcapUsd / state.price : 0}
        />
      </div>

      <CurveGraphic
        progress={state.progress}
        gradNative={Number(BigInt(state.gradTarget)) / 1e18}
        price={state.price}
        native={state.native}
        symbol={state.symbol}
        supply={state.price > 0 && state.nativeUsd > 0 ? state.mcapUsd / (state.price * state.nativeUsd) : 0}
        graduated={state.graduated}
      />

      {state.graduated ? (
        <div className="ticket">
          <p className="text-sm">{tr("Trading moved to the DEX pool.")}</p>
          {dex ? (
            <a className="btn-cyan mt-3 inline-flex" href={dex} target="_blank" rel="noopener noreferrer">
              {tr("Trade on the DEX")}
            </a>
          ) : (
            <p className="mt-2 text-sm text-muted">{tr("Find the pool on the explorer from the token page.")}</p>
          )}
        </div>
      ) : (
        <form onSubmit={(e) => void trade(e)} className="ticket space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <button type="button" className={cn("w-full", side === "buy" ? "btn-cyan" : "btn-line")} onClick={() => { setSide("buy"); setAmount(""); }}>
              {tr("Buy")}
            </button>
            <button type="button" className={cn("w-full", side === "sell" ? "btn-cyan" : "btn-line")} onClick={() => { setSide("sell"); setAmount(""); }}>
              {tr("Sell")}
            </button>
          </div>
          {opensAt ? <p className="text-sm text-muted">{tr("Trading opens")}{" "}{opensAt.toLocaleString()}.</p> : null}
          <TextInput
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal"
            placeholder={side === "buy" ? tr("{0} to spend", state.native) : tr("{0} to sell", state.symbol)}
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
              {quoted.refund > 0n ? tr(" · fills the curve, {0} {1} comes back", formatSmart(quoted.refund, 18), state.native) : ""}
            </p>
          ) : null}
          <div className="flex items-center gap-2 text-sm text-muted">
            {tr("Slippage")}
            {SLIPPAGES.map((s) => (
              <button key={s} type="button" onClick={() => setSlip(s)} className={cn("min-h-9 px-3", slip === s ? "btn-cyan" : "btn-line")}>
                {s / 100}%
              </button>
            ))}
          </div>
          {state.mine ? (
            <p className="text-xs text-muted">
              {tr("You hold")}{" "}{formatSmart(BigInt(state.mine.balance), 18)} {state.symbol}
              {BigInt(state.mine.locked) > 0n ? tr(" ({0} team tokens locked until graduation)", formatSmart(BigInt(state.mine.locked), 18)) : ""} ·{" "}
              {formatSmart(BigInt(state.mine.nativeBalance), 18)} {state.native}
            </p>
          ) : null}
          {error ? <p className="text-sm text-sell">{tr(error)}</p> : null}
          {busy ? <p className="text-sm text-cyan">{tr(busy)}</p> : null}
          {lastTx ? (
            <a className="text-sm text-cyan" href={explorerTx(chain, lastTx)} target="_blank" rel="noopener noreferrer">
              {tr("View last transaction")}
            </a>
          ) : null}
          <Button type="submit" className="w-full" disabled={Boolean(busy) || Boolean(opensAt)}>
            {!account ? tr("Connect wallet") : side === "buy" ? tr("Buy {0}", state.symbol) : tr("Sell {0}", state.symbol)}
          </Button>
          <p className="text-xs text-muted">{tr("1% fee on every trade: half to the creator, half to Ferzan. A referrer gets 10% of the fee.")}</p>
        </form>
      )}

      <BridgeBuy dest={chain} />

      <div className="ticket">
        <div className="flex items-center justify-between gap-3">
          <p className="font-semibold">{tr("Share and earn")}</p>
          <button type="button" className="btn-line" onClick={() => void copyShare()}>
            {copied ? tr("Link copied") : tr("Copy my referral link")}
          </button>
        </div>
        <p className="mt-2 text-xs text-muted">{tr("Anyone who trades through your link pays you 10% of the trading fee, straight to your wallet.")}</p>
      </div>

      <div className="ticket">
        <p className="font-semibold">{tr("Recent trades")}</p>
        {state.trades.length ? (
          <ul className="mt-2 divide-y divide-line text-sm">
            {state.trades.map((t) => (
              <li key={t.tx + t.ts} className="flex items-center justify-between gap-2 py-2">
                <span className={t.buy ? "text-cyan" : "text-sell"}>{t.buy ? tr("Buy") : tr("Sell")}</span>
                <span>{t.native.toPrecision(3)} {state.native}</span>
                <a className="text-muted" href={explorerTx(chain, t.tx)} target="_blank" rel="noopener noreferrer">
                  {short(t.trader)} · {ago(t.ts)}
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-muted">{tr("No trades yet.")}</p>
        )}
      </div>
    </div>
  );
}
