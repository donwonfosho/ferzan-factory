import { useEffect, useRef, useState } from "react";
import { BRIDGE_META, BRIDGE_SOURCES, getBridgeQuote, getTronSun, type BridgeChain, type BridgeQuote } from "@/lib/factory/bridge-buy";
import { siteBalance } from "@/lib/factory/site-wallet";
import { solBalance } from "@/lib/factory/solana";
import { tronWallet } from "@/lib/factory/tron-ton-wallets";
import { formatSmart, parseDecimal } from "@/lib/factory/units";
import { evmWallet, solanaWallet } from "@/lib/factory/wallet-bridge";
import type { EvmChainId } from "@/lib/factory/deploy";
import { cn } from "@/lib/cn";
import { Button, TextInput } from "./ui";

import { tr } from "@/lib/i18n";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const hexToBytes = (hex: string) => Uint8Array.from((hex.match(/.{1,2}/g) ?? []).map((b) => parseInt(b, 16)));

async function balanceOf(chain: BridgeChain, address: string): Promise<bigint> {
  if (chain === "solana") return solBalance(address);
  if (chain === "tron") return BigInt((await getTronSun({ data: { address } })).sun);
  return siteBalance(chain as EvmChainId, address);
}

async function sourceWallet(chain: BridgeChain): Promise<string> {
  if (chain === "solana") return (await solanaWallet()).address;
  return (await evmWallet(chain as EvmChainId)).address;
}

async function destWallet(dest: BridgeChain, srcAddress: string, src: BridgeChain): Promise<string> {
  if (dest === "solana") return (await solanaWallet()).address;
  if (dest === "tron") return (await tronWallet()).address;
  if (src !== "solana") return srcAddress; // one EVM address works on every EVM chain
  return (await evmWallet(dest as EvmChainId)).address;
}

/**
 * Pay for a coin with the coin you hold on another chain. Step 1 bridges to your own wallet on this coin's chain,
 * step 2 is the normal Buy box on this page. Nothing is held by Ferzan; your wallet signs the bridge.
 */
export function BridgeBuy({ dest, onArrived }: { dest: BridgeChain; onArrived?: () => void }) {
  const sources = BRIDGE_SOURCES.filter((s) => s !== dest);
  const [src, setSrc] = useState<BridgeChain>(sources[0]);
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [quote, setQuote] = useState<{ q: BridgeQuote; sender: string; recipient: string; raw: bigint } | null>(null);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const meta = BRIDGE_META[src];
  const dmeta = BRIDGE_META[dest];

  async function getQuote(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setNote("");
    setQuote(null);
    try {
      const raw = parseDecimal(amount, meta.dec);
      if (!raw || raw <= 0n) throw new Error(tr("Type how much {0} to send.", meta.sym));
      if (Number(amount) < meta.min) throw new Error(tr("The smallest bridge from here is {0} {1}.", String(meta.min), meta.sym));
      setBusy(tr("Connect your wallet."));
      const sender = await sourceWallet(src);
      const recipient = await destWallet(dest, sender, src);
      setBusy(tr("Finding the best route."));
      const q = await getBridgeQuote({ data: { from: src, to: dest, amount: raw.toString(), sender, recipient } });
      setQuote({ q, sender, recipient, raw });
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message.split("\n")[0] : tr("No route for that right now. Try another chain or a different size."));
    } finally {
      setBusy("");
    }
  }

  async function send() {
    if (!quote) return;
    setError("");
    setNote("");
    try {
      const before = await balanceOf(dest, quote.recipient).catch(() => 0n);
      setBusy(tr("Approve the bridge in your wallet."));
      if (src === "solana") {
        const w = await solanaWallet();
        await w.signAndSend(hexToBytes(quote.q.solHex));
      } else {
        const w = await evmWallet(src as EvmChainId); // switches to the source chain again in case it changed
        for (const t of quote.q.evm) {
          await w.provider.request({
            method: "eth_sendTransaction",
            params: [{ from: quote.sender, to: t.to, data: t.data, value: "0x" + BigInt(t.value).toString(16) }],
          });
        }
      }
      setQuote(null);
      setAmount("");
      setBusy(tr("Sent. Waiting for the coins to arrive on {0}. This usually takes under two minutes and can take up to seven.", dmeta.label));
      const want = quote.q.outRaw !== "0" ? (BigInt(quote.q.outRaw) * 6n) / 10n : 1n; // at least 60% of the quote (fees can move it)
      for (let i = 0; i < 70 && alive.current; i += 1) {
        await sleep(6000);
        const now = await balanceOf(dest, quote.recipient).catch(() => before);
        if (now - before >= want) {
          setNote(tr("Arrived: +{0} {1} on {2}. Now use the Buy box on this page.", formatSmart(now - before, dmeta.dec), dmeta.sym, dmeta.label));
          onArrived?.();
          return;
        }
      }
      if (alive.current) setNote(tr("Not there yet. Bridges can be slow; check your wallet on {0} in a few minutes. Your funds are safe with the bridge.", dmeta.label));
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      setError(/declin|reject|denied|cancel|4001/i.test(msg) ? tr("You cancelled in the wallet.") : msg.split("\n")[0] || tr("The bridge did not go through."));
    } finally {
      setBusy("");
    }
  }

  return (
    <details className="ticket">
      <summary className="cursor-pointer font-semibold">{tr("Pay with a coin from another chain")}</summary>
      <form onSubmit={(e) => void getQuote(e)} className="mt-3 space-y-3">
        <p className="text-xs text-muted">
          {tr("Step 1: bridge to your own wallet on {0}. Step 2: buy here with the normal Buy box. Bridge buys take a little longer than a normal buy.", dmeta.label)}
        </p>
        <div className="flex flex-wrap gap-2">
          {sources.map((s) => (
            <button
              key={s}
              type="button"
              className={cn("min-h-9 px-3 text-sm", src === s ? "btn-cyan" : "btn-line")}
              onClick={() => {
                setSrc(s);
                setQuote(null);
                setError("");
              }}
            >
              {BRIDGE_META[s].label}
            </button>
          ))}
        </div>
        <TextInput value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder={tr("{0} to send", meta.sym)} />
        {dest === "tron" ? <p className="text-xs text-muted">{tr("Bridges into Tron need about $20 or more.")}</p> : null}
        {quote ? (
          <div className="space-y-2">
            <p className="text-sm">
              {quote.q.outText ? tr("You receive about {0} on {1}.", quote.q.outText, dmeta.label) : tr("Route found.")}{" "}
              <span className="text-muted">{quote.q.via === "relay" ? "Relay" : "deBridge"}</span>
            </p>
            <Button type="button" className="w-full" disabled={Boolean(busy)} onClick={() => void send()}>
              {tr("Approve in wallet")}
            </Button>
          </div>
        ) : (
          <Button type="submit" className="w-full" disabled={Boolean(busy)}>
            {tr("Get a quote")}
          </Button>
        )}
        {error ? <p className="text-sm text-sell">{error}</p> : null}
        {busy ? <p className="text-sm text-cyan">{busy}</p> : null}
        {note ? <p className="text-sm text-cyan">{note}</p> : null}
      </form>
    </details>
  );
}
