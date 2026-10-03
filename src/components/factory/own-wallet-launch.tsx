import { useEffect, useState } from "react";
import { WalletNeeded, evmWallet, solanaWallet, useAccountWallets } from "@/lib/factory/wallet-bridge";
import {
  BOT_LAUNCH_CHAINS,
  GRAD_PRESETS,
  LAUNCH_CHAIN_META,
  finishBotLaunch,
  getChainModes,
  isPlainLaunch,
  startBotLaunch,
  type BotLaunchChain,
  type ChainModes,
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
import { Button, Label, Mark, TextInput } from "./ui";
import { LaunchPerksNote } from "./perks";
import { FEE, LaunchCelebration, LaunchPreview } from "./launch-preview";

import { tr } from "@/lib/i18n";
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

type LaunchTab = "info" | "links" | "curve" | "dev" | "protect" | "launch";

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
  const [tab, setTab] = useState<LaunchTab>("info");
  const [advanced, setAdvanced] = useState(false);
  const account = useAccountWallets();

  // The form is a draft: text fields are kept in this browser so a refresh does not lose them (never the picture or wallet).
  const [draftLoaded, setDraftLoaded] = useState(false);
  useEffect(() => {
    try {
      const d = JSON.parse(window.localStorage.getItem("ferzan-launch-draft") || "{}") as Record<string, string>;
      if (typeof d.name === "string") setName(d.name.slice(0, 32));
      if (typeof d.symbol === "string") setSymbol(d.symbol.slice(0, 10));
      if (typeof d.description === "string") setDescription(d.description.slice(0, 280));
      if (typeof d.website === "string") setWebsite(d.website.slice(0, 200));
      if (typeof d.xHandle === "string") setXHandle(d.xHandle.slice(0, 200));
      if (typeof d.telegram === "string") setTelegram(d.telegram.slice(0, 200));
    } catch {
      /* no saved draft */
    }
    setDraftLoaded(true);
  }, []);
  useEffect(() => {
    if (!draftLoaded) return;
    try {
      window.localStorage.setItem("ferzan-launch-draft", JSON.stringify({ name, symbol, description, website, xHandle, telegram }));
    } catch {
      /* storage blocked */
    }
  }, [draftLoaded, name, symbol, description, website, xHandle, telegram]);


  // Tron and TON launch a standard coin until their bonding curve is open; then the curve is the default.
  const [modes, setModes] = useState<ChainModes>({});
  useEffect(() => {
    let stop = false;
    getChainModes()
      .then((m) => !stop && setModes(m))
      .catch(() => undefined);
    return () => {
      stop = true;
    };
  }, []);
  const curveOpen = modes[chain]?.curve === true;
  const plain = isPlainLaunch(chain) && !curveOpen;
  const evm = chain !== "solana" && !plain;
  const meta = LAUNCH_CHAIN_META[chain];

  function pickChain(next: BotLaunchChain) {
    setChain(next);
    setWallet("");
    if (next === "solana") setAdvanced(false);
    const presets = (GRAD_PRESETS as Record<string, string[] | undefined>)[next];
    if (next !== "solana" && presets) setGrad(presets[1]);
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
        if (receipt.status !== "0x1") throw new Error(tr("The launch failed on chain. Nothing was created."));
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 2500));
    }
    throw new Error(tr("Still confirming after 3 minutes. Check the transaction before you try again."));
  }

  async function signEvm(built: EvmLaunchTx, from: string): Promise<string> {
    const { address, provider: eth } = await evmWallet(chain as EvmChainId);
    if (address.toLowerCase() !== from.toLowerCase()) throw new Error(tr("The wallet changed. Press Launch again."));
    const sent = await eth.request({
      method: "eth_sendTransaction",
      params: [{ from, to: built.to, data: built.data, value: "0x" + BigInt(built.value).toString(16), gas: "0x" + BigInt(built.gas).toString(16) }],
    });
    if (typeof sent !== "string") throw new Error(tr("The wallet did not send the launch."));
    setHash(sent);
    setBusy(tr("Sent. Waiting for the chain to confirm."));
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
    if (cleanName.length < 2 || cleanName.length > 32) return setError(tr("Name needs 2–32 characters."));
    if (!/^[A-Z0-9]{2,10}$/.test(cleanSymbol)) return setError(tr("Ticker is 2–10 letters or numbers."));
    if (evm && !(Number(grad) > 0)) return setError(tr("Pick how much {0} the curve collects before it graduates.", meta.native));
    if (plain && !/^[1-9]\d{0,12}$/.test(supply.trim())) return setError(tr("Supply is a whole number between 1 and 1,000,000,000,000."));
    if (evm && Number(startMinutes) > 0 && Number(devBuy) > 0) {
      return setError(tr("A first buy needs trading to open right away. Clear the delay or the first buy."));
    }
    try {
      setBusy(tr("Connect your wallet."));
      const account = await connect();
      setBusy(tr("Preparing the launch."));
      const built = await startBotLaunch({
        data: {
          chain,
          wallet: account,
          name: cleanName,
          symbol: cleanSymbol,
          description: description.trim(),
          image,
          gradNative: evm ? grad.trim() : "",
          devBuy: plain || chain === "ton" ? "0" : devBuy.trim() || "0",
          maxBuy: evm && chain !== "ton" ? maxBuy.trim() || "0" : "0",
          startMinutes: evm && chain !== "ton" ? startMinutes.trim() || "0" : "0",
          website: website.trim(),
          x: xHandle.trim(),
          telegram: telegram.trim(),
          supplyWhole: plain ? supply.trim() : "1000000000",
          mode: isPlainLaunch(chain) && plain ? "plain" : "",
        },
      });
      let txHash: string;
      let mint = "";
      if (built.kind === "tron") {
        setBusy(
          plain
            ? tr("Approve in TronLink: {0} TRX launch fee + about 16 TRX of network energy.", formatSmart(BigInt(built.feeSun), 6))
            : tr("Approve in TronLink: {0} TRX (launch fee and first buy) + about 50 TRX of network energy.", formatSmart(BigInt(built.feeSun), 6)),
        );
        const { signAndSend } = await tronWallet();
        txHash = await signAndSend(built.transactionJson);
        setHash(txHash);
        setBusy(tr("Sent. Waiting for Tron to confirm (up to a minute)."));
      } else if (built.kind === "ton") {
        setBusy(
          plain
            ? tr("Approve in your TON wallet: 0.3 TON launch fee + about 0.3 TON for the coin contract (most comes back).")
            : tr("Approve in your TON wallet: 0.3 TON launch fee + about 0.35 TON for the curve and coin contracts (most comes back). Trading opens about 2 minutes later."),
        );
        const { send } = await tonWallet();
        await send({ validUntil: built.validUntil, network: built.network, messages: built.messages });
        txHash = "ton-connect";
        setBusy(tr("Sent. Waiting for TON to confirm (up to two minutes)."));
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
        setBusy(tr("Approve in your wallet. {0}", built.costText));
        mint = built.mint;
        txHash = await signSolana(built);
        setBusy(tr("Sent. Waiting for Solana to confirm."));
      }
      setBusy(plain || chain === "ton" ? tr("Waiting for the chain to confirm the coin. This can take a minute or two.") : tr("Confirmed. Listing it everywhere."));
      let done: { token: string; curve: string; url: string } | null = null;
      for (let attempt = 0; attempt < (plain || chain === "ton" ? 4 : 1); attempt += 1) {
        try {
          done = await finishBotLaunch({ data: { requestId: built.requestId, chain, hash: txHash, mint } });
          break;
        } catch (err) {
          const last = attempt === (plain || chain === "ton" ? 3 : 0);
          const msg = err instanceof Error ? err.message : "";
          if (last || !/not confirmed|has not confirmed|did not answer/i.test(msg)) throw err;
          await new Promise((resolve) => setTimeout(resolve, 10_000));
        }
      }
      if (!done) throw new Error(tr("The launch was sent, but it is not confirmed yet. Check your wallet before trying again."));
      setLaunched({ chain, name: cleanName, symbol: cleanSymbol, token: done.token, curve: done.curve, url: done.url, hash: txHash });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "The launch did not go through.";
      if (err instanceof WalletNeeded) {
        setError(err.message);
      } else if (/user (rejected|denied|rejects)|declined|rejected the request|4001/i.test(msg)) {
        setError(tr("You cancelled in the wallet. Nothing was launched."));
      } else {
        setError(tr(msg));
      }
    } finally {
      setBusy("");
    }
  }

  if (needTerms) return <TermsGate onAccept={() => setNeedTerms(false)} />;

  if (launched) {
    return (
      <div className="ticket mt-6">
        <p className="text-sm font-medium text-cyan">{tr("Launched")}</p>
        <h2 className="mt-2 text-3xl">
          {launched.name} <span className="text-muted">${launched.symbol}</span>
        </h2>
        <p className="mt-3 text-sm text-muted">
          {tr("It is live on")}{" "}{tr(LAUNCH_CHAIN_META[launched.chain].label)}{tr(". The @Ferzan_Launches channel, X and the Telegram bots pick it up like any other launch, and it shows on the floor as soon as the indexer sees it.")}
        </p>
        <p className="mt-3 break-all text-xs text-muted">{tr("Token")}{" "}{launched.token}</p>
        <div className="mt-4 flex flex-wrap gap-3">
          <a
            className="btn-cyan"
            href={siteCoinHref(launched.url) ?? launched.url}
            {...(siteCoinHref(launched.url) ? {} : { target: "_blank", rel: "noopener noreferrer" })}
          >
            {tr("Trade it")}
          </a>
          <a
            className="btn-line"
            href={txLink(launched.chain, launched.hash, launched.token)}
            target="_blank"
            rel="noopener noreferrer"
          >
            {tr("View transaction")}
          </a>
          <button type="button" className="btn-line" onClick={() => setLaunched(null)}>
            {tr("Launch another")}
          </button>
        </div>
        <LaunchCelebration chain={launched.chain} token={launched.token} symbol={launched.symbol} />
      </div>
    );
  }

  const links = walletAppLinks();
  const ton = chain === "ton";
  const hasBuy = !plain && !ton;
  const hasProtect = evm && !ton;
  const tabs: { id: LaunchTab; label: string }[] = [
    { id: "info", label: "Info" },
    { id: "links", label: "Links" },
    ...(evm && advanced ? [{ id: "curve" as LaunchTab, label: "Graduation" }] : []),
    ...(hasBuy ? [{ id: "dev" as LaunchTab, label: "First buy" }] : []),
    ...(hasProtect && advanced ? [{ id: "protect" as LaunchTab, label: "Protection" }] : []),
    { id: "launch", label: "Launch" },
  ];
  const at = Math.max(0, tabs.findIndex((t) => t.id === tab));
  const current = tabs[at]?.id ?? "info";
  const isLast = at >= tabs.length - 1;
  const sym = (symbol || "TOKEN").slice(0, 12);
  const firstBuy = Number(devBuy) > 0 ? `${devBuy} ${meta.native}` : "None";
  const opens = Number(startMinutes) > 0 ? `${startMinutes} min after launch` : "Right away";

  function clearDraft() {
    setName("");
    setSymbol("");
    setDescription("");
    setWebsite("");
    setXHandle("");
    setTelegram("");
    setDevBuy("");
    setMaxBuy("");
    setStartMinutes("0");
    setImage("");
    try {
      window.localStorage.removeItem("ferzan-launch-draft");
    } catch {
      /* private mode */
    }
  }

  const rows: [string, string][] = [
    ["Launch type", plain ? "Standard coin" : advanced ? "Curve, advanced" : "Curve, simple"],
    ...(hasBuy ? ([["First buy", firstBuy]] as [string, string][]) : []),
    ...(evm ? ([["Graduates at", `${grad || "?"} ${meta.native}`]] as [string, string][]) : []),
    ...(hasProtect ? ([["Max buy per wallet", Number(maxBuy) > 0 ? `${maxBuy} ${meta.native}` : "No limit"], ["Trading opens", opens]] as [string, string][]) : []),
    ...(chain === "solana" ? ([["Anti-sniper fee", "Built in"]] as [string, string][]) : []),
    ...(plain ? ([["Supply", Number(supply) > 0 ? Number(supply).toLocaleString("en-US") : "?"]] as [string, string][]) : []),
    ["Launch fee", FEE[chain].fee],
    ["You earn", plain ? "The whole supply is yours" : "Half of every trading fee"],
    ["Wallet", wallet ? `${wallet.slice(0, 6)}…${wallet.slice(-4)}` : "Connect at launch"],
  ];

  return (
    <form
      onSubmit={(e) => {
        if (!isLast) {
          e.preventDefault();
          setTab(tabs[at + 1].id);
          return;
        }
        void submit(e);
      }}
      className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] lg:items-start"
    >
      <aside className="ticket space-y-4 lg:sticky lg:top-24" aria-label={tr("Preview")}>
        <p className="text-xs font-semibold uppercase tracking-wider text-muted">{tr("Preview")}</p>
        <div className="flex items-center gap-3 rounded-xl bg-bg p-3 shadow-border">
          <Mark symbol={sym} image={image || undefined} />
          <span className="min-w-0 flex-1">
            <span className="block truncate font-extrabold">
              {name.trim() || tr("Your token")} <span className="text-muted">${sym}</span>
            </span>
            <span className="mt-1 flex items-center gap-1.5 text-xs text-muted">
              <ChainMark id={chain} className="h-4 w-4 shrink-0" />
              {tr(meta.label)}
            </span>
          </span>
        </div>
        {description.trim() ? <p className="line-clamp-3 text-xs text-muted">{description}</p> : null}
        <dl className="hidden space-y-2 text-sm lg:block">
          {rows.map(([k, v]) => (
            <div key={k} className="flex items-baseline justify-between gap-3">
              <dt className="text-muted">{tr(k)}</dt>
              <dd className="text-right font-semibold tabular-nums">{tr(v)}</dd>
            </div>
          ))}
        </dl>
        <div className="hidden items-center justify-between border-t border-line pt-3 text-xs text-muted lg:flex">
          <span>{tr("Draft saved automatically")}</span>
          <button type="button" className="min-h-11 font-semibold text-sell" onClick={clearDraft}>
            {tr("Clear draft")}
          </button>
        </div>
      </aside>

      <div className="ticket min-w-0 space-y-5">
        <div className="flex gap-2 overflow-x-auto pb-1" role="tablist">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={current === t.id}
              onClick={() => setTab(t.id)}
              className={cn("min-h-11 shrink-0 rounded-full px-4 text-sm font-semibold", current === t.id ? "bg-cyan text-cyan-ink" : "bg-bg text-fg shadow-border")}
            >
              {tr(t.label)}
            </button>
          ))}
        </div>

        {current === "info" ? (
          <div className="space-y-5">
            <div>
              <Label>{tr("Chain")}</Label>
              <p className="mb-2 text-xs text-muted">{tr("Where your coin lives and trades. The pair, the fees and the rewards all follow it.")}</p>
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
                    <span className="mt-2 block text-xs font-extrabold">{tr(LAUNCH_CHAIN_META[id].label)}</span>
                  </button>
                ))}
              </div>
              {chain === "solana" ? (
                <>
                  <p className="mt-2 text-xs text-muted">{tr("Meteora bonding curve: 1,000,000,000 supply, graduates to a locked pool. Supply and graduation are fixed by the Ferzan config.")}</p>
                  <LaunchPerksNote />
                </>
              ) : null}
              {chain === "ton" && !plain ? (
                <p className="mt-2 text-xs text-muted">{tr("TON bonding curve: 1,000,000,000 supply, trades on the curve about 2 minutes after launch, then moves to a STON.fi pool with the liquidity locked. Cost: 0.3 TON launch fee + about 0.35 TON for the contracts (most comes back).")}</p>
              ) : null}
              {chain === "tron" && !plain ? (
                <p className="mt-2 text-xs text-muted">{tr("Tron bonding curve: 1,000,000,000 supply, trades on the curve from the first second, then moves to a SunSwap pool. Cost: 5 TRX launch fee + about 50 TRX of Tron energy + your first buy, if any.")}</p>
              ) : null}
              {plain ? (
                <p className="mt-2 text-xs text-muted">
                  {chain === "tron"
                    ? tr("Standard TRC-20 coin. Cost: 5 TRX launch fee + about 16 TRX of Tron energy. Open a SunSwap pool afterwards so people can trade it.")
                    : tr("Standard TON jetton. Cost: 0.3 TON launch fee + about 0.3 TON for the coin contract (most of it comes back).")}
                </p>
              ) : null}
            </div>

            {plain ? null : (
              <div>
                <Label>{tr("Launch type")}</Label>
                <div className="grid gap-2 sm:grid-cols-2">
                  <button type="button" aria-pressed={!advanced} onClick={() => {
                    setAdvanced(false);
                    setMaxBuy("");
                    setStartMinutes("0");
                  }} className={cn("min-h-11 rounded-xl p-3 text-left", !advanced ? "bg-cyan text-cyan-ink" : "bg-bg text-fg shadow-border")}>
                    <span className="block text-sm font-extrabold">{tr("Simple")} <span className="text-[10px] uppercase tracking-wider">{tr("Recommended")}</span></span>
                    <span className="mt-1 block text-xs opacity-80">{tr("Keep it basic. Ferzan defaults, you earn half of every trading fee.")}</span>
                  </button>
                  {chain === "solana" ? null : (
                    <button type="button" aria-pressed={advanced} onClick={() => setAdvanced(true)} className={cn("min-h-11 rounded-xl p-3 text-left", advanced ? "bg-cyan text-cyan-ink" : "bg-bg text-fg shadow-border")}>
                      <span className="block text-sm font-extrabold">{tr("Advanced")}</span>
                      <span className="mt-1 block text-xs opacity-80">{ton ? tr("Choose how much TON the curve collects before it graduates.") : tr("Choose the graduation target, a max buy per wallet and a delayed start.")}</span>
                    </button>
                  )}
                </div>
              </div>
            )}

            <ProjectPicture image={image} onChange={setImage} onError={setError} />

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label>{tr("Name")}</Label>
                <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder={tr("Forged Rail")} maxLength={32} />
              </div>
              <div>
                <Label>{tr("Ticker")}</Label>
                <TextInput value={symbol} onChange={(e) => setSymbol(e.target.value.toUpperCase())} placeholder={tr("FORGE")} maxLength={10} />
              </div>
            </div>

            <div>
              <Label>{tr("Description")}</Label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={tr("What is this coin about?")}
                rows={3}
                maxLength={280}
                className="w-full rounded-lg bg-bg p-3 text-fg shadow-border outline-none placeholder:text-muted"
              />
              <p className="mt-1.5 text-xs text-muted">{tr("Optional, and worth a sentence: this is what link previews show for your coin.")}</p>
            </div>

            {plain ? (
              <div>
                <Label>{tr("Supply")}</Label>
                <div className="grid grid-cols-4 gap-2">
                  {SUPPLY_PRESETS.map((p) => (
                    <button key={p.value} type="button" onClick={() => setSupply(p.value)} className={cn("min-h-11", supply === p.value ? "btn-cyan" : "btn-line")}>
                      {tr(p.label)}
                    </button>
                  ))}
                </div>
                <TextInput className="mt-2" value={supply} onChange={(e) => setSupply(e.target.value.replace(/[^0-9]/g, ""))} inputMode="numeric" />
                <p className="mt-1.5 text-xs text-muted">{tr("All of it goes to your wallet at launch.")}</p>
              </div>
            ) : null}
          </div>
        ) : null}

        {current === "links" ? (
          <div className="space-y-3">
            <p className="text-sm text-muted">{tr("All optional. They show on your coin page and in link previews.")}</p>
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <Label>X / Twitter</Label>
                <TextInput value={xHandle} onChange={(e) => setXHandle(e.target.value)} placeholder="@handle" />
              </div>
              <div>
                <Label>{tr("Telegram")}</Label>
                <TextInput value={telegram} onChange={(e) => setTelegram(e.target.value)} placeholder="@group" />
              </div>
              <div>
                <Label>{tr("Website")}</Label>
                <TextInput value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://" />
              </div>
            </div>
          </div>
        ) : null}

        {current === "curve" && evm ? (
          <div>
            <Label>{tr("Graduates at (")}{meta.native})</Label>
            <div className="grid grid-cols-3 gap-2">
              {(GRAD_PRESETS as Record<string, string[]>)[chain].map((p) => (
                <button key={p} type="button" onClick={() => setGrad(p)} className={cn("min-h-11", grad === p ? "btn-cyan" : "btn-line")}>
                  {p} {meta.native}
                </button>
              ))}
            </div>
            <TextInput className="mt-2" value={grad} onChange={(e) => setGrad(e.target.value)} inputMode="decimal" />
            <p className="mt-1.5 text-xs text-muted">{tr("The curve moves to a DEX pool once it has collected this much. Supply is 1,000,000,000.")}</p>
          </div>
        ) : null}

        {current === "dev" && hasBuy ? (
          <div>
            <Label>{tr("First buy (")}{meta.native})</Label>
            <TextInput value={devBuy} onChange={(e) => setDevBuy(e.target.value)} placeholder={tr("0 — skip it")} inputMode="decimal" />
            <p className="mt-1.5 text-xs text-muted">{tr("Optional. It happens in the same transaction, so nobody can buy before you.")}</p>
          </div>
        ) : null}

        {current === "protect" && hasProtect ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label>{tr("Max buy per wallet (")}{meta.native})</Label>
              <TextInput value={maxBuy} onChange={(e) => setMaxBuy(e.target.value)} placeholder={tr("0 — no limit")} inputMode="decimal" />
              <p className="mt-1.5 text-xs text-muted">{tr("Stops one wallet from sweeping the curve.")}</p>
            </div>
            <div>
              <Label>{tr("Open trading after (minutes)")}</Label>
              <TextInput value={startMinutes} onChange={(e) => setStartMinutes(e.target.value)} inputMode="numeric" />
              <p className="mt-1.5 text-xs text-muted">{tr("Delay the start so you can announce first. 0 opens right away.")}</p>
            </div>
          </div>
        ) : null}

        {current === "launch" ? (
          <div className="space-y-4">
            <p className="text-sm text-muted">
              {tr("Signs with your own wallet:")}{" "}{WALLET_TEXT[chain]}{tr(". No Telegram needed.")}{" "}
              {plain
                ? tr("A standard coin: the whole supply is minted once to your wallet, with no owner and no way to mint more.")
                : tr("The coin goes on the same curves as @Ferzan_Launch_Bot launches.")}
            </p>
            <LaunchPreview chain={chain} name={name} symbol={symbol} image={image} description={description} devBuy={devBuy} startMinutes={startMinutes} plain={plain} />
            {wallet ? <p className="break-all text-xs text-muted">{tr("Wallet")}{" "}{wallet}</p> : null}
          </div>
        ) : null}

        {error ? <p className="text-sm text-sell">{tr(error)}</p> : null}

      {error.startsWith("No Tron wallet") ? (
          <div className="space-y-1 text-sm">
            <p>
              <b>{tr("On a phone:")}</b>{" "}
              <a className="font-semibold text-cyan" href={tronLinkAppLink()}>
                {tr("Open this page in the TronLink app")}
              </a>{" "}
              {tr("(install TronLink first if you don't have it).")}
            </p>
            <p>
              <b>{tr("On a computer:")}</b>{" "}{tr("add the")}{" "}
              <a className="font-semibold text-cyan" href="https://www.tronlink.org/" target="_blank" rel="noopener noreferrer">
                {tr("TronLink extension")}
              </a>
              {tr(", unlock it, then reload this page.")}
            </p>
            <p>
              <b>{tr("No TronLink?")}</b>{" "}{tr("Launch from your Ferzan Trade Bot wallet in")}{" "}
              <a className="font-semibold text-cyan" href="https://t.me/Ferzan_Launch_Bot?start=launch" target="_blank" rel="noopener noreferrer">
                {tr("@Ferzan_Launch_Bot")}
              </a>{" "}
              {tr("(pick Tron).")}
            </p>
          </div>
        ) : null}
        {error.startsWith("No ") && !error.startsWith("No Tron") && !plain ? (
          <p className="text-sm">
            <a className="font-semibold text-cyan" href={evm ? links.metamask : links.phantom}>
              {tr("Open in the")}{" "}{evm ? tr("MetaMask") : tr("Phantom")}{" "}{tr("app")}
            </a>
          </p>
        ) : null}
        {busy ? <p className="text-sm text-cyan">{tr(busy)}</p> : null}
        {hash && busy ? (
          <a
            className="text-sm text-cyan"
            href={txLink(chain, hash)}
            target="_blank"
            rel="noopener noreferrer"
          >
            {tr("View transaction")}
          </a>
        ) : null}
        <div className="flex flex-wrap items-center gap-3">
          {at > 0 ? (
            <button type="button" className="btn-line min-h-11" onClick={() => setTab(tabs[at - 1].id)}>
              {tr("Back")}
            </button>
          ) : null}
          {isLast && !wallet && !account?.authenticated && chain !== "ton" && chain !== "tron" ? (
            <div className="flex w-full flex-col gap-2">
              <p className="text-xs opacity-80">{tr("Sign in to use your Ferzan account wallet, or connect your own wallet.")}</p>
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  className="btn-cyan min-h-11 min-w-40 flex-1 px-6"
                  disabled={Boolean(busy) || !account?.ready}
                  onClick={() => account?.login()}
                >
                  {tr("Sign in to launch")}
                </button>
                <Button type="submit" className="min-w-40 flex-1" disabled={Boolean(busy)}>
                  {tr("Connect wallet and launch")}
                </Button>
              </div>
            </div>
          ) : isLast ? (
            <Button type="submit" className="min-w-40 flex-1" disabled={Boolean(busy)}>
              {wallet || account?.authenticated ? tr("Launch") : tr("Connect wallet and launch")}
            </Button>
          ) : (
            <button type="submit" className="btn-cyan ml-auto min-h-11 px-6">
              {tr("Continue")} →
            </button>
          )}
        </div>
      </div>
    </form>
  );
}
