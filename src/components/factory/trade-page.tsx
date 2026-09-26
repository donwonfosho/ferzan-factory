import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { CHAINS } from "@/lib/factory/catalog";
import { getCoin, type BoardCoin } from "@/lib/factory/board";
import { isEvmChain, readCurve, readErc20String, type EvmChainId } from "@/lib/factory/deploy";
import { isSolanaAddress } from "@/lib/factory/solana";
import type { ChainId } from "@/lib/factory/types";
import { ChainPanel } from "./chain-panel";
import { SolanaPanel } from "./solana-panel";
import { ContractLine } from "./token-view";
import { CoinPush } from "./coin-push";
import { CoinTape, CoinThread } from "./coin-board";
import { Holders } from "./holders";
import { CreatorHealth } from "./creator-health";
import { Mark } from "./ui";

export function TradePage({ chain, address }: { chain: string; address: string }) {
  const [coin, setCoin] = useState<BoardCoin | null | undefined>(undefined);
  const [onChain, setOnChain] = useState<{ symbol: string; name: string } | null | undefined>(undefined);
  const evm = isEvmListed(chain) && /^0x[a-fA-F0-9]{40}$/.test(address) ? chain : null;
  const sol = chain === "solana" && isSolanaAddress(address) ? address : null;
  const listed = evm ?? (sol ? "solana" : null);

  useEffect(() => {
    if (!listed) {
      setCoin(null);
      return;
    }
    let stop = false;
    void getCoin({ data: { chain: listed, contract: sol ? address : address.toLowerCase() } }).then(
      (row) => {
        if (!stop) setCoin(row);
      },
      () => {
        if (!stop) setCoin(null);
      },
    );
    return () => {
      stop = true;
    };
  }, [listed, address, sol]);

  useEffect(() => {
    if (!evm || coin !== null) {
      setOnChain(undefined);
      return;
    }
    let stop = false;
    setOnChain(undefined);
    void (async () => {
      try {
        await readCurve(evm, address);
        const [symbol, name] = await Promise.all([
          readErc20String(evm, address, "0x95d89b41"),
          readErc20String(evm, address, "0x06fdde03"),
        ]);
        if (!stop) setOnChain({ symbol: symbol || "Coin", name: name || "On-chain curve" });
      } catch {
        if (!stop) setOnChain(null);
      }
    })();
    return () => {
      stop = true;
    };
  }, [evm, address, coin]);

  if (!listed) {
    return (
      <div>
        <h1 className="text-3xl font-extrabold">Not a listed coin</h1>
        <Link to="/" className="mt-4 inline-flex min-h-11 items-center text-cyan">
          Back to the floor
        </Link>
      </div>
    );
  }

  const meta = CHAINS[listed];
  return (
    <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
      <div>
        <p className="text-sm font-medium text-cyan">
          {coin?.mode === "plain" ? "Regular pool" : "Curve"} · {meta.label}
        </p>
        <div className="mt-3 flex items-center gap-4">
          <Mark symbol={coin?.symbol || "FZ"} image={coin?.image} className="h-28 w-28 text-2xl" />
          <div>
            <h1 className="text-4xl">{coin?.symbol || onChain?.symbol || "Coin"}</h1>
            <p className="mt-1 text-muted">{coin ? coin.name : onChain ? onChain.name : "Loading the board."}</p>
            {coin?.creator ? (
              <Link to="/p/$address" params={{ address: coin.creator }} className="mt-1 inline-flex text-sm font-semibold text-cyan">
                Creator
              </Link>
            ) : null}
          </div>
        </div>
        <ContractLine chain={listed} address={coin?.contract || address} />
        <CoinPush chain={listed} address={coin?.contract || address} symbol={coin?.symbol || onChain?.symbol || "Coin"} />
        <p className="mt-4 max-w-xl text-sm text-muted">
          Buy and sell here. The signature stays in the wallet this site opened for you. No extension popup.
        </p>
        {coin === null && onChain ? (
          <p className="mt-4 text-sm text-muted">This contract is not on the board. The curve can still be traded.</p>
        ) : null}
        {coin === null && onChain === null ? <p className="mt-4 text-sm text-sell">This contract is not a curve this site can trade.</p> : null}
        {listed && (coin || onChain) ? (
          <CoinTape contract={coin?.contract || address} chain={coin?.chain || listed} createdAt={coin?.createdAt} supply={coin?.supply} />
        ) : null}
        {listed ? <Holders chain={listed} address={coin?.contract || address} decimals={meta.tokenDecimals} /> : null}
        {coin?.creator ? <CreatorHealth creator={coin.creator} highlight={coin.contract} /> : null}
      </div>
      <aside>
        {coin && coin.mode === "curve" && evm ? (
          <ChainPanel chain={evm} address={coin.contract} symbol={coin.symbol} />
        ) : onChain && evm ? (
          <ChainPanel chain={evm} address={address} symbol={onChain.symbol} />
        ) : listed === "solana" ? (
          <SolanaPanel mint={address} symbol={coin?.symbol || "Coin"} />
        ) : coin && coin.mode === "plain" ? (
          <div className="ticket text-sm text-muted">Regular pool. The supply was minted to the creator. There is no curve to trade.</div>
        ) : coin === null && onChain === null ? null : (
          <p className="text-sm text-muted">Reading the coin.</p>
        )}
        {coin ? <CoinThread contract={coin.contract} chain={coin.chain} /> : null}
      </aside>
    </div>
  );
}

function isEvmListed(chain: string): chain is EvmChainId {
  return (chain === "ethereum" || chain === "bsc" || chain === "base" || chain === "robinhood" || chain === "arc") && isEvmChain(chain as ChainId);
}
