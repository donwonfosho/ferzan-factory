import { useEffect, useState } from "react";
import { CHAINS, TREASURY } from "@/lib/factory/catalog";
import { listBoosts, previewBoost, setBoostPayer, submitBoost, type BoostQuote, type BoostView } from "@/lib/factory/boosts";
import { evmWallet, solanaWallet } from "@/lib/factory/wallet-bridge";
import type { ChainId } from "@/lib/factory/types";
import { tr } from "@/lib/i18n";

const BOOST_CHAINS = ["base", "ethereum", "bsc", "solana", "robinhood", "arc"] as const;
type BoostChain = (typeof BOOST_CHAINS)[number];
const TIERS = [
  { hours: 6, usd: 10 },
  { hours: 24, usd: 30 },
  { hours: 72, usd: 75 },
] as const;

const EXPLORER: Record<string, string> = {
  ethereum: "https://etherscan.io/tx/",
  base: "https://basescan.org/tx/",
  bsc: "https://bscscan.com/tx/",
  robinhood: "https://robinhoodchain.blockscout.com/tx/",
  arc: "https://explorer.arc.io/tx/",
  solana: "https://solscan.io/tx/",
};

export function txHref(chain: string, hash: string): string {
  return `${EXPLORER[chain] ?? ""}${hash}`;
}

export function BoostList({ rows }: { rows: BoostView[] }) {
  if (rows.length === 0) return <p className="text-sm text-muted">{tr("No promoted coins yet.")}</p>;
  return (
    <ul className="divide-y divide-line">
      {rows.map((row) => (
        <li key={row.txHash} className="flex flex-wrap items-baseline justify-between gap-2 py-3 text-sm">
          <a href={row.path} className="font-semibold text-cyan">
            ${row.symbol || row.name}
          </a>
          <span className="text-muted">
            ${row.usd} · {tr(CHAINS[row.chain as ChainId]?.label) ?? row.chain}
          </span>
          <a className="text-cyan" href={txHref(row.chain, row.txHash)} target="_blank" rel="noopener noreferrer">
            {tr("Transaction")}
          </a>
        </li>
      ))}
    </ul>
  );
}

