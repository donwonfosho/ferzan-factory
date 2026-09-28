import { useCallback, useEffect, useState } from "react";
import {
  buildSolFeeClaim,
  getPortfolio,
  getSolFees,
  type PortfolioCoin,
  type SolFeePool,
  type WalletPortfolio,
} from "@/lib/factory/telegram-feed";
import { solanaExplorerTx } from "@/lib/factory/solana";
import { solanaWallet } from "@/lib/factory/wallet-bridge";
import { WalletBalances } from "./gas-step";
import { coinHref } from "./launch-board";
import { ChainMark, type MarkChain } from "./chain-mark";
import { compactUsd } from "./market-line";
import { Button, Mark } from "./ui";

import { tr } from "@/lib/i18n";
const MARKS = new Set<string>(["solana", "base", "bsc", "ethereum", "robinhood", "arc", "tron", "ton"]);
const EMPTY: WalletPortfolio = { holdings: [], launches: [], valueUsd: 0, earnedUsd: 0, referralUsd: 0 };

function amount(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0";
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return n >= 1 ? n.toFixed(2) : n.toPrecision(3);
}

function native(n: number, sym: string): string {
  if (!Number.isFinite(n) || n <= 0) return `0 ${sym}`;
  return `${n >= 0.01 ? n.toFixed(4) : n.toPrecision(3)} ${sym}`;
}

function merge(a: WalletPortfolio, b: WalletPortfolio): WalletPortfolio {
  return {
    holdings: [...a.holdings, ...b.holdings].sort((x, y) => y.valueUsd - x.valueUsd),
    launches: [...a.launches, ...b.launches].sort((x, y) => y.launchedTs - x.launchedTs),
    valueUsd: a.valueUsd + b.valueUsd,
    earnedUsd: a.earnedUsd + b.earnedUsd,
    referralUsd: a.referralUsd + b.referralUsd,
  };
}

/** The account's EVM + Solana portfolio from the Launch Bot index (live balances, launches, fees). */
function usePortfolio(evm: string | null, sol: string | null): { data: WalletPortfolio | null; failed: boolean } {
  const [data, setData] = useState<WalletPortfolio | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let stop = false;
    async function pull() {
      const reads = await Promise.all([
        evm ? getPortfolio({ data: { wallet: evm } }).catch(() => null) : Promise.resolve(EMPTY),
        sol ? getPortfolio({ data: { wallet: sol } }).catch(() => null) : Promise.resolve(EMPTY),
      ]);
      if (stop) return;
      setFailed(reads.some((r) => r === null));
      setData(merge(reads[0] ?? EMPTY, reads[1] ?? EMPTY));
    }
    setData(null);
    void pull();
    const timer = window.setInterval(() => void pull(), 30_000);
    return () => {
      stop = true;
      window.clearInterval(timer);
    };
  }, [evm, sol]);
  return { data, failed };
}

