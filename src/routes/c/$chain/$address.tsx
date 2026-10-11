import { createFileRoute } from "@tanstack/react-router";
import { TradePage } from "@/components/factory/trade-page";
import { coinShareMeta, coinTitle } from "@/lib/factory/board";

export const Route = createFileRoute("/c/$chain/$address")({
  loader: async ({ params }) => {
    try {
      return await coinTitle({ data: { chain: params.chain, contract: params.address } });
    } catch {
      return null;
    }
  },
  head: ({ loaderData }) => coinShareMeta(loaderData),
  component: TradeRoute,
});

function TradeRoute() {
  const { chain, address } = Route.useParams();
  return <TradePage chain={chain} address={address} />;
}
