import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { readEmbedCard, type EmbedCard } from "@/lib/factory/public-read";
import { setPollInterval } from "@/lib/factory/poll";
import { tr } from "@/lib/i18n";

export const Route = createFileRoute("/embed/$chain/$id")({
  loader: async ({ params }) => {
    try {
      return await readEmbedCard({ data: { chain: params.chain, id: params.id } });
    } catch {
      return null;
    }
  },
  head: () => ({
    meta: [
      { title: "Trade on Ferzan" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: EmbedPage,
});

function money(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(2)}`;
}

/** A small card other sites can frame. It does not connect a wallet. The coin page does. */
function EmbedPage() {
  const first = Route.useLoaderData();
  const { chain, id } = Route.useParams();
  const [card, setCard] = useState<EmbedCard | null>(first);
  useEffect(() => {
    return setPollInterval(() => {
      void readEmbedCard({ data: { chain, id } })
        .then((next) => setCard(next))
        .catch(() => undefined);
    }, 20_000);
  }, [chain, id]);
  const href = card?.path || `/coin/${chain}/${id}`;
  const symbol = card?.symbol ? `$${card.symbol}` : "";
  const name = card?.name || tr("This coin");
  return (
    <a className="flex h-[164px] w-full max-w-md items-center gap-3 rounded-xl bg-surface p-3 text-fg shadow-border" href={href} target="_blank" rel="noopener noreferrer">
      {card?.image ? <img src={card.image} alt="" className="h-14 w-14 shrink-0 rounded-lg object-cover" /> : <span className="grid h-14 w-14 shrink-0 place-items-center rounded-lg bg-bg text-xs text-muted">FZ</span>}
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold">{name} {symbol}</span>
        <span className="mt-0.5 block truncate text-xs text-muted">
          {card?.price ?? tr("Not available")}
          {" · "}
          {card?.mcapUsd ? money(card.mcapUsd) : tr("Not available")}
        </span>
        <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-bg">
          <span className="block h-full bg-cyan" style={{ width: `${Math.max(0, Math.min(100, card?.progress ?? 0))}%` }} />
        </span>
        <span className="mt-1 block text-[11px] text-muted">
          {card?.progress === null || card?.progress === undefined ? tr("Not available") : tr("{0}% to graduation", Math.round(card.progress))}
        </span>
        <span className="btn-cyan mt-1 inline-flex min-h-8 px-3 text-xs">{tr("Trade on Ferzan")}</span>
      </span>
    </a>
  );
}
