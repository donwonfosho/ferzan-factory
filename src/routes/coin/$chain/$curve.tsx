import { createFileRoute } from "@tanstack/react-router";
import { BotCoinPage } from "@/components/factory/bot-coin-page";
import { BOT_CURVE_CHAINS, type BotCurveChain } from "@/lib/factory/bot-curve";

export const Route = createFileRoute("/coin/$chain/$curve")({
  component: BotCoinRoute,
});

function BotCoinRoute() {
  const { chain, curve } = Route.useParams();
  if (!BOT_CURVE_CHAINS.includes(chain as BotCurveChain) || !/^0x[0-9a-fA-F]{40}$/.test(curve)) {
    return <p className="ticket mx-auto max-w-3xl text-sm text-sell">That coin link looks wrong.</p>;
  }
  return <BotCoinPage chain={chain as BotCurveChain} curve={curve.toLowerCase()} />;
}
