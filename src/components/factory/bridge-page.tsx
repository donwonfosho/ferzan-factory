import { useState } from "react";
import { BRIDGE_FEE_BPS, BRIDGE_META, BRIDGE_SOURCES, type BridgeChain } from "@/lib/factory/bridge-buy";
import { cn } from "@/lib/cn";
import { tr } from "@/lib/i18n";
import { useBridgeFlow } from "./bridge-buy-panel";
import { Button, TextInput } from "./ui";

const ALL_CHAINS = Object.keys(BRIDGE_META) as BridgeChain[];

function ChainPicker({ value, options, onPick }: { value: BridgeChain; options: BridgeChain[]; onPick: (c: BridgeChain) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((c) => (
        <button key={c} type="button" className={cn("min-h-9 px-3 text-sm", value === c ? "btn-cyan" : "btn-line")} onClick={() => onPick(c)}>
          {BRIDGE_META[c].label}
        </button>
      ))}
    </div>
  );
}

/** Move funds from one chain to your own wallet on another chain, without buying a coin. */
export function BridgePage() {
  const [src, setSrc] = useState<BridgeChain>(BRIDGE_SOURCES[0]);
  const [dest, setDest] = useState<BridgeChain>("solana");
  const [copied, setCopied] = useState("");
  const flow = useBridgeFlow(src, dest, undefined, true);
  const { meta, dmeta, quote } = flow;

  function pickSrc(c: BridgeChain) {
    setSrc(c);
    if (c === dest) setDest(ALL_CHAINS.find((x) => x !== c) ?? dest);
    flow.reset();
  }
  function pickDest(c: BridgeChain) {
    setDest(c);
    flow.reset();
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(text);
      window.setTimeout(() => setCopied(""), 2000);
    } catch {
      setCopied("");
    }
  }

  return (
    <div className="space-y-4">
      <div className="fz-panel p-5 fz-rise">
        <p className="fz-eyebrow">{tr("Bridge")}</p>
        <h1 className="mt-1 text-2xl font-extrabold">{tr("Move funds between chains")}</h1>
        <p className="mt-2 text-sm text-muted">
          {tr("Bridging is two steps: get a quote, then approve it in your wallet. Your funds land in your own wallet on the destination chain, not with Ferzan.")}
        </p>
      </div>

      <form onSubmit={(e) => void flow.getQuote(e)} className="grid gap-4 md:grid-cols-2">
        <div className="fz-panel space-y-3 p-5">
          <p className="fz-eyebrow">{tr("From")}</p>
          <ChainPicker value={src} options={BRIDGE_SOURCES} onPick={pickSrc} />
          <p className="fz-eyebrow pt-2">{tr("To")}</p>
          <ChainPicker value={dest} options={ALL_CHAINS.filter((c) => c !== src)} onPick={pickDest} />
        </div>

        <div className="fz-stat fz-stat-key space-y-3 p-5">
          <p className="fz-eyebrow">{tr("Amount")}</p>
          <TextInput value={flow.amount} onChange={(e) => flow.setAmount(e.target.value)} inputMode="decimal" placeholder={tr("{0} to send", meta.sym)} />
          <p className="text-xs text-muted">{tr("The smallest bridge from here is {0} {1}.", String(meta.min), meta.sym)}</p>
          {dest === "tron" ? <p className="text-xs text-muted">{tr("Bridges into Tron need about $20 or more.")}</p> : null}
          <p className="text-xs text-muted">{tr("Ferzan bridge fee: {0}% of the amount sent. It is shown again in your quote before you confirm.", BRIDGE_FEE_BPS / 100)}</p>

          {quote ? (
            <div className="space-y-2">
              <p className="text-sm">
                {quote.q.outText ? tr("You receive about {0} on {1}.", quote.q.outText, dmeta.label) : tr("Route found.")}{" "}
                <span className="text-muted">{quote.q.via === "relay" ? "Relay" : "deBridge"}</span>
              </p>
              {quote.q.feeText ? <p className="text-sm">{tr(quote.q.feeText)}</p> : null}
              <div className="min-w-0">
                <p className="fz-eyebrow">{tr("Your {0} wallet", dmeta.label)}</p>
                <div className="mt-1 flex flex-col gap-2 sm:flex-row sm:items-stretch">
                  <span className="fz-ca min-w-0 flex-1">{quote.recipient}</span>
                  <button type="button" className="btn-line min-h-11 shrink-0" onClick={() => void copy(quote.recipient)}>
                    {copied === quote.recipient ? tr("Copied") : tr("Copy address")}
                  </button>
                </div>
              </div>
              <Button type="button" className="w-full" disabled={Boolean(flow.busy)} onClick={() => void flow.send()}>
                {tr("Confirm and approve in wallet")}
              </Button>
            </div>
          ) : (
            <Button type="submit" className="w-full" disabled={Boolean(flow.busy)}>
              {tr("Get a quote")}
            </Button>
          )}
          {flow.error ? <p className="text-sm text-sell">{flow.error}</p> : null}
          {flow.busy ? <p className="text-sm text-cyan">{flow.busy}</p> : null}
          {flow.note ? <p className="text-sm text-cyan">{flow.note}</p> : null}
        </div>
      </form>
    </div>
  );
}
