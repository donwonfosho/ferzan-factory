import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { listLaunched, type BoardCoin } from "@/lib/factory/board";
import { CHAINS } from "@/lib/factory/catalog";
import { isEvmChain, readClaimable, type EvmChainId } from "@/lib/factory/deploy";
import { getHolders } from "@/lib/factory/market-extra";
import type { ChainId } from "@/lib/factory/types";
import { formatSmart } from "@/lib/factory/units";
import { formatUsd, useNativeUsd } from "@/lib/factory/usd";
import { useAccountWallets } from "@/lib/factory/wallet-bridge";
import { CoinStream } from "./coin-stream";
import { EmbedCode } from "./embed-code";
import { VerifiedCreator } from "./verified-creator";
import { ShareCard } from "./share-card";
import { CommunitySetup } from "./community-setup";
import { tr } from "@/lib/i18n";

const EVM = new Set(["ethereum", "base", "bsc", "robinhood", "arc"]);

type Row = { coin: BoardCoin; holders: string | null; claimable: bigint | null };

function same(a: string, b: string) {
  if (a.startsWith("0x") || b.startsWith("0x")) return a.toLowerCase() === b.toLowerCase();
  return a === b;
}

function volumeText(coin: BoardCoin): string {
  if (!/^\d+$/.test(coin.volumeWei)) return tr("Not available");
  const meta = CHAINS[coin.chain as ChainId];
  const decimals = meta?.nativeDecimals ?? (coin.chain === "solana" ? 9 : 18);
  const unit = meta?.native ?? "";
  return `${formatSmart(BigInt(coin.volumeWei), decimals)}${unit ? ` ${unit}` : ""}`;
}

/** Signed-in creator: their launches, fees, stream, embed, and share card. */
export function CreatorDash() {
  const account = useAccountWallets();
  const eth = useNativeUsd("ethereum");
  const bnb = useNativeUsd("bsc");
  const [rows, setRows] = useState<Row[] | null>(null);
  const wallets = [account?.evmAddress, account?.solAddress, account?.tronAddress, account?.tonAddress].filter((item): item is string => Boolean(item));
  const walletKey = wallets.join("|");

  useEffect(() => {
    if (!account?.authenticated || wallets.length === 0) {
      setRows(account?.authenticated ? [] : null);
      return;
    }
    let stop = false;
    void (async () => {
      const lists = await Promise.all(wallets.map((creator) => listLaunched({ data: { creator } }).catch(() => [] as BoardCoin[])));
      const coins = lists.flat().filter((coin, index, all) => all.findIndex((item) => item.contract === coin.contract) === index).slice(0, 24);
      const next = await Promise.all(
        coins.map(async (coin) => {
          const holders = await getHolders({ data: { chain: coin.chain, token: coin.contract } })
            .then((h) => (h && h.source === "chain" && Number.isFinite(h.holderCount) ? String(h.holderCount) : null))
            .catch(() => null);
          let claimable: bigint | null = null;
          if (coin.mode === "curve" && EVM.has(coin.chain) && isEvmChain(coin.chain as ChainId) && account.evmAddress) {
            claimable = await readClaimable(coin.chain as EvmChainId, coin.contract, account.evmAddress).catch(() => null);
          }
          return { coin, holders, claimable };
        }),
      );
      if (!stop) setRows(next);
    })();
    return () => {
      stop = true;
    };
  }, [account?.authenticated, account?.evmAddress, walletKey]);

  if (!account?.ready) return <p className="text-sm text-muted">{tr("Loading…")}</p>;
  if (!account.authenticated) {
    return (
      <div className="mx-auto max-w-lg">
        <h1 className="text-4xl">{tr("Creator")}</h1>
        <p className="mt-3 text-sm text-muted">{tr("Sign in to see the coins your wallets launched.")}</p>
        <button type="button" className="btn-cyan mt-4 min-h-11 px-4" onClick={() => account.login()}>
          {tr("Sign in")}
        </button>
      </div>
    );
  }

  let earned = 0;
  let priced = true;
  for (const row of rows ?? []) {
    if (row.claimable === null || row.claimable <= 0n) continue;
    const price = row.coin.chain === "bsc" ? bnb : row.coin.chain === "arc" ? 1 : eth;
    const decimals = CHAINS[row.coin.chain as ChainId]?.nativeDecimals ?? 18;
    if (!price) {
      priced = false;
      continue;
    }
    const scale = 10n ** BigInt(decimals);
    const native = Number(row.claimable / scale) + Number(row.claimable % scale) / 10 ** decimals;
    earned += native * price;
  }
  const earnedText = !rows ? tr("Loading…") : !priced && earned === 0 ? tr("Not available") : earned <= 0 ? "$0" : formatUsd(earned) || tr("Not available");
  const solanaFees = (rows ?? []).some((row) => row.coin.chain === "solana");

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-4xl">{tr("Creator")}</h1>
        <p className="mt-2 text-lg">{tr("You have earned {0} so far on Ferzan", earnedText)}</p>
        <p className="mt-1 text-sm text-muted">
          {tr("This is what EVM curves still have waiting to claim.")}
          {solanaFees ? ` ${tr("Solana pays that cut into the creator wallet on the trade itself.")}` : ""}
        </p>
      </div>
      {rows === null ? <p className="text-sm text-muted">{tr("Loading…")}</p> : null}
      {rows && rows.length === 0 ? (
        <div className="ticket">
          <p className="text-sm text-muted">{tr("No launched coins yet.")}</p>
          <Link to="/launch" search={{ kind: "curve" }} className="btn-cyan mt-3 inline-flex">
            {tr("Launch")}
          </Link>
        </div>
      ) : null}
      {rows?.map(({ coin, holders, claimable }) => {
        const meta = CHAINS[coin.chain as ChainId];
        const signer = wallets.find((wallet) => same(wallet, coin.creator)) ?? "";
        const claimText =
          coin.chain === "solana"
            ? tr("Paid on each trade")
            : EVM.has(coin.chain)
              ? claimable === null
                ? tr("Not available")
                : `${formatSmart(claimable, meta?.nativeDecimals ?? 18)} ${meta?.native ?? ""}`
              : tr("Not available");
        return (
          <section key={coin.contract} className="space-y-3">
            <div className="ticket">
              <h2 className="text-2xl">${coin.symbol}</h2>
              <p className="text-sm text-muted">{coin.name} · {tr(meta?.label) ?? coin.chain}</p>
              <ul className="mt-3 space-y-1 text-sm">
                <li className="flex justify-between gap-3"><span>{tr("Holders")}</span><span>{holders ?? tr("Not available")}</span></li>
                <li className="flex justify-between gap-3"><span>{tr("Volume")}</span><span>{volumeText(coin)}</span></li>
                <li className="flex justify-between gap-3"><span>{tr("Buys")}</span><span>{coin.buys}</span></li>
                <li className="flex justify-between gap-3"><span>{tr("Claimable")}</span><span>{claimText}</span></li>
              </ul>
            </div>
            <CoinStream chain={coin.chain} token={coin.contract} curve={coin.contract} creator={coin.creator} signer={signer} />
            <VerifiedCreator chain={coin.chain} coin={coin.contract} creator={coin.creator} />
            <EmbedCode chain={coin.chain} id={coin.contract} creator={coin.creator} />
            <ShareCard chain={coin.chain} contract={coin.contract} symbol={coin.symbol} name={coin.name} image={coin.image} />
            <CommunitySetup chain={coin.chain} token={coin.contract} />
          </section>
        );
      })}
    </div>
  );
}
