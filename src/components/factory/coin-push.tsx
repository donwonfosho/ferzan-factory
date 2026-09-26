import { useState } from "react";
import { CHAINS } from "@/lib/factory/catalog";
import type { ChainId } from "@/lib/factory/types";
import { Button } from "./ui";

export function CoinPush({ chain, address, symbol }: { chain: string; address: string; symbol: string }) {
  const [note, setNote] = useState("");
  const meta = CHAINS[chain as ChainId];
  const page = typeof window === "undefined" ? "" : `${window.location.origin}/c/${chain}/${address}`;
  const blurb = `${symbol} on ${meta?.label ?? chain}\n${page}\nCA: ${address}`;

  async function openChat(url: string, label: string) {
    try {
      await navigator.clipboard.writeText(blurb);
      setNote(`${label} text copied. Paste it in the chat.`);
    } catch {
      setNote(`Open ${label} and paste the contract.`);
    }
    window.open(url, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="mt-4">
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="ghost" onClick={() => void openChat("https://t.me/Ferzan_Raid", "Raid")}>
          Raid
        </Button>
        <Button type="button" variant="ghost" onClick={() => void openChat("https://t.me/Ferzan_Trending", "Trending")}>
          Trending
        </Button>
        <a
          className="btn-line"
          href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(blurb)}`}
          target="_blank"
          rel="noreferrer"
        >
          Share on X
        </a>
        <Button
          type="button"
          variant="ghost"
          onClick={() => {
            void navigator.clipboard.writeText(address).then(
              () => setNote("Contract copied."),
              () => setNote("Could not copy the contract."),
            );
          }}
        >
          Copy contract
        </Button>
      </div>
      {note ? <p className="mt-2 text-sm text-muted">{note}</p> : null}
    </div>
  );
}
