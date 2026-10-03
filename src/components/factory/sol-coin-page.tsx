import { useCallback, useEffect, useRef, useState } from "react";
import { buildSolSwap, getSolCoin, type SolCoin } from "@/lib/factory/sol-coin";
import { solanaExplorerMint, solanaExplorerTx } from "@/lib/factory/solana";
import { formatPrice, formatSmart, formatUsdPrice, parseDecimal } from "@/lib/factory/units";
import { WalletNeeded, solanaWallet, useAccountWallets } from "@/lib/factory/wallet-bridge";
import { cn } from "@/lib/cn";
import { CandleChart } from "./chart-pro";
import { Button, TextInput } from "./ui";
import { CreatorScoreBox } from "./creator-score";
import { ShareCoin } from "./perks";
import { useLive } from "@/lib/factory/live";
import { HoldersPanel, PnlShare } from "./coin-extras";
import { AlertsButton, WatchButton } from "./watch";
import { CoinComments } from "./coin-comments";

import { BridgeBuy } from "./bridge-buy-panel";
import { tr } from "@/lib/i18n";
import { creditCall } from "@/lib/factory/compete";
const TIMEFRAMES = [
  { tf: 60, label: "1m" },
  { tf: 300, label: "5m" },
  { tf: 900, label: "15m" },
  { tf: 3600, label: "1h" },
  { tf: 14400, label: "4h" },
];
const SLIPPAGES = [100, 500, 1000];
const TOKEN_DECIMALS = 6; // fixed by the Ferzan Meteora config
const SOL_DECIMALS = 9;

