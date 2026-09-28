import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { CHAINS } from "@/lib/factory/catalog";
import type { ChainId } from "@/lib/factory/types";
import { Button, Mark } from "./ui";

import { tr } from "@/lib/i18n";
export function ShareCard({
  chain,
  contract,
  symbol,
  name,
  image,
  ticketId,
}: {
  chain: string;
  contract: string;
  symbol: string;
  name: string;
  image: string;
  ticketId?: string;
}) {
  const [note, setNote] = useState("");
  const meta = CHAINS[chain as ChainId];
  const path = `/c/${chain}/${contract}`;

  async function copy(kind: "link" | "telegram" | "x") {
    const origin = window.location.origin;
    const url = `${origin}${path}`;
    const text =
      kind === "link"
        ? url
        : kind === "telegram"
          ? `${symbol} just launched on Ferzan Factory (${meta?.label ?? chain}). ${url}`
          : `${symbol} is live on Ferzan Factory. ${meta?.label ?? chain}. ${url}`;
    try {
      await navigator.clipboard.writeText(text);
      setNote(kind === "link" ? tr("Link copied.") : kind === "telegram" ? tr("Telegram text copied.") : tr("X text copied."));
    } catch {
      setNote(tr("Could not copy. Select the link and copy it."));
    }
  }

  return (
    <div className="ticket">
      <p className="text-sm font-medium text-cyan">{tr("Live")}</p>
      <div className="mt-3 flex items-center gap-4">
        <Mark symbol={symbol} image={image} className="h-20 w-20 text-xl" />
        <div>
          <p className="text-3xl">{symbol}</p>
          <p className="text-muted">
            {name} · {tr(meta?.label) ?? chain}
          </p>
        </div>
      </div>
      <p className="mt-4 break-all text-sm text-muted">{path}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button type="button" onClick={() => void copy("link")}>
          {tr("Copy link")}
        </Button>
        <Button type="button" variant="ghost" onClick={() => void copy("telegram")}>
          {tr("Copy for Telegram")}
        </Button>
        <Button type="button" variant="ghost" onClick={() => void copy("x")}>
          {tr("Copy for X")}
        </Button>
      </div>
      {note ? <p className="mt-3 text-sm text-cyan">{tr(note)}</p> : null}
      <div className="mt-4 flex flex-wrap gap-2">
        <Link to="/c/$chain/$address" params={{ chain, address: contract }} className="btn-cyan">
          {tr("Trade it")}
        </Link>
        {ticketId ? (
          <Link to="/t/$id" params={{ id: ticketId }} className="btn-line">
            {tr("Open the ticket")}
          </Link>
        ) : null}
      </div>
    </div>
  );
}
