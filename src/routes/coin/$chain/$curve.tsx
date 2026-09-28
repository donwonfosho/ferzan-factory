import { createFileRoute } from "@tanstack/react-router";
import { BotCoinPage } from "@/components/factory/bot-coin-page";
import { SolCoinPage } from "@/components/factory/sol-coin-page";
import { BOT_CURVE_CHAINS, type BotCurveChain } from "@/lib/factory/bot-curve";

const OG_API = "https://launch.ferzaneco.com/api/og";
const ogMeta = (chain: string, id: string) => {
  const safe = /^[a-z]{2,12}$/.test(chain) && /^[0-9A-Za-z_-]{20,70}$/.test(id);
  const img = safe ? `${OG_API}/${chain}/${id}.png` : "https://ferzan-factory.com/brand/lockup.jpg";
  return [
    { property: "og:type", content: "website" },
    { property: "og:site_name", content: "Ferzan Factory" },
    { property: "og:title", content: "Trade it on Ferzan Factory" },
    { property: "og:image", content: img },
    { property: "og:image:width", content: "1200" },
    { property: "og:image:height", content: "630" },
    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:image", content: img },
  ];
};

export const Route = createFileRoute("/coin/$chain/$curve")({
  // Link previews in Telegram and X show a live card for this coin (drawn by the Ferzan API).
  head: ({ params }) => ({ meta: ogMeta(params.chain, params.curve) }),
  component: BotCoinRoute,
});

function BotCoinRoute() {
  const { chain, curve } = Route.useParams();
  if (chain === "solana" && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(curve)) return <SolCoinPage mint={curve} />;
  if (!BOT_CURVE_CHAINS.includes(chain as BotCurveChain) || !/^0x[0-9a-fA-F]{40}$/.test(curve)) {
    return <p className="ticket mx-auto max-w-3xl text-sm text-sell">That coin link looks wrong.</p>;
  }
  return <BotCoinPage chain={chain as BotCurveChain} curve={curve.toLowerCase()} />;
}
