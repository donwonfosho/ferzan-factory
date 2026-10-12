import { useEffect, useRef, useState } from "react";
import { explorerTx } from "@/lib/factory/deploy";
import { readBalance } from "@/lib/factory/relay";
import { solanaExplorerTx, solBalance } from "@/lib/factory/solana";
import { formatUnits, parseDecimal } from "@/lib/factory/units";
import { deskCall, deskCashout, deskTopupSol, normalizeTypedAmount } from "@/lib/factory/trade-desk";
import { evmWallet, useAccountWallets } from "@/lib/factory/wallet-bridge";
import { tr } from "@/lib/i18n";
import { AddFundsCard } from "./add-funds-card";

type Rec = Record<string, unknown>;

const NOTE_KEY = "ferzan-two-wallets";
const EVM_TOP: { id: "base" | "ethereum" | "bsc"; label: string; unit: string }[] = [
  { id: "base", label: "Base", unit: "ETH" },
  { id: "ethereum", label: "Ethereum", unit: "ETH" },
  { id: "bsc", label: "BNB Chain", unit: "BNB" },
];

function rec(value: unknown): Rec {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Rec) : {};
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function toBase64(bytes: Uint8Array): string {
  let text = "";
  for (const b of bytes) text += String.fromCharCode(b);
  return btoa(text);
}

const EVM_ADDRESS = /^0x[0-9a-fA-F]{40}$/;

/** Stop a top-up before it is signed if the Trading Wallet address is not a real address. */
async function deskAddressOk(chain: "sol" | "base" | "ethereum" | "bsc", address: string): Promise<boolean> {
  if (chain === "sol") {
    try {
      const { PublicKey } = await import("@solana/web3.js");
      const key = new PublicKey(address);
      return Boolean(key.toBase58());
    } catch {
      return false;
    }
  }
  return EVM_ADDRESS.test(address);
}

export function WalletChip({ chain, address, onCopied }: { chain: string; address: string; onCopied: (msg: string) => void }) {
  const dot = chain === "SOL" ? "#14f195" : chain === "TON" ? "#0098ea" : "#8b9cff";
  const short = address.length > 10 ? `${address.slice(0, 4)}…${address.slice(-4)}` : address;
  return (
    <button
      type="button"
      title={address}
      className="inline-flex min-h-0 items-center gap-2 whitespace-nowrap rounded-full border border-[rgba(160,190,255,.18)] bg-[#111c40] px-3 py-1.5 text-sm tabular-nums"
      onClick={() => {
        try {
          void navigator.clipboard.writeText(address).then(
            () => onCopied(tr("Copied")),
            () => onCopied(""),
          );
        } catch {
          onCopied("");
        }
      }}
    >
      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: dot }} aria-hidden />
      {chain} {short}
    </button>
  );
}

function https(value: unknown): string {
  if (typeof value !== "string") return "";
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : "";
  } catch {
    return "";
  }
}

