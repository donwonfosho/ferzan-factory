import { useCallback, useEffect, useRef, useState } from "react";
import { buildTonTrade, getTonCurve, quoteTonCurve, type TonCurveState } from "@/lib/factory/ton-curve";
import { tonWallet } from "@/lib/factory/tron-ton-wallets";
import { formatPrice, formatSmart, formatUsdPrice, parseDecimal } from "@/lib/factory/units";
import { useLive, sameCoin } from "@/lib/factory/live";
import { cn } from "@/lib/cn";
import { Button, TextInput } from "./ui";
import { CandleChart, CurveGraphic } from "./chart-pro";
import { CreatorScoreBox } from "./creator-score";
import { ShareCoin } from "./perks";
import { HoldersPanel } from "./coin-extras";
import { AlertsButton, WatchButton } from "./watch";
import { CoinComments } from "./coin-comments";
import { ChainMark } from "./chain-mark";

import { tr } from "@/lib/i18n";
const TIMEFRAMES = [
  { tf: 60, label: "1m" },
  { tf: 300, label: "5m" },
  { tf: 900, label: "15m" },
  { tf: 3600, label: "1h" },
  { tf: 14400, label: "4h" },
];
const SLIPPAGES = [100, 500, 1000];
const DEC = 9; // TON and Ferzan TON coins both use 9 decimals
const TON_REF = /^(?:(?:0|-1):[0-9a-fA-F]{64}|[A-Za-z0-9_-]{48})$/;

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

function plain(v: bigint): string {
  const base = 10n ** BigInt(DEC);
  const frac = (v % base).toString().padStart(DEC, "0").replace(/0+$/, "");
  return frac ? `${v / base}.${frac}` : (v / base).toString();
}

const short = (a: string) => (a.length > 12 ? `${a.slice(0, 5)}…${a.slice(-4)}` : a);
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Referrer from ?ref=… (kept for this visit), never the trader's own wallet. */
function referrerFor(account: string): string {
  if (typeof window === "undefined") return "";
  let ref = new URLSearchParams(window.location.search).get("ref") ?? "";
  try {
    if (TON_REF.test(ref)) window.sessionStorage.setItem("ferzan-ref-ton", ref);
    else ref = window.sessionStorage.getItem("ferzan-ref-ton") ?? "";
  } catch {
    /* private mode: the URL value still works */
  }
  return TON_REF.test(ref) && ref !== account ? ref : "";
}

