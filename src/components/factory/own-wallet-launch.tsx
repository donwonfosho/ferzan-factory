import { useState } from "react";
import { WalletNeeded, evmWallet, solanaWallet } from "@/lib/factory/wallet-bridge";
import {
  BOT_LAUNCH_CHAINS,
  GRAD_PRESETS,
  LAUNCH_CHAIN_META,
  finishBotLaunch,
  isPlainLaunch,
  startBotLaunch,
  type BotLaunchChain,
  type CurveLaunchChain,
  type EvmLaunchTx,
  type SolanaLaunchTx,
} from "@/lib/factory/bot-launch";
import { tonWallet, tronLinkAppLink, tronWallet } from "@/lib/factory/tron-ton-wallets";
import { explorerTx, type EvmChainId } from "@/lib/factory/deploy";
import { siteCoinHref } from "@/lib/factory/bot-curve";
import { getReceipt } from "@/lib/factory/relay";
import { solanaExplorerTx } from "@/lib/factory/solana";
import { formatSmart } from "@/lib/factory/units";
import { termsAccepted } from "@/lib/factory/terms";
import { cn } from "@/lib/cn";
import { ChainMark } from "./chain-mark";
import { ProjectPicture } from "./launch-form";
import { TermsGate } from "./terms";
import { Button, Label, TextInput } from "./ui";
import { LaunchPerksNote } from "./perks";

function bytesFromHex(hex: string): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i += 1) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
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

const SUPPLY_PRESETS = [
  { label: "1M", value: "1000000" },
  { label: "100M", value: "100000000" },
  { label: "1B", value: "1000000000" },
  { label: "1T", value: "1000000000000" },
];

/** Where a launch transaction can be looked at, per chain. */
function txLink(chain: BotLaunchChain, hash: string, token = ""): string {
  if (chain === "solana") return solanaExplorerTx(hash);
  if (chain === "tron") return `https://tronscan.org/#/transaction/${hash}`;
  if (chain === "ton") return `https://tonviewer.com/${token || hash}`;
  return explorerTx(chain as EvmChainId, hash);
}

