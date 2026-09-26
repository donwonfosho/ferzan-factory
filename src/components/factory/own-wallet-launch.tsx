import { useState } from "react";
import { Transaction, VersionedTransaction } from "@solana/web3.js";
import { CHAINS } from "@/lib/factory/catalog";
import {
  BOT_LAUNCH_CHAINS,
  GRAD_PRESETS,
  finishBotLaunch,
  sendBotLaunchSol,
  startBotLaunch,
  type BotLaunchChain,
  type EvmLaunchTx,
  type SolanaLaunchTx,
} from "@/lib/factory/bot-launch";
import { explorerTx, provider, switchChain, type EvmChainId } from "@/lib/factory/deploy";
import { getReceipt } from "@/lib/factory/relay";
import { solanaExplorerTx } from "@/lib/factory/solana";
import { formatSmart } from "@/lib/factory/units";
import { termsAccepted } from "@/lib/factory/terms";
import { cn } from "@/lib/cn";
import { ChainMark } from "./chain-mark";
import { ProjectPicture } from "./launch-form";
import { TermsGate } from "./terms";
import { Button, Label, TextInput } from "./ui";

type SolProvider = {
  publicKey?: { toString(): string } | null;
  connect: () => Promise<{ publicKey: { toString(): string } }>;
  signAndSendTransaction?: (tx: Transaction | VersionedTransaction) => Promise<{ signature: string }>;
  signTransaction?: (tx: Transaction | VersionedTransaction) => Promise<Transaction | VersionedTransaction>;
};

function solProvider(): SolProvider | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { phantom?: { solana?: SolProvider }; solana?: SolProvider };
  return w.phantom?.solana ?? w.solana ?? null;
}

function bytesFromHex(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i += 1) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function base64(bytes: Uint8Array): string {
  let text = "";
  for (const b of bytes) text += String.fromCharCode(b);
  return btoa(text);
}