export function WalletsPanel({ me: given, onRefresh }: { me?: Rec | null; onRefresh?: () => void }) {
  const account = useAccountWallets();
  const [loaded, setLoaded] = useState<Rec | null>(given === undefined ? null : given);
  const [waiting, setWaiting] = useState(given === undefined);
  const me = given === undefined ? loaded : given;
  const [noteOn, setNoteOn] = useState(false);
  const [toast, setToast] = useState("");
  const [balances, setBalances] = useState<Record<string, string>>({});
  const [topOpen, setTopOpen] = useState(false);
  const [topChain, setTopChain] = useState<"sol" | "base" | "ethereum" | "bsc">("sol");
  const [topAmount, setTopAmount] = useState("");
  const [cashOpen, setCashOpen] = useState(false);
  const [cashChain, setCashChain] = useState<"sol" | "base" | "ethereum" | "bsc">("sol");
  const [cashAmount, setCashAmount] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [link, setLink] = useState("");
  const [botHref, setBotHref] = useState("");
  const [tick, setTick] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const alive = useRef(true);
  const topRef = useRef<HTMLFormElement>(null);
  const cashRef = useRef<HTMLDivElement>(null);
  const topAmountRef = useRef<HTMLInputElement>(null);
  const cashAmountRef = useRef<HTMLInputElement>(null);
  useEffect(() => () => {
    alive.current = false;
  }, []);
  useEffect(() => {
    if (!topOpen) return;
    topRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    topAmountRef.current?.focus();
  }, [topOpen]);
  useEffect(() => {
    if (!cashOpen) return;
    cashRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    if (!confirm) cashAmountRef.current?.focus();
  }, [cashOpen, confirm]);

  const addresses = rec(me?.addresses);
  const solDesk = text(addresses.sol);
  const evmDesk = text(addresses.evm);
  const tonDesk = text(addresses.ton);
  const ready = me?.wallet_ready === true || (me?.wallet_ready !== false && Boolean(solDesk || evmDesk || tonDesk));
  const bot = https(me?.bot_link) || "https://t.me/Ferzan_Trade_Bot";
  const showCash = me?.self_cashout === true;

  useEffect(() => {
    try {
      setNoteOn(window.localStorage.getItem(NOTE_KEY) !== "1");
    } catch {
      setNoteOn(true);
    }
  }, []);

  useEffect(() => {
    if (!solDesk && topChain === "sol" && evmDesk) setTopChain("base");
    if (!solDesk && cashChain === "sol" && evmDesk) setCashChain("base");
  }, [solDesk, evmDesk, topChain, cashChain]);

  useEffect(() => {
    if (given !== undefined) return;
    if (!account?.ready) return;
    if (!account.authenticated) {
      setLoaded({});
      setWaiting(false);
      return;
    }
    let stop = false;
    void account.identityToken().then(async (token) => {
      if (!token || stop) return;
      try {
        const row = rec(JSON.parse(await deskCall({ data: { token, op: "me", body: {} } })) as unknown);
        if (!stop) {
          setLoaded(row);
          setWaiting(false);
        }
      } catch {
        if (!stop) {
          setLoaded({});
          setWaiting(false);
        }
      }
    });
    return () => {
      stop = true;
    };
  }, [given, account, tick]);

  useEffect(() => {
    let stop = false;
    setRefreshing(true);
    const jobs: [string, Promise<bigint>][] = [];
    if (account?.solAddress) jobs.push([`my:sol`, solBalance(account.solAddress)]);
    if (solDesk) jobs.push([`desk:sol`, solBalance(solDesk)]);
    const evmMine = account?.evmAddress;
    const evmReads: [string, "base" | "ethereum" | "bsc", string][] = [];
    if (evmMine) {
      for (const row of EVM_TOP) evmReads.push([`my:${row.id}`, row.id, evmMine]);
    }
    if (evmDesk) {
      for (const row of EVM_TOP) evmReads.push([`desk:${row.id}`, row.id, evmDesk]);
    }
    void (async () => {
      const next: Record<string, string> = {};
      await Promise.all([
        ...jobs.map(async ([key, job]) => {
          try {
            next[key] = formatUnits(await job, 9, 4) + " SOL";
          } catch {
            /* keep the previous balance */
          }
        }),
        ...evmReads.map(async ([key, chain, address]) => {
          try {
            const { wei } = await readBalance({ data: { chain, address } });
            const unit = EVM_TOP.find((row) => row.id === chain)?.unit ?? "";
            next[key] = `${formatUnits(BigInt(wei), 18, 4)} ${unit}`;
          } catch {
            /* keep the previous balance */
          }
        }),
      ]);
      if (!stop) {
        setBalances((prev) => ({ ...prev, ...next }));
        setRefreshing(false);
      }
    })();
    return () => {
      stop = true;
    };
  }, [account?.solAddress, account?.evmAddress, solDesk, evmDesk, tick]);

  function copied(message: string) {
    if (!message) return;
    setToast(message);
    window.setTimeout(() => setToast(""), 1600);
  }

  function dismiss() {
    setNoteOn(false);
    try {
      window.localStorage.setItem(NOTE_KEY, "1");
    } catch {
      /* this browser only */
    }
  }

  function refresh() {
    if (!alive.current) return;
    setTick((n) => n + 1);
    onRefresh?.();
  }

  function refreshSoon() {
    refresh();
    for (const ms of [12_000, 40_000]) {
      window.setTimeout(() => refresh(), ms);
    }
  }

  async function maxTop() {
    setMsg("");
    try {
      if (topChain === "sol") {
        if (!account?.solAddress) {
          setMsg(tr("This account has no Solana wallet yet."));
          return;
        }
        const bal = await solBalance(account.solAddress);
        const keep = 5000n;
        if (bal <= keep) {
          setMsg(tr("Not enough for the network fee."));
          return;
        }
        setTopAmount(formatUnits(bal - keep, 9, 6));
        return;
      }
      if (!account?.evmAddress) {
        setMsg(tr("This account has no EVM wallet yet."));
        return;
      }
      const { wei } = await readBalance({ data: { chain: topChain, address: account.evmAddress } });
      const { provider } = await evmWallet(topChain);
      const gas = await provider.request({ method: "eth_gasPrice" });
      const price = typeof gas === "string" ? BigInt(gas) : 1_000_000_000n;
      const keep = price * 21000n;
      const bal = BigInt(wei);
      if (bal <= keep) {
        setMsg(tr("Not enough for the network fee."));
        return;
      }
      setTopAmount(formatUnits(bal - keep, 18, 6));
    } catch (err) {
      setMsg(err instanceof Error ? err.message : tr("The terminal did not answer. Try again."));
    }
  }

  async function sendTop() {
    setBusy(true);
    setMsg("");
    setLink("");
    setBotHref("");
    try {
      if (topChain === "sol") {
        if (!solDesk) throw new Error(tr("This chain has no Trading Wallet yet."));
        if (!(await deskAddressOk("sol", solDesk))) {
          setMsg(tr("The Trading Wallet address looks wrong. Nothing was sent."));
          return;
        }
        const lamports = parseDecimal(normalizeTypedAmount(topAmount), 9);
        if (!lamports || lamports <= 0n) throw new Error(tr("Type how much to send."));
        if (lamports > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error(tr("Type how much to send."));
        if (!account?.solAddress || !account.solSign) throw new Error(tr("This account has no Solana wallet yet."));
        const token = await account.identityToken();
        if (!token) throw new Error(tr("Sign in again."));
        const { PublicKey, SystemProgram, TransactionMessage, VersionedTransaction } = await import("@solana/web3.js");
        const { solanaRelay } = await import("@/lib/factory/solana");
        const block = await solanaRelay({ data: { method: "block" } });
        if (!("blockhash" in block) || typeof block.blockhash !== "string") throw new Error(tr("The terminal did not answer. Try again."));
        const from = new PublicKey(account.solAddress);
        const message = new TransactionMessage({
          payerKey: from,
          recentBlockhash: block.blockhash,
          instructions: [SystemProgram.transfer({ fromPubkey: from, toPubkey: new PublicKey(solDesk), lamports: Number(lamports) })],
        }).compileToV0Message();
        const signed = await account.solSign(new VersionedTransaction(message).serialize());
        const sent = await deskTopupSol({ data: { token, signedB64: toBase64(signed) } });
        setLink(solanaExplorerTx(sent.signature));
        setMsg(tr("Sent. View on Solscan"));
        setTopAmount("");
        refreshSoon();
        return;
      } else {
        if (!evmDesk) throw new Error(tr("This chain has no Trading Wallet yet."));
        if (!(await deskAddressOk(topChain, evmDesk))) {
          setMsg(tr("The Trading Wallet address looks wrong. Nothing was sent."));
          return;
        }
        const value = parseDecimal(normalizeTypedAmount(topAmount), 18);
        if (!value || value <= 0n) throw new Error(tr("Type how much to send."));
        const { address, provider } = await evmWallet(topChain);
        const hash = await provider.request({
          method: "eth_sendTransaction",
          params: [{ from: address, to: evmDesk, value: `0x${value.toString(16)}` }],
        });
        if (typeof hash !== "string") throw new Error(tr("The wallet did not send it."));
        setLink(explorerTx(topChain, hash));
        setMsg(tr("Sent. {0}", hash));
      }
      setTopAmount("");
      refresh();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : tr("The terminal did not answer. Try again."));
    } finally {
      setBusy(false);
    }
  }

  async function sendCash() {
    setBusy(true);
    setMsg("");
    setLink("");
    setBotHref("");
    try {
      const token = await account?.identityToken();
      if (!token) throw new Error(tr("Sign in again."));
      const typed = normalizeTypedAmount(cashAmount);
      const amount = typed.toLowerCase() === "max" ? "max" : typed;
      if (!amount) throw new Error(tr("Type how much to send."));
      if (amount !== "max" && !/^\d+(\.\d+)?$/.test(amount)) throw new Error(tr("Type an amount like 0.01, or tap Max."));
      const raw = await deskCashout({ data: { token, chain: cashChain, amount } });
      const row = rec(JSON.parse(raw) as unknown);
      const href = https(row.tx) || https(row.url) || https(row.link) || https(row.explorer);
      const line = text(row.detail) || text(row.message) || text(row.result) || text(row.status);
      const opened = https(row.bot_link) || bot;
      setLink(href);
      if (line) setBotHref(opened);
      setMsg(line || tr("Queued"));
      setConfirm(false);
      refresh();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : tr("The terminal did not answer. Try again."));
    } finally {
      setBusy(false);
    }
  }

  const mySol = account?.solAddress ?? "";
  const myEvm = account?.evmAddress ?? "";
  const cashUnit = cashChain === "sol" ? "SOL" : cashChain === "bsc" ? "BNB" : "ETH";
  const cashDest = cashChain === "sol" ? mySol : myEvm;
  const cashShort = cashDest.length > 10 ? `${cashDest.slice(0, 4)}…${cashDest.slice(-4)}` : cashDest;
  const cashTyped = normalizeTypedAmount(cashAmount);
  const cashShown = !cashTyped || cashTyped.toLowerCase() === "max" ? tr("Max") : cashTyped;

  if (waiting && given === undefined) return <div className="term-skel h-40" />;

  return (
    <div className="grid gap-3">
      {refreshing ? <p className="text-sm text-muted">{tr("Refreshing…")}</p> : null}
      {noteOn ? (
        <div className="term-card text-sm">
          <p>
            {tr("My Wallet is the one you sign with, for launches and trades on this site. Trading Wallet is the Trade Bot wallet. It runs orders, take-profit, stop-loss and copy trades even when you are offline.")}
          </p>
          <button type="button" className="btn-line mt-3" onClick={dismiss}>
            {tr("Got it")}
          </button>
        </div>
      ) : null}
      <AddFundsCard />
      <div className="grid gap-3 sm:grid-cols-2">
        <section className="term-card">
          <p className="term-label">{tr("My Wallet")}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {mySol ? <WalletChip chain="SOL" address={mySol} onCopied={copied} /> : null}
            {myEvm ? <WalletChip chain="EVM" address={myEvm} onCopied={copied} /> : null}
            {!mySol && !myEvm ? <p className="text-sm text-muted">{tr("Sign in on the Manage account page first.")}</p> : null}
          </div>
          <ul className="mt-3 space-y-1 text-sm tabular-nums">
            {mySol && balances["my:sol"] ? <li>SOL · {balances["my:sol"]}</li> : null}
            {myEvm
              ? EVM_TOP.map((row) => (balances[`my:${row.id}`] ? <li key={row.id}>{row.label} · {balances[`my:${row.id}`]}</li> : null))
              : null}
          </ul>
          <p className="mt-3 text-sm text-muted">{tr("You hold this. Used for launching coins and trading on the site.")}</p>
          {ready ? (
            <button type="button" className="btn-line mt-3" onClick={() => { setTopOpen((v) => !v); setCashOpen(false); setConfirm(false); }}>
              {tr("Top up Trading Wallet")}
            </button>
          ) : null}
        </section>
        <section className="term-card">
          <p className="term-label">{tr("Trading Wallet")}</p>
          {ready ? (
            <>
              <div className="mt-3 flex flex-wrap gap-2">
                {solDesk ? <WalletChip chain="SOL" address={solDesk} onCopied={copied} /> : null}
                {evmDesk ? <WalletChip chain="EVM" address={evmDesk} onCopied={copied} /> : null}
                {tonDesk ? <WalletChip chain="TON" address={tonDesk} onCopied={copied} /> : null}
              </div>
              <ul className="mt-3 space-y-1 text-sm tabular-nums">
                {solDesk && balances["desk:sol"] ? <li>SOL · {balances["desk:sol"]}</li> : null}
                {evmDesk
                  ? EVM_TOP.map((row) => (balances[`desk:${row.id}`] ? <li key={row.id}>{row.label} · {balances[`desk:${row.id}`]}</li> : null))
                  : null}
              </ul>
              <p className="mt-3 text-sm text-muted">{tr("Your Trade Bot wallet. Runs your orders and take-profit/stop-loss even when you're offline.")}</p>
              {tonDesk ? (
                <p className="mt-2 text-sm text-muted">{tr("Send TON here from any wallet")}</p>
              ) : null}
              {showCash ? (
                <button type="button" className="btn-line mt-3" onClick={() => { setCashOpen((v) => !v); setTopOpen(false); setConfirm(false); }}>
                  {tr("Cash out to My Wallet")}
                </button>
              ) : null}
            </>
          ) : (
            <>
              <p className="mt-3 text-sm">{tr("Your Trading Wallet is created in the Trade Bot — open @Ferzan_Trade_Bot, tap Start, then come back.")}</p>
              <a className="btn-cyan mt-3 inline-flex" href={bot} target="_blank" rel="noopener noreferrer">
                {tr("Open @Ferzan_Trade_Bot")}
              </a>
            </>
          )}
        </section>
      </div>
      {topOpen && ready ? (
        <form
          ref={topRef}
          className="term-card grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void sendTop();
          }}
        >
          <p className="term-label">{tr("Top up Trading Wallet")}</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={topChain === "sol" ? "term-chip term-chip-on" : "term-chip"} disabled={!solDesk} onClick={() => setTopChain("sol")}>SOL</button>
            {EVM_TOP.map((row) => (
              <button key={row.id} type="button" className={topChain === row.id ? "term-chip term-chip-on" : "term-chip"} disabled={!evmDesk} onClick={() => setTopChain(row.id)}>
                {row.unit} · {row.label}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <input ref={topAmountRef} className="min-w-0 flex-1 bg-[#111c40] px-3 tabular-nums" inputMode="decimal" value={topAmount} placeholder={tr("Amount")} onChange={(e) => setTopAmount(e.target.value)} aria-label={tr("Amount")} />
            <button type="button" className="term-chip" onClick={() => void maxTop()}>{tr("Max")}</button>
          </div>
          <button type="submit" className="term-go" disabled={busy}>{tr("Send")}</button>
        </form>
      ) : null}
      {cashOpen && showCash ? (
        <div ref={cashRef} className="term-card grid gap-3">
          <p className="term-label">{tr("Cash out to My Wallet")}</p>
          {confirm ? (
            <>
              <p>{tr("Send {0} {1} from your Trading Wallet to My Wallet {2}?", cashShown, cashUnit, cashShort)}</p>
              <div className="flex gap-2">
                <button type="button" className="term-go" disabled={busy} onClick={() => void sendCash()}>{tr("Confirm")}</button>
                <button type="button" className="btn-line" onClick={() => setConfirm(false)}>{tr("Cancel")}</button>
              </div>
            </>
          ) : (
            <>
              <div className="flex flex-wrap gap-2">
                <button type="button" className={cashChain === "sol" ? "term-chip term-chip-on" : "term-chip"} disabled={!solDesk || !mySol} onClick={() => setCashChain("sol")}>SOL</button>
                {EVM_TOP.map((row) => (
                  <button key={row.id} type="button" className={cashChain === row.id ? "term-chip term-chip-on" : "term-chip"} disabled={!evmDesk || !myEvm} onClick={() => setCashChain(row.id)}>
                    {row.unit} · {row.label}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <input ref={cashAmountRef} className="min-w-0 flex-1 bg-[#111c40] px-3 tabular-nums" inputMode="decimal" value={cashAmount} placeholder={tr("Amount")} onChange={(e) => setCashAmount(e.target.value)} aria-label={tr("Amount")} />
                <button type="button" className="term-chip" onClick={() => setCashAmount("max")}>{tr("Max")}</button>
              </div>
              <button type="button" className="term-go" disabled={busy || !cashAmount.trim()} onClick={() => setConfirm(true)}>{tr("Cash out to My Wallet")}</button>
            </>
          )}
        </div>
      ) : null}
      {msg ? <p className="text-sm">{msg}</p> : null}
      {botHref ? (
        <a className="btn-cyan inline-flex" href={botHref} target="_blank" rel="noopener noreferrer">
          {tr("Open the Trade Bot")}
        </a>
      ) : null}
      {link ? (
        <a className="text-sm text-cyan" href={link} target="_blank" rel="noopener noreferrer">
          {link.includes("solscan.io") ? tr("View on Solscan") : tr("View on explorer")}
        </a>
      ) : null}
      {toast ? <p className="text-sm text-cyan">{toast}</p> : null}
    </div>
  );
}

export function TradingSetup({ bot }: { bot: string }) {
  return (
    <div className="term-card">
      <p className="term-label">{tr("Trading Wallet")}</p>
      <p className="mt-3 text-sm">{tr("Your Trading Wallet is created in the Trade Bot — open @Ferzan_Trade_Bot, tap Start, then come back.")}</p>
      <a className="btn-cyan mt-3 inline-flex" href={bot || "https://t.me/Ferzan_Trade_Bot"} target="_blank" rel="noopener noreferrer">
        {tr("Open @Ferzan_Trade_Bot")}
      </a>
    </div>
  );
}
