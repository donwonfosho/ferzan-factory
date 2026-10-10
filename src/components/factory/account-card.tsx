import { useEffect, useState } from "react";
import { PRIVY_APP_ID, useAccountWallets } from "@/lib/factory/wallet-bridge";
import { CHAINS } from "@/lib/factory/catalog";
import type { EvmChainId } from "@/lib/factory/deploy";
import { siteBalance } from "@/lib/factory/site-wallet";
import { solBalance } from "@/lib/factory/solana";
import { getTonBalance, getTronBalance } from "@/lib/factory/site-chains";
import { formatSmart } from "@/lib/factory/units";
import { tonWalletAddress } from "@/lib/factory/ton-address";
import { SignerChoice } from "./signer-choice";

import { tr } from "@/lib/i18n";
const EVM_CHAINS: EvmChainId[] = ["base", "bsc", "ethereum", "robinhood", "arc"];

/** Balances of the account's wallets, read through the site's own servers; a chain that does not answer just shows no balance. */
function useBalances(evm: string | null, sol: string | null, tron: string | null, ton: string | null) {
  const [b, setB] = useState<{ evm: string; sol: string; tron: string; ton: string }>({ evm: "", sol: "", tron: "", ton: "" });
  useEffect(() => {
    let live = true;
    const set = (k: "evm" | "sol" | "tron" | "ton", v: string) => live && setB((o) => ({ ...o, [k]: v }));
    if (evm) {
      void Promise.all(EVM_CHAINS.map(async (c) => ({ c, v: await siteBalance(c, evm).catch(() => -1n) }))).then((rows) => {
        const shown = rows.filter((r) => r.v > 0n).map((r) => `${formatSmart(r.v, 18)} ${CHAINS[r.c].native} (${CHAINS[r.c].label})`);
        set("evm", rows.every((r) => r.v < 0n) ? "" : shown.length ? shown.join(" · ") : "0");
      });
    }
    if (sol) void solBalance(sol).then((v) => set("sol", `${formatSmart(v, 9)} SOL`)).catch(() => undefined);
    if (tron) {
      void getTronBalance({ data: { address: tron } })
        .then((v) => set("tron", `${formatSmart(BigInt(v.trxSun), 6)} TRX${BigInt(v.usdt) > 0n ? ` · ${formatSmart(BigInt(v.usdt), 6)} USDT` : ""}`))
        .catch(() => undefined);
    }
    if (ton) void getTonBalance({ data: { address: ton } }).then((v) => set("ton", `${formatSmart(BigInt(v.nano), 9)} TON`)).catch(() => undefined);
    return () => {
      live = false;
    };
  }, [evm, sol, tron, ton]);
  return b;
}

