import { useEffect, useState } from "react";
import { useAccountWallets } from "@/lib/factory/wallet-bridge";
import { tr } from "@/lib/i18n";

function sameWallet(a: string, b: string) {
  if (!a || !b) return false;
  if (a.startsWith("0x") || a.startsWith("0X") || b.startsWith("0x") || b.startsWith("0X")) return a.toLowerCase() === b.toLowerCase();
  return a === b;
}

/** Copies an iframe for this coin. Only the creator sees it. */
export function EmbedCode({ chain, id, creator }: { chain: string; id: string; creator: string }) {
  const account = useAccountWallets();
  const [note, setNote] = useState("");
  const [origin, setOrigin] = useState("https://ferzan-factory.com");
  useEffect(() => setOrigin(window.location.origin), []);
  if (!creator || !account?.authenticated) return null;
  const wallets = [account.evmAddress, account.solAddress, account.tronAddress, account.tonAddress];
  if (!wallets.some((wallet) => wallet && sameWallet(wallet, creator))) return null;
  const snippet = `<iframe src="${origin}/embed/${chain}/${id}" style="width:100%;height:180px;border:0" title="Trade on Ferzan"></iframe>`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(snippet);
      setNote(tr("Embed code copied."));
    } catch {
      setNote(tr("Could not copy. Select the link and copy it."));
    }
  }

  return (
    <div className="ticket space-y-2">
      <button type="button" className="btn-line min-h-10 px-3" onClick={() => void copy()}>
        {tr("Get embed code")}
      </button>
      <p className="break-all text-xs text-muted">{snippet}</p>
      {note ? <p className="text-sm text-cyan">{note}</p> : null}
    </div>
  );
}