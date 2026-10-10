import { Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useAccountWallets } from "@/lib/factory/wallet-bridge";
import { tonWalletAddress } from "@/lib/factory/ton-address";
import { FUND_CODES, moonpayUrl } from "@/lib/factory/moonpay";
import {
  FUND_CHAINS,
  addressFits,
  fundTicker,
  moonpaySellLink,
  type FundChain,
  type FundKind,
} from "@/lib/factory/onramp";
import { track } from "@/lib/factory/analytics";
import { cn } from "@/lib/cn";
import { tr } from "@/lib/i18n";

const WARN = "On the MoonPay page the receive address must match this address. If it says MoonPay wallet, change it or cancel.";
const BASE_NOTE = "Buy ETH on Base (eth_base) to your address, then use the Ferzan Bridge to move it to Sonic/Ink.";
const SELL_NONE = "Bridge to Base, Ethereum or Solana first, then cash out there.";
const OFF = "Not available yet";

/** Card chains MoonPay can actually fund from this site, plus bridge-only and off chains. */
const SHOWN = FUND_CHAINS.filter((row) => row.mode !== "card" || Boolean(FUND_CODES[row.id]));

const EVM_CHAIN_ID: Record<number, string> = {
  1: "ethereum",
  56: "bsc",
  8453: "base",
  42161: "arbitrum",
  10: "optimism",
  137: "polygon",
  43114: "avalanche",
  4663: "robinhood",
  5042: "arc",
  59144: "linea",
  146: "sonic",
  999: "hyperevm",
  369: "pulsechain",
};

function connectedAddress(kind: FundKind, evm: string | null, sol: string | null, tron: string | null, ton: string | null): string {
  if (kind === "evm") return evm ?? "";
  if (kind === "solana") return sol ?? "";
  if (kind === "tron") return tron ?? "";
  if (!ton) return "";
  const uq = tonWalletAddress(ton);
  return uq.startsWith("UQ") ? uq : "";
}

/** Chain of a wallet that is already connected. Does not open a wallet prompt. Solana if none is. */
async function connectedChain(): Promise<string> {
  const eth = (window as unknown as { ethereum?: { request?: (args: { method: string }) => Promise<unknown> } }).ethereum;
  if (eth?.request) {
    try {
      const accounts = await eth.request({ method: "eth_accounts" });
      if (Array.isArray(accounts) && accounts.length > 0) {
        const hex = await eth.request({ method: "eth_chainId" });
        const id = typeof hex === "string" ? Number.parseInt(hex, 16) : 0;
        const match = EVM_CHAIN_ID[id];
        if (match && SHOWN.some((row) => row.id === match)) return match;
        return "ethereum";
      }
    } catch {
      /* No extension, or it refused a silent read. Stay on Solana. */
    }
  }
  return "solana";
}

function Chip({ on, children, onClick }: { on: boolean; children: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        "min-h-11 shrink-0 rounded-lg border-2 px-3 text-sm font-semibold",
        on ? "border-cyan bg-cyan text-cyan-ink" : "border-transparent bg-bg text-fg shadow-border",
      )}
    >
      {children}
    </button>
  );
}