/** Reads the account through the wallet bridge, so this component never loads the Privy SDK itself. */
export function AccountCard() {
  const account = useAccountWallets();
  const [copied, setCopied] = useState("");
  const [busy, setBusy] = useState("");
  const [note, setNote] = useState("");
  const bal = useBalances(account?.evmAddress ?? null, account?.solAddress ?? null, account?.tronAddress ?? null, account?.tonAddress ?? null);

  if (!PRIVY_APP_ID) return null;

  function copy(label: string, value: string) {
    void navigator.clipboard.writeText(value).then(() => {
      setCopied(label);
      window.setTimeout(() => setCopied(""), 1500);
    });
  }

  async function run(key: string, fn: () => Promise<void>, failure: string) {
    setBusy(key);
    setNote("");
    try {
      await fn();
    } catch (err) {
      const msg = err instanceof Error ? err.message.split("\n")[0] : "";
      setNote(/closed|cancel|declin|denied/i.test(msg) ? tr("Cancelled.") : `${failure}${msg ? ` (${msg.slice(0, 140)})` : ""}`);
    } finally {
      setBusy("");
    }
  }

  if (!account || !account.ready) return <div className="ticket mt-4 text-sm text-muted">{tr("Loading your account…")}</div>;

  if (!account.authenticated) {
    return (
      <div className="ticket mt-4">
        <p className="fz-eyebrow">{tr("Account")}</p>
          <p className="text-lg font-extrabold">{tr("Your Ferzan account")}</p>
        <p className="mt-2 text-sm text-muted">
          {tr("Sign in with email, Google, X or a wallet. New accounts get their own wallet on Base, BNB, Ethereum, Robinhood and Arc, plus a Solana wallet. You can export the keys any time.")}
        </p>
        <button type="button" className="btn-cyan mt-4 w-full" onClick={() => account.login()}>
          {tr("Sign in or create account")}
        </button>
      </div>
    );
  }

  const rows: {
    key: "evm" | "sol" | "tron" | "ton";
    label: string;
    address: string | null;
    fund: string;
    balance: string;
    canExport: boolean;
    exportIt: () => Promise<void>;
    create?: () => Promise<void>;
    createLabel?: string;
  }[] = [
    {
      key: "evm",
      label: tr("Base · BNB · Ethereum · Robinhood · Arc"),
      address: account.evmAddress,
      fund: tr("Fund: send ETH on Base, Ethereum or Robinhood, BNB on BNB Chain, or USDC on Arc to this address. One address works on all five."),
      balance: bal.evm,
      canExport: account.evmEmbedded,
      exportIt: account.exportEvm,
    },
    {
      key: "sol",
      label: tr("Solana"),
      address: account.solAddress,
      fund: tr("Fund: send SOL on Solana to this address."),
      balance: bal.sol,
      canExport: true,
      exportIt: account.exportSol,
    },
    {
      key: "tron",
      label: tr("Tron"),
      address: account.tronAddress,
      fund: tr("Fund: send TRX on Tron to this address. Keep about 40 TRX for network energy."),
      balance: bal.tron,
      canExport: true,
      exportIt: account.exportTron,
      create: account.createTron,
      createLabel: tr("Create Tron wallet"),
    },
    {
      key: "ton",
      label: tr("TON"),
      address: account.tonAddress ? tonWalletAddress(account.tonAddress) : null,
      fund: tr("Fund: send TON on the TON network to this address. Send a little first if it is a new wallet."),
      balance: bal.ton,
      canExport: true,
      exportIt: account.exportTon,
      create: account.createTon,
      createLabel: tr("Create TON wallet"),
    },
  ];

  return (
    <div className="ticket fz-panel mt-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-lg font-extrabold">{tr("Your Ferzan account")}</p>
          {account.who ? <p className="truncate text-sm text-muted">{account.who}</p> : null}
        </div>
        <button type="button" className="btn-line" onClick={() => void account.logout()}>
          {tr("Sign out")}
        </button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
      {rows.map((r) =>
        r.address ? (
          <div key={r.key} className="min-w-0 space-y-1 rounded-xl bg-bg/60 p-3 shadow-border">
            <p className="text-xs text-muted">{r.label}</p>
            <button type="button" className="w-full break-all text-left text-sm" onClick={() => copy(r.key, r.address ?? "")}>
              {r.address} {copied === r.key ? <span className="text-cyan">{tr("copied")}</span> : null}
            </button>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn-line" onClick={() => copy(r.key, r.address ?? "")}>
                {tr("Copy")}
              </button>
              {r.canExport ? (
                <button
                  type="button"
                  className="btn-line"
                  disabled={busy === `x-${r.key}`}
                  onClick={() => void run(`x-${r.key}`, r.exportIt, tr("Privy did not open the export for this wallet."))}
                >
                  {tr("Export key")}
                </button>
              ) : null}
            </div>
            <p className="text-xs text-muted">
              {r.balance ? `${tr("Balance")}: ${r.balance}. ` : ""}
              {r.fund}
            </p>
            {r.key === "tron" || r.key === "ton" ? <SignerChoice chain={r.key} /> : null}
          </div>
        ) : r.create ? (
          <div key={r.key} className="min-w-0 space-y-1 rounded-xl bg-bg/60 p-3 shadow-border">
            <p className="text-xs text-muted">{r.label}</p>
            <p className="text-sm text-muted">
              {r.key === "tron"
                ? tr("No Tron address yet. Create one under this account to fund and launch on Tron without TronLink.")
                : tr("No TON address yet. Create one under this account to fund and launch on TON without a separate wallet app.")}
            </p>
            <button
              type="button"
              className="btn-cyan"
              disabled={busy === `c-${r.key}`}
              onClick={() => void run(`c-${r.key}`, r.create!, tr("Could not create the wallet."))}
            >
              {busy === `c-${r.key}` ? tr("Creating…") : r.createLabel}
            </button>
          </div>
        ) : null,
      )}
      </div>
      {note ? <p className="text-sm text-sell">{note}</p> : null}
      <p className="text-xs text-muted">
        {tr("Send coins to these addresses to launch and trade. The keys are held in Privy's secure wallet system, not on this site. Export shows the key only to you.")}
      </p>
      <p className="text-xs text-muted">
        {tr("Tron and TON keys are also held by Privy. If Privy does not offer key export for a wallet type, the Export button says so instead of showing a key.")}
      </p>
    </div>
  );
}
