import { createFileRoute } from "@tanstack/react-router";
import { PlainCoinPage } from "@/components/factory/plain-coin-page";
import { coinShareMeta, coinTitle } from "@/lib/factory/board";
import { isPlainCoin } from "@/lib/factory/plain-coin";

import { tr } from "@/lib/i18n";
export const Route = createFileRoute("/token/$chain/$address")({
  loader: async ({ params }) => {
    try {
      return await coinTitle({ data: { chain: params.chain, contract: params.address } });
    } catch {
      return null;
    }
  },
  head: ({ loaderData }) => coinShareMeta(loaderData),
  component: PlainCoinRoute,
});

function PlainCoinRoute() {
  const { chain, address } = Route.useParams();
  const token = chain === "arc" ? address.toLowerCase() : address;
  if (!isPlainCoin(chain, token)) return <p className="ticket mx-auto max-w-3xl text-sm text-sell">{tr("That coin link looks wrong.")}</p>;
  return <PlainCoinPage chain={chain} token={token} />;
}