export function PromoteForm() {
  const [chain, setChain] = useState<BoostChain>("base");
  const [coin, setCoin] = useState("");
  const [hours, setHours] = useState<(typeof TIERS)[number]["hours"]>(6);
  const [quote, setQuote] = useState<BoostQuote | null>(null);
  const [hash, setHash] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const id = coin.trim();
    const ok = chain === "solana" ? /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(id) : /^0x[a-fA-F0-9]{40}$/.test(id);
    if (!ok) {
      setQuote(null);
      return;
    }
    let stop = false;
    previewBoost({ data: { chain, coin: id, hours } })
      .then((next) => {
        if (!stop) {
          setQuote(next);
          setNote("");
        }
      })
      .catch((err) => {
        if (stop) return;
        setQuote(null);
        setNote(err instanceof Error ? err.message : tr("That coin looks wrong."));
      });
    return () => {
      stop = true;
    };
  }, [chain, coin, hours]);

  async function send() {
    if (!quote) return;
    setBusy(true);
    setNote("");
    let sent = hash.trim();
    let sentNow = false;
    let wallet = "";
    try {
      if (!sent) {
        if (chain === "solana") {
          const connected = await solanaWallet();
          wallet = connected.address;
          await setBoostPayer({ data: { quote: quote.quote, chain, payer: wallet } });
          const { solanaRelay } = await import("@/lib/factory/solana");
          const block = (await solanaRelay({ data: { method: "block" } })) as { blockhash?: string };
          if (!block.blockhash) throw new Error(tr("Solana did not return a block."));
          const { PublicKey, SystemProgram, Transaction } = await import("@solana/web3.js");
          const from = new PublicKey(wallet);
          const tx = new Transaction({ recentBlockhash: block.blockhash, feePayer: from });
          tx.add(
            SystemProgram.transfer({
              fromPubkey: from,
              toPubkey: new PublicKey(TREASURY.sol),
              lamports: Number(quote.nativeRaw),
            }),
          );
          sent = await connected.signAndSend(tx.serialize({ requireAllSignatures: false, verifySignatures: false }));
        } else {
          const { address, provider } = await evmWallet(chain);
          wallet = address;
          await setBoostPayer({ data: { quote: quote.quote, chain, payer: wallet } });
          const raw = await provider.request({
            method: "eth_sendTransaction",
            params: [{ from: address, to: TREASURY.evm, value: `0x${BigInt(quote.nativeRaw).toString(16)}` }],
          });
          if (typeof raw !== "string") throw new Error(tr("The wallet did not send it."));
          sent = raw;
        }
        sentNow = true;
        setHash(sent);
      } else {
        wallet = chain === "solana" ? (await solanaWallet()).address : (await evmWallet(chain)).address;
      }
      await submitBoost({ data: { chain, coin: quote.coin, hours, hash: sent, quote: quote.quote, wallet } });
      setNote(tr("Promoted. It shows at the top of Pulse until it ends."));
    } catch (err) {
      const message = err instanceof Error ? err.message : tr("The send failed.");
      setNote(sentNow ? `${tr("Payment sent. Do not send it again.")} ${sent} ${message}` : message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className="ticket space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        void send();
      }}
    >
      <h2 className="text-xl font-extrabold">{tr("Promote a coin")}</h2>
      <p className="text-sm text-muted">
        {tr("Pay the Ferzan treasury from your own wallet. 6 hours is $10, 24 hours is $30, 72 hours is $75. The chain price can move by 5% and still count.")}
      </p>
      <div className="flex flex-wrap gap-1">
        {BOOST_CHAINS.map((id) => (
          <button key={id} type="button" className={chain === id ? "chip-on min-h-9 px-3 text-xs font-semibold" : "min-h-9 bg-bg px-3 text-xs font-semibold text-muted shadow-border"} onClick={() => setChain(id)}>
            {tr(CHAINS[id].label)}
          </button>
        ))}
      </div>
      <label className="block text-sm text-muted">
        {tr("Coin")}
        <input value={coin} onChange={(e) => setCoin(e.target.value.trim())} placeholder={chain === "solana" ? tr("Mint") : "0x…"} className="mt-1 min-h-11 w-full bg-bg px-3 text-fg shadow-border outline-none" />
      </label>
      <div className="flex flex-wrap gap-1">
        {TIERS.map((tier) => (
          <button key={tier.hours} type="button" className={hours === tier.hours ? "chip-on min-h-9 px-3 text-xs font-semibold" : "min-h-9 bg-bg px-3 text-xs font-semibold text-muted shadow-border"} onClick={() => setHours(tier.hours)}>
            {tr("{0} hours · ${1}", tier.hours, tier.usd)}
          </button>
        ))}
      </div>
      <p className="text-sm">
        {quote
          ? tr("Send {0} {1} to the treasury.", quote.nativeText, quote.nativeSymbol)
          : tr("Not available")}
      </p>
      <label className="block text-sm text-muted">
        {tr("Transaction hash, if you already sent it")}
        <input value={hash} onChange={(e) => setHash(e.target.value.trim())} className="mt-1 min-h-11 w-full bg-bg px-3 text-fg shadow-border outline-none" />
      </label>
      <button type="submit" className="btn-cyan min-h-11 px-4" disabled={busy || !quote}>
        {busy ? tr("Sending") : hash ? tr("Submit transaction") : tr("Send from my wallet")}
      </button>
      {note ? <p className="break-all text-sm text-muted">{note}</p> : null}
    </form>
  );
}

export function PromotedPage() {
  const [rows, setRows] = useState<BoostView[] | null>(null);
  useEffect(() => {
    let stop = false;
    listBoosts()
      .then((next) => {
        if (!stop) setRows(next);
      })
      .catch(() => {
        if (!stop) setRows([]);
      });
    return () => {
      stop = true;
    };
  }, []);
  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div>
        <h1 className="text-4xl">{tr("Promoted")}</h1>
        <p className="mt-2 text-sm text-muted">{tr("Every paid placement, with the transaction. Nothing is hidden.")}</p>
      </div>
      <PromoteForm />
      {rows === null ? <p className="text-sm text-muted">{tr("Loading…")}</p> : <BoostList rows={rows} />}
    </div>
  );
}