function usd(n: number): string {
  if (!n) return "$0";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(2)}`;
}

const short = (a: string) => (a.length > 12 ? `${a.slice(0, 4)}…${a.slice(-4)}` : a);

function fromB64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

function plain(v: bigint, decimals: number): string {
  const base = 10n ** BigInt(decimals);
  const frac = (v % base).toString().padStart(decimals, "0").replace(/0+$/, "");
  return frac ? `${v / base}.${frac}` : (v / base).toString();
}

/** Buy and sell a Ferzan Meteora curve on the site, with the account's Solana wallet or Phantom. */
export function SolCoinPage({ mint }: { mint: string }) {
  const account = useAccountWallets();
  const [coin, setCoin] = useState<SolCoin | null>(null);
  const [loadError, setLoadError] = useState("");
  const [tf, setTf] = useState(300);
  const [wallet, setWallet] = useState("");
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [amount, setAmount] = useState("");
  const [slip, setSlip] = useState(500);
  const [quote, setQuote] = useState<bigint | null>(null);
  const [feeBps, setFeeBps] = useState<number | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [lastTx, setLastTx] = useState("");

  // A signed-in account's Solana wallet is known without asking; an extension is asked on first trade.
  const knownWallet = wallet || (account?.authenticated ? account.solAddress ?? "" : "");

  const load = useCallback(async () => {
    try {
      const next = await getSolCoin({ data: { mint, wallet: knownWallet, tf } });
      setCoin(next);
      setLoadError("");
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : tr("This coin did not load."));
    }
  }, [mint, knownWallet, tf]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 20_000);
    return () => window.clearInterval(timer);
  }, [load]);

  // Live: reload a moment after any trade on this coin, so the chart and curve move right away.
  const reloadTimer = useRef<number | null>(null);
  useLive((e) => {
    if (e.type !== "trade" || e.chain !== "solana" || e.token !== mint || reloadTimer.current !== null) return;
    reloadTimer.current = window.setTimeout(() => ((reloadTimer.current = null), void load()), 1200);
  });

  const decimals = side === "buy" ? SOL_DECIMALS : TOKEN_DECIMALS;
  const raw = parseDecimal(amount, decimals);

  // Live quote once we know which wallet will trade (the builder needs its token accounts).
  useEffect(() => {
    setQuote(null);
    if (!raw || raw <= 0n || !knownWallet || !coin || coin.graduated) return;
    const id = window.setTimeout(() => {
      void buildSolSwap({ data: { mint, wallet: knownWallet, side, amount: raw.toString(), slippageBps: slip } }).then(
        (q) => {
          setQuote(BigInt(q.amountOut));
          setFeeBps(q.feeBps);
        },
        () => {
          setQuote(null);
          setFeeBps(null);
        },
      );
    }, 600);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [amount, side, slip, knownWallet, coin?.graduated]);

  async function trade(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!coin) return;
    try {
      if (!raw || raw <= 0n) throw new Error(side === "buy" ? tr("Type how much SOL to spend.") : tr("Type how many {0} to sell.", coin.symbol));
      setBusy(tr("Connect your wallet."));
      const w = await solanaWallet();
      setWallet(w.address);
      if (side === "sell" && coin.mine && w.address === knownWallet && raw > BigInt(coin.mine.tokenRaw)) {
        throw new Error(tr("You hold {0} {1}.", formatSmart(BigInt(coin.mine.tokenRaw), TOKEN_DECIMALS), coin.symbol));
      }
      setBusy(tr("Preparing the trade."));
      const built = await buildSolSwap({ data: { mint, wallet: w.address, side, amount: raw.toString(), slippageBps: slip, simulate: true } });
      if (built.simError) {
        throw new Error(
          /insufficient/i.test(built.simError)
            ? tr("Not enough SOL for this trade plus the network fee and token account (keep about 0.01 SOL extra).")
            : tr("Solana would reject this trade: {0}", built.simError),
        );
      }
      setBusy(tr("Approve it in your wallet."));
      const signature = await w.signAndSend(fromB64(built.txB64));
      if (side === "buy") creditCall("solana", signature, w.address);
      setLastTx(signature);
      setAmount("");
      setBusy(tr("Sent. Updating in a few seconds."));
      window.setTimeout(() => void load(), 6000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "The trade did not go through.";
      setError(err instanceof WalletNeeded ? tr(msg) : /user (rejected|denied)|rejected the request|4001/i.test(msg) ? tr("You cancelled in the wallet.") : msg.split("\n")[0]);
    } finally {
      window.setTimeout(() => setBusy(""), 1500);
    }
  }

  if (loadError && !coin) return <p className="ticket mx-auto max-w-3xl text-sm text-sell">{tr(loadError)}</p>;
  if (!coin) return <p className="ticket mx-auto max-w-3xl text-sm text-muted">{tr("Loading the curve…")}</p>;
  if (!coin.indexed) {
    return (
      <p className="ticket mx-auto max-w-3xl text-sm text-muted">
        {tr("This coin is not on the Ferzan floor yet. New launches show up within about a minute.")}
      </p>
    );
  }

  const tokenBal = coin.mine ? BigInt(coin.mine.tokenRaw) : 0n;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="ticket flex items-start gap-4">
        {coin.image ? <img src={coin.image} alt="" className="h-16 w-16 shrink-0 object-cover" /> : null}
        <div className="min-w-0 flex-1">
          <h1 className="text-3xl">
            {coin.name} <span className="text-muted">${coin.symbol}</span>
          </h1>
          <p className="mt-1 text-sm text-muted">
            {tr("Solana ·")}{" "}
            <a className="text-cyan" href={solanaExplorerMint(coin.mint)} target="_blank" rel="noopener noreferrer">
              {short(coin.mint)}
            </a>
            {coin.creator ? (
              <>
                {" "}{tr("· by")}{" "}{short(coin.creator)}
                {coin.creatorLaunches > 1 ? tr(" ({0} launches, {1} graduated)", coin.creatorLaunches, coin.creatorGraduated) : tr(" (first launch)")}
              </>
            ) : null}
          </p>
          {coin.description ? <p className="mt-2 text-sm">{coin.description}</p> : null}
          <p className="mt-2 flex flex-wrap gap-3 text-sm">
            {coin.links.website ? <a className="text-cyan" href={coin.links.website} target="_blank" rel="noopener noreferrer">{tr("Website")}</a> : null}
            {coin.links.x ? <a className="text-cyan" href={coin.links.x} target="_blank" rel="noopener noreferrer">X</a> : null}
            {coin.links.telegram ? <a className="text-cyan" href={coin.links.telegram} target="_blank" rel="noopener noreferrer">{tr("Telegram")}</a> : null}
          </p>
        </div>
      </div>

      <ShareCoin chain="solana" token={coin.mint} symbol={coin.symbol} />
      <div className="flex flex-wrap gap-2">
        <WatchButton chain="solana" token={coin.mint} symbol={coin.symbol} path={`/coin/solana/${coin.mint}`} />
        <AlertsButton chain="solana" token={coin.mint} />
      </div>
      <PnlShare chain="solana" token={coin.mint} wallet={knownWallet} />
      <HoldersPanel chain="solana" token={coin.mint} />
      <CoinComments chain="solana" token={coin.mint} creator={coin.creator} />
      <CreatorScoreBox token={coin.mint} />

      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <div className="ticket">
          <p className="text-xs text-muted">{tr("Market cap")}</p>
          <p className="text-base font-extrabold tabular-nums sm:text-lg">{usd(coin.mcapUsd)}</p>
        </div>
        <div className="ticket">
          <p className="text-xs text-muted">{tr("Price")}</p>
          <p className="text-base font-extrabold tabular-nums sm:text-lg">{formatUsdPrice(coin.price, coin.nativeUsd) || (formatPrice(coin.price) + " " + tr("SOL"))}</p>
          {formatUsdPrice(coin.price, coin.nativeUsd) ? <p className="text-xs text-muted tabular-nums">{formatPrice(coin.price)} {tr("SOL")}</p> : null}
        </div>
        <div className="ticket">
          <p className="text-xs text-muted">{coin.graduated ? tr("Graduated") : tr("To graduation")}</p>
          <p className="text-base font-extrabold tabular-nums sm:text-lg">{coin.progress.toFixed(1)}%</p>
        </div>
      </div>
      <div className="h-2 w-full bg-surface shadow-border">
        <div className="h-2 bg-cyan" style={{ width: `${Math.min(100, coin.progress)}%` }} />
      </div>
      <p className="text-xs text-muted">
        {coin.graduated
          ? tr("This curve is full. Its liquidity moved to a locked Meteora pool.")
          : tr("{0} of {1} SOL raised · {2} trades · {3} SOL volume", coin.raisedSol.toFixed(2), coin.gradSol.toFixed(0), coin.trades, coin.volumeSol.toFixed(2))}
      </p>

      <div className="ticket">
        <div className="mb-2 flex gap-2 overflow-x-auto">
          {TIMEFRAMES.map((t) => (
            <button key={t.tf} type="button" onClick={() => setTf(t.tf)} className={cn("min-h-9 px-3 text-sm", tf === t.tf ? "btn-cyan" : "btn-line")}>
              {tr(t.label)}
            </button>
          ))}
        </div>
        <CandleChart candles={coin.candles} tf={tf} native="SOL" toCap={coin.price > 0 ? coin.mcapUsd / coin.price : 0} />
      </div>

      {coin.graduated ? (
        <div className="ticket">
          <p className="text-sm">{tr("Trading moved to the Meteora pool.")}</p>
          <a className="btn-cyan mt-3 inline-flex" href={`https://jup.ag/tokens/${coin.mint}`} target="_blank" rel="noopener noreferrer">
            {tr("Trade the pool")}
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
          <TextInput value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder={side === "buy" ? tr("SOL to spend") : tr("{0} to sell", coin.symbol)} />
          {side === "sell" && tokenBal > 0n ? (
            <div className="flex flex-wrap gap-2">
              {[25, 50, 100].map((p) => (
                <button key={p} type="button" className="btn-line min-h-9 px-3 text-sm" onClick={() => setAmount(plain((tokenBal * BigInt(p)) / 100n, TOKEN_DECIMALS))}>
                  {p}%
                </button>
              ))}
            </div>
          ) : null}
          {quote !== null ? (
            <p className="text-sm text-muted">
              ≈ {side === "buy" ? `${formatSmart(quote, TOKEN_DECIMALS)} ${coin.symbol}` : tr("{0} SOL", formatSmart(quote, SOL_DECIMALS))}
              {feeBps !== null ? tr(" · fee {0}%", feeBps >= 1000 ? Math.round(feeBps / 100) : (feeBps / 100).toFixed(feeBps % 100 ? 2 : 0)) : ""}
            </p>
          ) : null}
          {quote !== null && feeBps !== null && feeBps >= 300 ? (
            <p className="text-sm text-sell">
              {tr("The launch fee is still high. It keeps falling in the first minutes after launch and settles at 1%.")}
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
          {coin.mine ? (
            <p className="text-xs text-muted">
              {tr("You hold")}{" "}{formatSmart(tokenBal, TOKEN_DECIMALS)} {coin.symbol} · {formatSmart(BigInt(coin.mine.lamports), SOL_DECIMALS)}{" "}{tr("SOL")}
            </p>
          ) : null}
          {error ? <p className="text-sm text-sell">{tr(error)}</p> : null}
          {busy ? <p className="text-sm text-cyan">{tr(busy)}</p> : null}
          {lastTx ? (
            <a className="text-sm text-cyan" href={solanaExplorerTx(lastTx)} target="_blank" rel="noopener noreferrer">
              {tr("View last transaction")}
            </a>
          ) : null}
          <Button type="submit" className="w-full" disabled={Boolean(busy)}>
            {side === "buy" ? tr("Buy {0}", coin.symbol) : tr("Sell {0}", coin.symbol)}
          </Button>
        </form>
      )}

      {coin.graduated ? null : <BridgeBuy dest="solana" />}
    </div>
  );
}
