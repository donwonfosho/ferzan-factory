import { useEffect, useState } from "react";
import { prefersExternal, setPrefersExternal, type ExtendedChain } from "@/lib/factory/tron-ton-wallets";
import { useAccountWallets } from "@/lib/factory/wallet-bridge";

import { tr } from "@/lib/i18n";
/** Shows which wallet signs on Tron / TON and lets the visitor switch to TronLink / TON Connect (or back). Renders only when the account has that wallet. */
export function SignerChoice({ chain }: { chain: ExtendedChain }) {
  const account = useAccountWallets();
  const [external, setExternal] = useState(false);
  useEffect(() => {
    const sync = () => setExternal(prefersExternal(chain));
    sync();
    window.addEventListener("ferzan-signer", sync);
    return () => window.removeEventListener("ferzan-signer", sync);
  }, [chain]);

  const has = account?.authenticated && (chain === "tron" ? account.tronAddress : account.tonAddress);
  if (!has) return null;
  const ext = chain === "tron" ? "TronLink" : tr("a TON Connect wallet");
  return (
    <p className="text-xs text-muted">
      {external ? tr("Signing with {0}.", ext) : tr("Signing with your Ferzan account wallet.")}{" "}
      <button type="button" className="font-semibold text-cyan" onClick={() => setPrefersExternal(chain, !external)}>
        {external ? tr("Use my account wallet") : tr("Use {0} instead", ext)}
      </button>
    </p>
  );
}
