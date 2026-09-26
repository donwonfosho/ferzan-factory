import { createFileRoute } from "@tanstack/react-router";
import { TradePage } from "@/components/factory/trade-page";

export const Route = createFileRoute("/c/$chain/$address")({
  component: TradeRoute,
});

function TradeRoute() {
  const { chain, address } = Route.useParams();
  return <TradePage chain={chain} address={address} />;
}
