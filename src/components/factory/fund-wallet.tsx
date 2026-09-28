import { useState } from "react";
import { CHAINS } from "@/lib/factory/catalog";
import { moonpayUrl } from "@/lib/factory/moonpay";
import type { LiveChainId } from "@/lib/factory/types";
import { Button } from "./ui";

import { tr } from "@/lib/i18n";
export function FundButton({ address, chain, quiet = false }: { address: string; chain: LiveChainId; quiet?: boolean }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const meta = CHAINS[chain];

  async function open() {
    setBusy(true);
    setNote("");
    try {
      const res = await moonpayUrl({ data: { chain, address } });
      if (!res.ok) {
        setNote(tr("Card and Apple Pay are not switched on yet. Send {0} to the address above.", meta.native));
        return;
      }
      const popup = window.open(res.url, "_blank", "noopener,noreferrer");
      if (!popup) setNote(tr("Allow pop-ups, then press the button again."));
    } catch (err) {
      setNote(err instanceof Error ? err.message : tr("Could not open card checkout."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3">
      <Button type="button" variant="ghost" disabled={busy} onClick={() => void open()}>
        {busy ? tr("Opening") : tr("Card or Apple Pay")}
      </Button>
      {quiet ? null : (
        <p className="mt-2 text-xs text-muted">
          {tr("Buys")}{" "}{meta.native}{" "}{tr("on")}{" "}{tr(meta.label)}{" "}{tr("straight into this address. Apple Pay shows on iPhone inside that window. This site never sees the card.")}
        </p>
      )}
      {note ? <p className="mt-2 text-sm text-muted">{tr(note)}</p> : null}
    </div>
  );
}
