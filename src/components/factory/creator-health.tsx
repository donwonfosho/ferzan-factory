import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { listLaunched, type BoardCoin } from "@/lib/factory/board";
import { CHAINS } from "@/lib/factory/catalog";
import type { ChainId } from "@/lib/factory/types";
import { Mark } from "./ui";

import { tr } from "@/lib/i18n";
export type RecordTone = "clear" | "watch" | "heavy";

export function creatorVerdict(coins: BoardCoin[]): { tone: RecordTone; title: string; line: string } {
  if (coins.length === 0) {
    return {
      tone: "clear",
      title: "No board history",
      line: "This wallet has not published a coin on the board yet. That is not a clean bill of health. It only means there is nothing here to count.",
    };
  }
  const now = Date.now();
  const day = coins.filter((coin) => now - Date.parse(coin.createdAt) < 86_400_000).length;
  const traded = coins.filter((coin) => coin.buys > 0).length;
  const quiet = coins.length - traded;
  if (day >= 3 && traded * 2 < coins.length) {
    return {
      tone: "heavy",
      title: "Spray",
      line: `${day} launches in the last day, and ${quiet} of ${coins.length} have no buys. That is the pattern bundled deploys leave. It is not proof of a rug.`,
    };
  }
  if (coins.length >= 4 && traded === 0) {
    return {
      tone: "heavy",
      title: "Nothing traded",
      line: `${coins.length} coins from this wallet, and none of them have a buy on the board.`,
    };
  }
  if (day >= 3 || (coins.length >= 3 && quiet > traded)) {
    return {
      tone: "watch",
      title: "Busy wallet",
      line: `${coins.length} coins. ${traded} have buys. ${day} landed in the last day.`,
    };
  }
  if (coins.length === 1) {
    return {
      tone: "clear",
      title: traded ? "One coin, already traded" : "First coin",
      line: "No other coin from this wallet is on the board.",
    };
  }
  return {
    tone: "clear",
    title: "Repeat creator",
    line: `${traded} of ${coins.length} coins have at least one buy.`,
  };
}

const TONE: Record<RecordTone, string> = {
  clear: "text-cyan",
  watch: "text-fg",
  heavy: "text-sell",
};

export function CreatorHealth({ creator, highlight }: { creator: string; highlight?: string }) {
  const [coins, setCoins] = useState<BoardCoin[] | null>(null);
  const valid = /^0x[a-fA-F0-9]{40}$/.test(creator) || /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(creator);

  useEffect(() => {
    if (!valid) return;
    let stop = false;
    void listLaunched({ data: { creator } }).then(
      (rows) => {
        if (!stop) setCoins(rows);
      },
      () => {
        if (!stop) setCoins([]);
      },
    );
    return () => {
      stop = true;
    };
  }, [creator, valid]);

  if (!valid) return null;
  const verdict = coins ? creatorVerdict(coins) : null;
  const others = (coins ?? []).filter((coin) => coin.contract.toLowerCase() !== (highlight ?? "").toLowerCase());

  return (
    <section className="mt-6 bg-surface p-4 shadow-border">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-extrabold">{tr("Creator record")}</h2>
        {verdict ? <p className={`text-sm font-extrabold ${TONE[verdict.tone]}`}>{tr(verdict.title)}</p> : null}
      </div>
      <p className="mt-2 text-sm text-muted">
        {verdict ? verdict.line : tr("Reading this wallet’s other launches.")}{" "}{tr("Counts only coins published on this board. It does not see other sites, bundled wallets, or the creator’s allocation.")}
      </p>
      {others.length > 0 ? (
        <ul className="mt-3 divide-y divide-line">
          {others.slice(0, 6).map((coin) => (
            <li key={coin.id}>
              <Link to="/c/$chain/$address" params={{ chain: coin.chain, address: coin.contract }} className="flex items-center gap-3 py-2">
                <Mark symbol={coin.symbol} image={coin.image} />
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{coin.symbol}</span>
                  <span className="block truncate text-sm text-muted">
                    {tr(CHAINS[coin.chain as ChainId]?.label) ?? coin.chain}
                    {coin.buys > 0 ? tr(" · {0} buys", coin.buys) : tr(" · no buys")}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
      <Link to="/p/$address" params={{ address: creator }} className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-cyan">
        {tr("Open creator profile")}
      </Link>
    </section>
  );
}
