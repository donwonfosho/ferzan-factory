import { createFileRoute } from "@tanstack/react-router";
import { readPublicCoin } from "@/lib/factory/public-read";
import { tr } from "@/lib/i18n";

export const Route = createFileRoute("/embed/$chain/$id")({
  loader: async ({ params }) => {
    try {
      return await readPublicCoin({ data: { chain: params.chain, id: params.id } });
    } catch {
      return null;
    }
  },
  component: EmbedPage,
});

/** A buy button other sites can frame. It does not connect a wallet. The coin page does. */
function EmbedPage() {
  const coin = Route.useLoaderData();
  const { chain, id } = Route.useParams();
  const href = coin?.path || `/coin/${chain}/${id}`;
  const label = coin ? tr("Buy {0} on Ferzan", `$${coin.symbol}`) : tr("Buy this coin on Ferzan");
  return (
    <a className="btn-cyan inline-flex" href={href} target="_blank" rel="noopener noreferrer">
      {label}
    </a>
  );
}
