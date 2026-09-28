import { useCallback, useEffect, useState } from "react";
import { buildSolSwap, getSolCoin, type SolCoin } from "@/lib/factory/sol-coin";
import { solanaExplorerMint, solanaExplorerTx } from "@/lib/factory/solana";
import { formatSmart, parseDecimal } from "@/lib/factory/units";
import { WalletNeeded, solanaWallet, useAccountWallets } from "@/lib/factory/wallet-bridge";
import { cn } from "@/lib/cn";
import { Chart } from "./bot-coin-page";
import { Button, TextInput } from "./ui";
import { CreatorScoreBox } from "./creator-score";

const TIMEFRAMES = [
  { tf: 300, label: "5m" },
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
      setLoadError(err instanceof Error ? err.message : "This coin did not load.");
    }
  }, [mint, knownWallet, tf]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 20_000);
    return () => window.clearInterval(timer);
  }, [load]);

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
      if (!raw || raw <= 0n) throw new Error(side === "buy" ? "Type how much SOL to spend." : `Type how many ${coin.symbol} to sell.`);
      setBusy("Connect your wallet.");
      const w = await solanaWallet();
      setWallet(w.address);
      if (side === "sell" && coin.mine && w.address === knownWallet && raw > BigInt(coin.mine.tokenRaw)) {
        throw new Error(`You hold ${formatSmart(BigInt(coin.mine.tokenRaw), TOKEN_DECIMALS)} ${coin.symbol}.`);
      }
      setBusy("Preparing the trade.");
      const built = await buildSolSwap({ data: { mint, wallet: w.address, side, amount: raw.toString(), slippageBps: slip, simulate: true } });
      if (built.simError) {
        throw new Error(
          /insufficient/i.test(built.simError)
            ? "Not enough SOL for this trade plus the network fee and token account (keep about 0.01 SOL extra)."
            : `Solana would reject this trade: ${built.simError}`,
        );
      }
      setBusy("Approve it in your wallet.");
      const signature = await w.signAndSend(fromB64(built.txB64));
      setLastTx(signature);
      setAmount("");
      setBusy("Sent. Updating in a few seconds.");
      window.setTimeout(() => void load(), 6000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "The trade did not go through.";
      setError(err instanceof WalletNeeded ? msg : /user (rejected|denied)|rejected the request|4001/i.test(msg) ? "You cancelled in the wallet." : msg.split("\n")[0]);
    } finally {
      window.setTimeout(() => setBusy(""), 1500);
    }
  }

  if (loadError && !coin) return <p className="ticket mx-auto max-w-3xl text-sm text-sell">{loadError}</p>;
  if (!coin) return <p className="ticket mx-auto max-w-3xl text-sm text-muted">Loading the curve…</p>;
  if (!coin.indexed) {
    return (
      <p className="ticket mx-auto max-w-3xl text-sm text-muted">
        This coin is not on the Ferzan floor yet. New launches show up within about a minute.
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
            Solana ·{" "}
            <a className="text-cyan" href={solanaExplorerMint(coin.mint)} target="_blank" rel="noopener noreferrer">
              {short(coin.mint)}
            </a>
            {coin.creator ? (
              <>
                {" "}· by {short(coin.creator)}
                {coin.creatorLaunches > 1 ? ` (${coin.creatorLaunches} launches, ${coin.creatorGraduated} graduated)` : " (first launch)"}
              </>
            ) : null}
          </p>
          {coin.description ? <p className="mt-2 text-sm">{coin.description}</p> : null}
          <p className="mt-2 flex flex-wrap gap-3 text-sm">
            {coin.links.website ? <a className="text-cyan" href={coin.links.website} target="_blank" rel="noopener noreferrer">Website</a> : null}
            {coin.links.x ? <a className="text-cyan" href={coin.links.x} target="_blank" rel="noopener noreferrer">X</a> : null}
            {coin.links.telegram ? <a className="text-cyan" href={coin.links.telegram} target="_blank" rel="noopener noreferrer">Telegram</a> : null}
          </p>
        </div>
      </div>

      <CreatorScoreBox token={coin.mint} />

      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <div className="ticket">
          <p className="text-xs text-muted">Market cap</p>
          <p className="text-base font-extrabold tabular-nums sm:text-lg">{usd(coin.mcapUsd)}</p>
        </div>
        <div className="ticket">
          <p className="text-xs text-muted">Price</p>
          <p className="text-base font-extrabold tabular-nums sm:text-lg">{coin.price ? coin.price.toPrecision(3) : "—"} SOL</p>
        </div>
        <div className="ticket">
          <p className="text-xs text-muted">{coin.graduated ? "Graduated" : "To graduation"}</p>
          <p className="text-base font-extrabold tabular-nums sm:text-lg">{coin.progress.toFixed(1)}%</p>
        </div>
      </div>
      <div className="h-2 w-full bg-surface shadow-border">
        <div className="h-2 bg-cyan" style={{ width: `${Math.min(100, coin.progress)}%` }} />
      </div>
      <p className="text-xs text-muted">
        {coin.graduated
          ? "This curve is full. Its liquidity moved to a locked Meteora pool."
          : `${coin.raisedSol.toFixed(2)} of ${coin.gradSol.toFixed(0)} SOL raised · ${coin.trades} trades · ${coin.volumeSol.toFixed(2)} SOL volume`}
      </p>

      <div className="ticket">
        <div className="mb-2 flex gap-2">
          {TIMEFRAMES.map((t) => (
            <button key={t.tf} type="button" onClick={() => setTf(t.tf)} className={cn("min-h-9 px-3 text-sm", tf === t.tf ? "btn-cyan" : "btn-line")}>
              {t.label}
            </button>
          ))}
        </div>
        <Chart candles={coin.candles} />
      </div>

      {coin.graduated ? (
        <div className="ticket">
          <p className="text-sm">Trading moved to the Meteora pool.</p>
          <a className="btn-cyan mt-3 inline-flex" href={`https://jup.ag/tokens/${coin.mint}`} target="_blank" rel="noopener noreferrer">
            Trade the pool
          </a>
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
          <TextInput value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder={side === "buy" ? "SOL to spend" : `${coin.symbol} to sell`} />
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
              ≈ {side === "buy" ? `${formatSmart(quote, TOKEN_DECIMALS)} ${coin.symbol}` : `${formatSmart(quote, SOL_DECIMALS)} SOL`}
              {feeBps !== null ? ` · fee ${feeBps >= 1000 ? Math.round(feeBps / 100) : (feeBps / 100).toFixed(feeBps % 100 ? 2 : 0)}%` : ""}
            </p>
          ) : null}
          {quote !== null && feeBps !== null && feeBps >= 300 ? (
            <p className="text-sm text-sell">
              The launch fee is still high. It keeps falling in the first minutes after launch and settles at 1%.
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
          {coin.mine ? (
            <p className="text-xs text-muted">
              You hold {formatSmart(tokenBal, TOKEN_DECIMALS)} {coin.symbol} · {formatSmart(BigInt(coin.mine.lamports), SOL_DECIMALS)} SOL
            </p>
          ) : null}
          {error ? <p className="text-sm text-sell">{error}</p> : null}
          {busy ? <p className="text-sm text-cyan">{busy}</p> : null}
          {lastTx ? (
            <a className="text-sm text-cyan" href={solanaExplorerTx(lastTx)} target="_blank" rel="noopener noreferrer">
              View last transaction
            </a>
          ) : null}
          <Button type="submit" className="w-full" disabled={Boolean(busy)}>
            {side === "buy" ? `Buy ${coin.symbol}` : `Sell ${coin.symbol}`}
          </Button>
        </form>
      )}
    </div>
  );
}
