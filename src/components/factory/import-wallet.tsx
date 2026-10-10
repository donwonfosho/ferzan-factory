import { useState } from "react";
import { PRIVY_APP_ID, useAccountWallets } from "@/lib/factory/wallet-bridge";
import { tonWalletAddress } from "@/lib/factory/ton-address";
import { TextInput } from "./ui";

import { tr } from "@/lib/i18n";
type Kind = "evm" | "sol";

/**
 * Always shown on the Account page.
 * Privy's browser SDK can import a private key into an account wallet for EVM (hex key) and Solana (base58 key).
 * It has no key import for Tron or TON, so those two are only covered by the "bring funds" panel below it.
 */
export function ImportWallet() {
  const account = useAccountWallets();
  const [copied, setCopied] = useState("");
  const [kind, setKind] = useState<Kind>("evm");
  const [key, setKey] = useState("");
  const [sure, setSure] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  if (!PRIVY_APP_ID) return null;

  function copy(label: string, value: string) {
    void navigator.clipboard.writeText(value).then(() => {
      setCopied(label);
      window.setTimeout(() => setCopied(""), 1500);
    });
  }

  async function importKey() {
    if (!account?.authenticated) return;
    const value = key.trim();
    if (!value) {
      setNote({ ok: false, text: tr("Paste the private key first.") });
      return;
    }
    if (kind === "evm" && !/^(0x)?[0-9a-fA-F]{64}$/.test(value)) {
      setNote({ ok: false, text: tr("An EVM private key is 64 hex characters (with or without 0x).") });
      return;
    }
    if (kind === "sol" && !/^[1-9A-HJ-NP-Za-km-z]{60,100}$/.test(value)) {
      setNote({ ok: false, text: tr("A Solana private key is a long base58 text (what Phantom shows under Export private key).") });
      return;
    }
    setBusy(true);
    setNote(null);
    try {
      const address = kind === "evm" ? await account.importEvm(value) : await account.importSol(value);
      setKey("");
      setSure(false);
      setNote({ ok: true, text: tr("Imported. This wallet is now under your account: {0}", address) });
    } catch (err) {
      const msg = err instanceof Error ? err.message.split("\n")[0].slice(0, 160) : "";
      setNote({ ok: false, text: `${tr("Privy did not import that key.")}${msg ? ` (${msg})` : ""}` });
    } finally {
      setBusy(false);
    }
  }

  const addresses: { key: string; label: string; value: string | null }[] = [
    { key: "evm", label: tr("Base · BNB · Ethereum · Robinhood · Arc"), value: account?.authenticated ? account.evmAddress : null },
    { key: "sol", label: tr("Solana"), value: account?.authenticated ? account.solAddress : null },
    { key: "tron", label: tr("Tron"), value: account?.authenticated ? account.tronAddress : null },
    { key: "ton", label: tr("TON"), value: account?.authenticated && account.tonAddress ? tonWalletAddress(account.tonAddress) : null },
  ];

  return (
    <div className="ticket fz-panel mt-4 space-y-4">
      <div>
        <p className="text-lg font-extrabold">{tr("Import a wallet")}</p>
        <p className="mt-2 text-sm text-muted">
          {tr("Already have a wallet? You can bring its private key into your Ferzan account (EVM and Solana), or send its funds to the addresses above.")}
        </p>
      </div>

      {account?.authenticated ? (
        <div className="space-y-2">
          <p className="text-sm font-semibold">{tr("Import a private key")}</p>
          <div className="flex gap-2">
            <button type="button" className={kind === "evm" ? "btn-cyan" : "btn-line"} onClick={() => setKind("evm")}>
              {tr("EVM (Base, BNB, Ethereum, Robinhood, Arc)")}
            </button>
            <button type="button" className={kind === "sol" ? "btn-cyan" : "btn-line"} onClick={() => setKind("sol")}>
              {tr("Solana")}
            </button>
          </div>
          <TextInput
            type="password"
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder={kind === "evm" ? tr("Private key (0x…)") : tr("Private key (base58)")}
          />
          <p className="text-xs text-sell">
            {tr("Warning: a private key is full control of the funds. Never paste it on a page you do not trust or share it with anyone. This page hands it straight to Privy's import; Ferzan's servers never receive it. Privy may refuse if your account already has a wallet of this type.")}
          </p>
          <label className="flex items-start gap-2 text-xs text-muted">
            <input type="checkbox" checked={sure} onChange={(e) => setSure(e.target.checked)} className="mt-0.5" />
            <span>{tr("I understand this key will be stored in my Ferzan account wallet system (Privy).")}</span>
          </label>
          <button type="button" className="btn-cyan" disabled={busy || !sure || !key.trim()} onClick={() => void importKey()}>
            {busy ? tr("Importing…") : tr("Import wallet")}
          </button>
          {note ? <p className={note.ok ? "break-all text-sm text-cyan" : "text-sm text-sell"}>{note.text}</p> : null}
          <p className="text-xs text-muted">{tr("Tron and TON keys cannot be imported. Use the funds option below for those.")}</p>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-sm text-muted">{tr("Sign in first to import a key into your account.")}</p>
          {account?.ready ? (
            <button type="button" className="btn-cyan" onClick={() => account.login()}>
              {tr("Sign in or create account")}
            </button>
          ) : null}
        </div>
      )}

      <div className="space-y-2 border-t border-line pt-4">
        <p className="text-sm font-semibold">{tr("Bring funds from a wallet you already have")}</p>
        <p className="text-sm text-muted">
          {tr("From the Ferzan Trade Bot on Telegram: open the bot, send /wallet, choose withdraw, pick the coin, and paste the matching address from below as the destination. Always pick the right network: EVM address for Base, BNB, Ethereum, Robinhood and Arc; Solana, Tron and TON have their own addresses.")}
        </p>
        <p className="text-sm text-muted">
          {tr("From any other wallet or exchange: send to the same addresses, on the same network. Send a small test amount first.")}
        </p>
        {account?.authenticated ? (
          <div className="space-y-2">
            {addresses.map((a) =>
              a.value ? (
                <div key={a.key}>
                  <p className="text-xs text-muted">{a.label}</p>
                  <div className="flex items-start gap-2">
                    <span className="min-w-0 flex-1 break-all text-sm">{a.value}</span>
                    <button type="button" className="btn-line shrink-0" onClick={() => copy(a.key, a.value ?? "")}>
                      {copied === a.key ? tr("copied") : tr("Copy")}
                    </button>
                  </div>
                </div>
              ) : null,
            )}
            {!account.tronAddress || !account.tonAddress ? (
              <p className="text-xs text-muted">{tr("Create your Tron or TON wallet in the account card above to get those addresses.")}</p>
            ) : null}
          </div>
        ) : (
          <p className="text-xs text-muted">{tr("Sign in to see your addresses here.")}</p>
        )}
        <p className="text-xs text-muted">
          {tr("Still have coins in the old wallet this browser used to hold? The Move funds card above appears when it finds one, and Wallet > View wallets lets you import an exported key from it.")}
        </p>
      </div>
    </div>
  );
}
