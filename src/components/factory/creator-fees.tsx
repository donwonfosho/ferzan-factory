import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { listLaunched, type BoardCoin } from "@/lib/factory/board";
import { CHAINS } from "@/lib/factory/catalog";
import { claimData, isEvmChain, readClaimable, sendCurve, type EvmChainId } from "@/lib/factory/deploy";
import type { ChainId } from "@/lib/factory/types";
import { formatSmart } from "@/lib/factory/units";
import { Button } from "./ui";

type Row = { coin: BoardCoin; claimable: bigint | null };

export function CreatorFees({ evm, sol }: { evm: string; sol: string | null }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    let stop = false;
    void (async () => {
      const [evmCoins, solCoins] = await Promise.all([
        listLaunched({ data: { creator: evm } }).catch(() => [] as BoardCoin[]),
        sol ? listLaunched({ data: { creator: sol } }).catch(() => [] as BoardCoin[]) : Promise.resolve([] as BoardCoin[]),
      ]);
      const coins = [...evmCoins, ...solCoins].filter((coin, index, all) => all.findIndex((item) => item.contract === coin.contract) === index);
      const next = await Promise.all(
        coins.slice(0, 12).map(async (coin) => {
          if (coin.mode !== "curve" || !isEvmChain(coin.chain as ChainId)) return { coin, claimable: null };
          try {
            const claimable = await readClaimable(coin.chain as EvmChainId, coin.contract, evm);
            return { coin, claimable };
          } catch {
            return { coin, claimable: null };
          }
        }),
      );
      if (!stop) setRows(next);
    })();
    return () => {
      stop = true;
    };
  }, [evm, sol, busy]);

  async function claim(coin: BoardCoin) {
    if (!isEvmChain(coin.chain as ChainId)) return;
    setBusy(coin.contract);
    setNote("");
    const res = await sendCurve({ chain: coin.chain as EvmChainId, address: coin.contract, data: claimData(), from: evm });
    setBusy("");
    setNote(res.ok ? `Claimed on ${coin.symbol}.` : res.error);
  }

  return (
    <section className="ticket mt-4">
      <h2 className="text-lg font-extrabold">Creator fees</h2>
      <p className="mt-1 text-sm text-muted">
        30% of the 1% curve fee sits here until you claim it. Solana pays that cut into the creator wallet on the trade itself, so there is nothing to claim there.
      </p>
      {rows.length === 0 ? <p className="mt-3 text-sm text-muted">No launched coins yet.</p> : null}
      <ul className="mt-3 divide-y divide-line">
        {rows.map(({ coin, claimable }) => {
          const meta = CHAINS[coin.chain as ChainId];
          const evmCurve = coin.mode === "curve" && isEvmChain(coin.chain as ChainId);
          return (
            <li key={coin.contract} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div>
                <Link to="/c/$chain/$address" params={{ chain: coin.chain, address: coin.contract }} className="font-semibold text-cyan">
                  {coin.symbol}
                </Link>
                <p className="text-sm text-muted">
                  {meta?.label ?? coin.chain}
                  {evmCurve
                    ? ` · ${claimable == null ? "…" : formatSmart(claimable, meta?.nativeDecimals ?? 18)} ${meta?.native ?? ""} to claim`
                    : " · paid on each trade"}
                </p>
              </div>
              {evmCurve ? (
                <Button type="button" variant="ghost" disabled={busy === coin.contract || !claimable || claimable === 0n} onClick={() => void claim(coin)}>
                  {busy === coin.contract ? "Claiming" : "Claim"}
                </Button>
              ) : null}
            </li>
          );
        })}
      </ul>
      {note ? <p className="mt-2 text-sm text-muted">{note}</p> : null}
    </section>
  );
}
