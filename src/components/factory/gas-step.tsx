import { useEffect, useState } from "react";
import { CHAINS } from "@/lib/factory/catalog";
import { siteBalance } from "@/lib/factory/site-wallet";
import { solBalance } from "@/lib/factory/solana";
import type { EvmChainId } from "@/lib/factory/deploy";
import { readTokenBalances } from "@/lib/factory/relay";
import { useFactory } from "@/lib/factory/store";
import type { LiveChainId } from "@/lib/factory/types";
import { formatSmart, formatUnits } from "@/lib/factory/units";
import { Button } from "./ui";

export function GasStep({ address, chain = "base" }: { address: string; chain?: EvmChainId | "solana" }) {
  const [copied, setCopied] = useState(false);
  const [wei, setWei] = useState<bigint | null>(null);
  const meta = CHAINS[chain];
  const solana = chain === "solana";

  useEffect(() => {
    let stop = false;
    async function read() {
      try {
        const next = solana ? await solBalance(address) : await siteBalance(chain, address);
        if (!stop) setWei(next);
      } catch {
        if (!stop) setWei(null);
      }
    }
    void read();
    const timer = window.setInterval(() => void read(), 12000);
    return () => {
      stop = true;
      window.clearInterval(timer);
    };
  }, [address, chain, solana]);

  return (
    <div className="ticket">
      <p className="text-sm font-medium text-cyan">Gas</p>
      <p className="mt-2 break-all font-semibold">{address}</p>
      <Button
        type="button"
        variant="ghost"
        className="mt-3"
        onClick={() => {
          void navigator.clipboard.writeText(address).then(
            () => setCopied(true),
            () => setCopied(false),
          );
        }}
      >
        {copied ? "Address copied" : "Copy address"}
      </Button>
      <p className="mt-3 text-sm text-muted">
        {solana
          ? "Send SOL to this Solana address before a Solana launch. It is not the ETH address."
          : `Send ${meta.native} on ${meta.label} to this address before you launch or trade.`}
        {!solana && chain === "base" ? " Base is the default chain." : ""}
        {!solana ? " Ethereum, BNB Chain, Robinhood, and Arc each need their own gas in this same wallet. Arc gas is USDC." : ""}
      </p>
      <p className="mt-2 text-sm tabular-nums">
        {meta.label} balance {wei == null ? "…" : `${formatSmart(wei, meta.nativeDecimals)} ${meta.native}`}
        {wei === 0n ? ". This wallet cannot sign until that balance is above zero." : ""}
      </p>
    </div>
  );
}

const HOLDINGS: { id: LiveChainId; coin: string }[] = [
  { id: "base", coin: "Base ETH" },
  { id: "ethereum", coin: "Ethereum ETH" },
  { id: "bsc", coin: "BNB" },
  { id: "solana", coin: "SOL" },
  { id: "robinhood", coin: "Robinhood ETH" },
  { id: "arc", coin: "Arc USDC" },
];

export function WalletBalances({ evm, sol }: { evm: string; sol: string | null }) {
  const book = useFactory((s) =>
    s.launches
      .filter((item) => item.contract && item.chain !== "solana")
      .map((item) => `${item.chain}:${item.contract}:${item.symbol}`)
      .join("|"),
  );
  const [native, setNative] = useState<Record<string, string>>({});
  const [failed, setFailed] = useState<Record<string, boolean>>({});
  const [tokens, setTokens] = useState<{ chain: string; symbol: string; raw: string }[]>([]);

  useEffect(() => {
    let stop = false;
    async function pull() {
      const evmChains = HOLDINGS.filter((row) => row.id !== "solana");
      await Promise.all(
        evmChains.map(async (row) => {
          try {
            const wei = await siteBalance(row.id as EvmChainId, evm);
            if (stop) return;
            setNative((prev) => ({ ...prev, [row.id]: wei.toString() }));
            setFailed((prev) => ({ ...prev, [row.id]: false }));
          } catch {
            if (!stop) setFailed((prev) => ({ ...prev, [row.id]: true }));
          }
        }),
      );
      if (sol) {
        try {
          const lamports = await solBalance(sol);
          if (!stop) {
            setNative((prev) => ({ ...prev, solana: lamports.toString() }));
            setFailed((prev) => ({ ...prev, solana: false }));
          }
        } catch {
          if (!stop) setFailed((prev) => ({ ...prev, solana: true }));
        }
      }
      const groups = new Map<EvmChainId, { address: string; symbol: string }[]>();
      for (const row of book.split("|").filter(Boolean)) {
        const [chain, address, symbol] = row.split(":");
        if (chain !== "ethereum" && chain !== "base" && chain !== "bsc" && chain !== "robinhood" && chain !== "arc") continue;
        if (!address || !symbol) continue;
        const list = groups.get(chain) ?? [];
        if (list.some((item) => item.address.toLowerCase() === address.toLowerCase())) continue;
        list.push({ address, symbol });
        groups.set(chain, list);
      }
      const found: { chain: string; symbol: string; raw: string }[] = [];
      await Promise.all(
        [...groups.entries()].map(async ([chain, list]) => {
          try {
            const rows = await readTokenBalances({ data: { chain, wallet: evm, tokens: list } });
            found.push(...rows.map((item) => ({ chain, symbol: item.symbol, raw: item.raw })));
          } catch {
            /* that chain's token list can wait for the next pass */
          }
        }),
      );
      if (!stop) setTokens(found);
    }
    void pull();
    const timer = window.setInterval(() => void pull(), 12000);
    return () => {
      stop = true;
      window.clearInterval(timer);
    };
  }, [book, evm, sol]);

  return (
    <div className="ticket">
      <p className="text-sm font-medium text-cyan">Wallet balances</p>
      <p className="mt-2 break-all text-sm">{evm}</p>
      {sol ? <p className="mt-1 break-all text-sm text-muted">Solana {sol}</p> : null}
      <ul className="mt-3 divide-y divide-line border-y border-line">
        {HOLDINGS.map((row) => {
          const raw = native[row.id];
          const text = failed[row.id]
            ? "Couldn't read"
            : raw == null
              ? "…"
              : `${formatUnits(BigInt(raw), CHAINS[row.id].nativeDecimals, 8)} ${row.id === "solana" ? "SOL" : CHAINS[row.id].native}`;
          return (
            <li key={row.id} className="flex items-center justify-between gap-3 py-2 text-sm">
              <span>{row.coin}</span>
              <span className="tabular-nums font-semibold">{text}</span>
            </li>
          );
        })}
        {tokens.map((row) => (
          <li key={`${row.chain}:${row.symbol}`} className="flex items-center justify-between gap-3 py-2 text-sm">
            <span>
              {row.symbol} on {CHAINS[row.chain as LiveChainId]?.label ?? row.chain}
            </span>
            <span className="tabular-nums font-semibold">{formatSmart(BigInt(row.raw), 18)}</span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-muted">
        Read from the chain every few seconds. Base ETH is not Ethereum ETH. SOL is a different address. A zero means nothing has arrived there yet.
      </p>
    </div>
  );
}