function CoinRow({ coin, right, sub }: { coin: PortfolioCoin; right: string; sub: string }) {
  const link = coinHref(coin);
  return (
    <li>
      <a
        href={link.href}
        {...(link.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
        className="flex items-center gap-3 py-3"
      >
        <Mark symbol={coin.symbol} image={coin.image || undefined} />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className="truncate font-extrabold">{coin.symbol}</span>
            {MARKS.has(coin.chain) ? <ChainMark id={coin.chain as MarkChain} className="h-4 w-4 shrink-0" /> : null}
            {coin.graduated ? <span className="text-xs text-cyan">{tr("Graduated")}</span> : null}
          </span>
          <span className="block truncate text-sm text-muted">{sub}</span>
        </span>
        <span className="shrink-0 text-right text-sm font-semibold tabular-nums">{right}</span>
      </a>
    </li>
  );
}

/** Portfolio for the signed-in account: coin balances, holdings with value, and launches. */
export function AccountPortfolio({ evm, sol }: { evm: string | null; sol: string | null }) {
  const { data, failed } = usePortfolio(evm, sol);
  return (
    <>
      {evm ? (
        <div className="mt-4">
          <WalletBalances evm={evm} sol={sol} />
        </div>
      ) : null}
      <section className="ticket mt-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-sm text-muted">{tr("Holdings value")}</p>
            <p className="mt-1 text-2xl font-extrabold tabular-nums">{data ? compactUsd(data.valueUsd) : "…"}</p>
          </div>
          <div>
            <p className="text-sm text-muted">{tr("Creator fees earned")}</p>
            <p className="mt-1 text-2xl font-extrabold tabular-nums">{data ? compactUsd(data.earnedUsd) : "…"}</p>
          </div>
        </div>
        {failed ? <p className="mt-3 text-sm text-sell">{tr("Part of the portfolio did not load. It retries every 30 seconds.")}</p> : null}
      </section>

      <section className="mt-6">
        <h2 className="text-xl font-extrabold">{tr("Holding")}</h2>
        <p className="mt-1 text-sm text-muted">{tr("Ferzan coins in your wallets, valued at the curve price.")}</p>
        {data === null ? <p className="mt-3 text-sm text-muted">{tr("Reading your wallets…")}</p> : null}
        {data && data.holdings.length === 0 ? <p className="mt-3 text-sm text-muted">{tr("No Ferzan coins yet. Buy one from the board.")}</p> : null}
        <ul className="mt-3 divide-y divide-line border-y border-line empty:hidden">
          {(data?.holdings ?? []).map((coin) => (
            <CoinRow
              key={`h-${coin.chain}-${coin.token}`}
              coin={coin}
              right={compactUsd(coin.valueUsd)}
              sub={`${amount(coin.balance)} ${coin.symbol} · ${native(coin.valueNative, coin.native)}`}
            />
          ))}
        </ul>
      </section>

      <section className="mt-6">
        <h2 className="text-xl font-extrabold">{tr("Launched")}</h2>
        <p className="mt-1 text-sm text-muted">{tr("Coins launched from these wallets, here or on Telegram.")}</p>
        {data && data.launches.length === 0 ? <p className="mt-3 text-sm text-muted">{tr("None yet.")}</p> : null}
        <ul className="mt-3 divide-y divide-line border-y border-line empty:hidden">
          {(data?.launches ?? []).map((coin) => (
            <CoinRow
              key={`l-${coin.chain}-${coin.token}`}
              coin={coin}
              right={compactUsd(coin.mcapUsd)}
              sub={
                coin.earnedUsd !== null
                  ? `${coin.trades} trades · you earned ${native(coin.earnedNative ?? 0, coin.native)}`
                  : `${coin.trades} trades · fees on Rewards`
              }
            />
          ))}
        </ul>
      </section>
    </>
  );
}

function fromB64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

/** Rewards for the signed-in account: referral link, EVM fees (paid on every trade) and Solana fees to claim. */
export function AccountRewards({ evm, sol }: { evm: string | null; sol: string | null }) {
  const { data } = usePortfolio(evm, sol);
  const [fees, setFees] = useState<{ totalSol: number; pools: SolFeePool[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [tx, setTx] = useState("");

  const loadFees = useCallback(async () => {
    if (!sol) return setFees({ totalSol: 0, pools: [] });
    setFees(await getSolFees({ data: { wallet: sol } }).catch(() => ({ totalSol: 0, pools: [] })));
  }, [sol]);

  useEffect(() => {
    void loadFees();
  }, [loadFees]);

  async function claim() {
    if (!sol || !fees?.pools.length) return;
    setBusy(true);
    setNote("");
    setTx("");
    try {
      const wallet = await solanaWallet();
      if (wallet.address !== sol) throw new Error(tr("Sign in with the account that launched these coins."));
      const txs = await buildSolFeeClaim({ data: { wallet: sol, pools: fees.pools.map((p) => p.pool) } });
      let last = "";
      for (const [i, b64] of txs.entries()) {
        setNote(txs.length > 1 ? tr("Signing claim {0} of {1}…", i + 1, txs.length) : tr("Signing the claim…"));
        last = await wallet.signAndSend(fromB64(b64));
      }
      setTx(last);
      setNote(tr("Claimed. The SOL is in your wallet once the chain confirms."));
      window.setTimeout(() => void loadFees(), 8000);
    } catch (err) {
      setNote(err instanceof Error ? err.message : tr("The claim did not go through."));
    } finally {
      setBusy(false);
    }
  }

  const evmLaunches = (data?.launches ?? []).filter((coin) => coin.earnedUsd !== null);

  return (
    <>
      <section className="ticket mt-4">
        <p className="font-semibold">{tr("Referrals")}</p>
        <p className="mt-1 text-sm text-muted">
          {tr("When a trade names your wallet as the referrer (your Telegram /refer link does this), 10% of its fee goes to you. Earned so far:")}{" "}{data ? compactUsd(data.referralUsd) : "…"}
        </p>
        {evm ? (
          <button
            type="button"
            className="btn-line mt-3"
            onClick={() => {
              void navigator.clipboard.writeText(evm).then(
                () => setNote("Referrer address copied."),
                () => setNote("Copy was blocked."),
              );
            }}
          >
            {tr("Copy referrer address")}
          </button>
        ) : null}
      </section>

      <section className="ticket mt-4">
        <p className="font-semibold">{tr("Creator fees on Base, BNB, Ethereum and Robinhood")}</p>
        <p className="mt-1 text-sm text-muted">{tr("Half of the 1% fee on every trade goes straight to your wallet. Nothing to claim.")}</p>
        {evmLaunches.length === 0 ? <p className="mt-3 text-sm text-muted">{tr("No launches on these chains yet.")}</p> : null}
        <ul className="mt-2 divide-y divide-line empty:hidden">
          {evmLaunches.map((coin) => (
            <CoinRow
              key={`e-${coin.chain}-${coin.token}`}
              coin={coin}
              right={compactUsd(coin.earnedUsd ?? 0)}
              sub={`${native(coin.earnedNative ?? 0, coin.native)} earned`}
            />
          ))}
        </ul>
      </section>

      <section className="ticket mt-4">
        <p className="font-semibold">{tr("Solana creator fees")}</p>
        <p className="mt-1 text-sm text-muted">{tr("Meteora holds your share of the trading fees until you claim it.")}</p>
        {fees === null ? <p className="mt-3 text-sm text-muted">{tr("Checking…")}</p> : null}
        {fees && fees.pools.length === 0 ? <p className="mt-3 text-sm text-muted">{tr("Nothing to claim right now.")}</p> : null}
        <ul className="mt-2 divide-y divide-line empty:hidden">
          {(fees?.pools ?? []).map((p) => (
            <li key={p.pool} className="flex items-center justify-between gap-3 py-2 text-sm">
              <span className="font-semibold">{p.symbol || `${p.mint.slice(0, 4)}…${p.mint.slice(-4)}`}</span>
              <span className="tabular-nums">{native(p.sol, "SOL")}</span>
            </li>
          ))}
        </ul>
        {fees && fees.pools.length ? (
          <Button type="button" className="mt-3 w-full sm:w-auto" disabled={busy} onClick={() => void claim()}>
            {busy ? tr("Claiming…") : tr("Claim {0}", native(fees.totalSol, "SOL"))}
          </Button>
        ) : null}
        {tx ? (
          <a className="mt-2 block text-sm font-semibold text-cyan" href={solanaExplorerTx(tx)} target="_blank" rel="noopener noreferrer">
            {tr("View transaction")}
          </a>
        ) : null}
      </section>
      {note ? <p className="mt-3 text-sm text-muted">{tr(note)}</p> : null}
    </>
  );
}
