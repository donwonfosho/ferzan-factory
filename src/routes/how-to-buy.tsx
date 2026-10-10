import { createFileRoute, Link } from "@tanstack/react-router";

import { tr } from "@/lib/i18n";
export const Route = createFileRoute("/how-to-buy")({
  head: () => ({
    meta: [
      { title: "How to buy FERZAN · Ferzan Factory" },
      {
        name: "description",
        content: "Add funds with a card or Apple Pay, bridge with the Ferzan Bridge if you need another chain, then buy on the coin page.",
      },
    ],
  }),
  component: HowToBuyPage,
});

function HowToBuyPage() {
  return (
    <div className="mx-auto max-w-lg">
      <h1 className="text-4xl">{tr("How to buy FERZAN")}</h1>
      <p className="mt-3 text-muted">{tr("Three steps. Your wallet signs. This site never holds the payment.")}</p>
      <ol className="mt-6 space-y-4">
        <li className="bg-surface p-4 shadow-border">
          <p className="text-sm font-extrabold text-cyan">1</p>
          <p className="mt-1 font-semibold">{tr("Add funds")}</p>
          <p className="mt-1 text-sm text-muted">{tr("Add funds with a card or Apple Pay. MoonPay takes the payment.")}</p>
          <Link to="/funds" className="mt-3 inline-flex min-h-11 items-center font-semibold text-cyan">
            {tr("Add funds")} →
          </Link>
        </li>
        <li className="bg-surface p-4 shadow-border">
          <p className="text-sm font-extrabold text-cyan">2</p>
          <p className="mt-1 font-semibold">{tr("Bridge if you need another chain")}</p>
          <p className="mt-1 text-sm text-muted">{tr("If your funds are on a different chain from the coin, move them with the Ferzan Bridge. They land in your own wallet.")}</p>
          <Link to="/bridge" className="mt-3 inline-flex min-h-11 items-center font-semibold text-cyan">
            {tr("Open the Ferzan Bridge")} →
          </Link>
        </li>
        <li className="bg-surface p-4 shadow-border">
          <p className="text-sm font-extrabold text-cyan">3</p>
          <p className="mt-1 font-semibold">{tr("Buy on the coin page")}</p>
          <p className="mt-1 text-sm text-muted">{tr("Open the coin and buy it on its page. For FERZAN, start from the FERZAN page.")}</p>
          <Link to="/ferzan" className="mt-3 inline-flex min-h-11 items-center font-semibold text-cyan">
            {tr("FERZAN")} →
          </Link>
        </li>
      </ol>
    </div>
  );
}
