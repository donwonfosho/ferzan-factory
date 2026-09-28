import { useEffect, useState } from "react";
import { CHAINS } from "@/lib/factory/catalog";
import type { EvmChainId } from "@/lib/factory/deploy";
import { explorerTx } from "@/lib/factory/deploy";
import { readSiteWallet, siteBalance, sweepSiteWallet } from "@/lib/factory/site-wallet";
import { solBalance, solanaAddress, solanaExplorerTx, sweepSolanaSite } from "@/lib/factory/solana";
import { formatSmart } from "@/lib/factory/units";
import { useAccountWallets } from "@/lib/factory/wallet-bridge";

import { tr } from "@/lib/i18n";
const EVM: EvmChainId[] = ["base", "bsc", "ethereum", "robinhood", "arc"];

type Row = { chain: EvmChainId | "solana"; balance: bigint };

/**
 * Shown to a signed-in account that still has an old browser-wallet key on this device.
 * Moves each chain's coin balance to the account wallet, keeping back only the network fee.
 */
export function MoveFunds() {
  const account = useAccountWallets();
  const [oldEvm, setOldEvm] = useState<string | null>(null);
  const [oldSol, setOldSol] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [busy, setBusy] = useState("");
  const [note, setNote] = useState<{ text: string; href?: string } | null>(null);

  useEffect(() => {
    const site = readSiteWallet();
    setOldEvm(site?.address ?? null);
    setOldSol(site ? solanaAddress() : null);
  }, []);

  async function load() {
    if (!oldEvm) return;
    const evm = await Promise.all(
      EVM.map(async (chain) => ({ chain, balance: await siteBalance(chain, oldEvm).catch(() => 0n) })),
    );
    const sol = oldSol ? [{ chain: "solana" as const, balance: await solBalance(oldSol).catch(() => 0n) }] : [];
    setRows([...evm, ...sol].filter((r) => r.balance > 0n));
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [oldEvm, oldSol]);

  if (!oldEvm || !account?.authenticated || !account.evmAddress) return null;
  if (account.evmAddress.toLowerCase() === oldEvm.toLowerCase()) return null;

  async function move(row: Row) {
    setNote(null);
    setBusy(row.chain);
    try {
      if (row.chain === "solana") {
        if (!account?.solAddress) throw new Error(tr("Your account has no Solana wallet yet."));
        const res = await sweepSolanaSite(account.solAddress);
        setNote({ text: `Moved ${formatSmart(res.sent, 9)} SOL to your account.`, href: solanaExplorerTx(res.signature) });
      } else {
        const res = await sweepSiteWallet(row.chain, account!.evmAddress!);
        setNote({
          text: `Moved ${formatSmart(res.sent, 18)} ${CHAINS[row.chain].native} to your account.`,
          href: explorerTx(row.chain, res.hash),
        });
      }
      await load();
    } catch (err) {
      setNote({ text: err instanceof Error ? err.message.split("\n")[0] : "The move did not go through." });
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="ticket mt-4">
      <p className="text-lg font-extrabold">{tr("Move funds to your account")}</p>
      <p className="mt-2 text-sm text-muted">
        {tr("This browser still holds an old wallet (")}{oldEvm.slice(0, 6)}…{oldEvm.slice(-4)}{tr("). Move its coins to your account wallet so everything is in one place. Only the network fee stays behind.")}
      </p>
      {rows === null ? <p className="mt-3 text-sm text-muted">{tr("Checking balances…")}</p> : null}
      {rows && rows.length === 0 ? <p className="mt-3 text-sm text-muted">{tr("Nothing left to move. The old wallet is empty.")}</p> : null}
      {rows && rows.length > 0 ? (
        <ul className="mt-3 space-y-2">
          {rows.map((row) => {
            const native = row.chain === "solana" ? "SOL" : CHAINS[row.chain].native;
            const label = row.chain === "solana" ? "Solana" : CHAINS[row.chain].label;
            return (
              <li key={row.chain} className="flex items-center justify-between gap-3">
                <span className="text-sm">
                  {label}: {formatSmart(row.balance, row.chain === "solana" ? 9 : 18)} {native}
                </span>
                <button type="button" className="btn-line" disabled={Boolean(busy)} onClick={() => void move(row)}>
                  {busy === row.chain ? tr("Moving…") : tr("Move")}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
      {note ? (
        <p className="mt-3 text-sm">
          {tr(note.text)}{" "}
          {note.href ? (
            <a className="text-cyan" href={note.href} target="_blank" rel="noopener noreferrer">
              {tr("View")}
            </a>
          ) : null}
        </p>
      ) : null}
      <p className="mt-3 text-xs text-muted">
        {tr("Coins you bought (tokens) are not moved here. Export the old key under View wallets and import it into MetaMask or Phantom to move those.")}
      </p>
    </div>
  );
}
