import { useState } from "react";
import { CHAINS } from "@/lib/factory/catalog";
import { moonpayUrl } from "@/lib/factory/moonpay";
import type { LiveChainId } from "@/lib/factory/types";
import { Button } from "./ui";

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
        setNote(`Card and Apple Pay are not switched on yet. Send ${meta.native} to the address above.`);
        return;
      }
      const popup = window.open(res.url, "_blank", "noopener,noreferrer");
      if (!popup) setNote("Allow pop-ups, then press the button again.");
    } catch (err) {
      setNote(err instanceof Error ? err.message : "Could not open card checkout.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3">
      <Button type="button" variant="ghost" disabled={busy} onClick={() => void open()}>
        {busy ? "Opening" : "Card or Apple Pay"}
      </Button>
      {quiet ? null : (
        <p className="mt-2 text-xs text-muted">
          Buys {meta.native} on {meta.label} straight into this address. Apple Pay shows on iPhone inside that window. This site never sees the card.
        </p>
      )}
      {note ? <p className="mt-2 text-sm text-muted">{note}</p> : null}
    </div>
  );
}
