import { useState } from "react";
import { PRIVY_APP_ID, useAccountWallets } from "@/lib/factory/wallet-bridge";

import { tr } from "@/lib/i18n";
/** Reads the account through the wallet bridge, so this component never loads the Privy SDK itself. */
export function AccountCard() {
  const account = useAccountWallets();
  const [copied, setCopied] = useState("");

  if (!PRIVY_APP_ID) return null;

  function copy(label: string, value: string) {
    void navigator.clipboard.writeText(value).then(() => {
      setCopied(label);
      window.setTimeout(() => setCopied(""), 1500);
    });
  }

  if (!account || !account.ready) return <div className="ticket mt-4 text-sm text-muted">{tr("Loading your account…")}</div>;

  if (!account.authenticated) {
    return (
      <div className="ticket mt-4">
        <p className="text-lg font-extrabold">{tr("Your Ferzan account")}</p>
        <p className="mt-2 text-sm text-muted">
          {tr("Sign in with email, Google, X or a wallet. New accounts get their own wallet on Base, BNB, Ethereum and Robinhood, plus a Solana wallet. You can export the keys any time.")}
        </p>
        <button type="button" className="btn-cyan mt-4 w-full" onClick={() => account.login()}>
          {tr("Sign in or create account")}
        </button>
      </div>
    );
  }

  return (
    <div className="ticket mt-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-lg font-extrabold">{tr("Your Ferzan account")}</p>
          {account.who ? <p className="truncate text-sm text-muted">{account.who}</p> : null}
        </div>
        <button type="button" className="btn-line" onClick={() => void account.logout()}>
          {tr("Sign out")}
        </button>
      </div>
      {account.evmAddress ? (
        <div>
          <p className="text-xs text-muted">{tr("Base · BNB · Ethereum · Robinhood")}</p>
          <button type="button" className="w-full break-all text-left text-sm" onClick={() => copy("evm", account.evmAddress ?? "")}>
            {account.evmAddress} {copied === "evm" ? <span className="text-cyan">{tr("copied")}</span> : null}
          </button>
          {account.evmEmbedded ? (
            <button type="button" className="btn-line mt-2" onClick={() => void account.exportEvm()}>
              {tr("Export key")}
            </button>
          ) : null}
        </div>
      ) : null}
      {account.solAddress ? (
        <div>
          <p className="text-xs text-muted">{tr("Solana")}</p>
          <button type="button" className="w-full break-all text-left text-sm" onClick={() => copy("sol", account.solAddress ?? "")}>
            {account.solAddress} {copied === "sol" ? <span className="text-cyan">{tr("copied")}</span> : null}
          </button>
          <button type="button" className="btn-line mt-2" onClick={() => void account.exportSol()}>
            {tr("Export key")}
          </button>
        </div>
      ) : null}
      <p className="text-xs text-muted">
        {tr("Send coins to these addresses to launch and trade. The keys are held in Privy's secure wallet system, not on this site. Export shows the key only to you.")}
      </p>
    </div>
  );
}
