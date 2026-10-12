import { createFileRoute } from "@tanstack/react-router";

import { tr } from "@/lib/i18n";

export const Route = createFileRoute("/compare")({
  head: () => ({
    meta: [
      { title: "Ferzan vs the rest · Ferzan Factory" },
      { name: "description", content: "Ferzan fees next to pump.fun, Axiom and Trojan. Plain numbers, with the sources." },
    ],
  }),
  component: ComparePage,
});

const LAUNCH: { row: string; ferzan: string; other: string }[] = [
  { row: "Cost to launch", ferzan: "Free (network cost only)", other: "Free (network cost only)" },
  { row: "Fee on each curve trade", ferzan: "1%", other: "1.25%" },
  { row: "Creator's share of each trade", ferzan: "0.50% on new launches", other: "0.30%" },
  { row: "Chains", ferzan: "8 (Solana, Base, Ethereum, BNB Chain, Robinhood Chain, Arc, TON, Tron)", other: "Solana" },
];

const TRADE: { row: string; ferzan: string; axiom: string; trojan: string }[] = [
  { row: "Fee per trade", ferzan: "0.5%, down to 0.25% with volume", axiom: "0.75% to 0.95% by tier", trojan: "about 1%" },
  { row: "Subscription", ferzan: "None", axiom: "None", trojan: "None" },
  { row: "Chains for spot trading", ferzan: "Solana, Base, Ethereum, BNB Chain, Arbitrum, TON", axiom: "Solana (perps on Hyperliquid)", trojan: "Solana" },
  { row: "Web terminal", ferzan: "Yes", axiom: "Yes", trojan: "Yes" },
];

function ComparePage() {
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-4xl">{tr("Ferzan vs the rest")}</h1>
      <p className="mt-3 text-sm text-muted">{tr("Plain numbers. No logos. Check each site before you trade.")}</p>

      <h2 className="mt-8 text-2xl">{tr("Launchpad")}</h2>
      <p className="mt-1 text-sm text-muted">{tr("Ferzan vs pump.fun")}</p>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[20rem] text-left text-sm">
          <thead>
            <tr className="text-muted">
              <th className="py-2 pr-4 font-medium">{tr("Row")}</th>
              <th className="py-2 pr-4 font-medium">Ferzan</th>
              <th className="py-2 font-medium">pump.fun</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {LAUNCH.map((line) => (
              <tr key={line.row}>
                <th className="py-2 pr-4 text-left font-medium">{tr(line.row)}</th>
                <td className="py-2 pr-4">{tr(line.ferzan)}</td>
                <td className="py-2">{tr(line.other)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="mt-8 text-2xl">{tr("Trading")}</h2>
      <p className="mt-1 text-sm text-muted">{tr("Ferzan Trade Bot vs Axiom vs Trojan")}</p>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[20rem] text-left text-sm">
          <thead>
            <tr className="text-muted">
              <th className="py-2 pr-4 font-medium">{tr("Row")}</th>
              <th className="py-2 pr-4 font-medium">{tr("Ferzan Trade Bot")}</th>
              <th className="py-2 pr-4 font-medium">Axiom</th>
              <th className="py-2 font-medium">Trojan</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {TRADE.map((line) => (
              <tr key={line.row}>
                <th className="py-2 pr-4 text-left font-medium">{tr(line.row)}</th>
                <td className="py-2 pr-4">{tr(line.ferzan)}</td>
                <td className="py-2 pr-4">{tr(line.axiom)}</td>
                <td className="py-2">{tr(line.trojan)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-6 text-sm text-muted">
        {tr("Competitor fees as published:")}{" "}
        <a className="text-cyan" href="https://pump.fun/docs/fees" target="_blank" rel="noopener noreferrer">{tr("pump.fun docs (Oct 2026)")}</a>
        {", "}
        <a className="text-cyan" href="https://coinbureau.com/review/axiom-trade-review" target="_blank" rel="noopener noreferrer">{tr("Coin Bureau Axiom review (Jun 2026)")}</a>
        {", "}
        <a className="text-cyan" href="https://solanatools.io/trojan-terminal" target="_blank" rel="noopener noreferrer">{tr("Solana Tools Trojan review (Mar 2026)")}</a>
        {". "}
        {tr("Fees change; check each site before you trade. Ferzan snipes are 1%. A few older Ferzan coins pay creators 0.30%.")}
      </p>
    </div>
  );
}
