import { useState } from "react";
import { FUND_CODES, moonpayUrl } from "@/lib/factory/moonpay";
import { fundTicker } from "@/lib/factory/onramp";
import { tonWalletAddress } from "@/lib/factory/ton-address";
import type { LiveChainId } from "@/lib/factory/types";

import { tr } from "@/lib/i18n";
const WARN = "On the MoonPay page the receive address must match this address. If it says MoonPay wallet, change it or cancel.";

type PayChain = LiveChainId | "tron" | "ton";

function receive(chain: PayChain, address: string): string {
  const raw = address.trim();
  if (chain !== "ton") return raw;
  const uq = tonWalletAddress(raw);
  return uq.startsWith("UQ") ? uq : "";
}

/** Card checkout. The address is on screen before MoonPay opens. Two coins means two buttons. */
export function FundButton({ address, chain, quiet = false }: { address: string; chain: PayChain; quiet?: boolean }) {
  const codes = FUND_CODES[chain] ?? [];
  const shown = receive(chain, address);
  const [busy, setBusy] = useState("");
  const [note, setNote] = useState("");

  async function open(code: string) {
    if (!shown) return;
    setBusy(code);
    setNote("");
    try {
      const res = await moonpayUrl({ data: { chain, address: shown, code } });
      const popup = window.open(res.url, "_blank", "noopener,noreferrer");
      if (!popup) setNote(tr("Allow pop-ups, then press the button again."));
    } catch (err) {
      setNote(err instanceof Error ? err.message : tr("Could not open card checkout."));
    } finally {
      setBusy("");
    }
  }

  if (!codes.length || !shown) return null;

  return (
    <div className="mt-3">
      <p className="text-sm font-semibold">{tr("Add funds")}</p>
      <p className="fz-ca mt-2 break-all font-mono text-xs">{shown}</p>
      <p className="mt-2 text-xs text-sell">{tr(WARN)}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {codes.map((code) => (
          <button key={code} type="button" className="btn-line" disabled={Boolean(busy)} onClick={() => void open(code)}>
            {busy === code ? tr("Opening") : tr("Buy {0}", fundTicker(code))}
          </button>
        ))}
      </div>
      {quiet ? null : <p className="mt-2 text-xs text-muted">{tr("This site never sees your card details.")}</p>}
      {note ? <p className="mt-2 text-sm text-muted">{tr(note)}</p> : null}
    </div>
  );
}
