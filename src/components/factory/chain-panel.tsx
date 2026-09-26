import { useEffect, useState } from "react";
import { CHAINS } from "@/lib/factory/catalog";
import { spot, quoteBuy, quoteSell } from "@/lib/factory/curve";
import { recordTrade } from "@/lib/factory/board";
import { buyData, claimData, curveGuardsMin, CURVE_POOL, dexSwapUrl, explorerAddress, explorerTx, readClaimable, readCurve, readCurveWall, readHeld, readPool, sellData, sendCurve, type ChainCurve, type EvmChainId } from "@/lib/factory/deploy";
import { useFactory } from "@/lib/factory/store";
import { siteBalance, siteMatches, keySaved } from "@/lib/factory/site-wallet";
import { formatPrice, formatSmart, formatTokensPerNative, parseDecimal } from "@/lib/factory/units";
import { cn } from "@/lib/cn";
import { Dollar } from "./dollar";
import { GraduationMeter } from "./graduation-meter";
import { GasStep } from "./gas-step";
import { Button } from "./ui";
import { termsAccepted } from "@/lib/factory/terms";
import { TermsGate } from "./terms";
import { KeyLock } from "./key-gate";

export function ChainPanel({ chain, address, symbol }: { chain: EvmChainId; address: string; symbol: string }) {
  const wallet = useFactory((s) => s.wallet);
  const [state, setState] = useState<ChainCurve | null>(null);
  const [error, setError] = useState("");
  const [needTerms, setNeedTerms] = useState(false);
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [amount, setAmount] = useState("");
  const [referrer, setReferrer] = useState("");
  const [busy, setBusy] = useState("");
  const [gas, setGas] = useState<bigint | null>(null);
  const [curveNote, setCurveNote] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [held, setHeld] = useState<bigint | null>(null);
  const [slip, setSlip] = useState("1");
  const [pool, setPool] = useState("");
  const [wall, setWall] = useState<{ maxBuy: bigint; startAt: bigint } | null>(null);
  const [owed, setOwed] = useState(0n);
  const [txHash, setTxHash] = useState("");
  const [guards, setGuards] = useState(false);
  const meta = CHAINS[chain];
  const onSite = Boolean(wallet && siteMatches(wallet));

  useEffect(() => {
    let stop = false;
    async function pull() {
      try {
        const next = await readCurve(chain, address);
        const opened = next.graduated ? await readPool(chain, address) : null;
        const cap = await readCurveWall(chain, address);
        if (!stop) {
          setState(next);
          setPool(opened ?? "");
          setWall(cap);
          setCurveNote("");
        }
      } catch (err) {
        if (!stop) setCurveNote(err instanceof Error ? err.message.split("\n")[0] : "Could not read the curve.");
      }
    }
    void pull();
    const timer = window.setInterval(() => void pull(), 8000);
    return () => {
      stop = true;
      window.clearInterval(timer);
    };
  }, [chain, address, refresh]);

  useEffect(() => {
    let stop = false;
    void curveGuardsMin(chain, address).then(
      (yes) => {
        if (!stop) setGuards(yes);
      },
      () => {
        if (!stop) setGuards(false);
      },
    );
    return () => {
      stop = true;
    };
  }, [chain, address]);

  useEffect(() => {
    if (!wallet || !wallet.startsWith("0x")) {
      setOwed(0n);
      return;
    }
    let stop = false;
    void readClaimable(chain, address, wallet).then(
      (next) => {
        if (!stop) setOwed(next);
      },
      () => {
        if (!stop) setOwed(0n);
      },
    );
    return () => {
      stop = true;
    };
  }, [chain, address, wallet, refresh]);

  useEffect(() => {
    if (!wallet) {
      setHeld(null);
      return;
    }
    let stop = false;
    async function pull() {
      try {
        const next = await readHeld(chain, address, wallet);
        if (!stop) setHeld(next);
      } catch {
        if (!stop) setHeld(null);
      }
    }
    void pull();
    const timer = window.setInterval(() => void pull(), 8000);
    return () => {
      stop = true;
      window.clearInterval(timer);
    };
  }, [chain, address, wallet, refresh]);

  useEffect(() => {
    if (!wallet || !onSite) return;
    let stop = false;
    function pull() {
      void siteBalance(chain, wallet).then(
        (wei) => {
          if (!stop) setGas(wei);
        },
        () => {
          if (!stop) setGas(null);
        },
      );
    }
    pull();
    const timer = window.setInterval(pull, 12000);
    return () => {
      stop = true;
      window.clearInterval(timer);
    };
  }, [chain, wallet, onSite, busy]);

  const price = state ? spot(state, meta.nativeDecimals, meta.tokenDecimals) : 0;
  let out = "";
  if (state && amount.trim()) {
    try {
      if (side === "buy") {
        const eth = parseDecimal(amount, meta.nativeDecimals);
        if (eth && eth > 0n) out = `${formatSmart(quoteBuy(state, eth), meta.tokenDecimals)} ${symbol}`;
      } else {
        const tokens = parseDecimal(amount, meta.tokenDecimals);
        if (tokens && tokens > 0n) out = `${formatSmart(quoteSell(state, tokens).ethOut, meta.nativeDecimals)} ${meta.native}`;
      }
    } catch {
      out = "";
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!termsAccepted()) {
      setNeedTerms(true);
      return;
    }
    if (!wallet) {
      setError("Create a wallet on Account before you trade. Opening the site does not create one.");
      return;
    }
    if (siteMatches(wallet) && !keySaved(wallet)) {
      setError("Copy the key on your profile first. That key is how this wallet comes back.");
      return;
    }
    if (referrer && !/^0x[a-fA-F0-9]{40}$/.test(referrer)) {
      setError("Referrer has to be a wallet address, or leave it blank.");
      return;
    }
    setBusy(side === "buy" ? "Approve the buy." : "Approve the sell.");
    const sent =
      side === "buy"
        ? await (async () => {
            const value = parseDecimal(amount, meta.nativeDecimals);
            if (value == null || value <= 0n) return { ok: false as const, error: "Type how much to spend, then press Buy." };
            let curve: ChainCurve;
            try {
              curve = await readCurve(chain, address);
            } catch {
              return { ok: false as const, error: "Could not read the curve. Nothing was bought." };
            }
            const moved = await guardSlip("buy", value);
            if (moved) return moved;
            if (!guards) return sendCurve({ chain, address, data: buyData(referrer), value, from: wallet });
            const priced = minReceived("buy", value, curve);
            if (!priced.ok) return priced;
            return sendCurve({ chain, address, data: buyData(referrer, priced.floor), value, from: wallet });
          })()
        : await (async () => {
            const parsed = parseDecimal(amount, meta.tokenDecimals);
            if (parsed == null || parsed <= 0n) return { ok: false as const, error: "Type how many tokens to sell, then press Sell." };
            const unit = 10n ** BigInt(meta.tokenDecimals);
            const whole = parsed / unit;
            if (whole <= 0n) return { ok: false as const, error: "Sell at least 1 whole token. A fraction of a token is left in the wallet." };
            const tokens = whole * unit;
            let curve = state;
            try {
              curve = await readCurve(chain, address);
            } catch {
              return { ok: false as const, error: "Could not read the curve. Nothing was sold." };
            }
            if (tokens > curve.tokensSold) {
              return {
                ok: false as const,
                error:
                  curve.tokensSold <= 0n
                    ? "Nobody has bought from this curve yet, so it cannot buy any tokens back. Tokens minted to the creator stay in the wallet."
                    : `The curve can only buy back ${formatSmart(curve.tokensSold, meta.tokenDecimals)} ${symbol}. That is what has been bought from it. The rest stays in the wallet.`,
              };
            }
            const moved = await guardSlip("sell", tokens);
            if (moved) return moved;
            if (!guards) return sendCurve({ chain, address, data: sellData(tokens), from: wallet });
            const priced = minReceived("sell", tokens, curve);
            if (!priced.ok) return priced;
            return sendCurve({ chain, address, data: sellData(tokens, priced.floor), from: wallet });
          })();
    setBusy("");
    if (!sent.ok) {
      setError(sent.error);
      return;
    }
    setTxHash(sent.hash);
    setRefresh((n) => n + 1);
    // The server reads side, amounts, wallet and price from the transaction itself.
    void recordTrade({ data: { chain, hash: sent.hash } }).catch(() => undefined);
    setAmount("");
  }

  async function guardSlip(which: "buy" | "sell", amountRaw: bigint): Promise<{ ok: false; error: string } | null> {
    const bps = slipBps(slip);
    if (bps == null) return { ok: false, error: "Slippage has to be a percent from 0.1 to 50." };
    if (!state) return null;
    let fresh: ChainCurve;
    try {
      fresh = await readCurve(chain, address);
    } catch {
      return null;
    }
    try {
      if (which === "buy") {
        const seen = quoteBuy(state, amountRaw);
        const next = quoteBuy(fresh, amountRaw);
        const min = (seen * BigInt(10_000 - bps)) / 10_000n;
        if (next < min) {
          return {
            ok: false,
            error: `Price moved. This buy would receive ${formatSmart(next, meta.tokenDecimals)} ${symbol}, under your minimum of ${formatSmart(min, meta.tokenDecimals)}.`,
          };
        }
      } else {
        const seen = quoteSell(state, amountRaw).ethOut;
        const next = quoteSell(fresh, amountRaw).ethOut;
        const min = (seen * BigInt(10_000 - bps)) / 10_000n;
        if (next < min) {
          return {
            ok: false,
            error: `Price moved. This sell would receive ${formatSmart(next, meta.nativeDecimals)} ${meta.native}, under your minimum of ${formatSmart(min, meta.nativeDecimals)}.`,
          };
        }
      }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Could not price that trade." };
    }
    return null;
  }

  function minReceived(
    which: "buy" | "sell",
    amountRaw: bigint,
    curve: ChainCurve,
  ): { ok: true; floor: bigint } | { ok: false; error: string } {
    const bps = slipBps(slip);
    if (bps == null) return { ok: false, error: "Slippage has to be a percent from 0.1 to 50." };
    try {
      const seen = which === "buy" ? quoteBuy(curve, amountRaw) : quoteSell(curve, amountRaw).ethOut;
      if (seen <= 0n) {
        return {
          ok: false,
          error: which === "buy" ? "That amount is too small. The curve would pay zero tokens." : "That amount is too small. The curve would pay zero.",
        };
      }
      const floor = (seen * BigInt(10_000 - bps)) / 10_000n;
      return { ok: true, floor: floor > 0n ? floor : 1n };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Could not price that trade." };
    }
  }

  function fillSell(pct: number) {
    if (!wallet) {
      setError("Open the wallet on this site first. The percent buttons use the tokens that wallet holds.");
      return;
    }
    if (held == null) {
      setError("Still reading how many tokens this wallet holds.");
      return;
    }
    if (held <= 0n) {
      setError(`This wallet holds no ${symbol} to sell.`);
      return;
    }
    const cap = state && state.tokensSold < held ? state.tokensSold : held;
    if (cap <= 0n) {
      setError("Nobody has bought from this curve yet, so it cannot buy any tokens back. Tokens minted to the creator stay in the wallet.");
      return;
    }
    const whole = cap / 10n ** BigInt(meta.tokenDecimals);
    const tokens = (whole * BigInt(pct)) / 100n;
    if (tokens <= 0n) {
      setError("That percent is under 1 whole token. Type the amount if you want to sell the remainder.");
      return;
    }
    setError("");
    setAmount(tokens.toString());
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="text-3xl font-extrabold tabular-nums">{state && price > 0 ? formatTokensPerNative(price) : "—"}</p>
        <p className="text-sm text-muted">
          {symbol} per 1 {meta.native}
          {state && price > 0 ? ` · ${formatPrice(price)} ${meta.native} each` : ""}
          {state && price > 0 ? <Dollar chain={chain} nativePerToken={price} /> : null}
        </p>
      </div>
      {onSite && gas === 0n ? (
        <GasStep address={wallet} chain={chain} />
      ) : onSite ? (
        <p className="text-sm text-muted">
          Site wallet {wallet.slice(0, 6)}…{wallet.slice(-4)}
          {gas != null ? ` · ${formatSmart(gas, meta.nativeDecimals)} ${meta.native}` : ""}. Trades sign here.
        </p>
      ) : wallet ? (
        <p className="text-sm text-muted">Extension {wallet.slice(0, 6)}…{wallet.slice(-4)}.</p>
      ) : (
        <p className="text-sm text-muted">Create a wallet on Account before you trade.</p>
      )}
      <GraduationMeter
        filled={state?.realEth ?? 0n}
        goal={state?.graduation ?? 0n}
        graduated={Boolean(state?.graduated)}
        native={meta.native}
        decimals={meta.nativeDecimals}
      />
      {wall && wall.maxBuy > 0n ? (
        <p className="text-sm text-muted">
          Wallet cap {formatSmart(wall.maxBuy, meta.nativeDecimals)} {meta.native}. It stays until graduation. It does not lift after a few minutes.
        </p>
      ) : null}
      {wall && wall.startAt * 1000n > BigInt(Date.now()) ? (
        <p className="text-sm text-muted">Buys are held until {new Date(Number(wall.startAt) * 1000).toLocaleString()}.</p>
      ) : null}
      <p className="text-sm text-muted">
        1% fee. Creator keeps 0.30% and can claim it. Referrer 0.10%. Treasury 0.60% is the Ferzan buyback bucket. That buy is not running yet.
      </p>
      {pool ? (
        <p className="text-sm text-muted">
          Graduated in the same buy that filled the curve. The pool is live.
          {" "}
          <a className="font-semibold text-cyan" href={dexSwapUrl(chain, address) || explorerAddress(chain, pool)} target="_blank" rel="noreferrer">
            Trade on {CURVE_POOL[chain].dex}
          </a>
        </p>
      ) : state?.graduated ? (
        <p className="text-sm text-muted">This coin graduated before a pool could open. Selling stays on the curve.</p>
      ) : null}
      <KeyLock address={wallet}>
      <form onSubmit={submit} className="ticket space-y-4">
        <div className="grid grid-cols-2 gap-2">
          <button type="button" className={cn("min-h-11 font-semibold", side === "buy" ? "bg-cyan text-cyan-ink" : "bg-bg text-muted shadow-border")} onClick={() => setSide("buy")}>
            Buy
          </button>
          <button type="button" className={cn("min-h-11 font-semibold", side === "sell" ? "bg-sell text-cyan-ink" : "bg-bg text-muted shadow-border")} onClick={() => setSide("sell")}>
            Sell
          </button>
        </div>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-muted">
            {side === "buy" ? meta.native : symbol}
          </span>
          <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" className="min-h-11 w-full bg-bg px-3 tabular-nums shadow-border outline-none" />
        </label>
        {side === "sell" ? (
          <div>
            <div className="grid grid-cols-4 gap-2">
              {[25, 50, 75, 100].map((pct) => {
                const cap = held != null && held > 0n ? (state && state.tokensSold < held ? state.tokensSold : held) : null;
                const whole = cap != null ? cap / 10n ** BigInt(meta.tokenDecimals) : 0n;
                const tokens = (whole * BigInt(pct)) / 100n;
                const on = tokens > 0n && amount === tokens.toString();
                return (
                  <button
                    key={pct}
                    type="button"
                    className={cn("min-h-11 text-sm font-semibold", on ? "bg-sell text-cyan-ink" : "bg-bg text-muted shadow-border")}
                    onClick={() => fillSell(pct)}
                  >
                    {pct}%
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-sm text-muted tabular-nums">
              You hold {held == null ? "…" : formatSmart(held, meta.tokenDecimals)} {symbol}. The curve can buy back{" "}
              {state ? formatSmart(state.tokensSold, meta.tokenDecimals) : "…"} {symbol}. The percent buttons use whole tokens only.
            </p>
          </div>
        ) : null}
        {out ? <p className="text-sm font-semibold tabular-nums">You get {out}</p> : null}
        {side === "buy" ? (
          <details className="text-sm text-muted">
            <summary className="cursor-pointer">Add a referrer wallet</summary>
            <p className="mt-2">Optional. Leave it blank and the treasury keeps the 10%.</p>
            <input value={referrer} onChange={(e) => setReferrer(e.target.value)} placeholder="0x…" className="mt-2 min-h-11 w-full bg-bg px-3 shadow-border outline-none" />
          </details>
        ) : (
          <p className="text-sm text-muted">Sells pay no referrer.</p>
        )}
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-muted">Max slippage %</span>
          <input value={slip} onChange={(e) => setSlip(e.target.value)} inputMode="decimal" className="min-h-11 w-full bg-bg px-3 tabular-nums shadow-border outline-none" />
        </label>
        <p className="text-xs text-muted">
          {guards
            ? "The transaction reverts if you would receive less than this slippage allows."
            : "This coin launched before the contract could enforce a minimum. The quote is checked before you sign. The transaction itself cannot refuse a worse fill."}
        </p>
        {busy ? <p className="text-sm text-cyan">{busy}</p> : null}
        {curveNote ? <p className="text-sm break-words text-muted">{curveNote}</p> : null}
        {needTerms ? <TermsGate onAccept={() => setNeedTerms(false)} /> : null}
        {error ? (
          <p role="alert" className="bg-bg px-3 py-3 text-sm leading-normal break-words text-sell shadow-border">
            {error}
          </p>
        ) : null}
        {txHash ? (
          <a className="inline-flex min-h-11 items-center text-sm font-semibold text-cyan" href={explorerTx(chain, txHash)}>
            View transaction
          </a>
        ) : null}
        <p className="text-sm text-muted">
          Unaudited. A new curve on {CURVE_POOL[chain].dex || "this chain"} {CURVE_POOL[chain].dex ? "opens that pool when the meter fills. The creator keeps 30% of the LP. The rest is burned." : "has no exchange pool, so selling stays on the curve."} Coins launched before this update burn the whole LP.
        </p>
        <Button type="submit" variant={side === "sell" ? "sell" : "cyan"} disabled={Boolean(busy) || (side === "buy" && state?.graduated)}>
          {side === "buy" && state?.graduated ? "Buys closed" : side === "buy" ? "Buy" : "Sell"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          disabled={Boolean(busy) || !wallet || owed === 0n}
          onClick={() => {
            setBusy("Approve the claim.");
            void sendCurve({ chain, address, data: claimData(), from: wallet || "" }).then((res) => {
              setBusy("");
              if (!res.ok) setError(res.error);
              else {
                setTxHash(res.hash);
                setRefresh((n) => n + 1);
              }
            });
          }}
        >
          {owed > 0n ? `Claim ${formatSmart(owed, meta.nativeDecimals)} ${meta.native}` : "Nothing to claim"}
        </Button>
      </form>
      </KeyLock>
    </div>
  );
}

function slipBps(text: string): number | null {
  const t = text.trim();
  if (!/^\d+(\.\d)?$/.test(t)) return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0.1 || n > 50) return null;
  return Math.round(n * 100);
}

