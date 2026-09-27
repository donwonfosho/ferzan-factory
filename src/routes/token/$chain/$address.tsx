import { createFileRoute } from "@tanstack/react-router";
import { PlainCoinPage } from "@/components/factory/plain-coin-page";
import { isPlainCoin } from "@/lib/factory/plain-coin";

export const Route = createFileRoute("/token/$chain/$address")({
  component: PlainCoinRoute,
});

function PlainCoinRoute() {
  const { chain, address } = Route.useParams();
  const token = chain === "arc" ? address.toLowerCase() : address;
  if (!isPlainCoin(chain, token)) return <p className="ticket mx-auto max-w-3xl text-sm text-sell">That coin link looks wrong.</p>;
  return <PlainCoinPage chain={chain} token={token} />;
}
