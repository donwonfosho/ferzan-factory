import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { CHAINS } from "@/lib/factory/catalog";
import { listBoard, listPrints, quoteBoard, type BoardCoin, type BoardMark, type BoardPrint } from "@/lib/factory/board";
import type { ChainId } from "@/lib/factory/types";
import { formatSmart } from "@/lib/factory/units";
import { compactUsd } from "./market-line";
import { useNativeUsd } from "@/lib/factory/usd";
import { Mark } from "./ui";

export function HotList({ chain = "all" }: { chain?: string }) {
  const [coins, setCoins] = useState<BoardCoin[]>([]);
  const [prints, setPrints] = useState<BoardPrint[]>([]);
  const [marks, setMarks] = useState<Record<string, BoardMark>>({});

  useEffect(() => {
    let stop = false;
    async function pull() {
      try {
        const [nextCoins, nextPrints] = await Promise.all([
          listBoard({ data: { chain, sort: "buys", q: "" } }),
          listPrints(),
        ]);
        if (!stop) {
          setCoins(nextCoins);
          const tape = chain === "all" ? nextPrints : nextPrints.filter((print) => print.chain === chain);
          setPrints(tape);
          const quoted = await quoteBoard({
            data: { rows: tape.slice(0, 12).map((print) => ({ chain: print.chain, contract: print.contract, supply: print.supply || "0" })) },
          }).catch(() => []);
          if (!stop) {
            const next: Record<string, BoardMark> = {};
            for (const mark of quoted) next[mark.contract] = mark;
            setMarks(next);
          }
        }
      } catch {
        /* the board stays on the last good read */
      }
    }
    void pull();
    const timer = window.setInterval(() => void pull(), 8000);
    return () => {
      stop = true;
      window.clearInterval(timer);
    };
  }, [chain]);

  const hot = coins.filter((coin) => coin.buys > 0).slice(0, 6);
  const fresh = coins.filter((coin) => coin.buys === 0).slice(0, 4);

  if (hot.length === 0 && prints.length === 0 && fresh.length === 0) return null;

  return (
    <section className="space-y-8">
      {prints.length > 0 ? (
        <div>
          <h2 className="text-2xl">Tape</h2>
          <p className="mt-1 text-sm text-muted">Buys as they land.</p>
          <ul className="mt-3 divide-y divide-line border-y border-line">
            {prints.map((print, index) => (
              <TapeRow key={`${print.contract}-${print.createdAt}-${index}`} print={print} mark={marks[print.contract]} />
            ))}
          </ul>
        </div>
      ) : null}
      {hot[0] ? (
        <div>
          <h2 className="text-2xl">Lead</h2>
          <p className="mt-1 text-sm text-muted">Most buys on this floor.</p>
          <div className="mt-4">
            <Lead coin={hot[0]} />
          </div>
          {hot.length > 1 ? (
            <div className="mt-2 divide-y divide-line border-y border-line">
              {hot.slice(1).map((coin) => (
                <CoinRow key={coin.id} coin={coin} />
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
      {fresh.length > 0 ? (
        <div className="mt-4">
          <p className="text-sm font-medium text-cyan">Just launched</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {fresh.map((coin) => (
              <CoinCard key={coin.id} coin={coin} />
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function TapeRow({ print, mark }: { print: BoardPrint; mark?: BoardMark }) {
  const chain = CHAINS[print.chain as ChainId];
  const usd = useNativeUsd((print.chain in CHAINS ? print.chain : "base") as ChainId);
  const dollars = mark && usd ? mark.mcap * usd : 0;
  const who = print.who ? `${print.who.slice(0, 4)}…${print.who.slice(-4)}` : "Someone";
  return (
    <li>
      <Link to="/c/$chain/$address" params={{ chain: print.chain, address: print.contract }} className="flex items-center gap-3 py-3">
        <Mark symbol={print.symbol} image={print.image} />
        <span className="min-w-0 flex-1">
          <span className="block truncate">
            <span className="font-semibold">{who}</span> bought <span className="font-semibold">{print.symbol}</span>
          </span>
          <span className="block truncate text-sm text-muted">{money(print.nativeWei, print.chain)}</span>
        </span>
        <span className="shrink-0 text-sm font-semibold tabular-nums">{dollars > 0 ? compactUsd(dollars) : chain?.native ?? ""}</span>
      </Link>
    </li>
  );
}

function Lead({ coin }: { coin: BoardCoin }) {
  const chain = CHAINS[coin.chain as ChainId];
  return (
    <Link to="/c/$chain/$address" params={{ chain: coin.chain, address: coin.contract }} className="grid items-center gap-4 bg-surface p-5 shadow-border sm:grid-cols-[auto_1fr_auto]">
      <Mark symbol={coin.symbol} image={coin.image} className="h-20 w-20 text-xl" />
      <span className="min-w-0">
        <span className="text-sm font-medium text-cyan">Lead · {chain?.label ?? coin.chain}</span>
        <span className="mt-1 block truncate text-3xl">{coin.symbol}</span>
        <span className="block truncate text-sm text-muted">{coin.name}</span>
      </span>
      <span className="text-sm tabular-nums sm:text-right">
        <span className="block font-extrabold">{coin.buys} {coin.buys === 1 ? "buy" : "buys"}</span>
        <span className="text-muted">{chain ? money(coin.volumeWei, coin.chain) : ""}</span>
      </span>
    </Link>
  );
}

function CoinRow({ coin }: { coin: BoardCoin }) {
  const chain = CHAINS[coin.chain as ChainId];
  return (
    <Link to="/c/$chain/$address" params={{ chain: coin.chain, address: coin.contract }} className="flex items-center gap-3 py-3">
      <Mark symbol={coin.symbol} image={coin.image} />
      <span className="min-w-0 flex-1">
        <span className="block font-extrabold">{coin.symbol}</span>
        <span className="block truncate text-sm text-muted">{coin.name} · {chain?.label ?? coin.chain}</span>
      </span>
      <span className="shrink-0 text-sm tabular-nums text-muted">{coin.buys} buys</span>
    </Link>
  );
}

function CoinCard({ coin }: { coin: BoardCoin }) {
  const chain = CHAINS[coin.chain as ChainId];
  return (
    <Link to="/c/$chain/$address" params={{ chain: coin.chain, address: coin.contract }} className="ticket block">
      <div className="flex items-center gap-3">
        <Mark symbol={coin.symbol} image={coin.image} />
        <span className="min-w-0">
          <span className="block font-extrabold">{coin.symbol}</span>
          <span className="block truncate text-sm text-muted">
            {coin.name} · {chain?.label ?? coin.chain} · {coin.mode === "curve" ? "Curve" : "Pool"}
          </span>
        </span>
      </div>
      <p className="mt-3 text-sm tabular-nums">
        {coin.buys} {coin.buys === 1 ? "buy" : "buys"}
        {coin.buys > 0 && chain ? ` · ${money(coin.volumeWei, coin.chain)}` : ""}
      </p>
    </Link>
  );
}

function money(wei: string, chainId: string) {
  const chain = CHAINS[chainId as ChainId];
  if (!chain) return wei;
  return `${formatSmart(BigInt(wei || "0"), chain.nativeDecimals)} ${chain.native}`;
}