const WALLET_TEXT: Record<BotLaunchChain, string> = {
  solana: "Phantom or any Solana wallet",
  base: "MetaMask, Rabby or any EVM wallet",
  bsc: "MetaMask, Rabby or any EVM wallet",
  ethereum: "MetaMask, Rabby or any EVM wallet",
  robinhood: "MetaMask, Rabby or any EVM wallet",
  arc: "MetaMask, Rabby or any EVM wallet (gas is paid in USDC on Arc)",
  tron: "TronLink",
  ton: "Tonkeeper, Telegram Wallet or any TON Connect wallet",
};

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
  const [supply, setSupply] = useState("1000000000");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [hash, setHash] = useState("");
  const [needTerms, setNeedTerms] = useState(false);
  const [launched, setLaunched] = useState<Launched | null>(null);

  const plain = isPlainLaunch(chain);
  const evm = chain !== "solana" && !plain;
  const meta = LAUNCH_CHAIN_META[chain];

  function pickChain(next: BotLaunchChain) {
    setChain(next);
    setWallet("");
    if (next !== "solana" && !isPlainLaunch(next)) setGrad(GRAD_PRESETS[next as CurveLaunchChain][1]);
  }

  // Signed in -> the account's wallet; otherwise a browser extension; otherwise the sign-in opens.
  async function connect(): Promise<string> {
    const account =
      chain === "tron"
        ? (await tronWallet()).address
        : chain === "ton"
          ? (await tonWallet()).address
          : evm
            ? (await evmWallet(chain as EvmChainId)).address
            : (await solanaWallet()).address;
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
    const { address, provider: eth } = await evmWallet(chain as EvmChainId);
    if (address.toLowerCase() !== from.toLowerCase()) throw new Error("The wallet changed. Press Launch again.");
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
    const { signAndSend } = await solanaWallet();
    const signature = await signAndSend(bytesFromHex(built.txHex));
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
    if (plain && !/^[1-9]\d{0,12}$/.test(supply.trim())) return setError("Supply is a whole number between 1 and 1,000,000,000,000.");
    if (evm && Number(startMinutes) > 0 && Number(devBuy) > 0) {
      return setError("A first buy needs trading to open right away. Clear the delay or the first buy.");
    }
    try {
      setBusy("Connect your wallet.");
      const account = await connect();
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
          devBuy: plain ? "0" : devBuy.trim() || "0",
          maxBuy: evm ? maxBuy.trim() || "0" : "0",
          startMinutes: evm ? startMinutes.trim() || "0" : "0",
          website: website.trim(),
          x: xHandle.trim(),
          telegram: telegram.trim(),
          supplyWhole: plain ? supply.trim() : "1000000000",
        },
      });
      let txHash: string;
      let mint = "";
      if (built.kind === "tron") {
        setBusy(`Approve in TronLink: ${formatSmart(BigInt(built.feeSun), 6)} TRX launch fee + about 16 TRX of network energy.`);
        const { signAndSend } = await tronWallet();
        txHash = await signAndSend(built.transactionJson);
        setHash(txHash);
        setBusy("Sent. Waiting for Tron to confirm (up to a minute).");
      } else if (built.kind === "ton") {
        setBusy("Approve in your TON wallet: 0.3 TON launch fee + about 0.3 TON for the coin contract (most comes back).");
        const { send } = await tonWallet();
        await send({ validUntil: built.validUntil, network: built.network, messages: built.messages });
        txHash = "ton-connect";
        setBusy("Sent. Waiting for TON to confirm (up to two minutes).");
      } else if (built.kind === "evm") {
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
      setBusy(plain ? "Waiting for the chain to confirm the coin. This can take a minute or two." : "Confirmed. Listing it everywhere.");
      let done: { token: string; curve: string; url: string } | null = null;
      for (let attempt = 0; attempt < (plain ? 4 : 1); attempt += 1) {
        try {
          done = await finishBotLaunch({ data: { requestId: built.requestId, chain, hash: txHash, mint } });
          break;
        } catch (err) {
          const last = attempt === (plain ? 3 : 0);
          const msg = err instanceof Error ? err.message : "";
          if (last || !/not confirmed|has not confirmed|did not answer/i.test(msg)) throw err;
          await new Promise((resolve) => setTimeout(resolve, 10_000));
        }
      }
      if (!done) throw new Error("The launch was sent, but it is not confirmed yet. Check your wallet before trying again.");
      setLaunched({ chain, name: cleanName, symbol: cleanSymbol, token: done.token, curve: done.curve, url: done.url, hash: txHash });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "The launch did not go through.";
      if (err instanceof WalletNeeded) {
        setError(err.message);
      } else if (/user (rejected|denied|rejects)|declined|rejected the request|4001/i.test(msg)) {
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
          It is live on {LAUNCH_CHAIN_META[launched.chain].label}. The @Ferzan_Launches channel, X and the Telegram bots pick it up like any other launch, and it shows on the floor as soon as the indexer sees it.
        </p>
        <p className="mt-3 break-all text-xs text-muted">Token {launched.token}</p>
        <div className="mt-4 flex flex-wrap gap-3">
          <a
            className="btn-cyan"
            href={siteCoinHref(launched.url) ?? launched.url}
            {...(siteCoinHref(launched.url) ? {} : { target: "_blank", rel: "noopener noreferrer" })}
          >
            Trade it
          </a>
          <a
            className="btn-line"
            href={txLink(launched.chain, launched.hash, launched.token)}
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
        Signs with your own wallet: {WALLET_TEXT[chain]}. No Telegram needed.{" "}
        {plain
          ? "A standard coin: the whole supply is minted once to your wallet, with no owner and no way to mint more."
          : "The coin goes on the same curves as @Ferzan_Launch_Bot launches."}
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
        <div className="grid grid-cols-4 gap-2">
          {BOT_LAUNCH_CHAINS.map((id) => (
            <button
              key={id}
              type="button"
              aria-pressed={chain === id}
              onClick={() => pickChain(id)}
              className={cn("min-h-11 px-2 py-3 text-center", chain === id ? "bg-cyan text-cyan-ink" : "bg-bg text-fg shadow-border")}
            >
              <ChainMark id={id} className="mx-auto h-8 w-8" />
              <span className="mt-2 block text-xs font-extrabold">{LAUNCH_CHAIN_META[id].label}</span>
            </button>
          ))}
        </div>
        {chain === "solana" ? (
          <>
            <p className="mt-2 text-xs text-muted">Meteora bonding curve: 1,000,000,000 supply, graduates to a locked pool. Supply and graduation are fixed by the Ferzan config.</p>
            <LaunchPerksNote />
          </>
        ) : null}
        {plain ? (
          <p className="mt-2 text-xs text-muted">
            {chain === "tron"
              ? "Standard TRC-20 coin. Cost: 5 TRX launch fee + about 16 TRX of Tron energy. Open a SunSwap pool afterwards so people can trade it."
              : "Standard TON jetton. Cost: 0.3 TON launch fee + about 0.3 TON for the coin contract (most of it comes back)."}
          </p>
        ) : null}
      </div>

      {plain ? (
        <div>
          <Label>Supply</Label>
          <div className="grid grid-cols-4 gap-2">
            {SUPPLY_PRESETS.map((p) => (
              <button key={p.value} type="button" onClick={() => setSupply(p.value)} className={cn("min-h-11", supply === p.value ? "btn-cyan" : "btn-line")}>
                {p.label}
              </button>
            ))}
          </div>
          <TextInput className="mt-2" value={supply} onChange={(e) => setSupply(e.target.value.replace(/[^0-9]/g, ""))} inputMode="numeric" />
          <p className="mt-1.5 text-xs text-muted">All of it goes to your wallet at launch.</p>
        </div>
      ) : null}

      <div>
        <Label>Description</Label>
        <TextInput value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional" />
      </div>

      {evm ? (
        <div>
          <Label>Graduates at ({meta.native})</Label>
          <div className="grid grid-cols-3 gap-2">
            {GRAD_PRESETS[chain as CurveLaunchChain].map((p) => (
              <button key={p} type="button" onClick={() => setGrad(p)} className={cn("min-h-11", grad === p ? "btn-cyan" : "btn-line")}>
                {p} {meta.native}
              </button>
            ))}
          </div>
          <TextInput className="mt-2" value={grad} onChange={(e) => setGrad(e.target.value)} inputMode="decimal" />
          <p className="mt-1.5 text-xs text-muted">The curve moves to a DEX pool once it has collected this much. Supply is 1,000,000,000.</p>
        </div>
      ) : null}

      {plain ? null : (
        <div>
          <Label>First buy ({meta.native})</Label>
          <TextInput value={devBuy} onChange={(e) => setDevBuy(e.target.value)} placeholder="0 — skip it" inputMode="decimal" />
          <p className="mt-1.5 text-xs text-muted">Optional. It happens in the same transaction, so nobody can buy before you.</p>
        </div>
      )}

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
      {error.startsWith("No Tron wallet") ? (
        <div className="space-y-1 text-sm">
          <p>
            <b>On a phone:</b>{" "}
            <a className="font-semibold text-cyan" href={tronLinkAppLink()}>
              Open this page in the TronLink app
            </a>{" "}
            (install TronLink first if you don't have it).
          </p>
          <p>
            <b>On a computer:</b> add the{" "}
            <a className="font-semibold text-cyan" href="https://www.tronlink.org/" target="_blank" rel="noopener noreferrer">
              TronLink extension
            </a>
            , unlock it, then reload this page.
          </p>
          <p>
            <b>No TronLink?</b> Launch from your Ferzan Trade Bot wallet in{" "}
            <a className="font-semibold text-cyan" href="https://t.me/Ferzan_Launch_Bot?start=launch" target="_blank" rel="noopener noreferrer">
              @Ferzan_Launch_Bot
            </a>{" "}
            (pick Tron).
          </p>
        </div>
      ) : null}
      {error.startsWith("No ") && !error.startsWith("No Tron") && !plain ? (
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
          href={txLink(chain, hash)}
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
