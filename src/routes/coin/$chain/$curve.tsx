import { createFileRoute } from "@tanstack/react-router";
import { BotCoinPage } from "@/components/factory/bot-coin-page";
import { SolCoinPage } from "@/components/factory/sol-coin-page";
import { TronCurvePage } from "@/components/factory/tron-curve-page";
import { BOT_CURVE_CHAINS, type BotCurveChain } from "@/lib/factory/bot-curve";

import { tr } from "@/lib/i18n";
export const Route = createFileRoute("/coin/$chain/$curve")({
  component: BotCoinRoute,
});

function BotCoinRoute() {
  const { chain, curve } = Route.useParams();
  if (chain === "solana" && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(curve)) return <SolCoinPage mint={curve} />;
  if (chain === "tron" && /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(curve)) return <TronCurvePage curve={curve} />;
  if (!BOT_CURVE_CHAINS.includes(chain as BotCurveChain) || !/^0x[0-9a-fA-F]{40}$/.test(curve)) {
    return <p className="ticket mx-auto max-w-3xl text-sm text-sell">{tr("That coin link looks wrong.")}</p>;
  }
  return <BotCoinPage chain={chain as BotCurveChain} curve={curve.toLowerCase()} />;
}
