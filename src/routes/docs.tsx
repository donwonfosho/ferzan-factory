import { createFileRoute, Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { tr } from "@/lib/i18n";
export const Route = createFileRoute("/docs")({
  head: () => ({
    meta: [
      { title: "Docs · Ferzan Factory" },
      { name: "description", content: "How a Ferzan launch, a trade, the 1% fee, and graduation work on eight chains." },
    ],
  }),
  component: DocsPage,
});

export function DocsPage() {
  return (
    <div className="mx-auto max-w-lg">
      <h1 className="text-4xl">{tr("How it works")}</h1>
      <p className="mt-3 text-muted">
        {tr("Ferzan Factory launches and trades coins on Solana, Base, BNB, Ethereum, Robinhood, Arc, Tron and TON. Launch from this site or from Telegram.")}
      </p>
      <section className="mt-6 bg-surface p-4 shadow-border">
        <p className="text-sm font-extrabold text-cyan">{tr("Known issues")}</p>
        <p className="mt-1 text-sm text-muted">
          {tr("This site is in beta. Real funds are at risk. Start small.")}
        </p>
      </section>
      <ol className="mt-6 space-y-4">
        <Item n="1" title={tr("One account")}>
          {tr("One account wallet covers the EVM chains and Solana. Tron and TON addresses are shown on Profile.")}
        </Item>
        <Item n="2" title={tr("Launch from the site or from Telegram")}>
          {tr("Launch here, or from Telegram with the Launch Bot. Either way the coin shows on the floor.")}{" "}
          <Link to="/launch" search={{ kind: "curve" }} className="text-cyan">
            {tr("Launch")}
          </Link>
          {" · "}
          <Link to="/bots" className="text-cyan">
            {tr("Bots")}
          </Link>
        </Item>
        <Item n="3" title={tr("Add funds and the Ferzan Bridge")}>
          <Link to="/funds" className="text-cyan">
            {tr("Add funds")}
          </Link>
          {tr(" with a card or Apple Pay. If your funds are on another chain, use the Ferzan Bridge.")}{" "}
          <Link to="/bridge" className="text-cyan">
            {tr("Bridge")}
          </Link>
        </Item>
        <Item n="4" title={tr("The 1% fee")}>
          <ul className="list-disc space-y-1 pl-5">
            <li>{tr("Website curves: 60% treasury, 30% creator, 10% referrer or treasury.")}</li>
            <li>{tr("Telegram curves: 50% creator, 50% platform.")}</li>
            <li>{tr("Telegram curves with a referral: 50% creator, 40% platform, 10% referrer.")}</li>
          </ul>
        </Item>
        <Item n="5" title={tr("Graduation")}>
          {tr("Solana graduates into a Meteora pool. On Base, BNB, Ethereum, Robinhood and Arc, the buy that fills the curve opens a pool in that same transaction. When a TON curve fills, its STON.fi pool opens. When a Tron curve fills, its SunSwap pool opens.")}
        </Item>
        <Item n="6" title={tr("Weekly competition")}>
          {tr("Top traders and top callers on every Ferzan coin, every chain. A new week starts every Friday at 4:00 PM ET.")}{" "}
          <Link to="/compete" className="text-cyan">
            {tr("Weekly competition")}
          </Link>
        </Item>
      </ol>
      <p className="mt-6 text-sm text-muted">
        {tr("Nothing here is a promise of buyers or a price. Read the")}{" "}
        <Link to="/terms" className="text-cyan">
          {tr("terms")}
        </Link>{" "}
        {tr("before you launch or trade.")}
      </p>
    </div>
  );
}

function Item({ n, title, children }: { n: string; title: string; children: ReactNode }) {
  return (
    <li className="bg-surface p-4 shadow-border">
      <p className="text-sm font-extrabold text-cyan">{n}</p>
      <p className="mt-1 font-semibold">{title}</p>
      <div className="mt-1 text-sm text-muted">{children}</div>
    </li>
  );
}
