import { useEffect, useRef, useState } from "react";
import { setPollInterval } from "@/lib/factory/poll";
import { quoteBuy, quoteSell, spot } from "@/lib/factory/curve";
import { buySolanaCurve, migrateSolanaCurve, readSolanaCurve, readSolanaHeld, sellSolanaCurve, type SolanaCurve } from "@/lib/factory/solana-curve";
import { solanaAddress, solanaExplorerTx } from "@/lib/factory/solana";
import { useFactory } from "@/lib/factory/store";
import { siteMatches, keySaved } from "@/lib/factory/site-wallet";
import { formatPrice, formatSmart, parseDecimal } from "@/lib/factory/units";
import { cn } from "@/lib/cn";
import { recordTrade } from "@/lib/factory/board";
import { raydiumSwapUrl } from "@/lib/factory/deploy";
import { Dollar } from "./dollar";
import { GraduationMeter } from "./graduation-meter";
import { GasStep } from "./gas-step";
import { Button } from "./ui";
import { termsAccepted } from "@/lib/factory/terms";
import { TermsGate } from "./terms";
import { KeyLock } from "./key-gate";

import { tr } from "@/lib/i18n";
import { tryFive } from "@/lib/factory/retry";
import { FEE_SITE, TradePreview, approveLine, beginTx, minText } from "./trade-confidence";
export function SolanaPanel({ mint, symbol }: { mint: string; symbol: string }) {
  const wallet = useFactory((s) => s.wallet);
  const [state, setState] = useState<SolanaCurve | null | undefined>(undefined);
  const [held, setHeld] = useState<bigint | null>(null);
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [amount, setAmount] = useState("");
  const [referrer, setReferrer] = useState("");
  const [slip, setSlip] = useState("1");
  const [error, setError] = useState("");
  const [needTerms, setNeedTerms] = useState(false);
  const [busy, setBusy] = useState("");
  const [tx, setTx] = useState("");
  const [sol, setSol] = useState<string | null>(null);
  const [miss, setMiss] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const seen = useRef(false);

  useEffect(() => {
    setSol(solanaAddress());
    let stop = false;
    async function pull() {
      try {
        const next = seen.current
          ? await readSolanaCurve(mint)
          : await tryFive(() => readSolanaCurve(mint), () => {
              if (!stop) setError("Busy right now, retrying");
            });
        if (stop) return;
        seen.current = true;
        setMiss(false);
        setState(next);
        if (next) setError("");
        const owner = solanaAddress();
        if (owner && next) {
          const balance = await readSolanaHeld(mint, owner);
          if (!stop) setHeld(balance);
        }
      } catch {
        if (!stop && !seen.current) {
          setMiss(true);
          setState(null);
          setError("Busy right now. Try again in a minute.");
        }
      }
    }
    void pull();
    const stopPoll = setPollInterval(() => void pull(), 8000);
    return () => {
      stop = true;
      stopPoll();
    };
  }, [mint, tx]);

  if (state === undefined) {
    return (
      <div className="ticket" aria-busy="true">
        <p className="text-sm text-muted">{tr("Reading the Solana curve.")}</p>
        <div className="mt-3 h-28 animate-pulse rounded-xl bg-bg" />
      </div>
    );
  }
  if (!state && miss) {
    return (
      <div className="ticket" role="status">
        <p className="text-sm text-muted">{tr("Busy right now. Try again in a minute.")}</p>
      </div>
    );
  }
  if (!state) {
    return (
      <div className="ticket text-sm text-muted">
        {tr("This mint has no Solana curve. A launch from this site creates one. Older mints were only a token, with nothing to buy.")}
      </div>
    );
  }

  const curve = {
    virtualEth: state.virtualSol,
    virtualToken: state.virtualToken,
    graduation: state.graduation,
    realEth: state.realSol,
    raisedEth: state.raisedSol,
    tokensSold: state.tokensSold,
    graduated: state.graduated,
    feePlatform: 0n,
    feeCreator: 0n,
    feeReferrer: 0n,
  };
  const unit = 10n ** BigInt(state.decimals);
  let quote = "";
  try {
    if (side === "buy" && amount.trim()) {
      const solIn = parseDecimal(amount, 9);
      if (solIn && solIn > 0n) quote = `${formatSmart(quoteBuy(curve, solIn), state.decimals)} ${symbol}`;
    }
    if (side === "sell" && amount.trim()) {
      const tokens = parseDecimal(amount, state.decimals);
      if (tokens && tokens > 0n) quote = `${formatSmart(quoteSell(curve, tokens).ethOut, 9)} SOL`;
    }
  } catch {
    quote = "";
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!termsAccepted()) {
      setNeedTerms(true);
      return;
    }
    if (!state) return;
    if (!wallet || !siteMatches(wallet)) {
      setError(tr("Create a wallet on Account before you trade. Opening the site does not create one."));
      return;
    }
    if (!keySaved(wallet)) {
      setError(tr("Copy the key on your profile first. That key is how this wallet comes back."));
      return;
    }
    const slipBps = Math.round(Number(slip) * 100);
    if (!Number.isFinite(slipBps) || slipBps < 0 || slipBps > 5_000) {
      setError(tr("Slippage has to be from 0 to 50%."));
      return;
    }
    setBusy(side === "buy" ? tr("Signing the buy.") : tr("Signing the sell."));
    const retry = () => formRef.current?.requestSubmit();
    if (side === "buy") {
      const solIn = parseDecimal(amount, 9);
      if (!solIn || solIn <= 0n) {
        setBusy("");
        setError(tr("Type how much SOL to spend, then press Buy."));
        return;
      }
      let minOut = 0n;
      try {
        const quoted = quoteBuy(curve, solIn);
        minOut = (quoted * BigInt(10_000 - slipBps)) / 10_000n;
      } catch (err) {
        setBusy("");
        setError(err instanceof Error ? err.message : tr("That buy does not fit."));
        return;
      }
      const dock = beginTx(tr("Buy"));
      const sent = await buySolanaCurve({ mint, solIn, minOut, referrer: referrer.trim() });
      setBusy("");
      if (!sent.ok) {
        dock.failed(retry);
        setError(sent.error);
        return;
      }
      dock.confirmed(solanaExplorerTx(sent.signature));
      setTx(sent.signature);
      void recordTrade({ data: { chain: "solana", hash: sent.signature } }).catch(() => undefined);
      setAmount("");
      const filled = await readSolanaCurve(mint);
      if (filled?.graduated && !filled.pooled) {
        setBusy(tr("Curve is full. Opening the Raydium pool."));
        const migrated = await migrateSolanaCurve(mint);
        setBusy("");
        if (!migrated.ok) setError(tr("{0} The buy is already on chain.", migrated.error));
        else setTx(migrated.signature);
      }
      return;
    }
    const parsed = parseDecimal(amount, state.decimals);
    if (!parsed || parsed <= 0n) {
      setBusy("");
      setError(tr("Type how many tokens to sell, then press Sell."));
      return;
    }
    const whole = parsed / unit;
    if (whole <= 0n) {
      setBusy("");
      setError(tr("Sell at least 1 whole token."));
      return;
    }
    const tokens = whole * unit;
    let minOut = 0n;
    try {
      const quoted = quoteSell(curve, tokens).ethOut;
      minOut = (quoted * BigInt(10_000 - slipBps)) / 10_000n;
    } catch (err) {
      setBusy("");
      setError(err instanceof Error ? err.message : tr("That sell does not fit."));
      return;
    }
    const dock = beginTx(tr("Sell"));
    const sent = await sellSolanaCurve({ mint, tokenIn: tokens, minOut });
    setBusy("");
    if (!sent.ok) {
      dock.failed(retry);
      setError(sent.error);
      return;
    }
    dock.confirmed(solanaExplorerTx(sent.signature));
    setTx(sent.signature);
    void recordTrade({ data: { chain: "solana", hash: sent.signature } }).catch(() => undefined);
    setAmount("");
  }

  return (
    <KeyLock address={wallet}>
    <form ref={formRef} onSubmit={(e) => void submit(e)} className="ticket space-y-3">
      <p className="text-lg font-extrabold">{tr("Trade with SOL")}</p>
      <p className="text-sm text-muted">
        {formatPrice(spot(curve, 9, state.decimals))}{" "}{tr("SOL each")}
        <Dollar chain="solana" nativePerToken={spot(curve, 9, state.decimals)} />
      </p>
      <GraduationMeter
        filled={state.realSol}
        goal={state.graduation}
        graduated={state.graduated}
        native="SOL"
        decimals={9}
      />
      {state.maxBuy > 0n ? (
        <p className="text-sm text-muted">{tr("Wallet cap")}{" "}{formatSmart(state.maxBuy, 9)}{" "}{tr("SOL. It stays until graduation.")}</p>
      ) : null}
      <p className="text-sm text-muted">{tr("This coin is on Ferzan's first contract: 1% fee. The creator cut is paid into their Solana wallet on the trade. Treasury’s 0.60% is not buying Ferzan yet.")}</p>
      {sol ? <GasStep address={sol} chain="solana" /> : null}
      <div className="grid grid-cols-2 gap-2">
        <button type="button" className={cn("min-h-11 font-semibold", side === "buy" ? "bg-cyan text-cyan-ink" : "bg-bg text-muted shadow-border")} onClick={() => setSide("buy")}>
          {tr("Buy")}
        </button>
        <button type="button" className={cn("min-h-11 font-semibold", side === "sell" ? "bg-sell text-cyan-ink" : "bg-bg text-muted shadow-border")} onClick={() => setSide("sell")}>
          {tr("Sell")}
        </button>
      </div>
      {side === "sell" ? (
        <div className="flex gap-2">
          {[25, 50, 75, 100].map((pct) => (
            <button
              key={pct}
              type="button"
              className="min-h-11 px-3 text-sm text-muted shadow-border"
              onClick={() => {
                const cap = held == null ? 0n : held < state.tokensSold ? held : state.tokensSold;
                const tokens = ((cap / unit) * BigInt(pct)) / 100n;
                setAmount(tokens > 0n ? tokens.toString() : "");
              }}
            >
              {pct}%
            </button>
          ))}
        </div>
      ) : null}
      <label className="block text-sm">
        <span className="mb-1.5 block text-sm font-medium text-muted">{side === "buy" ? tr("SOL") : symbol}</span>
        <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" className="min-h-11 w-full bg-bg px-3 tabular-nums shadow-border outline-none" />
      </label>
      <p className="min-h-6 text-sm text-muted">{quote || (side === "sell" ? tr("Sells pay no referrer.") : tr("Type how much SOL to spend."))}</p>
      {side === "buy" ? (
        <details className="text-sm text-muted">
          <summary className="cursor-pointer">{tr("Add a referrer wallet")}</summary>
          <p className="mt-2">{tr("Optional. Leave it blank and the treasury keeps the 10%.")}</p>
          <input value={referrer} onChange={(e) => setReferrer(e.target.value.trim())} placeholder={tr("Solana address")} className="mt-2 min-h-11 w-full bg-bg px-3 text-fg shadow-border outline-none" />
        </details>
      ) : (
        <p className="text-sm text-muted">{tr("You hold")}{" "}{held == null ? "…" : formatSmart(held, state.decimals)} {symbol}{tr(". Percent buttons use whole tokens the curve can buy back.")}</p>
      )}
      <label className="block text-sm text-muted">
        {tr("Max slippage %")}
        <input value={slip} onChange={(e) => setSlip(e.target.value)} inputMode="decimal" className="mt-1 min-h-11 w-full bg-bg px-3 text-fg shadow-border outline-none" />
      </label>
      {needTerms ? <TermsGate onAccept={() => setNeedTerms(false)} /> : null}
      {error ? <p className="text-sm text-sell">{tr(error)}</p> : null}
      {busy ? <p className="text-sm text-cyan">{tr(busy)}</p> : null}
      {tx ? (
        <a className="inline-flex min-h-11 items-center text-sm font-semibold text-cyan" href={solanaExplorerTx(tx)}>
          {tr("View transaction")}
        </a>
      ) : null}
      <TradePreview
        amountIn={amount.trim() ? `${amount.trim()} ${side === "buy" ? "SOL" : symbol}` : undefined}
        amountOut={quote || undefined}
        minReceived={(() => {
          const bps = Math.round(Number(slip) * 100);
          if (!quote || !Number.isFinite(bps) || bps < 0 || bps > 5_000) return undefined;
          try {
            if (side === "buy") {
              const solIn = parseDecimal(amount, 9);
              if (!solIn || solIn <= 0n) return undefined;
              return minText(quoteBuy(curve, solIn), bps, state.decimals, symbol);
            }
            const tokens = parseDecimal(amount, state.decimals);
            if (!tokens || tokens <= 0n) return undefined;
            return minText(quoteSell(curve, tokens).ethOut, bps, 9, "SOL");
          } catch {
            return undefined;
          }
        })()}
        fee={FEE_SITE}
        approving={approveLine(amount.trim() ? `${amount.trim()} ${side === "buy" ? "SOL" : symbol}` : undefined, quote || undefined)}
      />
      <Button type="submit" variant={side === "sell" ? "sell" : "cyan"} disabled={Boolean(busy) || (side === "buy" && state.graduated) || (side === "sell" && state.pooled)}>
        {side === "buy" && state.graduated ? tr("Graduated") : side === "sell" && state.pooled ? tr("In the pool") : side === "buy" ? tr("Buy") : tr("Sell")}
      </Button>
      {state.graduated && !state.pooled ? (
        <Button
          type="button"
          variant="ghost"
          disabled={Boolean(busy)}
          onClick={() => {
            setBusy("Opening the Raydium pool. This spends about 0.5 SOL.");
            setError("");
            void migrateSolanaCurve(mint).then((res) => {
              setBusy("");
              if (!res.ok) setError(res.error);
              else setTx(res.signature);
            });
          }}
        >
          {tr("Open Raydium pool")}
        </Button>
      ) : null}
      {state.pooled ? (
        <a className="inline-flex min-h-11 items-center text-sm font-semibold text-cyan" href={raydiumSwapUrl(mint)} target="_blank" rel="noreferrer">
          {tr("Trade on Raydium")}
        </a>
      ) : null}
      <p className="text-xs text-muted">{tr("This coin is on Ferzan's first contract: fees are paid in the same transaction. 60% treasury, 30% creator, 10% referrer on buys. Sells pay no referrer.")}</p>
    </form>
    </KeyLock>
  );
}