/** A Ferzan bonding curve on TON: trade it here with a TON Connect wallet. Coins only move through the curve until it fills. */
export function TonCurvePage({ curve }: { curve: string }) {
  const [state, setState] = useState<TonCurveState | null>(null);
  const [loadError, setLoadError] = useState("");
  const [tf, setTf] = useState(300);
  const [account, setAccount] = useState("");
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [amount, setAmount] = useState("");
  const [slip, setSlip] = useState(500);
  const [quoted, setQuoted] = useState<{ out: bigint; refund: bigint } | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [sentOnce, setSentOnce] = useState(false);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    try {
      setState(await getTonCurve({ data: { curve, wallet: account, tf } }));
      setLoadError("");
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : tr("This coin did not load."));
    }
  }, [curve, account, tf]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 15_000);
    return () => window.clearInterval(timer);
  }, [load]);

  const reloadTimer = useRef<number | null>(null);
  useLive((e) => {
    if (e.type !== "trade" || !sameCoin(e, "ton", curve) || reloadTimer.current !== null) return;
    reloadTimer.current = window.setTimeout(() => ((reloadTimer.current = null), void load()), 1200);
  });

  const raw = parseDecimal(amount, DEC);
  const held = state?.mine ? BigInt(state.mine.balance) : 0n;

  useEffect(() => {
    setQuoted(null);
    if (!raw || raw <= 0n || !state || state.graduated || state.complete) return;
    const id = window.setTimeout(() => {
      void quoteTonCurve({ data: { curve, side, amount: raw.toString() } }).then(
        (q) => setQuoted({ out: BigInt(q.out), refund: BigInt(q.refund) }),
        () => setQuoted(null),
      );
    }, 350);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [amount, side, curve, state?.graduated, state?.complete]);

  async function sign(from: { address: string; send: (req: { validUntil: number; network: string; messages: { address: string; amount: string; payload?: string }[] }) => Promise<string> }, kind: "buy" | "sell", amt: bigint, minOut: bigint) {
    const built = await buildTonTrade({
      data: { curve, wallet: from.address, side: kind, amount: amt.toString(), minOut: minOut.toString(), ref: referrerFor(from.address) },
    });
    await from.send({ validUntil: built.validUntil, network: built.network, messages: [built.message] });
    setSentOnce(true);
  }

  async function trade(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!state) return;
    try {
      if (!raw || raw <= 0n) throw new Error(side === "buy" ? tr("Type how much {0} to spend.", "TON") : tr("Type how many {0} to sell.", state.symbol));
      if (state.start > Date.now() / 1000) throw new Error(tr("Trading has not opened yet."));
      if (side === "buy" && raw < 10_000_000n) throw new Error(tr("The smallest buy is 0.01 TON."));
      setBusy(tr("Connect your wallet."));
      const wallet = await tonWallet();
      setAccount(wallet.address);
      const fresh = await getTonCurve({ data: { curve, wallet: wallet.address, tf } });
      if (fresh.complete || fresh.graduated) throw new Error(tr("This curve is full. Trading moved to STON.fi."));
      const q = await quoteTonCurve({ data: { curve, side, amount: raw.toString() } });
      const out = BigInt(q.out);
      if (out <= 0n) throw new Error(tr("That amount gets nothing back. Try a larger amount."));
      const minOut = (out * BigInt(10_000 - slip)) / 10_000n;
      if (side === "sell") {
        const have = fresh.mine ? BigInt(fresh.mine.balance) : 0n;
        if (raw > have) throw new Error(tr("You can sell up to {0} {1}.", formatSmart(have, DEC), state.symbol));
      }
      setBusy(side === "buy" ? tr("Approve the buy in your TON wallet.") : tr("Approve the sell in your TON wallet."));
      await sign(wallet, side, raw, minOut);
      setAmount("");
      setBusy(tr("Sent. Waiting for TON to confirm."));
      await sleep(6000);
      await load();
      await sleep(8000);
      await load();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "The trade did not go through.";
      setError(/declin|reject|denied|cancel|user/i.test(msg) ? tr("You cancelled in the wallet.") : msg.split("\n")[0]);
    } finally {
      setBusy("");
    }
  }

  async function copyShare() {
    try {
      const from = account || (await tonWallet()).address;
      setAccount(from);
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

  const opensAt = state.start > Date.now() / 1000 ? new Date(state.start * 1000) : null;
  const tradeBot = `https://t.me/Ferzan_Trade_Bot?start=buy_${state.token}`;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="ticket flex items-start gap-4">
        {state.image ? <img src={state.image} alt="" className="h-16 w-16 shrink-0 object-cover" /> : null}
        <div className="min-w-0 flex-1">
          <h1 className="text-3xl">
            {state.name} <span className="text-muted">${state.symbol}</span>
          </h1>
          <p className="mt-1 flex flex-wrap items-center gap-1 text-sm text-muted">
            <ChainMark id="ton" className="h-4 w-4" /> TON ·{" "}
            <a className="text-cyan" href={`https://tonviewer.com/${state.token}`} target="_blank" rel="noopener noreferrer">
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
            <a className="text-cyan" href={tradeBot} target="_blank" rel="noopener noreferrer">{tr("Trade in Telegram")}</a>
          </p>
        </div>
      </div>

      <ShareCoin chain="ton" token={state.token} symbol={state.symbol} />
      <div className="flex flex-wrap gap-2">
        <WatchButton chain="ton" token={state.token} symbol={state.symbol} path={`/coin/ton/${curve}`} />
        <AlertsButton chain="ton" token={state.token} />
      </div>
      <HoldersPanel chain="ton" token={state.token} />
      <CoinComments chain="ton" token={state.token} creator={state.creator} />
      <CreatorScoreBox token={state.token} />

      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <div className="ticket">
          <p className="text-xs text-muted">{tr("Market cap")}</p>
          <p className="text-base font-extrabold tabular-nums sm:text-lg">{usd(state.mcapUsd)}</p>
        </div>
        <div className="ticket">
          <p className="text-xs text-muted">{tr("Price")}</p>
          <p className="text-base font-extrabold tabular-nums sm:text-lg">{formatUsdPrice(state.price, state.nativeUsd) || (formatPrice(state.price) + " " + "TON")}</p>
          {formatUsdPrice(state.price, state.nativeUsd) ? <p className="text-xs text-muted tabular-nums">{formatPrice(state.price)} {"TON"}</p> : null}
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
          : state.complete
            ? tr("This curve is full. Its STON.fi pool opens in a moment.")
            : tr("{0} of {1} {2} raised.", formatSmart(BigInt(state.real), DEC), formatSmart(BigInt(state.gradTarget), DEC), "TON")}
      </p>

      <div className="ticket">
        <div className="mb-2 flex gap-2 overflow-x-auto">
          {TIMEFRAMES.map((t) => (
            <button key={t.tf} type="button" onClick={() => setTf(t.tf)} className={cn("min-h-9 px-3 text-sm", tf === t.tf ? "btn-cyan" : "btn-line")}>
              {tr(t.label)}
            </button>
          ))}
        </div>
        <CandleChart candles={state.candles} trades={state.trades} tf={tf} native="TON" toCap={state.price > 0 ? state.mcapUsd / state.price : 0} />
      </div>

      <CurveGraphic
        progress={state.progress}
        gradNative={Number(BigInt(state.gradTarget)) / 10 ** DEC}
        price={state.price}
        native="TON"
        symbol={state.symbol}
        supply={state.price > 0 && state.nativeUsd > 0 ? state.mcapUsd / (state.price * state.nativeUsd) : 0}
        graduated={state.graduated}
      />

      {state.graduated || state.complete ? (
        <div className="ticket">
          <p className="text-sm">{state.graduated ? tr("Trading moved to the DEX pool.") : tr("Trading on the curve is closed. The STON.fi pool opens in a moment.")}</p>
          <a className="btn-cyan mt-3 inline-flex" href={tradeBot} target="_blank" rel="noopener noreferrer">
            {tr("Trade in Telegram")}
          </a>
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
            placeholder={side === "buy" ? tr("{0} to spend", "TON") : tr("{0} to sell", state.symbol)}
          />
          {side === "sell" && state.mine ? (
            <div className="flex flex-wrap gap-2">
              {[25, 50, 100].map((p) => (
                <button key={p} type="button" className="btn-line min-h-9 px-3 text-sm" onClick={() => setAmount(plain((held * BigInt(p)) / 100n))}>
                  {p}%
                </button>
              ))}
            </div>
          ) : null}
          {quoted ? (
            <p className="text-sm text-muted">
              ≈ {side === "buy" ? `${formatSmart(quoted.out, DEC)} ${state.symbol}` : `${formatSmart(quoted.out, DEC)} TON`}
              {quoted.refund > 0n ? tr(" · fills the curve, {0} {1} comes back", formatSmart(quoted.refund, DEC), "TON") : ""}
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
              {tr("You hold")}{" "}{formatSmart(BigInt(state.mine.balance), DEC)} {state.symbol}
            </p>
          ) : null}
          {error ? <p className="text-sm text-sell">{tr(error)}</p> : null}
          {busy ? <p className="text-sm text-cyan">{tr(busy)}</p> : null}
          {sentOnce ? (
            <a className="text-sm text-cyan" href={`https://tonviewer.com/${curve}`} target="_blank" rel="noopener noreferrer">
              {tr("View the curve on Tonviewer")}
            </a>
          ) : null}
          <Button type="submit" className="w-full" disabled={Boolean(busy) || Boolean(opensAt)}>
            {!account ? tr("Connect wallet") : side === "buy" ? tr("Buy {0}", state.symbol) : tr("Sell {0}", state.symbol)}
          </Button>
          <p className="text-xs text-muted">{tr("1% fee on every trade: half to the creator, half to Ferzan. A referrer gets 10% of the fee.")}</p>
          <p className="text-xs text-muted">{tr("A buy also sends about 0.12 TON for network gas. The curve returns what it does not use.")}</p>
        </form>
      )}

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
                <span>{t.native.toPrecision(3)} TON</span>
                <a className="text-muted" href={`https://tonviewer.com/${curve}`} target="_blank" rel="noopener noreferrer">
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