/** Add funds and cash out. Buy links come from the server (signed when a MoonPay key is set, otherwise keyless). */
export function FundsDesk() {
  const account = useAccountWallets();
  const [chainId, setChainId] = useState("solana");
  const chain = SHOWN.find((row) => row.id === chainId) ?? SHOWN[0];
  const [address, setAddress] = useState("");
  const [kind, setKind] = useState<FundKind>(chain.kind);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState("");
  const [note, setNote] = useState("");
  const edited = useRef(false);
  const chose = useRef(false);
  const chips = useRef<HTMLDivElement>(null);

  const evm = account?.evmAddress ?? null;
  const sol = account?.solAddress ?? null;
  const tron = account?.tronAddress ?? null;
  const ton = account?.tonAddress ?? null;
  const signedIn = account?.authenticated === true;

  useEffect(() => {
    if (!signedIn || edited.current) return;
    const next = connectedAddress(kind, evm, sol, tron, ton);
    if (next) setAddress(next);
  }, [signedIn, kind, evm, sol, tron, ton]);

  useEffect(() => {
    if (chose.current || !account?.ready) return;
    let cancel = false;
    void connectedChain().then((id) => {
      if (cancel || chose.current) return;
      chose.current = true;
      const row = SHOWN.find((item) => item.id === id) ?? SHOWN[0];
      setChainId(row.id);
      setKind(row.kind);
      if (signedIn && !edited.current) setAddress(connectedAddress(row.kind, evm, sol, tron, ton));
    });
    return () => {
      cancel = true;
    };
  }, [account?.ready, signedIn, evm, sol, tron, ton]);

  useEffect(() => {
    const root = chips.current;
    const el = root?.querySelector<HTMLElement>("[aria-pressed=true]");
    if (!root || !el) return;
    root.scrollTo({ left: Math.max(0, el.offsetLeft - root.clientWidth / 2 + el.clientWidth / 2) });
  }, [chain.id]);

  useEffect(() => {
    if (kind !== "ton") return;
    const raw = address.trim();
    if (!raw) return;
    const uq = tonWalletAddress(raw);
    if (uq.startsWith("UQ")) {
      if (uq !== address) setAddress(uq);
      return;
    }
    if (/^EQ[A-Za-z0-9_-]{46}$/.test(raw)) setAddress("");
  }, [kind, address]);

  function pick(next: FundChain) {
    chose.current = true;
    setChainId(next.id);
    setNote("");
    setBusy("");
    if (next.kind !== kind) {
      setKind(next.kind);
      edited.current = false;
      setAddress(signedIn ? connectedAddress(next.kind, evm, sol, tron, ton) : "");
    }
  }

  const shown = address.trim();
  const ok = chain.mode !== "off" && addressFits(chain.kind, shown);
  const payChain = chain.mode === "base" ? "base" : chain.id;

  async function openBuy(code: string) {
    if (!ok || !FUND_CODES[payChain]?.includes(code)) return;
    track("add_funds_clicked");
    setBusy(code);
    setNote("");
    try {
      const res = await moonpayUrl({ data: { chain: payChain, address: shown, code } });
      const popup = window.open(res.url, "_blank", "noopener,noreferrer");
      if (!popup) setNote(tr("Allow pop-ups, then press the button again."));
    } catch (err) {
      setNote(err instanceof Error ? err.message : tr("Could not open card checkout."));
    } finally {
      setBusy("");
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(shown);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <section className="ticket fz-panel">
        <p className="fz-eyebrow">{tr("Wallet")}</p>
        <h1 className="mt-2 text-3xl font-extrabold">{tr("Add funds")}</h1>
        <p className="mt-2 text-sm text-muted">
          {tr("Card, Apple Pay, or Google Pay. MoonPay takes the payment. This site never sees your card details.")}
        </p>
        <div ref={chips} className="mt-4 flex gap-2 overflow-x-auto pb-1">
          {SHOWN.map((row) => (
            <Chip key={row.id} on={row.id === chain.id} onClick={() => pick(row)}>
              {tr(row.label)}
            </Chip>
          ))}
        </div>

        {chain.mode === "off" ? <p className="mt-4 text-sm text-muted">{tr(OFF)}</p> : null}

        {chain.mode !== "off" ? (
          <div className="mt-4">
            <p className="text-sm font-semibold">{tr("Receive address")}</p>
            <p className="mt-1 text-xs text-muted">{tr("Paste the address that should receive the crypto")}</p>
            <textarea
              value={address}
              onChange={(e) => {
                edited.current = true;
                setAddress(e.target.value);
              }}
              rows={2}
              spellCheck={false}
              className="fz-ca mt-2 font-mono text-sm"
              aria-label={tr("Receive address")}
            />
            <button type="button" className="btn-line mt-2" disabled={!shown} onClick={() => void copy()}>
              {copied ? tr("Copied") : tr("Copy address")}
            </button>
            {shown && !ok ? <p className="mt-2 text-sm text-sell">{tr("That address does not match this chain.")}</p> : null}
            <p className="mt-3 text-sm text-sell">{tr(WARN)}</p>
          </div>
        ) : null}

        {chain.mode === "card" && chain.buy.length > 0 ? (
          <div className="mt-4">
            <p className="text-sm font-semibold text-cyan">{tr("Buying on {0}", tr(chain.label))}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {chain.buy.map((code) => (
                <button key={code} type="button" className="btn-cyan" disabled={!ok || Boolean(busy)} onClick={() => void openBuy(code)}>
                  {busy === code ? tr("Opening") : tr("Buy {0}", fundTicker(code))}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {chain.mode === "base" ? (
          <div className="mt-4 space-y-3">
            <p className="text-sm font-semibold text-cyan">{tr("Buying on {0}", tr(chain.label))}</p>
            <p className="text-sm text-muted">{tr(BASE_NOTE)}</p>
            <button type="button" className="btn-cyan" disabled={!ok || Boolean(busy)} onClick={() => void openBuy("eth_base")}>
              {busy === "eth_base" ? tr("Opening") : tr("Buy {0}", "ETH")}
            </button>
            <Link to="/bridge" className="btn-line">
              {tr("Open the Ferzan Bridge")}
            </Link>
          </div>
        ) : null}
        {note ? <p className="mt-3 text-sm text-sell">{tr(note)}</p> : null}
      </section>

      <section className="ticket fz-panel">
        <h2 className="text-2xl font-extrabold">{tr("Cash out")}</h2>
        {chain.mode === "off" ? <p className="mt-2 text-sm text-muted">{tr(OFF)}</p> : null}
        {chain.mode !== "off" && chain.sell && chain.sell.length > 0 ? (
          <div className="mt-3">
            <p className="text-sm text-muted">
              {tr("You send from your own wallet to the address MoonPay shows. This site does not hold the sale.")}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {chain.sell.map((code) => (
                <a key={code} className="btn-line" href={moonpaySellLink(code)} target="_blank" rel="noopener noreferrer" onClick={() => track("cash_out_clicked")}>
                  {tr("Cash out {0}", fundTicker(code))}
                </a>
              ))}
            </div>
          </div>
        ) : null}
        {chain.mode !== "off" && !chain.sell ? (
          <p className="mt-2 text-sm text-muted">
            {tr(SELL_NONE)}{" "}
            <Link to="/bridge" className="font-semibold text-cyan">
              {tr("Open the Ferzan Bridge")}
            </Link>
          </p>
        ) : null}
      </section>
    </div>
  );
}
