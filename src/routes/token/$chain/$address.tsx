import { createFileRoute } from "@tanstack/react-router";
import { PlainCoinPage } from "@/components/factory/plain-coin-page";
import { isPlainCoin } from "@/lib/factory/plain-coin";

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

export const Route = createFileRoute("/token/$chain/$address")({
  // Link previews in Telegram and X show a card for this coin (drawn by the Ferzan API).
  head: ({ params }) => ({ meta: ogMeta(params.chain, params.address) }),
  component: PlainCoinRoute,
});

function PlainCoinRoute() {
  const { chain, address } = Route.useParams();
  const token = chain === "arc" ? address.toLowerCase() : address;
  if (!isPlainCoin(chain, token)) return <p className="ticket mx-auto max-w-3xl text-sm text-sell">That coin link looks wrong.</p>;
  return <PlainCoinPage chain={chain} token={token} />;
}
