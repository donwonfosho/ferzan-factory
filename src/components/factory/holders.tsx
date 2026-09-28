import { useEffect, useState } from "react";
import { listHolders } from "@/lib/factory/market";
import { solanaRelay } from "@/lib/factory/solana";
import type { ChainId } from "@/lib/factory/types";
import { formatSmart } from "@/lib/factory/units";
import { isEvmChain } from "@/lib/factory/deploy";

import { tr } from "@/lib/i18n";
export function Holders({ chain, address, decimals }: { chain: ChainId; address: string; decimals: number }) {
  const [rows, setRows] = useState<{ address: string; amount: string }[] | null>(null);

  useEffect(() => {
    let stop = false;
    async function pull() {
      try {
        if (chain === "solana") {
          const result = await solanaRelay({ data: { method: "holders", mint: address } });
          if (!stop) setRows("holders" in result && result.holders ? result.holders : []);
          return;
        }
        if (!isEvmChain(chain)) {
          if (!stop) setRows([]);
          return;
        }
        const next = await listHolders({ data: { chain, contract: address } });
        if (!stop) setRows(next);
      } catch {
        if (!stop) setRows([]);
      }
    }
    void pull();
    return () => {
      stop = true;
    };
  }, [chain, address]);

  return (
    <section className="mt-8">
      <h2 className="text-lg font-extrabold">{tr("Holders")}</h2>
      {rows === null ? <p className="mt-2 text-sm text-muted">{tr("Reading holders.")}</p> : null}
      {rows && rows.length === 0 ? <p className="mt-2 text-sm text-muted">{tr("No holders yet.")}</p> : null}
      {rows && rows.length > 0 ? (
        <ol className="mt-3 divide-y divide-line border-y border-line">
          {rows.map((row, index) => (
            <li key={row.address} className="flex items-center justify-between gap-3 py-2 text-sm">
              <span className="text-muted tabular-nums">{String(index + 1).padStart(2, "0")}</span>
              <span className="min-w-0 flex-1 truncate font-semibold">
                {row.address.slice(0, 6)}…{row.address.slice(-4)}
              </span>
              <span className="tabular-nums">{formatSmart(BigInt(row.amount), decimals)}</span>
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  );
}