/** Opens this page inside the wallet app's browser on phones with no extension. */
function walletAppLinks(): { metamask: string; phantom: string } {
  const here = typeof window === "undefined" ? "" : window.location.href;
  const host = here.replace(/^https?:\/\//, "");
  return {
    metamask: `https://metamask.app.link/dapp/${host}`,
    phantom: `https://phantom.app/ul/browse/${encodeURIComponent(here)}?ref=${encodeURIComponent(
      typeof window === "undefined" ? "" : window.location.origin,
    )}`,
  };
}

type Launched = { chain: BotLaunchChain; name: string; symbol: string; token: string; curve: string; url: string; hash: string };

export function OwnWalletLaunch() {
  const [chain, setChain] = useState<BotLaunchChain>("base");
  const [wallet, setWallet] = useState("");
  const [image, setImage] = useState("");
  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [description, setDescription] = useState("");
  const [grad, setGrad] = useState(GRAD_PRESETS.base[1]);
  const [devBuy, setDevBuy] = useState("");
  const [maxBuy, setMaxBuy] = useState("");
  const [startMinutes, setStartMinutes] = useState("0");
  const [website, setWebsite] = useState("");
  const [xHandle, setXHandle] = useState("");
  const [telegram, setTelegram] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [hash, setHash] = useState("");
  const [needTerms, setNeedTerms] = useState(false);
  const [launched, setLaunched] = useState<Launched | null>(null);

  const evm = chain !== "solana";
  const meta = CHAINS[chain];

  function pickChain(next: BotLaunchChain) {
    setChain(next);
    setWallet("");
    if (next !== "solana") setGrad(GRAD_PRESETS[next][1]);
  }

  async function connect(): Promise<string> {
    if (evm) {
      const eth = provider();
      if (!eth) throw new Error("NO_WALLET");
      await switchChain(eth, chain as EvmChainId);
      const accounts = (await eth.request({ method: "eth_requestAccounts" })) as string[];
      const account = accounts?.[0];
      if (!account) throw new Error("The wallet returned no account.");
      setWallet(account);
      return account;
    }
    const sol = solProvider();
    if (!sol) throw new Error("NO_WALLET");
    const res = await sol.connect();
    const account = res.publicKey.toString();
    setWallet(account);
    return account;
  }

  async function waitEvm(hashValue: string): Promise<void> {
    for (let i = 0; i < 72; i += 1) {
      const receipt = await getReceipt({ data: { chain: chain as EvmChainId, hash: hashValue } }).catch(() => null);
      if (receipt) {
        if (receipt.status !== "0x1") throw new Error("The launch failed on chain. Nothing was created.");
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 2500));
    }
    throw new Error("Still confirming after 3 minutes. Check the transaction before you try again.");
  }

  async function signEvm(built: EvmLaunchTx, from: string): Promise<string> {
    const eth = provider();
    if (!eth) throw new Error("NO_WALLET");
    await switchChain(eth, chain as EvmChainId);
    const sent = await eth.request({
      method: "eth_sendTransaction",
      params: [{ from, to: built.to, data: built.data, value: "0x" + BigInt(built.value).toString(16), gas: "0x" + BigInt(built.gas).toString(16) }],
    });
    if (typeof sent !== "string") throw new Error("The wallet did not send the launch.");
    setHash(sent);
    setBusy("Sent. Waiting for the chain to confirm.");
    await waitEvm(sent);
    return sent;
  }

  async function signSolana(built: SolanaLaunchTx): Promise<string> {
    const sol = solProvider();
    if (!sol) throw new Error("NO_WALLET");
    const bytes = bytesFromHex(built.txHex);
    let tx: Transaction | VersionedTransaction;
    try {
      tx = Transaction.from(bytes);
    } catch {
      tx = VersionedTransaction.deserialize(bytes);
    }
    if (sol.signAndSendTransaction) {
      const { signature } = await sol.signAndSendTransaction(tx);
      setHash(signature);
      return signature;
    }
    if (!sol.signTransaction) throw new Error("This wallet cannot sign Solana transactions.");
    const signed = await sol.signTransaction(tx);
    const raw = signed instanceof VersionedTransaction ? signed.serialize() : signed.serialize();
    const { signature } = await sendBotLaunchSol({ data: { requestId: built.requestId, signedB64: base64(raw) } });
    setHash(signature);
    return signature;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setHash("");
    if (!termsAccepted()) {
      setNeedTerms(true);
      return;
    }
    const cleanName = name.trim();
    const cleanSymbol = symbol.trim().toUpperCase();
    if (cleanName.length < 2 || cleanName.length > 32) return setError("Name needs 2–32 characters.");
    if (!/^[A-Z0-9]{2,10}$/.test(cleanSymbol)) return setError("Ticker is 2–10 letters or numbers.");
    if (evm && !(Number(grad) > 0)) return setError(`Pick how much ${meta.native} the curve collects before it graduates.`);
    if (evm && Number(startMinutes) > 0 && Number(devBuy) > 0) {
      return setError("A first buy needs trading to open right away. Clear the delay or the first buy.");
    }
    try {
      setBusy("Connect your wallet.");
      const account = wallet || (await connect());
      setBusy("Preparing the launch.");
      const built = await startBotLaunch({
        data: {
          chain,
          wallet: account,
          name: cleanName,
          symbol: cleanSymbol,
          description: description.trim(),
          image,
          gradNative: evm ? grad.trim() : "",
          devBuy: devBuy.trim() || "0",
          maxBuy: evm ? maxBuy.trim() || "0" : "0",
          startMinutes: evm ? startMinutes.trim() || "0" : "0",
          website: website.trim(),
          x: xHandle.trim(),
          telegram: telegram.trim(),
        },
      });
      let txHash: string;
      let mint = "";
      if (built.kind === "evm") {
        const fee = BigInt(built.launchFeeWei);
        const dev = BigInt(built.devBuyWei);
        setBusy(
          `Approve in your wallet: ${formatSmart(fee, 18)} ${meta.native} launch fee` +
            (dev > 0n ? ` + ${formatSmart(dev, 18)} ${meta.native} first buy` : "") +
            " + gas.",
        );
        txHash = await signEvm(built, account);
      } else {
        setBusy(`Approve in your wallet. ${built.costText}`);
        mint = built.mint;
        txHash = await signSolana(built);
        setBusy("Sent. Waiting for Solana to confirm.");
      }
      setBusy("Confirmed. Listing it everywhere.");
      const done = await finishBotLaunch({ data: { requestId: built.requestId, chain, hash: txHash, mint } });
      setLaunched({ chain, name: cleanName, symbol: cleanSymbol, token: done.token, curve: done.curve, url: done.url, hash: txHash });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "The launch did not go through.";
      if (msg === "NO_WALLET") {
        setError(evm ? "No wallet in this browser. Install MetaMask or Rabby, or open this page in the MetaMask app." : "No Solana wallet in this browser. Install Phantom, or open this page in the Phantom app.");
      } else if (/user (rejected|denied)|rejected the request|4001/i.test(msg)) {
        setError("You cancelled in the wallet. Nothing was launched.");
      } else {
        setError(msg);
      }
    } finally {
      setBusy("");
    }
  }

  if (needTerms) return <TermsGate onAccept={() => setNeedTerms(false)} />;

  if (launched) {
    return (
      <div className="ticket mt-6">
        <p className="text-sm font-medium text-cyan">Launched</p>
        <h2 className="mt-2 text-3xl">
          {launched.name} <span className="text-muted">${launched.symbol}</span>
        </h2>
        <p className="mt-3 text-sm text-muted">
          It is live on {CHAINS[launched.chain].label}. The @Ferzan_Launches channel, X and the Telegram bots pick it up like any other launch, and it shows on the floor as soon as the indexer sees it.
        </p>
        <p className="mt-3 break-all text-xs text-muted">Token {launched.token}</p>
        <div className="mt-4 flex flex-wrap gap-3">
          <a className="btn-cyan" href={launched.url} target="_blank" rel="noopener noreferrer">
            Trade it
          </a>
          <a
            className="btn-line"
            href={launched.chain === "solana" ? solanaExplorerTx(launched.hash) : explorerTx(launched.chain as EvmChainId, launched.hash)}
            target="_blank"
            rel="noopener noreferrer"
          >
            View transaction
          </a>
          <button type="button" className="btn-line" onClick={() => setLaunched(null)}>
            Launch another
          </button>
        </div>
      </div>
    );
  }

  const links = walletAppLinks();
  return (
    <form onSubmit={(e) => void submit(e)} className="ticket mt-6 space-y-5">
      <p className="text-sm text-muted">
        Signs with your own wallet: {evm ? "MetaMask, Rabby or any EVM wallet" : "Phantom or any Solana wallet"}. No Telegram needed. The coin goes on the same curves as @Ferzan_Launch_Bot launches.
      </p>
      <ProjectPicture image={image} onChange={setImage} onError={setError} />

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label>Name</Label>
          <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="Forged Rail" required />
        </div>
        <div>
          <Label>Ticker</Label>
          <TextInput value={symbol} onChange={(e) => setSymbol(e.target.value.toUpperCase())} placeholder="FORGE" required />
        </div>
      </div>

      <div>
        <Label>Chain</Label>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          {BOT_LAUNCH_CHAINS.map((id) => (
            <button
              key={id}
              type="button"
              aria-pressed={chain === id}
              onClick={() => pickChain(id)}
              className={cn("min-h-11 px-2 py-3 text-center", chain === id ? "bg-cyan text-cyan-ink" : "bg-bg text-fg shadow-border")}
            >
              <ChainMark id={id} className="mx-auto h-8 w-8" />
              <span className="mt-2 block text-xs font-extrabold">{CHAINS[id].label}</span>
            </button>
          ))}
        </div>
        {chain === "solana" ? (
          <p className="mt-2 text-xs text-muted">Meteora bonding curve: 1,000,000,000 supply, graduates to a locked pool. Supply and graduation are fixed by the Ferzan config.</p>
        ) : null}
      </div>

      <div>
        <Label>Description</Label>
        <TextInput value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional" />
      </div>

      {evm ? (
        <div>
          <Label>Graduates at ({meta.native})</Label>
          <div className="grid grid-cols-3 gap-2">
            {GRAD_PRESETS[chain as Exclude<BotLaunchChain, "solana">].map((p) => (
              <button key={p} type="button" onClick={() => setGrad(p)} className={cn("min-h-11", grad === p ? "btn-cyan" : "btn-line")}>
                {p} {meta.native}
              </button>
            ))}
          </div>
          <TextInput className="mt-2" value={grad} onChange={(e) => setGrad(e.target.value)} inputMode="decimal" />
          <p className="mt-1.5 text-xs text-muted">The curve moves to a DEX pool once it has collected this much. Supply is 1,000,000,000.</p>
        </div>
      ) : null}

      <div>
        <Label>First buy ({meta.native})</Label>
        <TextInput value={devBuy} onChange={(e) => setDevBuy(e.target.value)} placeholder="0 — skip it" inputMode="decimal" />
        <p className="mt-1.5 text-xs text-muted">Optional. It happens in the same transaction, so nobody can buy before you.</p>
      </div>

      {evm ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label>Max buy per wallet ({meta.native})</Label>
            <TextInput value={maxBuy} onChange={(e) => setMaxBuy(e.target.value)} placeholder="0 — no limit" inputMode="decimal" />
          </div>
          <div>
            <Label>Open trading after (minutes)</Label>
            <TextInput value={startMinutes} onChange={(e) => setStartMinutes(e.target.value)} inputMode="numeric" />
          </div>
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <Label>Website</Label>
          <TextInput value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://" />
        </div>
        <div>
          <Label>X</Label>
          <TextInput value={xHandle} onChange={(e) => setXHandle(e.target.value)} placeholder="@handle" />
        </div>
        <div>
          <Label>Telegram</Label>
          <TextInput value={telegram} onChange={(e) => setTelegram(e.target.value)} placeholder="@group" />
        </div>
      </div>

      {wallet ? <p className="break-all text-xs text-muted">Wallet {wallet}</p> : null}
      {error ? <p className="text-sm text-sell">{error}</p> : null}
      {error.startsWith("No ") ? (
        <p className="text-sm">
          <a className="font-semibold text-cyan" href={evm ? links.metamask : links.phantom}>
            Open in the {evm ? "MetaMask" : "Phantom"} app
          </a>
        </p>
      ) : null}
      {busy ? <p className="text-sm text-cyan">{busy}</p> : null}
      {hash && busy ? (
        <a
          className="text-sm text-cyan"
          href={chain === "solana" ? solanaExplorerTx(hash) : explorerTx(chain as EvmChainId, hash)}
          target="_blank"
          rel="noopener noreferrer"
        >
          View transaction
        </a>
      ) : null}
      <Button type="submit" className="w-full" disabled={Boolean(busy)}>
        {wallet ? "Launch" : "Connect wallet and launch"}
      </Button>
    </form>
  );
}
